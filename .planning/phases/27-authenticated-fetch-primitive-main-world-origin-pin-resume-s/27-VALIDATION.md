---
phase: 27
slug: authenticated-fetch-primitive-main-world-origin-pin-resume-s
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
audited: 2026-06-20
---

# Phase 27 — Validation Strategy

> Per-phase validation contract. Audited 2026-06-20 against the executed phase:
> all five FETCH requirements have green automated coverage; FETCH-05's live
> logged-in-shape assertion is the single (irreducibly) Manual-Only item.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — zero-framework `node tests/*.test.js` (repo convention; mocked `chrome.*` globals + stubbed `chrome.scripting.executeScript` recorder) |
| **Config file** | none — root `package.json` `scripts.test` `&&`-chain |
| **Quick run command** | `node tests/capability-fetch.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5-20 seconds (Node, no browser) |

---

## Sampling Rate

- **After every task commit:** Run the touched `node tests/<suite>.test.js`
- **After every plan wave:** Run `npm test` (full `&&`-chain) + `npm run validate:extension` (recipe-path CI guard)
- **Before `/gsd:verify-work`:** Full suite + `validate:extension` must be green
- **Max feedback latency:** ~20 seconds (automated); live-browser UAT is human-gated and out-of-band

---

## Per-Task Verification Map

> Bound to concrete task IDs after execution. All automated rows green (capability-fetch.test.js 26/0, capability-interpreter.test.js 51/0).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-02-01/03 | 02 | 2 | FETCH-01 | T-27-06/08 | MAIN-world fetch carries first-party cookies (`credentials:'include'`); fixed func, recipe supplies data-only spec (10 assertions) | unit (stubbed `executeScript` records `{world:'MAIN', func, args:[spec]}` + serialization-safety guard) | `node tests/capability-fetch.test.js` | yes | green |
| 27-02-01/03 | 02 | 2 | FETCH-02 | T-27-10 | in-page `csrfSource` read (`.content`/`.value`) threads token into `headers[header]`; SW-side `extract` via `jmespath` (5 assertions) | unit (assert recorded spec headers + extract output vs fixture) | `node tests/capability-fetch.test.js` | yes | green |
| 27-01-01/02 + 27-02-02 | 01,02 | 1,2 | FETCH-03 | T-27-01/02/03/07 | cross-origin / protocol-relative target rejected with `RECIPE_ORIGIN_MISMATCH` before any side effect; interpreter pin (post-query-fold) + wrapper active-tab pin (4 + 11 assertions) | unit (assert typed error, no `executeScript` call) | `node tests/capability-interpreter.test.js` + `node tests/capability-fetch.test.js` | yes | green |
| 27-01-03 + 27-02-02 | 01,02 | 1,2 | FETCH-04 | T-27-09 | `BEFORE_API_REQUEST` snapshot written pre-fetch; mutating method on wake → `RECOVERY_AMBIGUOUS`, never blind-retried; GET re-issuable; code surfaced via errors.ts (11 assertions) | unit (drive `classifyOnWake`; assert snapshot fields + policy mapping; `RECOVERY_AMBIGUOUS` in built errors) | `node tests/capability-fetch.test.js` | yes | green |
| 27-02-03 (CI) / 27-03-01 (live) | 02,03 | 2,3 | FETCH-05 | — | logged-in shape returned from the MAIN world (not logged-out): CI/mock half through the stubbed seam (13 assertions) + **manual live UAT** for the real-cookie half | unit (mock) green + **Manual-Only (human_needed)** | `node tests/capability-fetch.test.js` (mock) | yes | green (CI) · manual (live) |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [x] `tests/capability-fetch.test.js` — new zero-framework suite (mocked `chrome.*`, stubbed `executeScript` recorder); covers FETCH-01..04 + FETCH-05 mock half (26 assertions, green)
- [x] Extend `package.json` `scripts.test` `&&`-chain with the new suite
- [x] `scripts/verify-recipe-path-guard.mjs` — `capability-fetch.js` added to `RECIPE_PATH_ALLOWLIST` (Check 4 fail-closed); guard PASS

*Existing `tests/capability-interpreter.test.js` / `capability-recipe-schema.test.js` / `recipe-path-guard.test.js` infrastructure covers the interpreter-side origin-pin assertion.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logged-in (not logged-out) data shape returned from the page MAIN-world fetch against a real HttpOnly-cookie site | FETCH-05 (live half) | No live browser / authenticated GitHub session in CI; HttpOnly `_gh_sess`/`logged_in` cookies can only attach in a real signed-in Chrome session (auth-stays-local forbids shipping a credential to CI) | Load the unpacked extension in Chrome, sign in to github.com, run the hardcoded `github.com → GET /notifications` recipe via the Phase-27 entry path; assert the response is 200 (not 302→/login) and `<meta name="user-login">` is non-empty (your username). Record in `27-HUMAN-UAT.md` (currently `human_needed`). Run via `/gsd:verify-work 27`. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies (FETCH-01..05 CI coverage green)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none missing; suite landed in 27-02)
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-20

---

## Validation Audit 2026-06-20

| Metric | Count |
|--------|-------|
| Requirements (FETCH-01..05) | 5 |
| Automated-covered (green) | 5 |
| Manual-only | 1 (FETCH-05 live logged-in-shape — irreducibly live) |
| Gaps found (fillable) | 0 |
| Tests generated | 0 (no fillable gaps; all automated coverage shipped in execution) |
| Escalated | 0 |

**Verdict:** Nyquist-compliant. Every requirement has automated verification of its CI-provable behavior (capability-fetch.test.js 26/0 + capability-interpreter.test.js 51/0, both green; recipe-path guard PASS). FETCH-05 additionally carries one documented Manual-Only verification (the real-GitHub-cookie logged-in-shape assertion), which cannot be automated in CI without shipping a credential and is tracked as `human_needed` UAT debt in `27-HUMAN-UAT.md`.
