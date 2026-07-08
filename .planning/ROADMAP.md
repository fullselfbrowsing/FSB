# Roadmap: FSB (Full Self-Browsing)

## Milestones

- 🚧 **v1.2.0 Showcase i18n Completeness** — Phases 52-56, in progress. Closes the translation gap that reopened after v0.9.63 shipped: a full-page audit establishes the true drift/missing scope, resync + stats-page translation + transcreation review close it, a CI drift-detection gate lands on the clean baseline, and the long-deferred WARNING-02 locale-cookie redirect bug is fixed.
- ✅ **v1.1.0 T1 App Execution Expansion** — Phases 44-51, shipped 2026-06-30; refreshed 2026-07-01 after post-closeout T1 ports. Expanded proven T1/guarded coverage from 26 baseline descriptors to 1,267 executable T1-ready descriptors plus 556 guarded fail-closed rows, and closed the remaining catalog tail with explicit terminal-state accounting. Archive: `.planning/milestones/v1.1.0-ROADMAP.md`.
- ✅ **v1.0.0 Full App Catalog (OpenTabs Parity)** — Phases 35-43, shipped 2026-06-29. Full OpenTabs-derived catalog/search/discovery surface: 2,314 descriptors across 128 app stems / 129 services; 26 T1/T1b descriptors today; 2,288 descriptors intentionally remain DOM/discovery-tail. Archive: `.planning/milestones/v1.0.0-ROADMAP.md`.

## Current Milestone: v1.2.0 Showcase i18n Completeness

**Milestone Goal:** Close the translation gap that reopened after v0.9.63 shipped -- full, drift-free coverage across all six supported locales (en, es, de, ja, zh-CN, zh-TW) for every showcase marketing page plus the stats page, the long-deferred locale-cookie redirect bug, and a CI gate that catches future drift automatically.

**Key context:** Supported locales are fixed (en source + es/de/ja/zh-CN/zh-TW) -- carried over from v0.9.63's `LocaleService` + locale-constants module, not up for debate. This is the second attempt at closing this exact gap: v0.9.63 left dashboard + WARNING-02 as accepted debt that then sat untouched through 6+ subsequent milestones. Builds on existing tooling: `lint:i18n` eslint check, `verify-locale-sync.mjs`, `ng extract-i18n` -- no new runtime dependency, no XLIFF-format migration.

**Phase ordering rationale (from research, all 4 researchers converged independently):** audit first (establish true scope) -> resync + stats-page translation + visual QA (close the known + newly-found gap) -> stats-page lint-gate flip + dashboard boundary documentation (gated on verified resync completion) -> new CI drift-detection gate (must land on a clean, drift-free baseline) -> WARNING-02 cookie-redirect fix (fully independent, zero shared surface with the rest, sequenced last for narrative completeness only).

**Research correction carried into scope:** the milestone brief's original "247 trans-units changed" framing (from commit `6d3ad363`) overstates the resync scope. An id-keyed `<source>`-text diff shows only 5 of the 247 touched trans-unit blocks have real source drift (`agents.meta.description`, `agents.schema.software.description`, `home.meta.description`, `support.faq.q.tools.a`, `support.schema.faq.tools.a`); the other 242 are harmless `<context-group><linenumber>` churn. Phase 52's audit is the authority on the true, final drift count -- do not fix a resync scope number ahead of that audit completing.

## Phases

