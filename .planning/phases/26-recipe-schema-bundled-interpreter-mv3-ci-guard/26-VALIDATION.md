---
phase: 26
slug: recipe-schema-bundled-interpreter-mv3-ci-guard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> All Phase-26 behavior is automatable under the existing zero-framework `node tests/*.test.js` harness — no live browser needed (the network call is Phase 27).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — plain CommonJS `node tests/*.test.js` + `assert`, pass/fail counters (VERIFIED convention: `tests/trigger-store.test.js`, `tests/ownership-error-codes.test.js`) |
| **Config file** | None — suites sequenced in root `package.json` `scripts.test` `&&`-chain |
| **Quick run command** | `node tests/capability-recipe-schema.test.js` (single suite, < 2 s) |
| **Full suite command** | `npm test` (full `&&`-chain) + `npm run validate:extension` (static gate + new recipe-path guard) |
| **Estimated runtime** | ~quick < 2 s per suite; full `npm test` per existing chain |

---

## Sampling Rate

- **After every task commit:** Run the single affected suite (`node tests/capability-*.test.js`), < 2 s
- **After every plan wave:** Run `npm run validate:extension` (manifest + `node --check` over `lib/` + recipe-path guard) + the new capability suites
- **Before `/gsd:verify-work`:** Full `npm test` green AND `npm run validate:extension` green (the mcp build inside `npm test` type-checks the `errors.ts` change)
- **Max feedback latency:** < 2 seconds (quick); full chain per existing CI

---

## Per-Task Verification Map

> Requirement-level map from RESEARCH.md Validation Architecture. Task IDs (26-NN-NN) are bound during planning (step 8) and finalized by the nyquist auditor.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD-planning | TBD | TBD | CAP-01 | T-26-01 | Forbidden/unknown fields + bad enums rejected; `schemaVersion` enforced | unit | `node tests/capability-recipe-schema.test.js` | ❌ W0 | ⬜ pending |
| TBD-planning | TBD | TBD | CAP-02 | T-26-02 | Valid recipe → bound spec `{url,method,headers,body,authStrategy,csrfSource?}`; interpreter performs NO fetch/executeScript | unit | `node tests/capability-interpreter.test.js` | ❌ W0 | ⬜ pending |
| TBD-planning | TBD | TBD | CAP-03 | T-26-01 | Invoke params validated; invalid → `RECIPE_SCHEMA_INVALID`; unknown-opcode → `RECIPE_OPCODE_INVALID`; validator runs without `eval` | unit | `node tests/capability-interpreter.test.js` | ❌ W0 | ⬜ pending |
| TBD-planning | TBD | TBD | CAP-04 | T-26-03 | Guard flags planted-`eval` on recipe path (non-zero); does NOT flag sanctioned `execute_js`; rejects reject-fixtures | unit + CI gate | `node scripts/verify-recipe-path-guard.mjs` + `node tests/recipe-path-guard.test.js` | ❌ W0 | ⬜ pending |
| TBD-planning | TBD | TBD | CAP-05 | — | 3 `lib/*.min.js` exist, pass `node --check`, expose globals; `background.js` additive importScripts; manifest unchanged | integration | `npm run validate:extension` | partial | ⬜ pending |
| TBD-planning | TBD | TBD | (errors.ts) | — | SW `{success:false, code:'RECIPE_SCHEMA_INVALID'}` surfaces verbatim (not `action_rejected`) | unit | new assertion mirroring `tests/mcp-recovery-messaging.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/capability-recipe-schema.test.js` — CAP-01 (clone `trigger-store.test.js`; load `extension/utils/capability-recipe-schema.js` + the vendored cfworker IIFE)
- [ ] `tests/capability-interpreter.test.js` — CAP-02/CAP-03 (assert bound-spec shape AND that `chrome.scripting.executeScript` is never called, via the mock recorder)
- [ ] `tests/recipe-path-guard.test.js` — CAP-04 (planted-eval fixture flagged; sanctioned sites NOT flagged)
- [ ] `catalog/recipes/_fixtures/` — accept (1+ valid) + reject (one per forbidden name + unknown-field + bad-enum) recipe JSON fixtures, shared by the schema test and the CI guard
- [ ] cfworker-IIFE test-loader strategy documented — `vm.runInThisContext`/`eval` the file then read `globalThis.CfworkerJsonSchema` (test-only; the guard scans the recipe path, not tests)
- [ ] Framework install: **none** — harness exists (`tests/fixtures/run-task-harness.js` provides `installChromeMock({storage,tabs})`)

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification (no live browser needed; the authenticated fetch is Phase 27).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
