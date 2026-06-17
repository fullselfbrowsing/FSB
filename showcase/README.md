# FSB Showcase

`showcase/` contains the public site for [full-selfbrowsing.com](https://full-selfbrowsing.com) plus the production Express relay used by dashboard pairing.

## Layout

| Path | Purpose |
|------|---------|
| `angular/` | Angular 20 app with static prerender for `/`, `/about`, `/privacy`, and `/support`. |
| `server/` | Express + better-sqlite3 + ws backend for pairing, auth, PhantomStream-compatible relay, and dashboard data. |
| `assets/` | Images, logos, icons, and provider artwork copied into the Angular build. |
| `css/`, `js/`, `*.html` | Legacy static surfaces still kept beside the Angular app. |
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

The Angular config copies `showcase/assets/` into the built `/assets` path and includes the public crawler files from `angular/public/`.

## Routes

Static prerender currently covers:

- `/`
- `/about`
- `/privacy`
- `/support`

Crawler-facing files are generated from `angular/scripts/build-crawler-files.mjs` and source content in `angular/scripts/llms-full.source.md`.

## Deploy And Smoke

The root `Dockerfile` and `fly.toml` deploy `showcase/server/server.js` on fly.io. Pushes to `main` trigger `.github/workflows/deploy.yml`.

Runtime defaults:

- `PORT=3847`
- `DB_PATH=/data/fsb-data.db`
- `NODE_ENV=production`

The production container is built in two stages. The first stage builds the Angular static output. The final stage installs server dependencies, copies the Express source, copies the Angular browser output into `public/`, and creates `/data` for SQLite persistence.

## Server Responsibilities

The Express backend handles:

- dashboard pairing
- authenticated dashboard routes
- WebSocket relay behavior, including PhantomStream-compatible stream frame classification and limits
- SQLite persistence for paired dashboard state
- serving prerendered Angular assets in production

The static and Angular dashboard preview surfaces use the shared PhantomStream viewer wrapper for snapshot rendering and mutation application. FSB host code still owns dashboard state, pairing, task/status traffic, progress/client badges, frozen overlays, and remote-control affordances.

Post-deploy crawler checks:

```bash
curl -A GPTBot -sI https://full-selfbrowsing.com/ | head -1
curl -A GPTBot -s  https://full-selfbrowsing.com/llms.txt | head -5
npm --prefix showcase/angular run smoke:crawler
```

See the root [README.md](../README.md) for the full repository overview.
