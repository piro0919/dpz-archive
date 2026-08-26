import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.development.local" });

if (!process.env.POSTGRES_PRISMA_URL) {
  throw new Error("POSTGRES_PRISMA_URL is not set in .env.development.local");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.POSTGRES_PRISMA_URL }),
  log: ["info", "warn", "error"],
});
// サンプルカテゴリデータ
const categories = [
  { id: "1", name: "記事" },
  { id: "2", name: "編集部日記" },
  { id: "3", name: "これすごくない？" },
  { id: "4", name: "TV" },
];
// サンプルライターデータ
const writers = [
  {
    avatarUrl: "https://dailyportalz.jp/application/files/avatars/191.jpg",
    id: "1",
    name: "林雄司",
    profileUrl: "https://dailyportalz.jp/writer/kijilist/191",
  },
  {
    avatarUrl: "https://dailyportalz.jp/application/files/avatars/184.jpg",
    id: "2",
    name: "石川大樹",
    profileUrl: "https://dailyportalz.jp/writer/kijilist/184",
  },
  {
    avatarUrl: "https://dailyportalz.jp/application/files/avatars/182.jpg",
    id: "3",
    name: "橋田玲子",
    profileUrl: "https://dailyportalz.jp/writer/kijilist/182",
  },
];
// サンプル記事データ
const articles = [
  {
    categoryId: "1", // 記事
    id: "1",
    publishedAt: new Date("2024-01-15"),
    thumbnail: "https://picsum.photos/400/300?random=1",
    title: "地下鉄の駅名をぜんぶ漢字で書いてみる",
    url: "https://dailyportalz.jp/kiji/sample-chikatetsu",
    writerIds: ["1", "2"], // 林雄司、石川大樹
  },
  {
    categoryId: "1", // 記事
    id: "2",
    publishedAt: new Date("2024-02-10"),
    thumbnail: "https://picsum.photos/400/300?random=2",
    title: "スーパーの惣菜だけで会席料理を組み立てる",
    url: "https://dailyportalz.jp/kiji/sample-kaiseki",
    writerIds: ["3"], // 橋田玲子
  },
  {
    categoryId: "2", // 編集部日記
    id: "3",
    publishedAt: new Date("2024-03-05"),
    thumbnail: "https://picsum.photos/400/300?random=3",
    title: "今月のみどころ",
    url: "https://dailyportalz.jp/dpq/sample-midokoro",
    writerIds: ["1"], // 林雄司
  },
  {
    categoryId: "3", // これすごくない？
    id: "4",
    publishedAt: new Date("2024-04-20"),
    thumbnail: "https://picsum.photos/400/300?random=4",
    title: "自販機の下に落ちていた硬貨の話",
    url: "https://dailyportalz.jp/koresugo/sample-jihanki",
    writerIds: ["2"], // 石川大樹
  },
  {
    categoryId: "4", // TV
    id: "5",
    publishedAt: new Date("2024-05-12"),
    thumbnail: "https://picsum.photos/400/300?random=5",
    title: "デイリーポータルZ TV 第1回",
    url: "https://dailyportalz.jp/tv/sample-tv1",
    writerIds: ["1", "3"], // 林雄司、橋田玲子
  },
];

async function seedDatabase(): Promise<void> {
  try {
    console.log("🌱 Starting local database seeding...");

    // 既存データをクリア（開発環境なので安全）
    console.log("🧹 Cleaning existing data...");
    await prisma.article.deleteMany();
    await prisma.writer.deleteMany();
    await prisma.category.deleteMany();

    // カテゴリを挿入
    console.log("📊 Seeding categories...");

    for (const category of categories) {
      await prisma.category.create({
        data: category,
      });
      console.log(`  ✓ Created category: ${category.name}`);
    }

    // ライターを挿入
    console.log("✍️ Seeding writers...");

    for (const writer of writers) {
      await prisma.writer.create({
        data: writer,
      });
      console.log(`  ✓ Created writer: ${writer.name}`);
    }

    // 記事を挿入
    console.log("📝 Seeding articles...");

    for (const article of articles) {
      const { writerIds, ...articleData } = article;

      await prisma.article.create({
        data: {
          ...articleData,
          writers: {
            connect: writerIds.map((id) => ({ id })),
          },
        },
      });
      console.log(`  ✓ Created article: ${article.title}`);
    }

    console.log("✨ Local database seeding completed successfully!");
    console.log(
      `📊 Seeded: ${categories.length} categories, ${writers.length} writers, ${articles.length} articles`,
    );
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// エラーハンドリング
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled rejection:", error);
  process.exit(1);
});

seedDatabase().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
