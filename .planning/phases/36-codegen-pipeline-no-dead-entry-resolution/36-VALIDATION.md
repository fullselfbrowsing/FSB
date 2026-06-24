---
phase: 36
slug: codegen-pipeline-no-dead-entry-resolution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 36 — Validation Strategy

> Per-phase validation contract. Source: the `## Validation Architecture` section of
> `36-RESEARCH.md` (CGEN-01..04 → proofs; 11 tests, ~8 new + ~3 extended).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node scripts (`PASS=/FAIL=`, `process.exit(1)`); the importer runs under `tsx` at build time |
| **Config file** | none |
| **Quick run command** | `node tests/<name>.test.js` (per-suite) |
| **Full suite command** | `npm test` (CI gate) |
| **Build/import** | `node scripts/import-opentabs-catalog.mjs` (tsx); `npm run validate:extension` |
| **Estimated runtime** | per-suite < ~3s; importer build a few s; full `npm test` several minutes |

---

## Sampling Rate

- **After every task commit:** run the relevant `node tests/<name>.test.js`
- **After every plan wave:** `npm run validate:extension` (classification gate + crosscheck + recipe-path guard) + affected suites
- **Before `/gsd-verify-work`:** `npm test` exits 0
- **Max feedback latency:** ~5 s per suite

---

## Per-Task Verification Map

> Requirement→proof locked from RESEARCH; planner fills task IDs.

| Requirement | Secure/Correct Behavior | Test Type | Automated Command | Status |
|-------------|-------------------------|-----------|-------------------|--------|
| CGEN-01 | Importer extracts slug/params(z.toJSONSchema)/origin/verb/desc → provenance-stamped descriptor JSON; NO runtime opentabs/sdk/zod shipped (Wall 1); forbidden-field pre-scan rejects script/expr/transform/code/fn/js at all depths | build + unit | `node scripts/import-opentabs-catalog.mjs` + `node tests/import-opentabs-catalog.test.js` + `node scripts/verify-recipe-path-guard.mjs` | ⬜ pending |
| CGEN-02 | Side-effect class = verb-map + override table + GraphQL/RPC carve-out; crosscheck fails build when a descriptor under-states a destructive op (fail-safe-high); void_invoice/delete_customer→destructive, GraphQL POST never read | gate + unit | `node scripts/verify-catalog-crosscheck.mjs` (exit≠0 on under-stated fixture) + `node tests/catalog-crosscheck.test.js` | ⬜ pending |
| CGEN-03 | `resolve()` descriptor-only fallback → T3 (DOM) default / T2 (learn-pending) when seeded; harness proves every searchable slug → non-null tier; invoke never returns RECIPE_NOT_FOUND for a searchable slug | unit + harness | `node tests/capability-catalog-resolve.test.js` + `node tests/no-dead-entry-harness.test.js` | ⬜ pending |
| CGEN-04 | Generated catalog inlined via readJsonDir; catalogVersion stable; IIFE shape + djb2 byte-unchanged (INV-01); eval harness re-passes (recall@k, wrong-invoke=0) on the smoke category; SW cold-start parse within budget | parity + eval | `node tests/capability-search-eval.test.js` + `node tests/recipe-index-shape-lock.test.js` + `npm run validate:extension` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Importer test harness + a tiny fixture OpenTabs plugin (or a pinned-snapshot slice) for deterministic extraction
- [ ] Forbidden-field pre-scan fixture (script/expr/etc. at top/nested/array/union/$defs positions)
- [ ] Crosscheck under-stated-destructive fixture (descriptor says read, verb says POST-mutation)
- [ ] No-dead-entry harness (every searchable slug → non-null tier)

*Existing node harness covers the framework; tsx is a build-time dev dep only (no runtime ship).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none expected) | — | All Phase-36 deliverables are build-script/gate/resolve()/eval → automatable | — |

*All phase behaviors have automated verification (no live-browser UAT in Phase 36).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
