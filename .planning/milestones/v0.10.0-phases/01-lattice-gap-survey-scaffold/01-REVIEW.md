---
phase: 01-lattice-gap-survey-scaffold
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - tests/lattice-smoke.test.js
  - package.json
  - lattice/packages/lattice/src/index.ts
  - lattice/packages/lattice/package.json
  - .planning/LATTICE-PIN.md
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Phase 1: Code Review Report

**Reviewed:** 2026-05-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** clean (no critical/warning issues; 3 info-only nits)

## Summary

Phase 1 introduces FSB <-> Lattice integration scaffolding: a Node smoke test that mints + verifies one Capability Receipt via Lattice's public surface, an npm `file:` dependency on the local Lattice clone, a one-line public re-export added on Lattice's side, a packaging substitution on Lattice's `package.json` (pnpm `catalog:` -> literal versions so npm 11 can install), and a cross-repo audit-trail markdown.

All five files clear the block-on threshold. Specifically:

- **No emoji** anywhere in the new files (verified via codepoint regex against emoji/symbol blocks).
- **No hardcoded secrets.** The smoke test mints an ephemeral Ed25519 keypair per run via `lattice.generateEd25519KeyPairJwk()`; private material lives only in the process and is discarded on exit. There are no key files committed to the repo, no env-var fallbacks, and no `privateKeyJwk` references in stdout/stderr -- only `kid` ("fsb-phase-1-smoke-key", a public identifier) and short structural assertions are logged.
- **No INV violations.** INV-01 (MCP wire untouched): no MCP file edited. INV-02/03 (tool surface / provider parity): no tool or provider code touched. INV-04 (setTimeout iterator preserved): not in scope. INV-05 (no `extension/agents/*` resurrection): the diff adds nothing under `extension/agents/`. INV-06 (Lattice primitives live in Lattice): FSB does not implement any Lattice primitive -- it consumes via the bare `'lattice'` specifier through the file: dep.
- **Supply-chain risk is bounded.** The `file:./lattice/packages/lattice` dep resolves locally inside the repo; no remote registry pull for Lattice code itself. The 6 catalog -> literal substitutions in `lattice/packages/lattice/package.json` were cross-checked against `lattice/pnpm-workspace.yaml`: every literal (`@standard-schema/spec 1.1.0`, `canonicalize 3.0.0`, `mime 4.1.0`, `@noble/ed25519 3.1.0`, `@types/node 24.12.2`, `zod 4.3.6`) matches the workspace catalog exactly -- no semver-range widening, no version drift, no transitive surprises.
- **Audit trail accurate.** `.planning/LATTICE-PIN.md` SHA references (`ab6c1f6`, `195e5ae`, `22bf986`) and the `current_lattice_sha` frontmatter (`22bf98627ae86b1576db5d34cf447ab2b321b3e1`) were verified against `cd lattice && git log` / `git rev-parse HEAD`; the pinned SHA equals Lattice's actual `fsb-integration-experiments` HEAD. Phase-1 commit ordering (re-export -> docs -> packaging tweak) matches the commit log.
- **Error-handling on the verify path is complete.** Both the positive verify (Step 5) and the negative-key verify (Step 6) are exercised; `verifyReceipt` is asserted to return a typed `{ ok: false, error.kind: 'signature-invalid' }` (never throw) when the public key mismatches. The dynamic import is wrapped in `try/catch` with an actionable failure message; `createReceipt` is wrapped in `try/catch`; the IIFE has a `.catch()` tail to surface unexpected rejections.
- **FSB test convention adherence.** `'use strict'` at top, manual `passed`/`failed` counters via `passAssert` + `passAssertEqual` helpers (matches `tests/cost-tracker.test.js` and `tests/install-identity.test.js` style), `process.exit(failed > 0 ? 1 : 0)` at the end, run instruction `node tests/lattice-smoke.test.js` in the file header. The test is wired into the top-level `npm test` script as the final entry. The dynamic ESM import bridge (CJS test consuming Lattice ESM via `await import('lattice')`) is the right pattern for Node 16+ and avoids forcing the whole tests directory to ESM.

The three Info items below are non-blocking polish notes; none affect correctness.

## Info

### IN-01: Unused `node:assert/strict` import in smoke test

**File:** `tests/lattice-smoke.test.js:20`
**Issue:** `const assert = require('node:assert/strict');` is imported but never used. The file uses the custom `passAssert` / `passAssertEqual` helpers (which mirror the convention in `tests/cost-tracker.test.js`) and never calls a method on `assert`. Harmless dead import, but inconsistent with the rest of the file which is otherwise quite tight.
**Fix:** Either drop the line or wire it in for one or two strict-equality checks where the custom counters do not add value. Cheapest fix is removal:
```js
// remove this line
const assert = require('node:assert/strict');
```

### IN-02: Double-counted failure when `verifyReceipt` returns `ok: false` on the positive path

**File:** `tests/lattice-smoke.test.js:136-150`
**Issue:** Line 136 runs `passAssertEqual(result.ok, true, ...)` which increments `failed` if `result.ok !== true`. The defensive `else` branch at line 147-149 then increments `failed` a second time for the same condition. The exit code is still correct (any non-zero `failed` -> exit 1), but the printed counter will be off by one in the unhappy path and the `console.error` on line 149 logs `result.error` without the `passAssert` prefix, slightly muddying the output format. The structural intent (guard the `result.body.*` reads in the next block) is sound; only the bookkeeping is doubled.
**Fix:** Drop the manual `failed++` so the equality assert is the single source of truth, and keep the `else` purely as a structural guard plus a diagnostic log:
```js
if (result.ok === true) {
  passAssertEqual(result.body.version, 'lattice-receipt/v1', '...');
  // ...other body assertions...
} else {
  console.error('  (diagnostic) result.error =', JSON.stringify(result.error));
}
```

### IN-03: Negative-path `wrongResult.ok === false` block is unguarded if shape changes

**File:** `tests/lattice-smoke.test.js:159-166`
**Issue:** Line 159 asserts `wrongResult.ok === false`. The follow-up at lines 160-166 reads `wrongResult.error.kind`, gated by `if (wrongResult.ok === false)`. If a future Lattice change returned `{ ok: false }` without an `error` field (e.g., a malformed-fail variant), this would throw a `TypeError: Cannot read properties of undefined (reading 'kind')` and bypass the smoke's clean failure handler (the IIFE's `.catch` would catch it, but the failure message would be opaque). Mirrors the positive-path guard style but does not also guard `wrongResult.error`. Very low likelihood given Lattice's typed `VerifyError` contract, but cheap to defend.
**Fix:** Tighten the guard, e.g.:
```js
if (wrongResult.ok === false && wrongResult.error) {
  passAssertEqual(
    wrongResult.error.kind,
    'signature-invalid',
    'verifyReceipt error.kind is signature-invalid when the public key does not match'
  );
} else if (wrongResult.ok === false) {
  failed++;
  console.error('  FAIL: wrongResult.ok is false but .error is missing');
}
```

---

_Reviewed: 2026-05-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
