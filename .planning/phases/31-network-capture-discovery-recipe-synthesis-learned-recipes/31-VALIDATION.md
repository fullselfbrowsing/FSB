---
phase: 31
slug: network-capture-discovery-recipe-synthesis-learned-recipes
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-22
---

# Phase 31 — Validation Strategy

> Per-phase validation contract. Seeded from `31-RESEARCH.md` §Validation Architecture. Per-task rows are finalized by the planner once PLAN.md task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Zero-framework FSB convention — `node tests/<name>.test.js`, `passed/failed` counters, `check(cond,msg)`, `process.exit(failed>0?1:0)`. No jest/mocha/vitest. |
| **Config file** | none — standalone Node scripts wired into the `package.json` `scripts.test` `&&` chain |
| **Stubs** | NEW `chrome.debugger` event-driver stub (canned `onEvent(source,method,params)` feeder); in-memory `chrome.storage.local` stub (`installChromeStorageStub`, consent-policy-store.test.js); `vm.runInThisContext` cfworker/module loader (capability-fetch.test.js); `verifyEd25519` zero-call spy (recipe-signature-interpreter-hook.test.js) |
| **Quick run command** | `node tests/network-capture.test.js` (or the single file for the module touched) |
| **Full suite command** | `npm test` (long `&&` chain; new suites appended at the tail next to `capability-*.test.js`) |
| **Estimated runtime** | quick ~1s each · full suite ~minutes (mcp build dominates) |

---

## Sampling Rate

- **After every task commit:** Run the single new suite for the task under change (e.g. `node tests/network-capture-redaction.test.js`)
- **After every plan wave:** `npm test` (full chain incl. `scripts/verify-recipe-path-guard.mjs`)
- **Before `/gsd:verify-work`:** full suite green + `verify-recipe-path-guard: PASS`
- **Max feedback latency:** ~1 second (single quick suite)

---

## Per-Task Verification Map

> Task IDs are the real `31-NN` plan ids (finalized by plan 31-01, Wave 0). The RED
> suites + the allowlist extension + the test-chain wiring were authored in plan
> 31-01; the **Plan** column names the plan that turns each row RED -> GREEN. The
> suite FILES now EXIST (authored Wave 0); their target modules/edits are still
> absent, so each behavior row is RED until its Plan ships.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-02 | 31-02 | 1 | DISC-02 | — | Network events on the existing attach are method-dispatched; canned requestWillBeSent/responseReceived → ObservedCalls; Input sendCommand unaffected | unit | `node tests/network-capture.test.js` | EXISTS (module absent, RED) | RED |
| 31-02 | 31-02 | 1 | DISC-04 | T-capture-on-unconsented | capture-start REJECTED on Off + denied; ALLOWED on Ask/Auto; sensitive origin needs extra-confirm | unit | `node tests/network-capture-consent.test.js` | EXISTS (module absent, RED) | RED |
| 31-02 | 31-02 | 1 | DISC-04 | — | only XHR/Fetch + same-origin become ObservedCalls; Document/Image/CSS/Font/Media + cross-origin dropped | unit | `node tests/network-capture.test.js` | EXISTS (module absent, RED) | RED |
| 31-02 | 31-02 | 1 | DISC-03/LEARN-02 | T-capture-leak | **(security)** redacted ObservedCall + synthesized recipe contain NO auth substring (authorization/cookie/bearer/x-csrf/x-api-key), NO body, NO query, NO PII — shape only | unit (security) | `node tests/network-capture-redaction.test.js` | EXISTS (module absent, RED) | RED |
| 31-03 | 31-03 | 2 | LEARN-01 | — | synthesis emits a `validateRecipe`-green recipe + paired descriptor; an unsynthesizable capture yields no recipe | unit | `node tests/recipe-synthesizer.test.js` | EXISTS (module absent, RED) | RED |
| 31-03 | 31-03 | 2 | LEARN-01/D-10 | — | promote-only-after-replay: clean replay → stored; failed replay → NOT stored | unit | `node tests/learned-promote-after-replay.test.js` | EXISTS (module absent, RED) | RED |
| 31-03 | 31-03 | 2 | LEARN-02/D-13/D-16 | — | learned-store per-origin round-trip; LRU evicts oldest lastSuccessAt past cap; quarantine flags (not deletes), `_getLearned` returns null for quarantined | unit | `node tests/learned-recipe-store.test.js` | EXISTS (module absent, RED) | RED |
| 31-05 | 31-05 | 3 | LEARN-03 | — | `addLearnedRecipe` makes the slug findable via search() AND getRecipeBySlug; snapshot re-persisted w/ bumped version (survives loadJSON) | unit | `node tests/learned-search-add.test.js` | EXISTS (export absent, RED) | RED |
| 31-05 | 31-05 | 3 | LEARN-04/D-15 | — | catalog.resolve returns learned {tier:'T2',recipe} that OUTRANKS generic T1b for same slug+origin; router T2 dispatches via _runDeclarativeTier when learned exists, RECIPE_LEARN_PENDING stub when none | unit | `node tests/learned-t2-outranking.test.js` | EXISTS (edits absent, RED) | RED |
| 31-04 | 31-04 | 3 | D-09 (HI-01) | T-provenance-spoof | a `'local'`-vouched recipe binds WITHOUT a verifyEd25519 call (zero-call spy); a payload self-asserting `provenance:'local'` with NO trusted vouch is STILL verified (tampered core rejected) | unit (security) | `node tests/learned-local-provenance-exempt.test.js` | EXISTS (edit absent, RED) | RED |
| 31-01 | 31-01 | 0 | INV/guard | T-31-01-CI | recipe-synthesizer.js + learned-recipe-store.js on RECIPE_PATH_ALLOWLIST + dynamic-code-free | guard | `node scripts/verify-recipe-path-guard.mjs` | EXISTS (allowlist extended) | GREEN |

