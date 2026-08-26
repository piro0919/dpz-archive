import { type Writer } from "@prisma/client";
import { NextResponse } from "next/server";
import prismaClient from "@/lib/prisma-client";

type WriterWithCount = Writer & {
  _count: {
    articles: number;
  };
};

// eslint-disable-next-line import/prefer-default-export
export async function GET(): Promise<NextResponse<WriterWithCount[]>> {
  const writers = await prismaClient.writer.findMany({
    include: {
      _count: {
        select: { articles: true },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return NextResponse.json(writers);
}
