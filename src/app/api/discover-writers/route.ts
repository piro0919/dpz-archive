import * as cheerio from "cheerio";
import { type NextRequest, NextResponse } from "next/server";
import sleep from "sleep-promise";
import env from "@/env";
import { getPrismaDirectClient } from "@/lib/prisma-client";

export const maxDuration = 300;

const prisma = getPrismaDirectClient();
const PAGE_DELAY = 1000;
const ARTICLE_DELAY = 500;
const RESOLVE_CANDIDATES = 3;
const CONNECT_BATCH_SIZE = 500;
const BASE_URL = "https://dailyportalz.jp";
const indexUrl = (page: number): string =>
  `${BASE_URL}/kiji?ccm_paging_p=${page}&ccm_order_by=h.publicDate&ccm_order_by_direction=desc`;

type ResolvedWriter = {
  avatarUrl: string;
  name: string;
  profileUrl: string;
};

// 索引は「…本文（林 雄司）  [2026/08/26]」の形でライター名を地の文に持つ。
// 同じ人が「林 雄司」「林雄司」と揺れるので、空白を落として突き合わせる。
function normalizeName(name: string): string {
  return name.replace(/\s+/g, "");
}

function extractRowWriter(block: string): null | string {
  const matched = /[（(]([^（()）]{1,40})[）)]\s*\[\d{4}\/\d{2}\/\d{2}\]/.exec(
    block,
  );

  return matched ? normalizeName(matched[1]) : null;
}

// ライター名から記事の URL を集める。1 ページ 120 件で、行の形は
// scrape-newposts と同じ。ここではタイトルや日付は要らない。
async function collectNamesFromPage(
  pageUrl: string,
  articleUrlsByName: Map<string, string[]>,
): Promise<number> {
  const response = await fetch(pageUrl);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const $ = cheerio.load(await response.text());
  const rows = $(".headline-row");

  rows.each((_, element) => {
    const row = $(element);
    const href = row.find("a.headline").attr("href");

    if (!href) {
      return;
    }

    const url = new URL(href, BASE_URL).toString();

    // 外部サイトへ飛ぶ行は取り込んでいないので、ここでも弾く。
    if (new URL(url).host !== new URL(BASE_URL).host) {
      return;
    }

    const name = extractRowWriter(row.find("p.tx-format").text());

    // これすごくない？（読者投稿）には書き手が付かない。
    if (!name) {
      return;
    }

    const urls = articleUrlsByName.get(name);

    if (urls) {
      urls.push(url);
    } else {
      articleUrlsByName.set(name, [url]);
    }
  });

  return rows.length;
}

// 記事ページの .writer-detail にライターページへのリンクがある。索引と違って
// ID が取れるので、表記の揺れに関係なく同じ人へ辿り着ける。
//
// 連名の記事は枠が複数並ぶ。索引側は「石川大樹/ささきえり」「安藤昌教・西垣匡基」
// のように区切りが揺れていて文字列では割れないので、枠の側を全部拾う。
async function resolveWritersFromArticle(
  articleUrl: string,
): Promise<ResolvedWriter[]> {
  const response = await fetch(articleUrl);

  if (!response.ok) {
    return [];
  }

  const $ = cheerio.load(await response.text());
  const writers = new Map<string, ResolvedWriter>();

  $(".writer-detail")
    .find("a")
    .each((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href");

      if (!href?.includes("/writer/kijilist/")) {
        return;
      }

      const image = anchor.find("img");
      const source = image.attr("src");
      const name = image.attr("alt")?.trim();

      if (!source || !name) {
        return;
      }

      const profileUrl = new URL(href, BASE_URL).toString();

      writers.set(profileUrl, {
        avatarUrl: new URL(source, BASE_URL).toString(),
        name,
        profileUrl,
      });
    });

  return [...writers.values()];
}

function writerKey(writers: ResolvedWriter[]): string {
  return writers
    .map((w) => w.profileUrl)
    .sort()
    .join("\n");
}

