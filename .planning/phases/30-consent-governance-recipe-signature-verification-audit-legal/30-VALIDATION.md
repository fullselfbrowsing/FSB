---
phase: 30
slug: consent-governance-recipe-signature-verification-audit-legal
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-21
---

# Phase 30 — Validation Strategy

> Per-phase validation contract. Seeded from `30-RESEARCH.md` §Validation Architecture. Per-task rows are finalized by the planner once PLAN.md task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Zero-framework FSB convention — `node tests/<name>.test.js`, `passed/failed` counters, `check(cond,msg)`, `process.exit(failed>0?1:0)`. No jest/mocha/vitest. |
| **Config file** | none — standalone Node scripts wired into the `package.json` `scripts.test` `&&` chain |
| **Chrome stubs** | in-memory `chrome.storage.local` stub (per `diagnostics-ring-buffer.test.js`); recipe loader (cfworker via `vm.runInThisContext`) per `capability-interpreter.test.js` |
| **Quick run command** | `node tests/consent-gate.test.js` (or the single file for the module touched) |
| **Full suite command** | `npm test` (long `&&` chain; new tests appended at the tail next to `capability-*.test.js`) |
| **Estimated runtime** | quick ~1s each · full suite ~minutes (mcp build dominates) |

---

## Sampling Rate

- **After every task commit:** Run the single new test for the module touched (e.g. `node tests/consent-gate.test.js`)
- **After every plan wave:** Run all new Phase-30 tests + `node scripts/verify-recipe-path-guard.mjs` + `node tests/agent-loop-iterator-guard.test.js`
- **Before `/gsd:verify-work`:** Full `npm test` green + `npm run validate:extension`
- **Max feedback latency:** ~1 second (single quick test)

---

## Per-Task Verification Map