**Phase Numbering:**
- Integer phases (52, 53, 54, 55, 56): Planned milestone work, continuing from v1.1.0's Phase 51
- Decimal phases (52.1, 52.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 52: Full-Page Translation Completeness Audit** - Establish the true per-page, per-locale, per-trans-unit coverage/currency verdict and trace the orphaned stats artifacts
- [ ] **Phase 53: Trans-Unit Resync, Stats Translation & Transcreation Review** - Close every audit-identified drift, bring the stats page to full coverage, apply a transcreation lens to hero copy, and spot-check DE/CJK rendering
- [ ] **Phase 54: Stats Lint Gate Flip & Dashboard Boundary Documentation** - Remove the stats-page `lint:i18n` exclusion now that coverage is verified, and document the dashboard exclusion as permanent
- [ ] **Phase 55: CI Drift-Detection Gate** - Add a permanent, back-tested CI gate that fails the build on future undetected translation drift
- [ ] **Phase 56: Locale-Cookie Redirect Fix (WARNING-02)** - Fix the picker-set locale cookie so it correctly redirects returning visitors instead of short-circuiting to EN

## Phase Details

### Phase 52: Full-Page Translation Completeness Audit
**Goal**: Every current showcase route has an authoritative, per-locale, per-trans-unit verdict that distinguishes "coverage" (marked + target exists) from "currency" (target still matches the current English source) -- and the orphaned `translations.stats-274.*.json` artifacts are traced end-to-end into (or explicitly out of) the live XLIFF files the build consumes.
**Depends on**: Nothing (first phase of this milestone)
**Requirements**: AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):
  1. A generated audit report lists, for every current showcase route (lattice, phantom-stream, prometheus, home, mobile nav, stats, and the original v0.9.63 routes) and every one of the 5 non-English locales, a per-trans-unit verdict of coverage AND currency as two distinct checks -- not a single pass/fail signal.
  2. The audit's true drift count is authoritative and supersedes the milestone brief's original "247 trans-units" estimate; the 5 confirmed `6d3ad363`-drifted units are validated as a subset of (not a substitute for) the full audit findings.
  3. The orphaned `translations.stats-274.*.json` artifacts are explicitly resolved: either shown to already be merged into the live `messages.<locale>.xlf` files, or shown to still be outstanding work with no ambiguity left for Phase 53 to inherit.
**Plans**: TBD

### Phase 53: Trans-Unit Resync, Stats Translation & Transcreation Review
**Goal**: Every trans-unit the Phase 52 audit flagged as drifted is resynced across all 5 translated locales, the stats page reaches full translation coverage, hero/CTA copy gets a transcreation-quality pass instead of literal translation, and German/CJK rendering is confirmed clean on the highest-copy-density routes.
**Depends on**: Phase 52
**Requirements**: RESYNC-01, RESYNC-02, RESYNC-03, VISUAL-01
**Success Criteria** (what must be TRUE):
  1. Every trans-unit flagged as drifted by the Phase 52 audit (the 5 confirmed `6d3ad363` units plus any additional units the audit surfaced) has an updated `<target>` in es, de, ja, zh-CN, and zh-TW that matches the current English `<source>`, with `<x id=.../>` placeholder alignment preserved and `DO-NOT-TRANSLATE.md` brand/term rules re-verified for each resynced string.
  2. The stats page has a `<target>` for every trans-unit across all 5 non-English locales -- full coverage, not partial.
  3. The ~10-20 hero headline and primary CTA strings read as natural, locale-appropriate marketing copy rather than literal word-for-word translation, reviewed explicitly through a transcreation lens.
  4. A targeted manual visual spot-check of German (text-expansion risk) and zh-CN/zh-TW (CJK line-wrap risk) on the highest-copy-density routes shows no broken layout, truncation, or overflow -- performed only after the resynced/transcreated copy above has landed, since it needs final translated text to check against.
**Plans**: TBD

### Phase 54: Stats Lint Gate Flip & Dashboard Boundary Documentation
**Goal**: The stats page is held to the same CI translation-completeness bar as every other marketing page, and the dashboard's permanent exclusion from that bar is written down as an explicit architectural decision rather than left as unstated deferred debt.
**Depends on**: Phase 53 (must follow verified stats-page translation completion, not precede it)
**Requirements**: CI-01, CI-05
**Success Criteria** (what must be TRUE):
  1. The `lint:i18n` ignore-pattern for `src/app/pages/stats/**` in `showcase/angular/package.json` is removed, and `npm run lint:i18n` passes clean against the stats page's own templates.
  2. The dashboard page's `lint:i18n` exclusion is documented in-repo as a permanent, intentional architectural boundary (authenticated app surface, not marketing content) with an explicit rationale, not a bare ignore-pattern with no explanation.
**Plans**: TBD

