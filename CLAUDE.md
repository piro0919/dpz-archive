# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an unofficial archive site for デイリーポータルZ (https://dailyportalz.jp/), a Japanese comedy content website. The application is built with Next.js 15 and React 19, featuring a progressive web app (PWA) with service worker support and providing search functionality for archived articles.

It was forked from `omocoro-archive`, which archives a different site with the same schema and UI. The two repositories are maintained separately; changes do not propagate between them.

Only titles, thumbnails, links and publication dates are stored. Article bodies are never fetched or persisted.

## Common Development Commands

### Development

- `npm run dev` - Start development server with local Docker PostgreSQL
- `npm run dev:prod` - Start development server with Vercel Postgres

### Building & Linting

- `npm run build` - Build the application
- `npm run lint` - Run ESLint (use this for linting)
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run lint:style` - Run Stylelint with auto-fix
- `npm run type-check` - Run TypeScript type checking (use this for type checking)
- `npm run prettier` - Format code with Prettier

### Database Operations

- `npm run migrate:create -- --name [migration_name]` - Create new migration
- `npm run migrate:dev` - Run migrations on local Docker
- `npm run migrate:prod` - Run migrations on Vercel Postgres
- `npm run studio:dev` - Open Prisma Studio for local Docker
- `npm run studio:prod` - Open Prisma Studio for Vercel Postgres
- `npm run seed` - Seed database with initial data

### Code Quality & Analysis

- `npm run depcheck` - Check for unused dependencies
- `npm run find:unused` - Find unused Next.js files
- `npm run knip` - Find unused files and exports

### Docker

- `docker-compose up` - Start local PostgreSQL with WebSocket proxy

## Architecture & Data Models

### Database Schema (Prisma)

The application uses PostgreSQL with three main models:

- **Article**: Core content model with title, URL, thumbnail, category, writers, and publication date
- **Category**: Content categories (記事, 編集部日記, これすごくない？, TV)
- **Writer**: Author profiles with avatar and profile URLs

### Key Technical Patterns

- **App Router**: Uses Next.js 15 App Router with typed routes enabled
- **Search Parameters**: Managed with `nuqs` library for URL state synchronization
- **Data Fetching**: Server actions pattern for database operations
- **Styling**: CSS Modules with strict scoping rules enforced by ESLint
- **PWA**: Service worker implementation with Serwist for offline functionality

### Project Structure

- `src/app/` - Next.js App Router pages and components
- `src/app/_components/` - Shared application components
- `src/app/api/` - API routes for scraping and querying
- `src/lib/` - Utility libraries (cookies, Prisma client)
- `prisma/` - Database schema and migrations

## Scraping

デイリーポータルZ の HTML はおもころとは構造が違うので、スクレイパーは共有できない。

- 記事の取得元は `/kiji` のバックナンバー索引。1 ページ 120 件、285 ページ、2002 年まで遡れる。
  ページングは `?ccm_paging_p=N&ccm_order_by=h.publicDate&ccm_order_by_direction=desc`
- 一覧の行は `.headline-row`。タイトルと URL は `a.headline`、サムネイルは `.td-thumb img`、
  日付は本文末尾の `[YYYY/MM/DD]`。時刻は持っていないので日本時間の 0 時として保存する
- 一覧にカテゴリー欄は無い。URL の第 1 セグメントから導く。`kiji` と `b` はどちらも通常の記事で、
  `b` は 2018 年のリニューアル以前のもの
- 外部サイトへ飛ぶ行（カインズマガジン、YouTube、旧 nifty ブログ）が混ざるので、
  dailyportalz.jp 以外のホストは弾く

### ライターの紐付け

一覧はライター名を地の文で持つだけで、リンクも ID も無い。表記も時代で揺れる（「林 雄司」と「林雄司」）。
名前で突き合わせると外れるので、`/writer/kijilist/<id>` を辿って URL で突き合わせる。
サイドバーの「今大人気の記事」はそのライターの記事とは限らないため、`#mainContentsInner` の中だけを見る。

### 各ルート

| ルート | 役割 |
| --- | --- |
| `GET /api/scrape-newposts` | `/kiji` を 1 ページ目から辿り、新着が尽きたら停止。日次 cron |
| `GET /api/scrape-newposts?from=1&to=20` | ページ範囲を指定した初回取り込み。全 285 ページは 300 秒に入らないので分割する |
| `GET /api/scrape-writers` | `/writer` から 89 人を upsert |
| `GET /api/link-writers?offset=0&limit=10` | 記事とライターを紐付ける。レスポンスの `nextOffset` で継続 |

`vercel.json` の cron は `scrape-newposts` だけ。`link-writers` は分割実行が要るので手動で叩く。

## Environment Setup

### Database Environments

- **Local Development**: Uses Docker PostgreSQL (port 54320) with WebSocket proxy (port 54330)
- **Production**: Uses Neon with connection pooling

### Environment Variables

- `CRON_SECRET` - Required for cron job authentication (defined in src/env.ts)
- Database URLs are automatically configured for Vercel deployment

## Code Style & Standards

### Pre-commit Hooks (Lefthook)

All code must pass these checks before commit:

- Prettier formatting
- Stylelint for CSS
- TypeScript compilation
- ESLint with auto-fix

### ESLint Configuration

- Strict TypeScript rules with explicit return types required
- Import sorting with perfectionist plugin
- CSS Modules validation
- React best practices enforcement
- Write-good-comments for comment quality

### Commit Message Format

Uses conventional commits with additional rules:

- Subject must be lowercase
- Must use present tense verbs
- Type is required (feat, fix, chore, etc.)

## Development Notes

- React Strict Mode is disabled for compatibility
- Images are unoptimized in Next.js config
- Uses React 19 with backwards compatibility overrides
- Service worker disabled in development mode
- PWA installability supported with proper manifest

## Package Installation Rules

パッケージをインストールする前に、必ず以下を実行すること：

1. `npm info <package>` でパッケージの用途を確認
2. dependencies か devDependencies かを判断し、根拠とともにユーザーに提示
3. ユーザーの承認を得てからインストール

### 判断基準

**devDependencies** (`--save-dev`):

- ビルドツール（next-sitemap, webpack等）
- リンター/フォーマッター（eslint, prettier, stylelint）
- 型定義（@types/\*）
- テストツール（jest, vitest）

**dependencies**:

- ランタイムで使用するライブラリ
- フレームワーク（next, react）
- UIコンポーネント

## Configuration Rules

設定ファイルを作成・編集する際、以下の値は推測せずユーザーに確認すること：

- URL（siteUrl、APIエンドポイント等）
- APIキー、シークレット
- 環境固有の設定値
- ポート番号、ホスト名

これらの値を設定する前に、必ずユーザーに確認を取る。
