---
phase: 275
plan: implicit-from-context
subsystem: privacy-policy + cws-listing + ci-guard
tags: [i18n, cws, privacy, ci, telemetry, blocker-b3, v0.9.69]
requires: [Phase 269 control-panel toggle, Phase 273 backend forget endpoint + IP hashing, Phase 274 /stats page + FSBTelemetryService]
provides: [privacy-page Anonymous Usage Telemetry section, CWS listing-copy.md "Data Collection" section, CWS privacy-practices-evidence.md, scripts/verify-store-listing.mjs CI guard, tests/{verify-store-listing,showcase-privacy-page}.test.js, root npm test chain wiring, manifest.json homepage_url]
affects: [extension/manifest.json, package.json, showcase/angular/src/app/pages/privacy/, showcase/angular/src/locale/messages*.xlf, store-assets/chrome-web-store/, scripts/, tests/]
requirements_satisfied: [CONS-03, CONS-04, CONS-05, CONS-06, CONS-07]
blockers_closed: [B3 — CWS listing + Privacy Practices declaration]
tech_added: [verify-store-listing CI guard (Node built-ins only)]
patterns_reinforced: [i18n discipline @@CUSTOM_ID + i18nMissingTranslation:error, verbatim Limited Use phrasing, root npm test chain insertion after showcase-build-smoke]
key_files_created: [scripts/verify-store-listing.mjs, tests/verify-store-listing.test.js, tests/showcase-privacy-page.test.js, store-assets/chrome-web-store/privacy-practices-evidence.md]
key_files_modified: [showcase/angular/src/app/pages/privacy/privacy-page.component.html, showcase/angular/src/locale/messages.xlf, showcase/angular/src/locale/messages.{es,de,ja,zh-CN,zh-TW}.xlf, store-assets/chrome-web-store/listing-copy.md, extension/manifest.json, package.json]
decisions: [Use uppercase @@PRIVACY_TELEMETRY_* IDs matching SHOWCASE_STATS_FSB_* convention; AI-fill all 5 non-en locales inline rather than via translations.json pipeline (faster, single commit, no infra change); Place verify-store-listing.mjs at root scripts/ (matches package-extension.mjs precedent, not showcase/angular/scripts); Append new XLIFF entries before </body> rather than reordering — Angular i18n lookup is by ID not by position; Add homepage_url to manifest.json (Rule 2 auto-fix — CI guard requires it); Use {{ '{' }} / {{ '}' }} Angular interpolation escape for curl-recipe JSON braces; Wire test chain insertion at root package.json after showcase-build-smoke.test.js per CONTEXT recommendation, not via .github/workflows/ci.yml]
metrics:
  duration: 12m37s
  duration_sec: 757
  task_count: 4
  files_changed: 11
  insertions: ~1689
  trans_units_added: 25
  i18n_targets_filled: 125
  test_count_new: 56  # 3 in verify-store-listing.test.js + 53 in showcase-privacy-page.test.js
  ci_invariants_added: 5
completed: 2026-05-14
---

# Phase 275 Plan implicit-from-context: Privacy Policy Page Update + CWS Listing Diff + CI Guard + Integration Smoke Summary

**One-liner:** Final BLOCKER B3 closeout: published anonymous-usage-telemetry disclosure on the privacy page (with full i18n across 6 locales), authored CWS Data-Collection listing copy + Privacy Practices evidence file with verbatim Limited Use phrasing, and wired a 5-assertion CI guard (`scripts/verify-store-listing.mjs`) + 56-assertion test pair into the root `npm test` chain so v0.9.69 is publishable.

## What landed

### 1. Privacy page Anonymous Usage Telemetry section (i18n source)

Appended to `showcase/angular/src/app/pages/privacy/privacy-page.component.html`:

- `<h2 id="telemetry-disclosure" i18n="@@PRIVACY_TELEMETRY_HEADING">Anonymous Usage Telemetry</h2>` — stable anchor cited by the extension control-panel kill-switch link (already shipped Phase 269) and by the CWS Privacy Policy URL.
- Intro paragraph + 7 subsections with H3 + i18n-marked content:
  1. **What we collect** — 5-bullet list (UUID, MCP client, model, tokens, active-agent count).
  2. **What we do NOT collect** — 6-bullet list (URLs, prompts, DOM, plaintext IPs, names, emails).
  3. **Retention** — 7d raw / 365d daily rollups / lifetime global aggregates.
  4. **How to opt out** — Control Panel → Advanced Settings → toggle.
  5. **How to erase your data** — anchor `#erase-data` with curl recipe for `POST /api/telemetry/forget`. Curly braces in the JSON body escaped via Angular `{{ '{' }} / {{ '}' }}` interpolation so the parser accepts the literal.
  6. **Limited Use affirmation** — verbatim CWS-compliant phrasing including the 4 "never" clauses.
  7. **Aggregated public metrics** — link to `/stats`.

25 new `@@PRIVACY_TELEMETRY_*` trans-units extracted into `messages.xlf`. Source XLIFF total goes from 445 → 470 trans-units.

### 2. Five non-en locale AI-fill

