import * as cheerio from "cheerio";
import { type NextRequest, NextResponse } from "next/server";
import sleep from "sleep-promise";
import env from "@/env";
import { getPrismaDirectClient } from "@/lib/prisma-client";

export const maxDuration = 300;

const prisma = getPrismaDirectClient();
const PAGE_DELAY = 1000;
const BASE_URL = "https://dailyportalz.jp";
// 記事一覧はライター名を地の文で持つだけで、リンクも ID も無い。名前で突き
// 合わせると表記ゆれ（「林 雄司」と「林雄司」）で外れるので、ライター別の
// 記事一覧を辿って URL で突き合わせる。
const writerListUrl = (profileUrl: string, page: number): string =>
  `${profileUrl}?ccm_paging_p=${page}&ccm_order_by=h.publicDate&ccm_order_by_direction=desc`;

async function fetchArticleUrls(pageUrl: string): Promise<string[]> {
  const response = await fetch(pageUrl);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const $ = cheerio.load(await response.text());
  // サイドバーの「今大人気の記事」はこのライターの記事とは限らないので、
  // 本文の領域だけを見る。
  const urls = new Set<string>();

  $("#mainContentsInner")
    .find("td.tx12px a[href^=\"https://dailyportalz.jp/\"]")
    .each((_, element) => {
      const href = $(element).attr("href");

      if (href) {
        urls.add(new URL(href, BASE_URL).toString());
      }
    });

  return [...urls];
}

async function linkWriter(
  writerId: string,
  profileUrl: string,
): Promise<{ linked: number; pages: number }> {
  const seen = new Set<string>();

  let page = 1;

  while (true) {
    const urls = await fetchArticleUrls(writerListUrl(profileUrl, page));
    const fresh = urls.filter((url) => !seen.has(url));

    if (fresh.length === 0) {
      break;
    }

    for (const url of fresh) {
      seen.add(url);
    }

    page++;
    await sleep(PAGE_DELAY);
  }

  // 取り込み済みの記事だけを繋ぐ。まだ無い URL は次の巡回で拾う。
  const articles = await prisma.article.findMany({
    select: { id: true },
    where: { url: { in: [...seen] } },
  });

  await prisma.writer.update({
    data: {
      articles: { connect: articles.map(({ id }) => ({ id })) },
    },
    where: { id: writerId },
  });

  return { linked: articles.length, pages: page - 1 };
}

function parseNonNegativeInt(value: null | string, fallback: number): number {
  const parsed = parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

  // ライター 1 人あたり 10 ページ前後を辿るので、全員分は 300 秒に収まらない。
  // offset / limit で何回かに分けて叩く。
  const { searchParams } = new URL(request.url);
  const skip = parseNonNegativeInt(searchParams.get("offset"), 0);
  const take = Math.min(parseNonNegativeInt(searchParams.get("limit"), 10), 89);

  try {
    const writers = await prisma.writer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, profileUrl: true },
      skip,
      take,
    });
    const results: { linked: number; name: string; pages: number }[] = [];
    const failures: { error: string; name: string }[] = [];

    for (const writer of writers) {
      try {
        console.log(`Linking ${writer.name}`);

        const { linked, pages } = await linkWriter(
          writer.id,
          writer.profileUrl,
        );

        results.push({ linked, name: writer.name, pages });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error(`Failed to link ${writer.name}: ${message}`);
        failures.push({ error: message, name: writer.name });
      }
    }

    return NextResponse.json({
      failures,
      nextOffset: skip + writers.length,
      results,
      success: true,
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
