---
phase: 2
slug: lattice-tripwire-receipt-extension
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-24
---

# Phase 2 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `02-RESEARCH.md#validation-architecture` + `02-CONTEXT.md` decisions (D-01..D-18 binding) + Phase 1 baseline preservation.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Lattice framework** | vitest (existing). Tests live under `lattice/packages/lattice/src/**/*.test.ts`. Lattice's `pnpm test` runs the suite. |
| **FSB framework** | Plain `node tests/foo.test.js` (FSB convention). New `tests/lattice-tripwire-smoke.test.js` mirrors `tests/lattice-smoke.test.js` style exactly. |
| **Lattice quick run** | `cd lattice && pnpm -F lattice test -- src/contract/bands.test.ts` (single new vitest file) -- under 5 seconds |
| **Receipts quick run** | `cd lattice && pnpm -F lattice test -- src/receipts/` -- runs the receipt test suite + new tests |
| **Lattice full suite** | `cd lattice && pnpm test` -- runs all 451+ existing tests + Phase 2's new tests (must all pass) |
| **FSB quick run** | `node tests/lattice-tripwire-smoke.test.js` (under 5 seconds) |
| **FSB full suite** | `npm test` (Phase 1 + Phase 2 smokes chained; full chain must remain green) |
| **Phase-gate command** | `cd lattice && pnpm typecheck && pnpm test && cd .. && npm test` |

---

## Sampling Rate

- **After every Lattice-side task commit:** `cd lattice && pnpm -F lattice test -- <relevant test path>` (e.g., `src/receipts/` after a receipts edit; `src/contract/` after a bands edit) -- under 5 seconds quick feedback.
- **After every Lattice-side wave (= cluster of related commits):** `cd lattice && pnpm typecheck && pnpm test` -- 30-60s; catches the 451-test baseline.
- **After every FSB-side task commit:** `node tests/lattice-tripwire-smoke.test.js` (smoke quick run).
- **After every FSB-side wave:** `npm test` (full chain).
- **Before `/gsd-verify-work`:** Full chain green on both sides + Lattice audit doc rows flipped to `Covered` with backlink SHAs + `.planning/LATTICE-PIN.md` bumped + REQUIREMENTS.md LSDK REQ-IDs populated.
- **Max feedback latency:** 5 seconds for quick run; ~60s for Lattice full suite.

---

## Per-Task Verification Map

> Task IDs will be finalized by the planner; this table maps Phase 2's expected work surfaces.

