---
phase: 274-public-aggregates-fsbtelemetryservice-stats-toggle
status: human_needed
verified_at: 2026-05-14T18:22:41Z
verifier: executor-agent (worktree-agent-aa47c956ff0f20cf7)
---

# Phase 274 Verification Report

## Status: `human_needed`

All automated tests + build invariants pass. The reason this is `human_needed`
rather than `passed` is the manual QA checklist in `274-02-SUMMARY.md`: a
browser smoke is needed to confirm the new chart views actually render correctly
across en + at least one non-en locale. The automation cannot exercise Chart.js
rendering in a headless harness short of pulling in Playwright (out of scope for
this phase).

## Automated Verification Results

### Tests (all 6 new tests pass; no regression on Phase 273)

| Test | Sub-assertions | Status |
|------|----------------|--------|
| `tests/server-public-stats-headline.test.js` | 33 | PASS |
| `tests/server-public-stats-series.test.js` | 21 | PASS |
| `tests/server-public-stats-cache.test.js` | 17 | PASS |
| `tests/server-public-stats-no-auth.test.js` | 21 | PASS |
| `tests/fsb-telemetry-service.test.js` | 68 | PASS |
| `tests/showcase-build-smoke.test.js` | 134 | PASS |
| **TOTAL NEW** | **294** | **0 failures** |

### Phase 273 regression (selected critical tests, all still pass)

| Test | Status |
|------|--------|
| `tests/server-telemetry-allowlist.test.js` | PASS |
| `tests/server-telemetry-housekeeper.test.js` | PASS |
| `tests/server-telemetry-rate-limit.test.js` | PASS |
| `tests/server-telemetry-body-cap.test.js` | PASS |
| `tests/server-telemetry-batch-cap.test.js` | PASS |
| `tests/server-telemetry-timestamp-tolerance.test.js` | PASS |
| `tests/server-telemetry-event-id-dedup.test.js` | PASS |
| `tests/server-telemetry-daily-budget.test.js` | PASS |
| `tests/server-telemetry-sec-gpc.test.js` | PASS |
| `tests/server-telemetry-optout-forget.test.js` | PASS |
| `tests/server-telemetry-salt-rotation.test.js` | PASS |
| `tests/server-trust-proxy.test.js` | PASS |
| `tests/server-no-ip-leak.test.js` | PASS (scanned my new files, no IP-leak patterns) |

### Build + Hreflang

| Check | Result |
|-------|--------|
| `npm --prefix showcase/angular run build` | SUCCESS (13.9 s, 30 prerendered routes) |
| `i18nMissingTranslation: error` invariant | HONOURED (no missing translation errors) |
| `npm --prefix showcase/angular run verify:hreflang` | 301 pass / 0 fail (unchanged from baseline) |

### Easter-egg crawler invariant

| File | Contains `/stats`? |
|------|--------------------|
| `showcase/angular/prerender-routes.txt` | NO |
| `showcase/angular/public/sitemap.xml` | NO |
| `showcase/angular/public/llms.txt` | NO |
| `showcase/angular/public/llms-full.txt` | NO |
| `showcase/dist/showcase-angular/browser/stats/` | DOES NOT EXIST (not prerendered) |

### File-existence checks

| File | Exists? |
|------|---------|
| `showcase/server/src/telemetry/active-tracker.js` | YES |
| `showcase/server/src/routes/public-stats.js` | YES |
| `showcase/angular/src/app/core/stats/fsb-telemetry.service.ts` | YES |
| `showcase/angular/src/app/core/stats/fsb-telemetry.types.ts` | YES |
| `showcase/angular/src/locale/translations.stats-274.{es,de,ja,zh-CN,zh-TW}.json` | YES (all 5) |
| `tests/showcase-build-smoke.test.js` | YES |
| `.planning/phases/274-public-aggregates-fsbtelemetryservice-stats-toggle/274-01-SUMMARY.md` | YES |
| `.planning/phases/274-public-aggregates-fsbtelemetryservice-stats-toggle/274-02-SUMMARY.md` | YES |