// 代表記事を何本か引いて、同じ顔ぶれに着くことを確かめる。1 本だけだと、索引の
// 名前と記事の署名がずれている行を掴んだときに全件を巻き添えにする。
// 編集部日記には署名の枠が無いので、引けなかった 1 本で打ち切らずに次を試す。
async function resolveName(articleUrls: string[]): Promise<ResolvedWriter[]> {
  const attempts: ResolvedWriter[][] = [];

  for (const articleUrl of articleUrls.slice(0, RESOLVE_CANDIDATES)) {
    const writers = await resolveWritersFromArticle(articleUrl);

    await sleep(ARTICLE_DELAY);

    if (writers.length > 0) {
      attempts.push(writers);
    }
  }

  const [first] = attempts;

  if (!first) {
    return [];
  }

  // 同じ表記から別の顔ぶれに着くなら、同姓同名か索引のずれを疑って手を出さない。
  if (attempts.some((w) => writerKey(w) !== writerKey(first))) {
    return [];
  }

  return first;
}

// 多対多の接続は 1 件ずつだと往復が嵩むので、まとめて渡す。
async function connectArticles(
  writerId: string,
  articleUrls: string[],
): Promise<number> {
  const articles = await prisma.article.findMany({
    select: { id: true },
    where: {
      url: { in: articleUrls },
      writers: { none: { id: writerId } },
    },
  });

  for (let i = 0; i < articles.length; i += CONNECT_BATCH_SIZE) {
    const batch = articles.slice(i, i + CONNECT_BATCH_SIZE);

    await prisma.writer.update({
      data: { articles: { connect: batch.map(({ id }) => ({ id })) } },
      where: { id: writerId },
    });
  }

  return articles.length;
}

function parsePositiveInt(value: null | string, fallback: number): number {
  const parsed = parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");

  if (
    process.env.NODE_ENV !== "development" &&
    authHeader !== `Bearer ${env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      { error: "Unauthorized", success: false },
      { status: 401 },
    );
  }

  // /writer に載っているのは 89 人だけで、そこに出てこない寄稿者が大勢いる。
  // 索引を辿って名前を拾い、知らない名前だけライターページへ解決する。
  const { searchParams } = new URL(request.url);
  const from = parsePositiveInt(searchParams.get("from"), 1);
  const to = parsePositiveInt(searchParams.get("to"), from);

  try {
    const articleUrlsByName = new Map<string, string[]>();

    for (let page = from; page <= to; page++) {
      const rowCount = await collectNamesFromPage(
        indexUrl(page),
        articleUrlsByName,
      );

      if (rowCount === 0) {
        console.log(`Finished - page ${page} had no rows`);

        break;
      }

      await sleep(PAGE_DELAY);
    }

    console.log(`Found ${articleUrlsByName.size} distinct writer names`);

    const stored = await prisma.writer.findMany({
      select: { id: true, name: true, profileUrl: true },
    });
    const idsByName = new Map(
      stored.map((w) => [normalizeName(w.name), [w.id]]),
    );
    const idByProfileUrl = new Map(stored.map((w) => [w.profileUrl, w.id]));
    const created: string[] = [];
    const unresolved: string[] = [];
    const linked: { linked: number; name: string }[] = [];

    for (const [name, articleUrls] of articleUrlsByName) {
      let writerIds = idsByName.get(name);

      if (!writerIds) {
        const writers = await resolveName(articleUrls);

        if (writers.length === 0) {
          unresolved.push(name);

          continue;
        }

        writerIds = [];

        for (const writer of writers) {
          // 表記が違うだけの既知のライターなら、行を増やさず既存に繋ぐ。
          const existingId = idByProfileUrl.get(writer.profileUrl);

          if (existingId) {
            writerIds.push(existingId);

            continue;
          }

          const upserted = await prisma.writer.upsert({
            create: writer,
            update: {
              avatarUrl: writer.avatarUrl,
              profileUrl: writer.profileUrl,
            },
            where: { name: writer.name },
          });

          writerIds.push(upserted.id);
          idByProfileUrl.set(writer.profileUrl, upserted.id);
          created.push(writer.name);
        }

        idsByName.set(name, writerIds);
      }

      for (const writerId of writerIds) {
        const count = await connectArticles(writerId, articleUrls);

        if (count > 0) {
          linked.push({ linked: count, name });
        }
      }
    }

    return NextResponse.json({
      created,
      distinctNames: articleUrlsByName.size,
      linked,
      success: true,
      totalLinked: linked.reduce((sum, entry) => sum + entry.linked, 0),
      unresolved,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.error("Fatal error:", errorMessage);

    return NextResponse.json(
      { error: errorMessage, success: false },
      { status: 500 },
    );
  }
}
