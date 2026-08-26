import { type Category } from "@prisma/client";
import prismaClient from "@/lib/prisma-client";
import pageMetadata from "../pageMetadata";
import CategoryComponent from "./_components/Category";

export const metadata = pageMetadata({
  description:
    "デイリーポータルZの記事をカテゴリーから探せます。記事、編集部日記、これすごくない？、TV をまとめています。",
  path: "/category",
  title: "カテゴリー一覧",
});

type CategoryWithCount = Category & {
  _count: {
    articles: number;
  };
};

const getCategories = async (): Promise<CategoryWithCount[]> => {
  const categories = await prismaClient.category.findMany({
    include: {
      _count: {
        select: { articles: true },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return categories;
};

export default async function Page(): Promise<React.JSX.Element> {
  const categories = await getCategories();

  return <CategoryComponent categories={categories} />;
}