### Phase 55: CI Drift-Detection Gate
**Goal**: A new, permanent CI gate automatically fails the build the moment `messages.xlf`'s English source content changes without a matching update in one of the 5 translated locale files -- landing only once the tree is verified drift-free, so it passes clean on day one instead of immediately failing on residual debt.
**Depends on**: Phase 54 (must land on the clean baseline established by Phases 52-54)
**Requirements**: CI-02, CI-03, CI-04
**Success Criteria** (what must be TRUE):
  1. `verify-translation-drift.mjs` exists, follows the zero-dependency style of the existing `verify-locale-sync.mjs`/`verify-hreflang.mjs` scripts, and fails the build when any trans-unit's English `<source>` text changes without a corresponding update in one of the 5 translated locale files -- diffing per trans-unit `id`, never whole-file or line-count.
  2. The gate is back-tested against this repo's own git history (known-clean pure-churn commits plus commit `6d3ad363` itself) and demonstrably stays silent on clean churn while firing on `6d3ad363`-shaped drift, before being wired hard-fail into CI.
  3. The gate's target-locale list is read dynamically from the existing locale registry at runtime, not hardcoded as a literal list in the script.
**Plans**: TBD

### Phase 56: Locale-Cookie Redirect Fix (WARNING-02)
**Goal**: A returning visitor whose picker-set `fsb-locale` cookie names a valid, non-default supported locale is correctly redirected to that locale's subpath from the bare-`/` route, instead of the cookie being ignored in favor of the EN prerender.
**Depends on**: Nothing (fully independent of Phases 52-55; zero shared surface, could be parallelized)
**Requirements**: ROUTE-01, ROUTE-02
**Success Criteria** (what must be TRUE):
  1. A request to `/` carrying an `fsb-locale` cookie set to a non-default supported locale (es, de, ja, zh-CN, or zh-TW) redirects to that locale's subpath rather than serving the EN prerender.
  2. A request to `/` carrying an `fsb-locale` cookie set to `en` (the default) still falls through correctly to the EN prerender without redirecting to a 404ing `/en/` path.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 52 → 53 → 54 → 55 → 56

| Phase | Plans Complete | Status | Completed |
|-------|-----------------|--------|-----------|
| 52. Full-Page Translation Completeness Audit | 1/1 | Complete   | 2026-07-08 |
| 53. Trans-Unit Resync, Stats Translation & Transcreation Review | 0/TBD | Not started | - |
| 54. Stats Lint Gate Flip & Dashboard Boundary Documentation | 0/TBD | Not started | - |
| 55. CI Drift-Detection Gate | 0/TBD | Not started | - |
| 56. Locale-Cookie Redirect Fix (WARNING-02) | 0/TBD | Not started | - |

## Completed Milestones

<details>
<summary>v1.1.0 T1 App Execution Expansion — Phases 44-51, SHIPPED 2026-06-30</summary>

**Hard invariants (v1.1.0):**

- Kept the two-tool MCP surface: `search_capabilities` and `invoke_capability`; no one tool per app.
- Preserved MV3 Wall 1: descriptors and recipes are closed-vocabulary data; no OpenTabs runtime/plugin code ships.
- Preserved Wall 2 unless explicitly extended by a verified Pattern-D design: credentialed execution stays origin-pinned and same-session.
- Writes and destructive actions stayed fail-closed until live request shape, consent behavior, and no-secret logging were proven.
- Denylisted origins remained blocked; sensitive origins stayed flagged/audited under the existing invoke/discovery consent semantics.
- Search distinguished "directly invocable T1" from "discovery-pending DOM/T2."

### Phase 44: T1 Readiness Inventory + Status Surface
**Goal:** Create the authoritative T1 readiness matrix for all 2,314 descriptors and make status visible to developers and users so "catalog supported" is never confused with "direct API-ready."
**Requirements:** T1R-01, T1R-02, T1R-03.
**Plans:**
- [x] 44-01: T1 readiness matrix generator and evidence report.
- [x] 44-02: Status-surface and documentation honesty pass.
- [x] 44-03: T1 readiness CI guard and phase closeout.

### Phase 45: T1 Porting Scaffold + Handler Contract Hardening
**Goal:** Build the reusable test and implementation scaffold for app ports so each new T1 handler has origin-pin, logged-out guard, shape guard, no-secret logging, consent classification, and byte-stable fallback behavior by default.
**Requirements:** T1R-04, T1R-05, T1R-09.
**Plans:**
- [x] 45-01: Port contract library and scaffold CLI.
- [x] 45-02: Current-catalog contract verifier.
- [x] 45-03: Documentation and phase closeout.

