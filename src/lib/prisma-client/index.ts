import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
  prismaDirect: PrismaClient | undefined;
};

// pg は sslmode の require / prefer / verify-ca を verify-full の別名として扱っており、
// 次の major で libpq 本来の緩い意味に変わると警告を出す。今の挙動が verify-full な
// 以上、明示しても接続は変わらず、将来の格下げだけを防げる。ローカルの Docker は
// sslmode を持たないので、書いてあるときだけ触る。
function withExplicitSsl(url: string): string {
  return url.replace(
    /([?&]sslmode=)(require|prefer|verify-ca)\b/g,
    "$1verify-full",
  );
}

// Prisma 7 は接続先を schema からではなくドライバアダプタから受け取る。
// 通常のリクエストはプール側、長く走る仕事は非プール側という使い分けは変えない。
function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: withExplicitSsl(connectionString),
    }),
  });
}

export const prismaClient =
  globalForPrisma.prisma ?? createClient(process.env.POSTGRES_PRISMA_URL ?? "");

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}

// Long-running jobs (scrape cron) should use the unpooled connection so they
// don't starve user-traffic queries through the small PgBouncer pool. Lazy so
// other routes don't pay for a non-pooled connection they never use.
// connect_timeout=30 covers Neon serverless compute cold-starts; the default 5s
// races the wake-up and intermittently fails the first query of the day.
function withConnectTimeout(url: string): string {
  if (!url) return url;
  if (/[?&]connect_timeout=/.test(url)) return url;

  return `${url}${url.includes("?") ? "&" : "?"}connect_timeout=30`;
}

export function getPrismaDirectClient(): PrismaClient {
  if (!globalForPrisma.prismaDirect) {
    const url = withConnectTimeout(
      process.env.POSTGRES_URL_NON_POOLING ??
        process.env.POSTGRES_PRISMA_URL ??
        "",
    );

    globalForPrisma.prismaDirect = createClient(url);
  }

  return globalForPrisma.prismaDirect;
}

export default prismaClient;