| Task ID | Plan | Wave | Requirement / Decision | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|------------------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-XX | 01 | 1 | D-01..D-05 (CapabilityReceiptBody extension + v1.1 bump) | -- | New optional fields are non-PII stable identifiers; canonical body preserves alphabetical key order | vitest | `cd lattice && pnpm -F lattice test -- src/receipts/` | W0 | pending |
| 2-01-XX | 01 | 1 | D-02 (verify.ts asReceiptBody accepts both literals) | -- | version-mismatch still fires for unknown literals; v1 and v1.1 receipts both verify cleanly | vitest | `cd lattice && pnpm -F lattice test -- src/receipts/verify.test.ts` | W0 | pending |
| 2-01-XX | 01 | 1 | D-03 (JCS round-trip stability) | -- | canonical.test.ts proves alphabetical sort; verify confirms with the new fields | vitest | `cd lattice && pnpm -F lattice test -- src/receipts/canonical.test.ts` | yes (existing) | pending |
| 2-01-XX | 01 | 1 | D-04 (redaction manifest unchanged) | -- | redact.test.ts continues to pass; no PII path enabled for new fields | vitest | `cd lattice && pnpm -F lattice test -- src/receipts/redact.test.ts` | yes (existing) | pending |
| 2-02-XX | 02 | 2 | D-06..D-11 (bands.ts shipping) | -- | Pure tripwire evaluator at tripwire.ts NOT modified; new module is sibling | vitest | `cd lattice && pnpm -F lattice test -- src/contract/bands.test.ts` | W0 | pending |
| 2-02-XX | 02 | 2 | D-07 (priority bands ordering) | -- | SAFETY > OBSERVABILITY > EXTENSION; verified by registered-handler invocation order | vitest | bands.test.ts band-ordering case | W0 | pending |
| 2-02-XX | 02 | 2 | D-08 (matcher regex per-handler) | -- | Handler with matcher fires only when event matches; non-matching events skip the handler | vitest | bands.test.ts matcher case | W0 | pending |
| 2-02-XX | 02 | 2 | D-09 (race-with-log per-handler budget) | T-2-01 (HOOK_TIMEOUT carries no PII) | Budget timer fires; HOOK_TIMEOUT logged via TracerLike with stable identifiers only | vitest | bands.test.ts race-with-log case | W0 | pending |
| 2-02-XX | 02 | 2 | D-10 (frozen-context evaluation) | -- | Handler mutations don't leak via structuredClone + Object.freeze | vitest | bands.test.ts frozen-context case | W0 | pending |
| 2-02-XX | 02 | 2 | D-11 (mid-session freeze) | -- | pipeline.freeze() irreversible; subsequent register() throws | vitest | bands.test.ts freeze case | W0 | pending |
| 2-02-XX | 02 | 2 | D-12 (HookLifecycleEvent union separate from RunEventKind) | -- | bands.ts exports its own typed union; tracing.ts RunEventKind unchanged | typecheck + grep | `cd lattice && pnpm typecheck`; `grep -c "BEFORE_PROVIDER\|AFTER_PROVIDER" lattice/packages/lattice/src/tracing/tracing.ts` returns 0 | W0 | pending |
| 2-03-XX | 03 | 2 | Lattice index.ts re-exports updated | -- | createHookPipeline + HookLifecycleEvent reachable via bare specifier `'lattice'` | grep | `grep -c "createHookPipeline" lattice/packages/lattice/src/index.ts` >= 1 | W0 | pending |
| 2-03-XX | 03 | 2 | Lattice dist/ rebuilt | -- | dist/index.js contains the new re-exports after pnpm build | grep | `grep -c "createHookPipeline" lattice/packages/lattice/dist/index.js` >= 1 | W0 | pending |
| 2-04-XX | 03 | 3 | D-13 (Phase 2 FSB smoke is new file) | T-2-02 (smoke uses ephemeral keypair) | tests/lattice-tripwire-smoke.test.js mints v1.1 + verifies + exercises band pipeline; Phase 1 smoke byte-frozen | runtime | `node tests/lattice-tripwire-smoke.test.js` exits 0 | W0 | pending |
| 2-04-XX | 03 | 3 | Phase 1 smoke still passes (regression gate) | -- | Phase 1's 29 assertions remain green | runtime | `node tests/lattice-smoke.test.js` exits 0 (29 PASS) | yes | pending |
| 2-04-XX | 03 | 3 | npm test full chain | -- | All existing tests + new smoke pass | runtime | `npm test` exits 0 | yes | pending |
| 2-05-XX | 04 | 3 | D-14 ceremony (Ref footer on every Lattice commit) | T-2-03 (Ref footer leaks no FSB IP) | All Phase 2 Lattice commits carry `Ref: FSB v0.10.0-attempt-2 Phase 2` | grep | `cd lattice && git log fsb-integration-experiments..HEAD --format=%B | grep -c "Ref: FSB v0.10.0-attempt-2 Phase 2"` matches commit count | W0 | pending |
| 2-05-XX | 04 | 3 | D-15 carryforward (no push) | T-2-04 (mainline PR deferred) | `cd lattice && git reflog | grep -c push` returns 0 | shell | reflog grep | yes | pending |
| 2-05-XX | 04 | 3 | Audit doc rows flipped to Covered | -- | lattice/docs/fsb-integration-gaps.md closed rows have Status=Covered + SHA in Notes | grep | `grep -c "Covered" lattice/docs/fsb-integration-gaps.md` increases by 6 over Phase 1 baseline (or whatever exact count Phase 2 closes) | W0 | pending |
| 2-05-XX | 04 | 3 | D-16 LATTICE-PIN.md bump | -- | current_lattice_sha matches new Lattice HEAD; one new Phase 2 row in body | grep | `grep "current_lattice_sha:" .planning/LATTICE-PIN.md` matches `cd lattice && git rev-parse fsb-integration-experiments` | yes | pending |
| 2-05-XX | 04 | 3 | D-17 LSDK REQ-IDs populated | -- | REQUIREMENTS.md LSDK-02..LSDK-08 (or whatever final count) replace TBD placeholders | grep | `grep -c "LSDK-0" .planning/REQUIREMENTS.md` >= 7 | yes | pending |
| INV-01 | -- | gate | MCP wire UNTOUCHED | -- | tool-definitions-parity.test.js continues 142/142 PASS | unit | `node tests/tool-definitions-parity.test.js` exits 0 | yes | pending |
| INV-04 | -- | gate | setTimeout iterator preserved | -- | `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 | grep | shell | yes | pending |
| INV-06 | -- | gate | Lattice primitives in Lattice repo | -- | Zero FSB-side primitive implementation; smoke imports from bare 'lattice' | by construction | -- | yes (construction) | pending |
| Option-B carryforward | -- | gate | Zero extension/* modifications | -- | `git diff --name-only $(git merge-base origin/main HEAD)..HEAD | grep -E "^extension/" | wc -l` returns 0 | shell | yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `lattice/packages/lattice/src/receipts/types.ts` modified (new optional fields + v1.1 literal union)
- [ ] `lattice/packages/lattice/src/receipts/verify.ts` modified (asReceiptBody accepts both literals)
- [ ] `lattice/packages/lattice/src/receipts/receipt.ts` modified (createReceipt version-bump heuristic)
- [ ] `lattice/packages/lattice/src/receipts/*.test.ts` new tests for v1.1 mint + verify backward-compat
- [ ] `lattice/packages/lattice/src/contract/bands.ts` -- NEW file
- [ ] `lattice/packages/lattice/src/contract/bands.test.ts` -- NEW file
- [ ] `lattice/packages/lattice/src/index.ts` modified (re-exports for createHookPipeline + HookLifecycleEvent)
- [ ] `lattice/packages/lattice/dist/*.js + .d.ts` rebuilt via `pnpm build`
- [ ] `lattice/docs/fsb-integration-gaps.md` modified (closed rows flipped to Covered with backlink SHAs)
- [ ] `tests/lattice-tripwire-smoke.test.js` -- NEW file (FSB-side)
- [ ] `package.json` `scripts.test` chain extended (append `&& node tests/lattice-tripwire-smoke.test.js`)
- [ ] `.planning/LATTICE-PIN.md` bumped (frontmatter `current_lattice_sha` + new Phase 2 row)
- [ ] `.planning/REQUIREMENTS.md` LSDK REQ-IDs populated (LSDK-02..LSDK-08 or final count)

*No test framework install required (Lattice uses existing vitest; FSB uses existing raw node).*

---

## Manual-Only Verifications

(Same MV3 sanity reload deferred to milestone UAT as Phase 1 -- Phase 2 inherits the deferral. Phase 2's smokes are all automated.)

(No new manual-only items introduced by Phase 2 -- the work is entirely Node + vitest verifiable.)

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (bands.ts, bands.test.ts, lattice-tripwire-smoke.test.js, plus the modifications)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s for quick run; < 60s for Lattice full suite
- [ ] `nyquist_compliant: true` set in frontmatter (planner sets after plan-checker passes)

**Approval:** pending
