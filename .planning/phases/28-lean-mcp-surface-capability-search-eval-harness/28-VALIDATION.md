---
phase: 28
slug: lean-mcp-surface-capability-search-eval-harness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 28-RESEARCH.md "Validation Architecture" + "Security Domain".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Zero-framework Node test scripts (FSB convention: each `tests/*.test.js` is a standalone `node` file that prints PASS/FAIL and `process.exit(1)` on failure) |
| **Config file** | none — tests are `&&`-chained in `package.json` `test` script (`package.json:17`) |
| **Quick run command** | `node tests/capability-search-eval.test.js && node tests/capability-mcp-surface.test.js` |
| **Full suite command** | `npm test` (full `&&`-chain; also runs via `npm run ci` at `package.json:32`) |
| **Estimated runtime** | ~30 seconds (no browser; the two new tests are fast index/mock assertions) |

---

## Sampling Rate

- **After every task commit:** Run `node tests/capability-search-eval.test.js && node tests/capability-mcp-surface.test.js` (the two new phase tests — fast, no browser)
- **After every plan wave:** Run `npm test` (full chain incl. `tool-definitions-parity`, `recipe-path-guard`, `capability-*`) + `node scripts/verify-recipe-path-guard.mjs` (via `validate:extension`)
- **Before `/gsd:verify-work`:** Full `npm run ci` green (validate:extension + npm test + mcp-smoke + showcase). INV-01 hash unchanged, recall@5 ≥ 0.9, wrong-invoke = 0, snapshot round-trip green, read-only-bypass asserted
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Task IDs are filled by the planner (plans not yet written). Rows below are the requirement→test contract every plan task must satisfy. `File Exists: ❌ W0` = the test is a Wave 0 deliverable created within this phase.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner) | TBD | — | SURF-01 | T-28-01 | Search returns ≤5 ranked schema-on-hit results; origin-matched capability outranks generic; origin resolved SW-side (not model-spoofed) | unit | `node tests/capability-search-eval.test.js` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | SURF-02 | T-28-02 | Routerless slug→`interpretRecipe`→`executeBoundSpec`; result `{success,status,...}` or typed error; unknown slug → `RECIPE_NOT_FOUND`; no cookie/auth in payload | unit | `node tests/capability-mcp-surface.test.js` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | SURF-03 | T-28-03 | Both tools on the wire; `EXPECTED_NON_TRIGGER_REGISTRY_HASH` UNCHANGED (INV-01) | unit | `node tests/capability-mcp-surface.test.js` + `node tests/tool-definitions-parity.test.js` | parity test ✅ / surface test ❌ W0 | ⬜ pending |
| (planner) | TBD | — | SURF-04 | T-28-04 | Index over synonyms+service+verb+side-effect; `toJSON`→`loadJSON(json, OPTIONS)` round-trip identical; `catalogVersion` mismatch → rebuild; snapshot to `chrome.storage.local`; descriptors are pure data (no eval) | unit | `node tests/capability-search-eval.test.js` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | SURF-05 | T-28-05 | `'search_capabilities'` bypasses the mutation queue (in `readOnlyTools`); `'invoke_capability'` enqueued/serialized | unit | `node tests/capability-mcp-surface.test.js` | ❌ W0 | ⬜ pending |
| (planner) | TBD | — | SURF-06 | T-28-06 | recall@5 ≥ 0.9 AND wrong-invoke = 0 over the seeded fixture set; `process.exit(1)` if either threshold fails (the milestone gate) | unit (gate) | `node tests/capability-search-eval.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/capability-search-eval.test.js` — covers SURF-01, SURF-04, SURF-06 (≤5 ranked schema-on-hit + origin bias; `toJSON`/`loadJSON` round-trip + version-mismatch rebuild; recall@5 ≥ 0.9 + wrong-invoke = 0 gate)
- [ ] `tests/capability-mcp-surface.test.js` — covers SURF-02, SURF-03, SURF-05 (two tools on the wire + registry hash unchanged + read-only/queue split + `RECIPE_NOT_FOUND`)
- [ ] `catalog/descriptors/_fixtures/seed-descriptors.json` + `catalog/descriptors/_fixtures/intent-cases.json` — synthetic head capabilities + intent→slug pairs (D-14 seeding; MUST include near-neighbor capabilities so recall@5 is not a trivial 1.0 and the gate can actually fail)
- [ ] Append both new tests to the `package.json` `test` `&&`-chain (after `capability-fetch.test.js`)
- [ ] No framework install needed (zero-framework convention)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live MCP-client-driven `search_capabilities` → `invoke_capability` against a real authenticated browser tab (end-to-end wire smoke) | SURF-01, SURF-02 | Requires a live Chrome extension + MCP host + a logged-in origin; FSB's established live-browser UAT posture (recorded as `human_needed`, not fabricated). The CI half (mocked `executeBoundSpec`, stubbed bridge) fully covers the logic | From an MCP host: call `search_capabilities("show my github notifications")` on a tab at `https://github.com`; confirm the `github.notifications` slug ranks first with its `params` schema; call `invoke_capability("github.notifications")`; confirm a logged-in-shape structured result returns. Record outcome in a `28-HUMAN-UAT.md` |

*All SURF-01..06 acceptance gates have deterministic automated verification; only the live end-to-end wire smoke is manual (consistent with the Phase 27 FETCH-05 live posture).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (the two new `tests/*.test.js` + the two fixture files)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
