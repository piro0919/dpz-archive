import { type Prisma } from "@prisma/client";

export type ArticleFilterParams = {
  category: null | string;
  from: null | string;
  keyword: null | string;
  to: null | string;
  writer: null | string;
};

export function readFilterParams(
  searchParams: URLSearchParams,
): ArticleFilterParams {
  return {
    category: searchParams.get("category"),
    from: searchParams.get("from"),
    keyword: searchParams.get("keyword"),
    to: searchParams.get("to"),
    writer: searchParams.get("writer"),
  };
}

export function buildArticleWhere(
  params: ArticleFilterParams,
): Prisma.ArticleWhereInput {
  const { category, from, keyword, to, writer } = params;
  const where: Prisma.ArticleWhereInput = {};

  if (category) {
    where.category = { name: category };
  }

  if (keyword) {
    where.AND = keyword
      .split(" ")
      .filter((word) => word.length > 0)
      .map((word) => ({
        title: { contains: word, mode: "insensitive" as const },
      }));
  }

  if (from || to) {
    where.publishedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  if (writer) {
    where.writers = { some: { name: writer } };
  }

  return where;
}

export function parsePagination(searchParams: URLSearchParams): {
  skip: number;
  take: number;
} {
  const rawLimit = parseInt(searchParams.get("limit") ?? "24", 10);
  const rawPage = parseInt(searchParams.get("page") ?? "0", 10);
  const take =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 24;
  const page = Number.isFinite(rawPage) && rawPage >= 0 ? rawPage : 0;

  return { skip: page * take, take };
}

export function parseOrder(searchParams: URLSearchParams): "asc" | "desc" {
  const value = searchParams.get("order");

  return value === "asc" ? "asc" : "desc";
}
