import * as cheerio from "cheerio";
import { type Element } from "domhandler";
import { type NextRequest, NextResponse } from "next/server";
import sleep from "sleep-promise";
import env from "@/env";
import { getPrismaDirectClient } from "@/lib/prisma-client";

export const maxDuration = 300;

const prisma = getPrismaDirectClient();
const RETRY_DELAY = 2000;
const PAGE_DELAY = 1000;
const MAX_RETRIES = 5;
const BASE_URL = "https://dailyportalz.jp";
// バックナンバー索引。1 ページ 120 件で、1 ページ目が新着順の先頭。
const indexUrl = (page: number): string =>
  `${BASE_URL}/kiji?ccm_paging_p=${page}&ccm_order_by=h.publicDate&ccm_order_by_direction=desc`;
// デイリーポータルZ にはカテゴリー欄がないので、URL の第 1 セグメントを使う。
// kiji と b はどちらも通常の記事で、b は 2018 年のリニューアル以前のもの。
const CATEGORY_BY_SEGMENT: Record<string, string> = {
  b: "記事",
  dpq: "編集部日記",
  kiji: "記事",
  koresugo: "これすごくない？",
  tv: "TV",
};

type ArticleInput = {
  category: string;
  publishedAt: Date;
  thumbnail: string;
  title: string;
  url: string;
};

function categoryFromUrl(url: string): null | string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean)[0];

    return segment ? (CATEGORY_BY_SEGMENT[segment] ?? null) : null;
  } catch {
    return null;
  }
}

// 一覧の日付は本文末尾に [2026/08/26] の形で入る。時刻は持っていないので
// 日本時間の 0 時として扱う。
function parsePublishedAt(text: string): Date | null {
  const matched = /\[(\d{4})\/(\d{2})\/(\d{2})\]/.exec(text);

  if (!matched) {
    return null;
  }

  const [, year, month, day] = matched;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00+09:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractArticleData(
  $: cheerio.CheerioAPI,
  row: cheerio.Cheerio<Element>,
): ArticleInput | null {
  try {
    const link = row.find("a.headline");
    const href = link.attr("href");
    const title = link.text().trim();

    if (!(typeof href === "string" && href.length > 0) || !title) {
      console.log(`Skipping invalid row: ${title || "No title"}`);

      return null;
    }

    const url = new URL(href, BASE_URL).toString();
    const category = categoryFromUrl(url);

    if (!category) {
      console.log(`Skipping article with unknown section: ${url}`);

      return null;
    }

    const publishedAt = parsePublishedAt(row.find("p.tx-format").text());

    if (!publishedAt) {
      console.log(`Skipping article without publish date: ${title}`);

      return null;
    }

    // 相対パスで入ることがある。古い記事はダミー画像を指す。
    const rawThumbnail = row.find(".td-thumb img").attr("src") ?? "";
    const thumbnail = rawThumbnail
      ? new URL(rawThumbnail, BASE_URL).toString()
      : "";

    return { category, publishedAt, thumbnail, title, url };
  } catch (error) {
    console.error("Error extracting article data:", error);

    return null;
  }
}

async function processArticle(articleData: ArticleInput): Promise<void> {
  try {
    console.log(`Processing: ${articleData.title}`);

    await prisma.$transaction(async (tx) => {
      const category = await tx.category.upsert({
        create: { name: articleData.category },
        update: {},
        where: { name: articleData.category },
      });

      // ライターの紐付けは /api/link-writers が持つので、ここでは触らない。
      await tx.article.upsert({
        create: {
          category: { connect: { id: category.id } },
          publishedAt: articleData.publishedAt,
          thumbnail: articleData.thumbnail,
          title: articleData.title,
          url: articleData.url,
        },
        update: {
          category: { connect: { id: category.id } },
          publishedAt: articleData.publishedAt,
          thumbnail: articleData.thumbnail,
          title: articleData.title,
        },
        where: { url: articleData.url },
      });
    });
  } catch (error) {
    console.error("Error processing article:", {
      error: error instanceof Error ? error.message : "Unknown error",
      title: articleData.title,
      url: articleData.url,
    });
    throw error;
  }
}

type PageFailure = {
  error: string;
  pageUrl: string;
  url: string;
};

async function fetchAndProcessPage(pageUrl: string): Promise<{
  failures: PageFailure[];
  newArticles: number;
  rowCount: number;
}> {
  const failures: PageFailure[] = [];
  const response = await fetch(pageUrl);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const rows = $(".headline-row");

  console.log(`Found ${rows.length} rows on ${pageUrl}`);

  const articles = rows
    .map((_, el) => extractArticleData($, $(el)))
    .get()
    .filter((a): a is ArticleInput => a !== null);
  const urls = articles.map((a) => a.url);
  const existing = await prisma.article.findMany({
    select: { url: true },
    where: { url: { in: urls } },
  });
  const existingUrls = new Set(existing.map((a) => a.url));
  const newArticles = urls.filter((u) => !existingUrls.has(u)).length;

  for (const articleData of articles) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await processArticle(articleData);
        lastError = undefined;

        break;
      } catch (error) {
        lastError = error;

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY);
        }
      }
    }

    if (lastError) {
      const message =
        lastError instanceof Error ? lastError.message : String(lastError);

      console.error(
        `Failed to process article after ${MAX_RETRIES} attempts: ${articleData.url} — ${message}`,
      );
      failures.push({ error: message, pageUrl, url: articleData.url });
    }
  }

  return { failures, newArticles, rowCount: rows.length };
}

function parsePositiveInt(value: null | string, fallback: number): number {
  const parsed = parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log("Starting scraping process");

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

  // 通常の巡回は新着が尽きた時点で止まる。全 285 ページの初回取り込みは
  // 300 秒に収まらないので、from / to でページを区切って何回かに分けて叩く。
  const { searchParams } = new URL(request.url);
  const from = parsePositiveInt(searchParams.get("from"), 1);
  const to = searchParams.get("to")
    ? parsePositiveInt(searchParams.get("to"), from)
    : null;
  const stopWhenNoNewArticles = to === null;

  try {
    const allFailures: PageFailure[] = [];

    let page = from;

    while (to === null || page <= to) {
      try {
        console.log(`Processing page ${page}`);

        const result = await fetchAndProcessPage(indexUrl(page));

        allFailures.push(...result.failures);

        if (result.rowCount === 0) {
          console.log(`Finished - page ${page} had no rows`);

          break;
        }

        if (stopWhenNoNewArticles && result.newArticles === 0) {
          console.log(
            `Finished - page ${page} had no new articles (all already in DB)`,
          );

          break;
        }

        page++;
        await sleep(PAGE_DELAY);
      } catch (error) {
        console.error(`Failed to process page ${page}:`, error);

        break;
      }
    }

    console.log(
      `Scraping completed. Failed articles: ${allFailures.length}, Last page: ${page - 1}`,
    );

    return NextResponse.json({
      failedArticles: allFailures.length,
      failures: allFailures,
      lastProcessedPage: page - 1,
      success: true,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.error("Fatal error:", errorMessage);

    return NextResponse.json(
      {
        details: error instanceof Error ? error.stack : undefined,
        error: errorMessage,
        success: false,
      },
      { status: 500 },
    );
  }
}