*Status: pending | green | red | flaky*

---

## Wave 0 Requirements

- [x] `tests/network-capture.test.js` — DISC-02 dispatch + DISC-04 XHR/Fetch+same-origin filter (NEW `chrome.debugger` event-driver stub)
- [x] `tests/network-capture-consent.test.js` — DISC-04 off/denied/sensitive gate
- [x] `tests/network-capture-redaction.test.js` — DISC-03/LEARN-02 no-secret/no-body/no-query assertion (THE security test)
- [x] `tests/recipe-synthesizer.test.js` — LEARN-01 schema-valid recipe+descriptor + path-template + conservative authStrategy
- [x] `tests/learned-promote-after-replay.test.js` — D-10 store-only-on-clean-replay (stub interpret/execute)
- [x] `tests/learned-recipe-store.test.js` — D-13/D-16 round-trip + LRU + quarantine
- [x] `tests/learned-search-add.test.js` — LEARN-03 findable + snapshot version bump survives loadJSON
- [x] `tests/learned-t2-outranking.test.js` — LEARN-04/D-15 resolve learned-first + router T2 dispatch
- [x] `tests/learned-local-provenance-exempt.test.js` — D-09 zero-call exempt + HI-01 payload-cannot-self-declare
- [x] NEW `chrome.debugger` event-driver stub helper (canned `onEvent` feeder) — `tests/_helpers/cdp-event-driver.js`
- [x] Allowlist extension in `scripts/verify-recipe-path-guard.mjs` for `recipe-synthesizer.js` + `learned-recipe-store.js`
- [x] Wire all new suites into `package.json` `scripts.test` chain (tail, next to `capability-*.test.js`)
- Framework install: **none** — zero-framework convention.

**Wave 0 status:** COMPLETE (plan 31-01). All nine RED suites + the shared CDP
event-driver stub exist and fail loud; the allowlist is extended (guard PASS); the
test chain is wired. Waves 1-3 turn the behavior rows RED -> GREEN.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| An ACTUAL `chrome.debugger` Network capture on a real authenticated site: the banner appears, a real first-party XHR/Fetch is observed, redacted, synthesized, replayed through the live MAIN-world credentialed fetch, promoted, and outranks the generic recipe on the next visit | DISC-01/LEARN-01/04 (live half) | Requires a live Chrome extension + a real authenticated origin + the debugger attach; cannot run in CI without shipping a real credential. Recorded as `human_needed`, matching the Phase 27/28/29/30 live-UAT posture. | Load the unpacked extension, sign in to an origin, start a discovery session, perform an action that fires an API call, confirm a learned recipe is synthesized + promoted + findable + outranks generic on the next visit. Record in `31-HUMAN-UAT.md`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter (planner sets after per-task rows finalized)

**Approval:** approved (Wave 0 complete, plan 31-01)
