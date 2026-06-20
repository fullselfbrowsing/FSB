---
phase: 27
slug: authenticated-fetch-primitive-main-world-origin-pin-resume-s
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Per-task rows are filled once plans assign task IDs; the requirement-level
> rows below are the scaffold (see 27-RESEARCH.md "## Validation Architecture"
> for the authoritative mock-vs-live split).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — zero-framework `node tests/*.test.js` (repo convention; mocked `chrome.*` globals + stubbed `chrome.scripting.executeScript` recorder) |
| **Config file** | none — root `package.json` `scripts.test` `&&`-chain |
| **Quick run command** | `node tests/capability-fetch.test.js` (per new suite) |
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

> Task IDs are TBD until plans are written. Rows below are requirement-anchored scaffolds; the planner/executor binds them to concrete `{27}-{plan}-{task}` IDs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-TBD | TBD | TBD | FETCH-01 | — | MAIN-world fetch carries first-party cookies (`credentials:'include'`); recipe supplies data-only spec | unit (stubbed `executeScript` records `{world:'MAIN', func, args:[spec]}`) | `node tests/capability-fetch.test.js` | ❌ W0 | ⬜ pending |
| 27-TBD | TBD | TBD | FETCH-02 | T-27 CSRF | in-page `csrfSource` read threads token into `headers[header]` before request; SW-side `extract` via `jmespath` | unit (assert recorded spec headers + extract output vs fixture) | `node tests/capability-fetch.test.js` | ❌ W0 | ⬜ pending |
| 27-TBD | TBD | TBD | FETCH-03 | T-27 origin-pin | cross-origin / protocol-relative target rejected with `RECIPE_ORIGIN_MISMATCH` before any side effect; both interpreter + wrapper checks | unit (assert typed error, no `executeScript` call) | `node tests/capability-interpreter.test.js` + `node tests/capability-fetch.test.js` | ❌ W0 | ⬜ pending |
| 27-TBD | TBD | TBD | FETCH-04 | T-27 eviction | `BEFORE_API_REQUEST` snapshot written pre-fetch; mutating method on wake → `RECOVERY_AMBIGUOUS`, never blind-retried; GET re-issuable | unit (drive `classifyOnWake`; assert snapshot fields + policy mapping) | `node tests/capability-fetch.test.js` | ❌ W0 | ⬜ pending |
| 27-TBD | TBD | TBD | FETCH-05 | — | logged-in shape returned from MAIN world (not logged-out) | unit (mock: wrapper returns parsed shape from stubbed response) + **manual live UAT** | `node tests/capability-fetch.test.js` (mock) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/capability-fetch.test.js` — new zero-framework suite (mocked `chrome.*`, stubbed `executeScript` recorder); covers FETCH-01..04 + FETCH-05 mock half
- [ ] Extend `package.json` `scripts.test` `&&`-chain with the new suite
- [ ] `scripts/verify-recipe-path-guard.mjs` — add `capability-fetch.js` to `RECIPE_PATH_ALLOWLIST` (Check 4 fail-closed)

*Existing `tests/capability-interpreter.test.js` / `capability-recipe-schema.test.js` / `recipe-path-guard.test.js` infrastructure covers the interpreter-side origin-pin assertion.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logged-in (not logged-out) data shape returned from the page MAIN-world fetch against a real HttpOnly-cookie site | FETCH-05 | No live browser / authenticated GitHub session in CI; HttpOnly `_gh_sess`/`logged_in` cookies can only attach in a real signed-in Chrome session | Load the unpacked extension in Chrome, sign in to github.com, run the hardcoded `github.com → GET /notifications` recipe via the Phase-27 entry path; assert the response is 200 (not 302→/login) and `<meta name="user-login">` is non-empty (your username). Record as `human_needed`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
