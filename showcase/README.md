# FSB Showcase

`showcase/` contains the public site for [full-selfbrowsing.com](https://full-selfbrowsing.com) plus the production Express server that hosts it.

## Layout

| Path | Purpose |
|------|---------|
| `angular/` | Angular 20 app with static prerender for `/`, `/about`, `/privacy`, and `/support`. |
| `server/` | Express + better-sqlite3 backend that serves the site, telemetry ingest, public stats, and the hosted Jev gateway, plus a temporary `ws` sink for pre-retirement extensions (see below). |
| `assets/` | Images, logos, provider artwork, OpenTabs art, and Lattice artwork copied into the Angular build. |
| `css/`, `js/`, `*.html` | Legacy static surfaces plus shared runtime visualizations still kept beside the Angular app. |
| `dist/` | Build output, populated as `showcase/dist/showcase-angular/`. |

## Develop

```bash
cd showcase/angular
npm install
npm start
```

The dev server runs at `http://localhost:4200`.

## Build

```bash
npm --prefix showcase/angular run build
```

The Angular build prerenders the static routes and runs `scripts/build-crawler-files.mjs` first, generating:

- `/robots.txt`
- `/sitemap.xml`
- `/llms.txt`
- `/llms-full.txt`

Production assets are emitted under `showcase/dist/showcase-angular/`.

The Angular config copies `showcase/assets/` into the built `/assets` path and includes the public crawler files from `angular/public/`. It also copies the homepage knowledge graph runtime scripts from `showcase/js/` into `/assets`:

- `fsb-knowledge-data.js`
- `knowledge-graph.js`
- `site-graph.js`

The Angular homepage uses those scripts for the interactive site-knowledge graph and uses the copied provider, OpenTabs, and Lattice artwork for the public marketing surfaces.

## Routes

Static prerender currently covers:

- `/`
- `/about`
- `/privacy`
- `/support`

Research product pages also prerender:

- `/lattice`
- `/concierge`
- `/phantom-stream`
- `/prometheus`

The `/stats` route is a deliberately low key stats for nerds page. It shows live GitHub activity plus FSB telemetry charts for active users, tokens, running agents, average agents per user, and popular MCP clients.

Crawler-facing files are generated from `angular/scripts/build-crawler-files.mjs` and source content in `angular/scripts/llms-full.source.md`.

## Deploy And Smoke

The root `Dockerfile` and `fly.toml` deploy `showcase/server/server.js` on fly.io. Pushes to `main` trigger `.github/workflows/deploy.yml`.

Runtime defaults:

- `PORT=3847`
- `DB_PATH=/data/fsb-data.db`
- `NODE_ENV=production`

Production should also provide `GITHUB_TOKEN` as a Fly secret. Use a
fine-grained token owned by an FSB collaborator, restricted to the FSB
repository with Metadata read and Contents read. The value is consumed only by
the server-side Stats poller and is never sent to browsers.

The production container is built in two stages. The first stage builds the Angular static output. The final stage installs server dependencies, copies the Express source, copies the Angular browser output into `public/`, and creates `/data` for SQLite persistence.

## Server Responsibilities

The Express backend handles:

- serving prerendered Angular assets in production, with locale routing, legacy `.html` redirects, and a localized 404
- anonymous telemetry ingest (`/api/telemetry`) with an hourly housekeeper for retention and rollups
- public aggregate stats for the `/stats` page (`/api/public-stats`), including cached GitHub stats from a server-side poller
- the hosted Jev decision gateway (`/api/jev`), off unless `JEV_ENABLED` is set and the upstream is configured
- SQLite persistence for all of the above

The Live Dashboard was retired after v0.9.95. Installs still on v0.9.95 or earlier keep opening its relay socket, so `server/src/ws/legacy-relay-sink.js` holds those sockets open, answers their pings, and discards everything else; `/api/auth` and `/api/pair` answer `410 Gone` (except `POST /api/auth/register`, which hands keyless old installs a throwaway key that is never stored), and `/dashboard` redirects to the home page. The sink logs an hourly count of open sockets and can be deleted once that count nears zero.

Local CI crawler smoke serves the built static output and runs the route checks against localhost:

```bash
npm run showcase:smoke
```

Production post-deploy crawler checks:

```bash
curl -A GPTBot -sI https://full-selfbrowsing.com/ | head -1
curl -A GPTBot -s  https://full-selfbrowsing.com/llms.txt | head -5
npm --prefix showcase/angular run smoke:crawler
```

See the root [README.md](../README.md) for the full repository overview.
