import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  disable: process.env.NODE_ENV === "development",
  swDest: "public/sw.js",
  // eslint-disable-next-line write-good-comments/write-good-comments
  // Note: This is only an example. If you use Pages Router,
  // use something else that works, such as "service-worker/index.ts".
  swSrc: "src/app/sw.ts",
});
const nextConfig: NextConfig = withSerwist({
  experimental: {
    typedRoutes: true,
  },
  images: {
    remotePatterns: [{ hostname: "dailyportalz.jp", protocol: "https" }],
    // Vercel の画像最適化は変換と保管が課金対象。索引が配るサムネイルは
    // 100x100 の 12KB で、縮めても得るものが無い。素のまま配る。
    unoptimized: true,
  },
  reactStrictMode: false,
});

export default nextConfig;