### Phase 46: Same-Origin Read Ports — First High-Value Batch
**Goal:** Convert a first batch of high-value read descriptors from T3 to executable T1 where the app's authenticated web runtime uses same-origin APIs and can be proven without weakening Wall 2.
**Requirements:** T1R-06.
**Plans:**
- [x] 46-01: Candidate selection and Netlify/Bitbucket/CircleCI handler ports.
- [x] 46-02: Catalog wiring, search readiness, and same-origin classifier gates.
- [x] 46-03: Verification, UAT notes, and phase closeout.

### Phase 47: Pattern-D + GAPI Bridge Architecture
**Goal:** Design and prove the missing architecture for apps whose useful APIs are separate-origin, per-org-subdomain, or page-bridge mediated, without breaking the active-tab credential boundary.
**Requirements:** T1R-07, T1R-08.
**Plans:**
- [x] 47-01: Pattern-D decision for separate-origin and per-org APIs.
- [x] 47-02: GAPI bridge decision for Google Workspace APIs.
- [x] 47-03: CI gate, negative controls, and closeout.

### Phase 48: High-Value Read Ports — Second Batch
**Goal:** Use the Phase 47 outcome to port another batch of read descriptors, including Pattern-D/GAPI candidates if the architecture is proven.
**Requirements:** T1R-06, T1R-07, T1R-08.
**Plans:**
- [x] 48-01: Vercel same-origin read head.
- [x] 48-02: CircleCI same-origin read expansion.
- [x] 48-03: Gate, search, and readiness-report closeout.

### Phase 49: Guarded Writes Activation Pipeline
**Goal:** Turn fail-closed write/destructive candidates into executable T1 only after live mutation-body capture, consent gate verification, and redacted audit proof.
**Requirements:** T1R-10, T1R-11.
**Plans:**
- [x] 49-01: Write activation evidence ledger.
- [x] 49-02: Evidence verifier and validation gate.
- [x] 49-03: Live-UAT template and closeout decision.

### Phase 50: T1 Expansion Gate + Next-Batch Plan
**Goal:** Close the milestone with an honest T1 coverage gate, full regression suite, and a prioritized backlog for the remaining 2,288-descendant tail.
**Requirements:** T1R-12.
**Plans:**
- [x] 50-01: Regenerate readiness evidence and closeout counts.
- [x] 50-02: Full regression gate.
- [x] 50-03: Next-batch backlog and milestone closeout.

### Phase 51: Full T1 Tail Migration Across Remaining Catalog
**Goal:** Convert the Phase 51 catalog-tail descriptors to explicit terminal states: executable T1/T1b where safe and technically provable, guarded fail-closed where write/destructive UAT is still required, or blocked where denylist/product/legal policy says no.
**Requirements:** T1ALL-01, T1ALL-02, T1ALL-03, T1ALL-04, T1ALL-05.
**Plans:**
- [x] 51-01: Full-tail worklist generator, acceptance gate, and batch scheduler.
- [x] 51-02: Existing-head and low-risk same-origin read bulk port.
- [x] 51-03: Retool CSRF same-origin read head.
- [x] 51-04: Asana same-origin Pattern-D carveout.
- [x] 51-05: Pattern-D and GAPI bridge implementation waves.
- [x] 51-06: Sensitive consumer/social and blocked-policy triage.
- [x] 51-07: Write/destructive live-UAT activation waves.
- [x] 51-08: Final all-tail regression, UAT ledger, and closeout.

Archive files:

- `.planning/milestones/v1.1.0-ROADMAP.md`
- `.planning/milestones/v1.1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.1.0-MILESTONE-AUDIT.md`

Outcome: v1.1.0 expanded proven direct execution from the v1.0.0 baseline into verified T1-ready read coverage across Netlify, Bitbucket, CircleCI, Vercel, Retool, Asana, and generated same-origin reads, with post-closeout ports reflected in the refreshed artifacts. Phase 51 closes the remaining catalog tail honestly: 1,267 rows are executable T1-ready, 556 rows are guarded fail-closed, and the remaining 491 descriptors are explicitly surfaced as bridge-needed, UAT-needed, blocked-policy, or degraded/discovery-pending rather than overclaimed.