Inserted 25 fully translated `<target state="translated">` blocks into each of `messages.{es,de,ja,zh-CN,zh-TW}.xlf` (125 translation entries total). Translations were authored to be culturally + technically accurate; code identifiers (FSB, UUID, MCP, install_uuid, fsbInstallUuid, Chrome, Chrome Web Store, Limited Use, GDPR, HTTP, DevTools, AI, IP, URL, DOM, grok-4-fast, claude-opus-4, Claude Code, Cursor, Codex) stay verbatim because they live inside `<x id="…"/>` placeholders extracted by `ng extract-i18n`. The build-time `i18nMissingTranslation: error` invariant is intact and `npm --prefix showcase/angular run build` exits 0.

Sample translations of "Anonymous Usage Telemetry":

| Locale  | Translation                |
| ------- | -------------------------- |
| en      | Anonymous Usage Telemetry  |
| es      | Telemetría anónima de uso  |
| de      | Anonyme Nutzungstelemetrie |
| ja      | 匿名利用テレメトリー        |
| zh-CN   | 匿名使用遥测                |
| zh-TW   | 匿名使用遙測                |

### 3. CWS listing-copy.md + privacy-practices-evidence.md

- Appended "Data Collection" section to `store-assets/chrome-web-store/listing-copy.md` mirroring the privacy-page disclosure (5 collected, 6 NOT-collected, retention, opt-out path, verbatim Limited Use, full privacy-policy link).
- New `store-assets/chrome-web-store/privacy-practices-evidence.md` (101 lines) is the in-repo source-of-truth for what the human publisher does on the CWS Developer Dashboard Privacy Practices tab. It contains:
  - Per-checkbox decision matrix (PII = TICK with UUID-as-identifier justification, Web history = NO, Limited Use = TICK; all other personal-data boxes NO).
  - Privacy Policy URL: `https://full-selfbrowsing.com/privacy#telemetry-disclosure`.
  - Verbatim Limited Use compliance statement (must be byte-equal to the privacy-page text).
  - Screenshots to capture at publish time (placeholders for `screenshots/privacy-{01..05}-*.png`).
  - 8-step publish-time workflow checklist.
  - Cross-references to all related phases (269, 273, 274, 275).

### 4. CI guard + tests

- New `scripts/verify-store-listing.mjs` (Node-built-ins-only) reads `listing-copy.md`, `privacy-practices-evidence.md`, and `extension/manifest.json` and asserts 5 invariants:
  1. listing-copy.md contains `^## Data Collection|Data we collect` (case-insensitive).
  2. listing-copy.md mentions `full-selfbrowsing.com/privacy`.
  3. Either listing-copy.md OR privacy-practices-evidence.md contains `#telemetry-disclosure`.
  4. privacy-practices-evidence.md exists and is non-empty.
  5. extension/manifest.json has a `homepage_url` string.
- New `tests/verify-store-listing.test.js` (3 invariants) spawns the script and asserts exit 0 + stdout/stderr quality.
- New `tests/showcase-privacy-page.test.js` (53 invariants) reads the privacy-page template directly without a browser and asserts the stable anchor, section heading, 5 collected fields, 6 NOT-collected categories, GDPR Article 17 curl recipe, /stats link, all 6 verbatim Limited Use phrases, and all 24 required `@@PRIVACY_TELEMETRY_*` i18n markers.
- Test-chain wiring inserted into root `package.json` immediately after `node tests/showcase-build-smoke.test.js`:
  ```
  … && node scripts/verify-store-listing.mjs
     && node tests/verify-store-listing.test.js
     && node tests/showcase-privacy-page.test.js && …
  ```

## Commits

| Task | Commit  | Message |
| ---- | ------- | ------- |
| 1    | c9db4f0 | feat(275-01): add anonymous usage telemetry section to privacy policy + i18n extract |
| 2    | 412195f | feat(275-02): AI-fill 5 non-en locales for privacy telemetry section |
| 3    | 94144ee | feat(275-03): CWS listing data collection section + privacy practices evidence |
| 4    | b3fc2ee | test(275-04): privacy page + verify-store-listing CI guard + test chain |

## Verifications (all green)

| # | Command                                                              | Result          |
| - | -------------------------------------------------------------------- | --------------- |
| 1 | `node scripts/verify-store-listing.mjs`                              | exit 0 — 5/5 PASS |
| 2 | `node tests/verify-store-listing.test.js`                            | exit 0 — 3/3 PASS |
| 3 | `node tests/showcase-privacy-page.test.js`                           | exit 0 — 53/53 PASS |
| 4 | `npm --prefix showcase/angular run build`                            | exit 0 — 30 prerendered routes, i18nMissingTranslation invariant intact |
| 5 | `npm --prefix showcase/angular run verify:hreflang`                  | exit 0 — 301/301 PASS (route count unchanged) |
| extra | `SKIP_BUILD=1 node tests/showcase-build-smoke.test.js`           | exit 0 — 130/130 PASS (existing /stats Easter-egg posture intact) |
| extra | `/stats` absence in prerender-routes.txt / sitemap.xml / llms.txt / llms-full.txt | confirmed absent |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Critical functionality] Added `homepage_url` to extension/manifest.json**
- **Found during:** Task 4 (writing scripts/verify-store-listing.mjs).
- **Issue:** The CONTEXT spec requires the CI guard to assert that `extension/manifest.json` has `homepage_url`. The manifest didn't have one — only a separate root `package.json#homepage` (GitHub URL). Adding `homepage_url` is required for both the CI guard to pass and for the CWS listing to be technically correct.
- **Fix:** Inserted `"homepage_url": "https://full-selfbrowsing.com"` after `description` in `extension/manifest.json`.
- **Files modified:** extension/manifest.json (1 line added).
- **Commit:** b3fc2ee.

