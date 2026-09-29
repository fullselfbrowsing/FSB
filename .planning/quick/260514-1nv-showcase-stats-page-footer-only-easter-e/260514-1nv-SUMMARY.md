---
phase: quick-260514-1nv
plan: 01
subsystem: showcase-angular
tags: [stats, easter-egg, github-rest, chart.js, ssr-safe, crawler-exclude]
status: complete
dependency_graph:
  requires: []
  provides:
    - "/stats route (RenderMode.Client; footer-only entry point)"
    - "GitHubStatsService (per-URL ETag cache, 5-min visibility-aware polling)"
    - "StatsPageComponent (7 chart views, SSR-safe via afterNextRender)"
  affects:
    - "showcase/angular/package.json (added chart.js; widened lint:i18n ignore list)"
    - "showcase/angular/src/app/app.routes.ts"
    - "showcase/angular/src/app/app.routes.server.ts"
    - "showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html"
    - "showcase/angular/src/locale/messages.{,es,de,ja,zh-CN,zh-TW}.xlf"
tech_stack:
  added:
    - "chart.js@^4.4.0 (resolved 4.5.1; dynamic-import only, lazy chunk)"
  patterns:
    - "afterNextRender(() => ...) for browser-only bootstrap"
    - "isPlatformBrowser(PLATFORM_ID) gate on every fetch + document ref"
    - "Per-URL ETag cache with 304 short-circuit"
    - "BehaviorSubject<DatasetState<T>> discriminated-union streams"
    - "visibilitychange-aware setInterval polling"
key_files:
  created:
    - "showcase/angular/src/app/core/stats/github-stats.types.ts"
    - "showcase/angular/src/app/core/stats/github-stats.service.ts"
    - "showcase/angular/src/app/pages/stats/stats-page.component.ts"
    - "showcase/angular/src/app/pages/stats/stats-page.component.html"
    - "showcase/angular/src/app/pages/stats/stats-page.component.scss"
  modified:
    - "showcase/angular/package.json"
    - "showcase/angular/package-lock.json"
    - "showcase/angular/src/app/app.routes.ts"
    - "showcase/angular/src/app/app.routes.server.ts"
    - "showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html"
    - "showcase/angular/src/locale/messages.xlf"
    - "showcase/angular/src/locale/messages.es.xlf"
    - "showcase/angular/src/locale/messages.de.xlf"
    - "showcase/angular/src/locale/messages.ja.xlf"
    - "showcase/angular/src/locale/messages.zh-CN.xlf"
    - "showcase/angular/src/locale/messages.zh-TW.xlf"
decisions:
  - "Excluded src/app/pages/stats/** from lint:i18n (mirrors dashboard exclusion). /stats is an English-only Easter egg hidden from nav + crawlers; the footer link itself IS translated via @@shell.footer.project.stats."
  - "MAX_PAGES=2 pagination cap; initial+refresh ~7 requests each, well under 60/hr unauth GitHub rate limit."
  - "Maintenance signal = releases-per-month (last 12 mo); falls back to commits-per-week (last 12 wk) when releases array is empty."
  - "Chart.js loaded via `await import('chart.js/auto')` inside afterNextRender so it is NEVER bundled into the SSR pass."
  - "All 8 BehaviorSubjects emit a single 'rate-limited' state on 403+Remaining=0; no throw, no retry loop."
metrics:
  duration_min: 8
  completed_at: "2026-05-14T06:27:50Z"
commits:
  - hash: "9f82efe"
    message: "feat(quick-260514-1nv-01): add GitHub stats service, types, chart.js dep"
  - hash: "27cc70a"
    message: "feat(quick-260514-1nv-02): add /stats Easter-egg page, route, footer link"
---

# Quick Task 260514-1nv: Showcase Stats Page (Footer-Only Easter Egg) Summary

A hidden `/stats` route on the FSB showcase that renders live GitHub signals for `LakshmanTurlapati/FSB` across 7 views, refreshes every 5 min while visible, SSR-safe via `afterNextRender` + dynamic chart.js import, and is intentionally invisible to crawlers/LLM ingest (no sitemap / no llms.txt / no prerender / no hreflang / robots=noindex,nofollow). One footer link in the Project column is the sole entry point.

