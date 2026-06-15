---
phase: 02-lattice-tripwire-receipt-extension
reviewed: 2026-05-24T19:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - tests/lattice-tripwire-smoke.test.js
  - package.json
  - lattice/packages/lattice/src/receipts/types.ts
  - lattice/packages/lattice/src/receipts/receipt.ts
  - lattice/packages/lattice/src/receipts/verify.ts
  - lattice/packages/lattice/src/contract/bands.ts
  - lattice/packages/lattice/src/index.ts
  - .planning/LATTICE-PIN.md
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-24T19:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found (1 warning, 3 info -- below block-on threshold `high`)

## Summary

Phase 2 ships the v1.1 Capability Receipt schema extension (six optional step-marker fields with backward-compatible version bump) plus a new Lattice primitive: `createHookPipeline` with priority bands, per-handler matcher regex, race-with-log budget enforcement, and irreversible freeze. The FSB-side deliverable is `tests/lattice-tripwire-smoke.test.js`, which exercises both primitives end-to-end via the existing `file:` dependency.

**Phase-cohesion verdict: GREEN.** All thirteen guardrails from the review brief check out:

1. **No emojis.** All 8 files scanned -- zero matches against an emoji + common-icon regex set.
2. **No hardcoded keys.** Smoke mints fresh Ed25519 material via `lattice.generateEd25519KeyPairJwk()` at line 72; no JWK literals, no `new Uint8Array([...])` key bytes.
3. **Promise.race no-abort pattern (D-09 / CD-01).** `bands.ts:131-169` matches the documented design: handler-promise + timeout-promise race; on timeout, emit `HOOK_TIMEOUT` synchronously and return; the handler keeps running in the background (CPU-leak accepted per CD-01).
4. **`pipeline.freeze()` throws on subsequent `register()`.** `bands.ts:200-204` constructs an `Error` with `.name = PIPELINE_FROZEN_ERROR_NAME` ("PIPELINE_FROZEN") before throwing; smoke Part 5 (line 187) verifies the thrown error name.
5. **v1.1 discriminated-union narrowing.** `types.ts:43` widens the `version` literal to `"lattice-receipt/v1" | "lattice-receipt/v1.1"`; `verify.ts:42` accepts both literals and falls through to `version-mismatch` otherwise.
6. **`exactOptionalPropertyTypes` compliance.** `receipt.ts:122-128` uses the conditional-spread idiom (`...(input.stepName !== undefined ? { stepName: input.stepName } : {})`) consistent with the existing `noRouteReasons` / `tripwireEvidence` pattern at `receipt.ts:116-121`. `bands.ts:163` and `bands.ts:217` use the same idiom for `sessionId` and `matcher`.
7. **INV-04 not touched.** No `extension/ai/agent-loop.js` diff on the current `automation` branch (Phase 2 file scope is 100% `.planning/`, `package.json`, `tests/lattice-tripwire-smoke.test.js`).
8. **INV-01 not touched.** No `extension/ai/tool-definitions.js` diff.
9. **D-13 honored.** `tests/lattice-smoke.test.js` last modified at commit `1545c14c` (Phase 1 baseline); no subsequent edits on `automation` branch.
10. **Smoke invokes real runtime.** Part 3-6 (smoke lines 137-213) construct real pipelines with `lattice.createHookPipeline()`, register real handlers, and await `pipe.run(...)`. Part 6 measures wall-clock budget breach (200ms handler vs 50ms budget) using real `setTimeout`. This is not a static-text check.
11. **Lattice TS strict-mode + verbatimModuleSyntax.** `bands.ts:28` uses `import type { TracerLike }`; `types.ts:10-11` use `import type`; all exported interfaces are `readonly`-fielded; no untyped `any` usage.
12. **Phase 2 audit trail.** `LATTICE-PIN.md` row 2 records `97836f2` with the full work decomposition (5 commits across receipt v1.1, test cleanup, bands, index re-export, audit-doc flips).
13. **Public surface re-export.** `index.ts:2` re-exports `createHookPipeline`, `HookPipeline`, and `HookLifecycleEvent`; smoke surface-presence checks at lines 56-62 pass.

The single warning (WR-01) and three info items below are all in `bands.ts` and document subtle race-with-log + freezeContext edge cases that warrant follow-up but do NOT block the phase.

## Warnings

### WR-01: structuredClone fallback silently exposes caller object to freeze