</details>

<details>
<summary>v1.0.0 Full App Catalog (OpenTabs Parity) — Phases 35-43, SHIPPED 2026-06-29</summary>

Archive files:

- `.planning/milestones/v1.0.0-ROADMAP.md`
- `.planning/milestones/v1.0.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v1.0.0-phases/`

Outcome: full OpenTabs-derived catalog/search/discovery surface shipped with 2,314 descriptors across 128 app stems / 129 services. The milestone deliberately fed the existing tier model rather than hand-porting every action: 26 descriptors resolve to T1/T1b today, 5 guarded writes remain fail-closed, and 2,288 descriptors remain T3 DOM/discovery-tail. Full milestone audit passed; non-blocking live UAT and T1 expansion debt are carried forward.

</details>

<details>
<summary>v0.9.99 Native Capability Catalog (FSB API Execution) — Phases 26-34, CODE-COMPLETE 2026-06-23</summary>

Gave FSB first-class authenticated-API execution as a fast path alongside DOM automation, between Wall 1 (closed-vocabulary recipe DATA bound by a fixed interpreter) and Wall 2 (MAIN-world authenticated fetch). Full `npm test` EXIT 0; live-browser UAT debt (UAT-27/29/30/31/32-01) carried forward. The v1.0.0 milestone extends this substrate verbatim.

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 26 | Recipe Schema + Bundled Interpreter + MV3 CI Guard | 3/3 | Complete |
| 27 | Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar | 3/3 | Complete; live FETCH-05 UAT human_needed |
| 28 | Lean MCP Surface + Capability Search + Eval Harness | 4/4 | Complete |
| 29 | Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity | 5/5 | Complete; live-capture UAT human_needed |
| 30 | Consent Governance + Recipe Signature Verification + Audit + Legal Posture | 4/4 | Complete; live smoke human_needed |
| 31 | Network-Capture Discovery + Recipe Synthesis + Learned Recipes | 6/6 | Complete; live UAT human_needed |
| 32 | Self-Healing Fallback + Recipe-Rot + Re-Learn + Provider/Schema-Lock Tests + UAT | 5/5 | Complete; live self-heal UAT human_needed |
| 33 | PhantomStream Media Mirroring (0.2.1 Uptake) — milestone extension | 1/1 | Complete; live media UAT human_needed |
| 34 | Explicit File Upload Tool (upload_file) — milestone extension | 1/1 | Complete; live upload UAT human_needed |

Substrate carried into v1.0.0 (FIXED — do not redesign): tiers T0/T1a/T1b/T2-learned/T3-DOM; the closed-vocab interpreter; the consent gate (opt-out Auto default, denylist = the ONE hard floor); the 2 out-of-`TOOL_REGISTRY` MCP tools; `capability-catalog.js resolve()` / `capability-router.js invoke()` / `capability-search.js buildIndex()`; `scripts/package-extension.mjs readJsonDir` + the generated `recipe-index.generated.js` IIFE; the `github.js` T1a hand-port contract; `service-denylist.js` loader; `network-capture.js` discovery path; `verify-recipe-path-guard.mjs` Wall-1 guard.

</details>

<details>
<summary>v0.12.0 PhantomStream Package Migration — Phases 21-25, COMPLETED 2026-06-17</summary>

Archive files:

- `.planning/milestones/v0.12.0-ROADMAP.md`
- `.planning/milestones/v0.12.0-REQUIREMENTS.md`
- `.planning/milestones/v0.12.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.12.0-phases/`

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 21 | Package Intake & Contract Mapping | 3/3 | Complete |
| 22 | Capture Adapter Migration | 4/4 | Complete |
| 23 | Dashboard Renderer Migration | 4/4 | Complete |
| 24 | Transport, Relay & Remote Control Integration | 4/4 | Complete |
| 25 | Parity Removal, Docs & Browser UAT | 4/4 | Complete; human UAT debt recorded |

Known deferred closeout evidence: live Chrome-extension dashboard preview and remote-control UAT remains `human_needed`; see `.planning/milestones/v0.12.0-phases/25-parity-removal-docs-browser-uat/25-HUMAN-UAT.md`.