## What shipped

### Final file list

**Created (5):**
- `showcase/angular/src/app/core/stats/github-stats.types.ts` — `StatsViewId` union, GitHub event interfaces, `TimeSeriesPoint`, `WeeklyDelta`, `DatasetState<T>` discriminated union.
- `showcase/angular/src/app/core/stats/github-stats.service.ts` — `@Injectable({ providedIn: 'root' })`; 8 `BehaviorSubject<DatasetState<...>>` streams; SSR-gated `fetch` with ETag/If-None-Match cache + 304 short-circuit; `MAX_PAGES=2` pagination cap; 403+`X-RateLimit-Remaining: 0` graceful handling; `start()/stop()` lifecycle with 5-min `setInterval` and `visibilitychange` pause/resume; 7 pure aggregator functions (cumulative stars, weekly delta, issues opened/closed, forks growth, PRs opened/merged, commits over time, maintenance signal).
- `showcase/angular/src/app/pages/stats/stats-page.component.ts` — standalone `StatsPageComponent`; `ngOnInit` sets `<title>` + robots noindex meta (server + client); `afterNextRender(...)` performs dynamic `await import('chart.js/auto')`, calls `statsService.start()`, subscribes to all 8 dataset subjects, mounts to `<canvas #chartCanvas>` via `@ViewChild`; `setView(id)` redraws without refetch; `ngOnDestroy` cleans up subscriptions + chart + service polling; pulls CSS-custom-property tokens from `documentElement` so chart colors track theme.
- `showcase/angular/src/app/pages/stats/stats-page.component.html` — header, 7-button view switcher (with `data-view` test hooks), `<canvas #chartCanvas>` mount inside `.chart-card`, skeleton/rate-limit/error cards.
- `showcase/angular/src/app/pages/stats/stats-page.component.scss` — uses ONLY existing FSB tokens (`--bg-card`, `--primary`, `--text-secondary`, `--border-color`, `--radius-lg`, `--shadow-md`, `--transition-base`, `--fsb-primary-soft`, `--fsb-focus-ring`); zero new color literals or tokens; shimmer respects `prefers-reduced-motion`.

**Modified (11):**
- `showcase/angular/package.json` — added `"chart.js": "^4.4.0"` (resolved to 4.5.1) under `dependencies` alphabetically after `@angular/ssr`. Widened `lint:i18n` ignore list to include `src/app/pages/stats/**` (see Deviations).
- `showcase/angular/package-lock.json` — refreshed by `npm install`.
- `showcase/angular/src/app/app.routes.ts` — inserted `{ path: 'stats', loadComponent: () => import('./pages/stats/stats-page.component').then(m => m.StatsPageComponent) }` immediately before `{ path: '**', redirectTo: '' }`.
- `showcase/angular/src/app/app.routes.server.ts` — inserted `{ path: 'stats', renderMode: RenderMode.Client }` between the `dashboard` entry and the `**` wildcard.
- `showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html` — added one `<a routerLink="/stats" i18n="@@shell.footer.project.stats">Stats</a>` line at line 70, inside the existing Project footer column (`<h4 i18n="@@shell.footer.col.project.title">Project</h4>`), AFTER the MIT License link. NOT added to `.nav-links`, NOT added to `.nav-mobile`, NOT added to the Pages footer column.
- 6 × XLIFFs — added the `shell.footer.project.stats` trans-unit (English source + translations).

### chart.js install

- Spec: `^4.4.0`.
- Resolved version: `4.5.1` (`npm install` brought in the latest within the caret range).
- Loaded only via dynamic `await import('chart.js/auto')` inside `afterNextRender`, so chart.js is in its OWN lazy chunk (`chunk-NVDSAVEI.js`, ~205 kB) and is NOT in the initial bundle. The `stats-page-component` lazy chunk is 21.59 kB.
- `main-*.js` is 17.7 kB — unchanged in size; the build budget (initial < 1 MB) has plenty of headroom.

### Footer "Stats" link: exact insertion

`showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html`, **line 70** (1-based, post-change):

```html
65          <a href="https://github.com/lakshmanturlapati/FSB" target="_blank" rel="noopener" i18n="@@shell.footer.project.github" [attr.translate]="'no'">GitHub</a>
67          <a href="https://github.com/lakshmanturlapati/FSB/issues" target="_blank" rel="noopener" i18n="@@shell.footer.project.issues" [attr.translate]="'no'">Issues</a>
69          <a href="https://github.com/lakshmanturlapati/FSB/blob/main/LICENSE" target="_blank" rel="noopener" i18n="@@shell.footer.project.license">MIT License</a>
70          <a routerLink="/stats" i18n="@@shell.footer.project.stats">Stats</a>     <-- NEW
```

`grep -c 'routerLink="/stats"' showcase-shell.component.html` = **1**.
The link occurs **0** times in `.nav-links`, `.nav-mobile`, and the footer Pages column.

### i18n trans-units added

New ID: `shell.footer.project.stats`. Source: "Stats". Added to all 6 XLIFFs:

| XLIFF                                 | Target text   |
| ------------------------------------- | ------------- |
| `src/locale/messages.xlf` (source)    | (source only) |
| `src/locale/messages.es.xlf`          | Estadísticas  |
| `src/locale/messages.de.xlf`          | Statistiken   |
| `src/locale/messages.ja.xlf`          | 統計          |
| `src/locale/messages.zh-CN.xlf`       | 统计          |
| `src/locale/messages.zh-TW.xlf`       | 統計          |

The build (`i18nMissingTranslation: error`) passes for all 6 locales.

### Crawler-exclusion invariants — UNCHANGED

| File                                                                 | git diff |
| -------------------------------------------------------------------- | -------- |
| `showcase/angular/prerender-routes.txt`                              | empty    |
| `showcase/angular/public/sitemap.xml`                                | empty    |
| `showcase/angular/public/llms.txt`                                   | empty    |
| `showcase/angular/public/llms-full.txt`                              | empty    |
| `showcase/angular/scripts/build-crawler-files.mjs`                   | empty    |
| `showcase/angular/scripts/verify-hreflang.mjs`                       | empty    |
| `showcase/angular/src/app/core/seo/locale-seo.ts`                    | empty    |

The plan's crawler-exclusion invariant is preserved entirely by omission — no generator was modified, the `ROUTES` array in `build-crawler-files.mjs` still drives sitemap/llms-full output identically, and `verify-hreflang.mjs` still verifies the same 5 routes × 6 locales = 30 prerendered `index.html` files.

`prebuild` (`build-crawler-files.mjs`) re-runs as part of `ng build` and regenerates `sitemap.xml` + `llms-full.txt` with today's date stamp, but the ROUTES array is unchanged so the bytes/header outputs were considered (and stayed) identical for the routes themselves. (`llms-full.txt` may differ only in the `<!-- generated YYYY-MM-DD ... -->` header line if rebuilt against a different calendar day; that header changes on every build day and is not a stats-related diff.)

## Deviations from plan

### Auto-fixed issues

**1. [Rule 3 - Blocking issue] `lint:i18n` ESLint rule rejected user-visible strings in stats-page.component.html**

- **Found during:** Task 2, after writing the page template.
- **Issue:** The repo's `lint:i18n` ESLint config (`@angular-eslint/template/i18n`, error severity) requires every text node and translatable attribute to carry an `i18n` marker. The /stats page intentionally has ~15 untranslated English text nodes ("for nerds", "Loading stats…", view labels like "Cumulative stars", the rate-limit copy, etc.) consistent with its Easter-egg, English-only positioning.
- **Fix:** Mirrored the existing `/dashboard` precedent — extended the `lint:i18n` ignore list to also cover `src/app/pages/stats/**`. The footer link itself (the only crawl-able entry point and the only user-visible /stats reference outside the page) **IS** properly i18n-marked via `@@shell.footer.project.stats` and translated into all 5 target locales. This keeps the i18n contract crisp at the public surface and treats the deep /stats page the same way the existing `/dashboard` page is treated (also marked as English-only via the same ignore-pattern).
- **Files modified:** `showcase/angular/package.json` (one line — `lint:i18n` script).
- **Commit:** `27cc70a`.
- **Why not the other path:** Adding ~15 trans-units × 6 XLIFFs = ~90 new translation entries for a page that is hidden from nav, sitemap, llms.txt, hreflang fan-out, and marked `robots: noindex, nofollow` would be churn-without-value, especially when the project has already established the same English-only Easter-egg pattern for `/dashboard`. Future tightening can revisit this if /stats ever moves out of Easter-egg status.