**2. [Rule 3 — Blocking] Used Angular interpolation escapes for curl JSON braces**
- **Found during:** Task 1 (first `ng extract-i18n` invocation).
- **Issue:** Raw `{"install_uuid":…}` in the curl recipe `<pre><code>` block triggered Angular's `NG5002: Unexpected character "EOF" (Do you have an unescaped "{" in your template?)` compile error. Required to unblock i18n extract + showcase build.
- **Fix:** Replaced `{...}` with `{{ '{' }}...{{ '}' }}` (Angular interpolation-of-string-literal escape, the project's documented way to emit a literal curly brace in a template). Translators see no `{` token so this does not affect i18n behavior.
- **Files modified:** showcase/angular/src/app/pages/privacy/privacy-page.component.html (1 line).
- **Commit:** c9db4f0 (within Task 1).

**3. [Out-of-scope discovery, not fixed] showcase/angular package.json has no `extract-i18n-clean` npm script.**
- **Found during:** Task 1.
- **Spec:** "Run `npm --prefix showcase/angular run extract-i18n-clean` to regenerate `messages.xlf`."
- **Reality:** The PROJECT.md and v0.9.63 ROADMAP mention `extract-i18n-clean` as a CI gate, but `showcase/angular/package.json` exposes only `extract-i18n` via the Angular CLI builder (in `angular.json`). I invoked `node_modules/.bin/ng extract-i18n --output-path src/locale --format=xlf` directly — equivalent semantics, byte-identical output.
- **Action:** Logged here. No fix attempted (out-of-scope per Scope Boundary — pre-existing absence, unrelated to this plan's goal). The build invariant is preserved (`messages.xlf` regenerated cleanly, no stale entries).

### Auth gates

None — fully autonomous execution.

### Known stubs

None — all code paths are wired end-to-end (privacy page renders, CI guard reads real files, manifest URL is real).

### Threat flags

None — this phase adds no new network endpoints, auth surfaces, or trust-boundary data flows. The only new public-facing surface is documentation (the privacy page section), which the existing CSP/SSR setup already serves.

## Cross-references

- Privacy section anchor `#telemetry-disclosure` is already referenced by:
  - `extension/ui/control_panel.html:658` — kill-switch hint link (Phase 269).
  - `store-assets/chrome-web-store/privacy-practices-evidence.md` — Privacy Practices URL (this phase).
  - `store-assets/chrome-web-store/listing-copy.md` — Data Collection footer (this phase).
- `POST /api/telemetry/forget` curl recipe references the Phase 273 INGEST-12 endpoint.
- `/stats` link is the Phase 274 public-aggregates page (Easter-egg posture preserved — absent from sitemap / llms / prerender-routes).

## Deferred (per CONTEXT)

Per CONTEXT.md these are explicitly NOT in scope and remain on the backlog:
- TELEMETRY-FUTURE-01: First-run privacy banner UI.
- TELEMETRY-FUTURE-02: "View what we send" live JSON preview panel.
- TELEMETRY-FUTURE-03: "Reset anonymous ID" in-extension button.
- TELEMETRY-FUTURE-04: "Wipe my telemetry data" in-extension button (the backend endpoint already exists; we documented the curl recipe instead).
- TELEMETRY-FUTURE-05: Region-gated opt-IN for EU/UK/CA installs.
- Footer link from `/` to `/privacy#telemetry-disclosure` (already linked via control-panel kill-switch).

## Self-Check: PASSED

- showcase/angular/src/app/pages/privacy/privacy-page.component.html: FOUND
- showcase/angular/src/locale/messages.xlf: FOUND (+25 PRIVACY_TELEMETRY_ trans-units)
- showcase/angular/src/locale/messages.{es,de,ja,zh-CN,zh-TW}.xlf: FOUND (each +25 translated targets)
- store-assets/chrome-web-store/listing-copy.md: FOUND (+ Data Collection section)
- store-assets/chrome-web-store/privacy-practices-evidence.md: FOUND
- scripts/verify-store-listing.mjs: FOUND
- tests/verify-store-listing.test.js: FOUND
- tests/showcase-privacy-page.test.js: FOUND
- extension/manifest.json: FOUND (+ homepage_url)
- package.json test chain wired: FOUND (3 entries after showcase-build-smoke)
- commits c9db4f0, 412195f, 94144ee, b3fc2ee: FOUND in git log
- 5 verification commands: exit 0
