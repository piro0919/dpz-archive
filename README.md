# DPZ Archive

> Unofficial archive site for [デイリーポータルZ](https://dailyportalz.jp/). Search and browse articles as a PWA.

## ✨ Features

- 🔍 Full-text article search
- 📖 Browse archived articles offline
- 📱 Installable PWA
- ⚡ Server-side rendering for fast loads

## 🛠 Tech Stack

- **Frontend**: Next.js 15 (App Router) + React 19
- **Database**: PostgreSQL + Prisma ORM
- **Styling**: CSS Modules
- **PWA**: Serwist (Service Worker)
- **Deployment**: Vercel

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Setup

```bash
npm install
docker-compose up -d
npm run migrate:dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## 🕸 Scraping

Articles come from the backnumber index at `/kiji`, which is paginated at 120 rows
per page (285 pages, back to 2002). Writers come from `/writer`.

| Route                                     | What it does                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/scrape-newposts`                | Walks `/kiji` from page 1 and stops once a page holds no new articles. Runs daily via cron.           |
| `GET /api/scrape-newposts?from=1&to=20`   | Backfill a fixed page range. The full index does not fit in one 300s invocation, so run it in chunks. |
| `GET /api/scrape-writers`                 | Upserts the ~89 writers from `/writer`.                                                               |
| `GET /api/link-writers?offset=0&limit=10` | Connects articles to writers. Chunked; use `nextOffset` from the response to continue.                |

The article index prints writer names as plain text with no link or id, and the
spelling drifts between eras (`林 雄司` vs `林雄司`), so writer links are resolved
by walking each writer's own article list and matching on URL instead of name.

Categories are derived from the first URL segment: `kiji` and `b` are both plain
articles, `dpq` is 編集部日記, `koresugo` is これすごくない？, `tv` is TV.

## 📄 License

MIT

---

This is an unofficial archive and is not affiliated with デイリーポータルZ or its
publisher. Only titles, thumbnails and links are stored; article bodies are not.