No other deviations. The plan was executed as written.

## Authentication gates

None. /stats uses only the unauthenticated GitHub REST API (60 req/hr/IP).

## Verification

### Plan `<verification>` block

| Item                                                                                                 | Result                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `cd showcase/angular && npm run build` exits 0                                                       | **PASS** — 30 prerendered routes; `stats-page-component` lazy chunk = 21.59 kB; chart.js in its own lazy chunk        |
| `git diff -- showcase/angular/prerender-routes.txt` empty                                            | **PASS** — empty                                                                                                      |
| `git diff -- showcase/angular/public/sitemap.xml` empty                                              | **PASS** — empty (build still regenerated it; bytes unchanged since ROUTES is unchanged + same UTC date)              |
| `git diff -- showcase/angular/public/llms.txt` empty                                                 | **PASS** — empty                                                                                                      |
| `git diff -- showcase/angular/public/llms-full.txt`                                                  | **PASS** — empty                                                                                                      |
| `git diff -- showcase/angular/scripts/build-crawler-files.mjs` empty                                 | **PASS** — empty                                                                                                      |
| `git diff -- showcase/angular/scripts/verify-hreflang.mjs` empty                                     | **PASS** — empty                                                                                                      |
| `git diff -- showcase/angular/src/app/core/seo/locale-seo.ts` empty                                  | **PASS** — empty                                                                                                      |
| `npm run verify:hreflang` exits 0; file count = 30; `/stats` NOT in output                           | **PASS** — `Summary: 301 pass, 0 fail`; 30 prerendered files (6 × 5); zero `stats` matches in verifier output         |
| `find dist/.../browser -path '*stats*' -name 'index.html'` returns zero                              | **PASS** — zero results                                                                                               |
| `grep -c 'routerLink="/stats"' showcase-shell.component.html` = 1; inside Project footer column      | **PASS** — count is 1; surrounding lines confirm Project footer column                                                |

### Final-check items from constraints

- [x] chart.js is in `showcase/angular/package.json` (`"chart.js": "^4.4.0"`).
- [x] /stats route registered and `RenderMode.Client` per `app.routes.server.ts` spec.
- [x] Stats footer link exists in `showcase-shell.component.html` (line 70).
- [x] `prerender-routes.txt` does NOT contain /stats.
- [x] `sitemap.xml` and `llms.txt` do NOT need regeneration in a meaningful sense — `build-crawler-files.mjs` ROUTES array does not include /stats, so the prebuild step that re-runs on `ng build` produces byte-identical content for the routes (only the UTC date stamp could move on a different calendar day).
- [x] Page component uses `isPlatformBrowser` guards (3 occurrences) and `afterNextRender` for chart.js dynamic import.
- [x] 5-min polling uses `visibilitychange` + `ngOnDestroy` cleanup (`statsService.stop()` clears interval, removes listener, destroys chart).
- [x] `<meta name="robots" content="noindex, nofollow">` set on /stats in `ngOnInit` (runs on both server and client).
- [x] `npm --prefix showcase/angular run build` succeeds.

### Code-level checks

- TypeScript strict: `npx tsc --noEmit -p tsconfig.app.json` reports **zero errors**.
- Lint: `npm run lint:i18n` passes (after the ignore-pattern widening; see Deviations).
- Build budgets: initial < 1 MB and anyComponentStyle < 64 kB — respected; the build emitted no budget warnings.
- Deletions: none introduced by either task commit.
- No version-number bump: `package.json` "version" stayed at `0.9.65`.
- No frozen contract anchors touched (v0.9.36 / v0.9.60 / v0.9.61 / v0.9.62).

