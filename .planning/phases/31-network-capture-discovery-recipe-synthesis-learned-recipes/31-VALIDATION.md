---
phase: 31
slug: network-capture-discovery-recipe-synthesis-learned-recipes
status: draft
nyquist_compliant: false
wave_0_complete: false
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

> Task IDs are `TBD` until the planner emits PLAN.md files; rows are keyed by requirement.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | 0 | DISC-02 | — | Network events on the existing attach are method-dispatched; canned requestWillBeSent/responseReceived → ObservedCalls; Input sendCommand unaffected | unit | `node tests/network-capture.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | DISC-04 | T-capture-on-unconsented | capture-start REJECTED on Off + denied; ALLOWED on Ask/Auto; sensitive origin needs extra-confirm | unit | `node tests/network-capture-consent.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | DISC-04 | — | only XHR/Fetch + same-origin become ObservedCalls; Document/Image/CSS/Font/Media + cross-origin dropped | unit | `node tests/network-capture.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | DISC-03/LEARN-02 | T-capture-leak | **(security)** redacted ObservedCall + synthesized recipe contain NO auth substring (authorization/cookie/bearer/x-csrf/x-api-key), NO body, NO query, NO PII — shape only | unit (security) | `node tests/network-capture-redaction.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | LEARN-01 | — | synthesis emits a `validateRecipe`-green recipe + paired descriptor; an unsynthesizable capture yields no recipe | unit | `node tests/recipe-synthesizer.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | LEARN-01/D-10 | — | promote-only-after-replay: clean replay → stored; failed replay → NOT stored | unit | `node tests/learned-promote-after-replay.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | LEARN-02/D-13/D-16 | — | learned-store per-origin round-trip; LRU evicts oldest lastSuccessAt past cap; quarantine flags (not deletes), `_getLearned` returns null for quarantined | unit | `node tests/learned-recipe-store.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | LEARN-03 | — | `addLearnedRecipe` makes the slug findable via search() AND getRecipeBySlug; snapshot re-persisted w/ bumped version (survives loadJSON) | unit | `node tests/learned-search-add.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | LEARN-04/D-15 | — | catalog.resolve returns learned {tier:'T2',recipe} that OUTRANKS generic T1b for same slug+origin; router T2 dispatches via _runDeclarativeTier when learned exists, RECIPE_LEARN_PENDING stub when none | unit | `node tests/learned-t2-outranking.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | D-09 (HI-01) | T-provenance-spoof | a `'local'`-vouched recipe binds WITHOUT a verifyEd25519 call (zero-call spy); a payload self-asserting `provenance:'local'` with NO trusted vouch is STILL verified (tampered core rejected) | unit (security) | `node tests/learned-local-provenance-exempt.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | INV/guard | — | recipe-synthesizer.js + learned-recipe-store.js on RECIPE_PATH_ALLOWLIST + dynamic-code-free | guard | `node scripts/verify-recipe-path-guard.mjs` | ✅ (extend allowlist) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/network-capture.test.js` — DISC-02 dispatch + DISC-04 XHR/Fetch+same-origin filter (NEW `chrome.debugger` event-driver stub)
- [ ] `tests/network-capture-consent.test.js` — DISC-04 off/denied/sensitive gate
- [ ] `tests/network-capture-redaction.test.js` — DISC-03/LEARN-02 no-secret/no-body/no-query assertion (THE security test)
- [ ] `tests/recipe-synthesizer.test.js` — LEARN-01 schema-valid recipe+descriptor + path-template + conservative authStrategy
- [ ] `tests/learned-promote-after-replay.test.js` — D-10 store-only-on-clean-replay (stub interpret/execute)
- [ ] `tests/learned-recipe-store.test.js` — D-13/D-16 round-trip + LRU + quarantine
- [ ] `tests/learned-search-add.test.js` — LEARN-03 findable + snapshot version bump survives loadJSON
- [ ] `tests/learned-t2-outranking.test.js` — LEARN-04/D-15 resolve learned-first + router T2 dispatch
- [ ] `tests/learned-local-provenance-exempt.test.js` — D-09 zero-call exempt + HI-01 payload-cannot-self-declare
- [ ] NEW `chrome.debugger` event-driver stub helper (canned `onEvent` feeder) — small shared test fixture
- [ ] Allowlist extension in `scripts/verify-recipe-path-guard.mjs` for `recipe-synthesizer.js` + `learned-recipe-store.js`
- [ ] Wire all new suites into `package.json` `scripts.test` chain (tail, next to `capability-*.test.js`)
- Framework install: **none** — zero-framework convention.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| An ACTUAL `chrome.debugger` Network capture on a real authenticated site: the banner appears, a real first-party XHR/Fetch is observed, redacted, synthesized, replayed through the live MAIN-world credentialed fetch, promoted, and outranks the generic recipe on the next visit | DISC-01/LEARN-01/04 (live half) | Requires a live Chrome extension + a real authenticated origin + the debugger attach; cannot run in CI without shipping a real credential. Recorded as `human_needed`, matching the Phase 27/28/29/30 live-UAT posture. | Load the unpacked extension, sign in to an origin, start a discovery session, perform an action that fires an API call, confirm a learned recipe is synthesized + promoted + findable + outranks generic on the next visit. Record in `31-HUMAN-UAT.md`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 1s
- [ ] `nyquist_compliant: true` set in frontmatter (planner sets after per-task rows finalized)

**Approval:** pending