> Task IDs are `TBD` until the planner emits PLAN.md files; rows are keyed by requirement.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01 (test) / 30-02 (gate) | 30-01 (test) / 30-02 (gate) | 0 | GOV-01 | T-consent-default-off | Unseen origin is default-OFF → `invoke` returns `RECIPE_CONSENT_REQUIRED`, no side effect | unit | `node tests/consent-gate.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-02 (store) | 30-01 (test) / 30-02 (store) | 0 | GOV-02 | — | Off/Ask/Auto round-trip in store; Auto is per-origin (no global enable) | unit | `node tests/consent-policy-store.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-02 (mutation gate) | 30-01 (test) / 30-02 (mutation gate) | 0 | GOV-03 | T-mutation-elevation | Read-Auto ≠ write-Auto: POST on read-Auto origin → `RECIPE_CONSENT_MUTATING_REQUIRED`; elevated opt-in lets it through | unit | `node tests/consent-mutation-gate.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-02 (chokepoint) | 30-01 (test) / 30-02 (chokepoint) | 0 | GOV-04 | T-single-chokepoint | Gate runs at the single `invoke` chokepoint AFTER ownership; both front doors hit it | unit | `node tests/consent-chokepoint.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-02 (audit ring) | 30-01 (test) / 30-02 (audit ring) | 0 | GOV-05 | — | Append-only entry has exactly `{ts,origin,slug,method,sideEffectClass,consentDecision,outcome,error?}` and FIFO-trims | unit | `node tests/audit-log.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-02 (redaction) | 30-01 (test) / 30-02 (redaction) | 0 | GOV-06 | T-no-secret-log | NO auth substring (cookie/token/csrf/xoxc/_gh_sess/bearer/authorization) survives in the persisted ring or capture | unit (security) | `node tests/audit-log-no-secret.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-02 (sensitive gate) + 30-03 (classifier) / 30-04 (UI reflect) | 30-01 (test) / 30-02 (gate) / 30-03 (classify) / 30-04 (UI) | 0 | GOV-07 | T-sensitive-auto-bypass | Sensitive origin (`FsbServiceDenylist.classify().sensitive`) under stored mode `auto` is downgraded to ask AT THE GATE → `invoke` returns `RECIPE_CONSENT_REQUIRED` / `consentDecision:'sensitive'`, NO side effect (D-14, gate-side enforcement, not UI-only) | unit (security) | `node tests/consent-gate.test.js` (sensitive+Auto case) | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-04 (UI) | 30-01 (test) / 30-04 (UI) | 0 | GOV-07 | — | Control-panel section surface shape (nav, per-origin list, pending queue, audit table, legal card) + options.js wiring + Sensitive badge reads `classify` | source-text unit | `node tests/consent-audit-settings-ui.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-03 (denylist+classify+LEGAL) | 30-01 (test) / 30-03 (denylist+classify+LEGAL) | 0 | GOV-08 | T-denylist-bypass | `docs/LEGAL.md` exists (retention+consent); `service-denylist.json` valid (deniedOrigins+sensitiveOrigins); `classify` returns the right sensitive/denied combination; denylist checked BEFORE policy (denylisted origin non-enableable) | unit + source | `node tests/service-denylist.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test+fixtures) / 30-03 (verify) | 30-01 (test+fixtures) / 30-03 (verify) | 0 | SIGN-01 | T-recipe-tamper | FIXTURE KEYPAIR: sign fixture recipe → verify-pass; flip one signed byte → `RECIPE_SIGNATURE_INVALID`; absent sig on non-bundled → reject | unit (security) | `node tests/recipe-signature.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-03 (interp hook) | 30-01 (test) / 30-03 (interp hook) | 0 | SIGN-02 | — | Verify hook fires INSIDE `interpretRecipe` AFTER schema-validate, BEFORE bind; integrity metadata (sig/capturedAt/schemaHash) is the verified payload | unit | `node tests/recipe-signature-interpreter-hook.test.js` | ❌ W0 | ⬜ pending |
| 30-01 (test) / 30-03 (provenance) | 30-01 (test) / 30-03 (provenance) | 0 | SIGN-01/D-07 | T-recipe-tamper | Bundled / no-meta recipe is EXEMPT (verify NOT called via the absent/bundled-meta default path); non-bundled IS gated | unit | `node tests/recipe-signature.test.js` (provenance branch) | ❌ W0 | ⬜ pending |
| 30-02/30-03 (regression) | 30-02/30-03 (regression) | 0 | INV-01/04 | — | errors.ts passthrough surfaces `RECIPE_CONSENT_*`/`RECIPE_SIGNATURE_INVALID` verbatim (built mcp); iterator byte-untouched; ~63 tool schemas unchanged | unit | `node tests/capability-interpreter.test.js` + `node tests/agent-loop-iterator-guard.test.js` | partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/consent-policy-store.test.js` — GOV-02 (envelope round-trip, default-OFF)
- [ ] `tests/consent-gate.test.js` — GOV-01 (default-OFF blocks; chokepoint placement) + GOV-07/D-14 (sensitive origin under Auto → NON-allow `RECIPE_CONSENT_REQUIRED` / `consentDecision:'sensitive'`; gate-side enforcement sampled)
- [ ] `tests/consent-mutation-gate.test.js` — GOV-03 (read-Auto ≠ write-Auto)
- [ ] `tests/consent-chokepoint.test.js` — GOV-04 (one gate; after ownership; both doors)
- [ ] `tests/audit-log.test.js` — GOV-05 (entry schema + FIFO)
- [ ] `tests/audit-log-no-secret.test.js` — GOV-06 (no-auth-substring security assertion)
- [ ] `tests/recipe-signature.test.js` — SIGN-01 + D-07 (fixture keypair sign/verify/tamper + provenance exemption)
- [ ] `tests/recipe-signature-interpreter-hook.test.js` — SIGN-02 (hook order in interpretRecipe)
- [ ] `tests/service-denylist.test.js` — GOV-08 + D-14 (denylist shape + sensitiveOrigins seed + `classify` source-of-truth + checked-first)
- [ ] `tests/consent-audit-settings-ui.test.js` — GOV-07 (UI surface per 30-UI-SPEC AC; Sensitive badge reads `classify`)
- [ ] Fixtures: `catalog/recipes/_fixtures/` signed + tampered recipe + a fixture Ed25519 public key (D-08)
- [ ] Wire all of the above into `package.json` `scripts.test` chain (tail, next to `capability-*.test.js`)
- [ ] Pre-arm `RECIPE_PATH_ALLOWLIST` with `capability-signature.js` + `consent-policy-store.js` + `audit-log.js` + `service-denylist.js` (Check 1/4 fails closed otherwise; service-denylist.js listed explicitly — it does not match the `capability-*` glob but the gate reads it above the interpret path, RESEARCH Pitfall 6)
- Framework install: **none** — zero-framework convention.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual smoke of the Consent & Audit control-panel section: render, per-origin Off/Ask/Auto control, Grant/Deny on a pending request, badge appearance, sensitive/denylisted flags | GOV-07 (live render half only) | Requires loading the unpacked extension + opening the control panel in a real browser; the source-text UI test covers surface shape and the gate-side sensitive+Auto enforcement is automated (`tests/consent-gate.test.js`) — only the live render/interaction is manual. | Load the unpacked extension, open the control panel, navigate to Consent & Audit, verify the per-origin list + audit table render, toggle a mode, confirm the amber Sensitive badge + disabled Auto on a sensitive origin, grant a pending request, confirm the badge clears. Record in `30-HUMAN-UAT.md`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter (planner sets after per-task rows finalized)

**Approval:** planner-finalized (per-task rows mapped to 30-01..30-04; GOV-07/D-14 sensitive+Auto gate-side row added; nyquist_compliant true)
</content>