</details>

<details>
<summary>v0.11.0 Trigger Tool (Reactive DOM Monitoring) — Phases 14-20, COMPLETED 2026-06-17</summary>

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 14 | Trigger Survivability Foundation | 3/3 | Complete |
| 15 | Fire-Condition Engine & Value Extraction | 3/3 | Complete |
| 16 | Live-Observe Watch & Analyzing Pulse | 4/4 | Complete |
| 17 | Refresh-Poll Watch (Tab-Owning Background Reload) | 4/4 | Complete |
| 18 | Shared Tool Registry & Dispatcher Wiring | 4/4 | Complete |
| 19 | MCP Tools & Blocking/Detached Reporting | 3/3 | Complete |
| 20 | Integration, Cap UI, Docs & Edge Cases | 5/5 | Complete; human UAT debt recorded |

Known deferred closeout evidence: live-browser/composed trigger UAT remains `human_needed`; publish/tag/release actions remain user-gated.

</details>

<details>
<summary>v0.10.0 Autopilot via Lattice SDK (Phases 01-13) — SHIPPED 2026-06-15</summary>

Archive files:

- `.planning/milestones/v0.10.0-ROADMAP.md`
- `.planning/milestones/v0.10.0-REQUIREMENTS.md`
- `.planning/milestones/v0.10.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.10.0-phases/`

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 01 | Lattice SDK gap survey + integration scaffolding | 2/2 | Complete |
| 02 | Lattice tripwire + receipt primitives extension | 5/5 | Complete |
| 03 | Observability + step-markers extension | 3/3 | Complete |
| 04 | Provider adapter alignment | 5/5 | Complete |
| 05 | MV3-survivability adapter contract + bundler infra + hybrid offscreen Lattice host | 6/6 | Complete |
| 06 | FSB engine consumes Lattice provider abstraction | 7/7 | Complete |
| 07 | Archive FSB custom provider stack | 4/4 | Complete |
| 08 | FSB agent brain on Lattice runtime | 3/3 | Complete |
| 09 | FSB SurvivabilityAdapter activated for MV3 SW eviction resumption | 3/3 | Complete |
| 10 | MCP-philosophy parity for autopilot driver | 3/3 | Complete |
| 11 | Tab-aware side panel surface | 5/5 | Complete |
| 12 | Side panel follows automation | 5/5 | Complete |
| 13 | Public Lattice package integration | 1/1 | Complete |

Known deferred closeout evidence: 11 human-gated Chrome MV3/UAT verification items were acknowledged at close. See `.planning/STATE.md` `## Deferred Items`.

</details>

## Carry-Forward Candidates

- **Consolidated Chrome MV3 UAT debt:** Run and capture archived v0.10/v0.11/v0.12 + v0.9.99 (UAT-27/29/30/31/32-01) browser evidence if release policy requires post-close proof. Does NOT block v1.2.0.
- **v2 deferred capability families (acknowledged, out of v1.0.0/v1.1.0):** GAPI-01 (gapi-bridge handler family for Google Workspace); CLOUD-01 (cloud-console Pattern-D ports); UATX-01 (per-app live guarded-write UAT closeout).
- **v1.2.0 v2 deferred (see REQUIREMENTS.md):** QA-01 (native-speaker/bilingual QA pass), I18N-FUTURE-01 (migrate stats page off ad hoc JSON mechanism into main XLIFF pipeline), I18N-FUTURE-02 (full automated per-locale visual regression pipeline), I18N-FUTURE-03 (translation-freshness/"last synced" reporting surface).
- **Delegation primitive:** Parked from v0.10.0; re-scope as either a Lattice-owned primitive or an FSB-only consumer of Lattice receipt + tripwire surfaces.

## Backlog

### Phase 999.1: MCP tool gaps — click heuristics

**Status:** Completed historical backlog work retained outside milestone archival.

- `999.1-01`: Route-aware MCP bridge dispatch + `execute_js` background handler.
- `999.1-02`: Text-based click targeting with TreeWalker visible-text matching.

Artifacts remain in `.planning/phases/999.1-mcp-tool-gaps-click-heuristics/`.