**File:** `lattice/packages/lattice/src/contract/bands.ts:118-129`
**Issue:** `freezeContext` swallows `structuredClone` failures with `} catch { cloned = ctx; }`. When `structuredClone` throws (e.g. context contains a `Function`, `WeakMap`, DOM node, or other non-cloneable value), `cloned` is reassigned to the original `ctx`. The subsequent `Object.freeze(cloned)` then freezes the caller's original object in-place, mutating their reference's frozen-state. This is a quiet behavior change: the docstring at `bands.ts:62-65` promises "Mutations on the handler side do NOT leak back to the calling site," but a non-cloneable context breaks that promise -- the handler still cannot mutate (because of freeze) but the *caller* now holds a frozen object they did not expect.

The smoke test happens to pass a plain `{ tool: 'click' }` object which clones fine, so this path is not exercised. But the FSB integration in Phase 3+ (which will pass real provider request / tool-call payloads) may hit it.

Severity bumped to Warning rather than Info because the contract violation is silent -- there is no diagnostic emit on the catch path. A handler-budget timeout emits `HOOK_TIMEOUT`; a clone failure emits nothing.

**Fix:**
```ts
function freezeContext<T>(ctx: T): Readonly<T> {
  let cloned: T;
  let cloneFailed = false;
  try {
    cloned = structuredClone(ctx);
  } catch {
    cloned = ctx;
    cloneFailed = true;
  }
  if (typeof cloned === "object" && cloned !== null) {
    // Skip freeze when we fell back to the caller's object -- otherwise
    // we silently mutate their reference's frozen-state. Logging the
    // clone failure is left to a future emit hook (CONTEXT-pin needed).
    if (!cloneFailed) Object.freeze(cloned);
  }
  return cloned as Readonly<T>;
}
```
Alternative: thread `emit` into `freezeContext` and emit a `HOOK_CONTEXT_UNCLONEABLE` diagnostic on the catch path, similar to `HOOK_TIMEOUT`. Either way, the silent freeze-of-original branch should not survive into Phase 3 wire-up.

## Info

### IN-01: Stale "v1" string in version-mismatch error message

**File:** `lattice/packages/lattice/src/receipts/verify.ts:106-108`
**Issue:** The version literal-union was widened to accept v1 and v1.1 at line 42, but the fail() message at line 107 still reads `"receipt body is not a lattice-receipt/v1 shape"`. Downstream log consumers grepping for "v1.1" will miss receipts that fail the shape check post-bump.
**Fix:** Update message to `"receipt body is not a lattice-receipt/{v1,v1.1} shape"` or `"receipt body version is not lattice-receipt/v1 or v1.1"` to reflect the widened acceptance.

### IN-02: Handler-completion path leaks the budget timer

**File:** `lattice/packages/lattice/src/contract/bands.ts:141-155`
**Issue:** The `setTimeout(...)` inside `budgetPromise` is never cleared on the handler-wins branch. When the handler resolves before the budget, `Promise.race` returns `"__done__"`, but the timer keeps the event loop alive for the remaining `budgetMs - elapsed` ms. For one-shot tests this is invisible, but a high-throughput pipeline running thousands of `BEFORE_TOOL` hooks under the default 100ms budget will accumulate thousands of pending timers per second until they each fire. Memory grows on the timer queue, then drains; functional impact is bounded but observable.
**Fix:** Capture the timer handle and clear it on the handler-wins branch:
```ts
let timerHandle: ReturnType<typeof setTimeout> | undefined;
const budgetPromise = new Promise<"__timeout__">((resolve) => {
  timerHandle = setTimeout(() => {
    timeoutFired = true;
    resolve("__timeout__");
  }, budgetMs);
});
// ...
const result = await Promise.race([handlerPromise, budgetPromise]);
if (result === "__done__" && timerHandle !== undefined) {
  clearTimeout(timerHandle);
}
```

### IN-03: Smoke harness exit code aliasing process.exit at line 218 vs error catch

**File:** `tests/lattice-tripwire-smoke.test.js:218-222`
**Issue:** Smoke harness exits with `failed > 0 ? 1 : 0` at line 218 inside the IIFE, then has a `.catch` at line 219 that exits with 1 on uncaught rejection. The IIFE returns the same Promise that line 219 catches -- if the IIFE rejects after a partial-pass run, both branches could fire, but only the catch matters. This is benign (process.exit terminates), just slightly redundant. Consider returning rather than calling process.exit inside the IIFE so the .catch is the single exit point. Not blocking.
**Fix:** Replace `process.exit(failed > 0 ? 1 : 0)` with `if (failed > 0) throw new Error('tripwire smoke had ' + failed + ' failures')`; the outer .catch will then exit with code 1, and successful runs naturally exit 0 once the IIFE's Promise resolves.

---

_Reviewed: 2026-05-24T19:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