### Privacy invariants verified

- No `install_uuid`, `ip_hash`, or `event_id` in `/api/public-stats/global` body (regex-asserted in `server-public-stats-headline.test.js` + `server-public-stats-no-auth.test.js`).
- No `Set-Cookie` header on `/api/public-stats/*` responses.
- No new IP-leak patterns introduced; `tests/server-no-ip-leak.test.js` scanned 17 server source files including my new ones and all pass.

## Human Verification Needed

A reviewer should manually verify by visiting the running showcase server and
confirming the following (see `274-02-SUMMARY.md` § "Manual QA Checklist"):

1. **English `/stats`:** 13 toggle buttons visible; FSB Telemetry section header
   above the chart card; headline row reads "<N> active right now · <M> total
   users · <K> tokens (last 24h)" once first fetch resolves.
2. **Each of the 6 new toggles** renders a chart without console errors:
   - `fsb-active-now`: single-bar chart with active_users_now.
   - `fsb-tokens`: 30-day line chart from FSBTelemetrySeries.d30[].tokens.
   - `fsb-agents-running`: single-bar with bucket suffix [5-8] etc.
   - `fsb-popular-agents` / `fsb-popular-mcp`: doughnut from popular_* arrays.
     Renders a "Pending (k>=5 floor)" single slice when the array is empty.
   - `fsb-avg-agents-per-user`: single-bar with suggestedMax=5 for a "big number" feel.
3. **Locale switch verification:** open `/es/stats`, `/de/stats`, `/ja/stats`,
   `/zh-CN/stats`, `/zh-TW/stats` and verify:
   - The FSB section heading is translated ("Telemetría", "Telemetrie", "テレメトリ", "遥测", "遙測").
   - Headline cells are translated ("activos ahora", "jetzt aktiv", "現在アクティブ", "当前活跃", "目前活躍").
   - Brand "FSB" stays as "FSB" verbatim in every locale.
   - The 6 new toggle buttons show locale-appropriate labels.
4. **Visibility behaviour:** background the tab for 1-2 minutes, then refocus.
   Confirm an immediate refresh fires (DevTools Network tab shows
   `/api/public-stats/global` request fire on visibilitychange) and the 5-min
   polling cadence resumes.
5. **`/stats` is not findable via SEO**: visit `/sitemap.xml`, `/llms.txt`,
   `/robots.txt` and confirm `/stats` is not enumerated.

If all of the above pass: status is `passed`. If any fail, file a Phase 275
hot-fix plan.

## Threat Surface Scan

No new security-relevant surface introduced beyond what the plan's
`<threat_model>` already enumerates. The public-stats router is the only new
network surface; its threats are catalogued as T-274-01 through T-274-09 in
`274-01-PLAN.md`. The XLF translations are committed to the repo and reviewed
at PR time per T-274-11.

## Known Stubs

None. The "Pending (k>=5 floor)" doughnut slice is INTENTIONAL — it renders
when the housekeeper's k-anonymity floor suppresses popular_* lists. This is
a feature, not a stub: the slice tells the visitor that data is pending
floor-clear, not that the implementation is incomplete.

## Deferred Issues

None for Phase 274. Items deferred to future phases (per Phase 274 CONTEXT
§ Deferred Ideas):
- Public API documentation + versioning (TELEMETRY-FUTURE-06).
- Per-day sparkline charts (TELEMETRY-FUTURE-07).
- Geo heatmap (TELEMETRY-FUTURE-08).
- 1Hz real-time active-agents ticker (TELEMETRY-FUTURE-09).
- Authenticated `/api/private-stats` (separate from `/api/public-stats`).

---
*Phase: 274-public-aggregates-fsbtelemetryservice-stats-toggle*
*Verifier: executor-agent-aa47c956ff0f20cf7*
*Verified: 2026-05-14*