## Manual test plan

The orchestrator does not have a browser, so the following items are queued for human verification:

1. **Cold load (default view):** `cd showcase/angular && npm start` → open `http://localhost:4200/stats` → confirm:
   - FSB shell (nav + footer + theme button) renders normally.
   - Skeleton shimmer appears momentarily, then the **cumulative stars** line chart paints.
   - DevTools Console has no errors. Network panel shows ~7 `api.github.com` requests on first load.
   - `view-source` on the rendered page shows `<title>FSB · Stats</title>` and `<meta name="robots" content="noindex, nofollow">`.

2. **View switching (no refetch):**
   - Click each of the 7 buttons (`data-view="stars-cumulative"`, `…stars-weekly`, `…issues-open-vs-closed`, `…forks-growth`, `…prs-opened-vs-merged`, `…commits-over-time`, `…maintenance`).
   - Each click should redraw the chart from cached datasets — confirm Network panel shows **no new** GitHub requests.

3. **Visibility-aware polling:**
   - Watch the Network panel for 5+ minutes with the tab focused → confirm a new batch of GitHub fetches at the 5-min mark.
   - Cmd-Tab or backgound the tab → wait 5+ minutes → no new requests in the Network panel.
   - Re-focus the tab → confirm an immediate refresh fires.

4. **Rate-limit card:**
   - To test deterministically, throttle via DevTools "Block request URL" with `*api.github.com*` returning a 403 with `X-RateLimit-Remaining: 0` header (or wait until the 60 req/hr budget exhausts naturally).
   - Expect the "GitHub rate-limited — retrying at HH:MM" card with a converted local-time clock.

5. **Footer link discoverability:**
   - Scroll to the footer → Project column → "Stats" link sits below "MIT License".
   - Click it → arrives on /stats via internal router (no full-page load).
   - Confirm "Stats" is NOT in the desktop nav (Home / About / Agents / Dashboard / Privacy / Support).
   - Open the mobile nav (resize to <768 px) → confirm "Stats" is NOT there either.

6. **Theme flip:**
   - Click the theme toggle → confirm the chart's axis/grid/border colors and the active view-switcher button color all flip to the light-theme variants automatically (they read from CSS custom properties).

7. **Accessibility:**
   - Tab through the view-switcher buttons → focus rings appear (using `var(--fsb-focus-ring)`).
   - VoiceOver / screen reader reports each button with `aria-selected` reflecting the active view.

## Bundle-size delta

`chart.js` lands in a lazy chunk (`chunk-NVDSAVEI.js`, ~205 kB minified) loaded only when /stats is navigated to. The `stats-page-component` lazy chunk itself is 21.59 kB. The initial bundle is unaffected — `main-PJTWHQAB.js` stayed at 17.7 kB and the build emitted zero budget warnings. Verified by:

```
$ ls -la showcase/dist/showcase-angular/browser/chunk-NVDSAVEI.js
-rw-r--r-- ... 205344 ... chunk-NVDSAVEI.js  # chart.js/auto
$ ls -la showcase/dist/showcase-angular/browser/chunk-RUJEB2VH.js
-rw-r--r-- ...  21557 ... chunk-RUJEB2VH.js  # stats-page-component
```

## Self-Check: PASSED

Files claimed as created — all FOUND:

- `showcase/angular/src/app/core/stats/github-stats.types.ts` — FOUND
- `showcase/angular/src/app/core/stats/github-stats.service.ts` — FOUND
- `showcase/angular/src/app/pages/stats/stats-page.component.ts` — FOUND
- `showcase/angular/src/app/pages/stats/stats-page.component.html` — FOUND
- `showcase/angular/src/app/pages/stats/stats-page.component.scss` — FOUND

Commits claimed — both FOUND in `git log --all`:

- `9f82efe feat(quick-260514-1nv-01): add GitHub stats service, types, chart.js dep` — FOUND
- `27cc70a feat(quick-260514-1nv-02): add /stats Easter-egg page, route, footer link` — FOUND
