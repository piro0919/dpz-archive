import * as cheerio from "cheerio";
import { NextResponse } from "next/server";
import prismaClient from "@/lib/prisma-client";

const BASE_URL = "https://dailyportalz.jp";

type Writer = {
  avatarUrl: string;
  name: string;
  profileUrl: string;
};

// eslint-disable-next-line import/prefer-default-export
export async function GET(): Promise<NextResponse> {
  const response = await fetch(`${BASE_URL}/writer`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  // 一覧はライターごとにアバターのリンクと名前のリンクを持つ。アバター側は
  // alt に名前が入っているので、そちらだけを見れば 3 つとも揃う。
  const writers = new Map<string, Writer>();

  $("a[href*=\"/writer/kijilist/\"]").each((_, element) => {
    const anchor = $(element);
    const image = anchor.find("img");
    const href = anchor.attr("href");
    const source = image.attr("src");
    const name = image.attr("alt")?.trim();

    if (!href || !source || !name) {
      return;
    }

    const profileUrl = new URL(href, BASE_URL).toString();

    writers.set(profileUrl, {
      avatarUrl: new URL(source, BASE_URL).toString(),
      name,
      profileUrl,
    });
  });

  if (writers.size === 0) {
    throw new Error("No writers found");
  }

  for (const writer of writers.values()) {
    await prismaClient.writer.upsert({
      create: writer,
      update: {
        avatarUrl: writer.avatarUrl,
        profileUrl: writer.profileUrl,
      },
      where: {
        name: writer.name,
      },
    });
  }

  return NextResponse.json({
    success: true,
    writers: writers.size,
  });
}
