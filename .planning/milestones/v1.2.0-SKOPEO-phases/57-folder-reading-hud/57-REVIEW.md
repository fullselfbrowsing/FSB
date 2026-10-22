---
phase: 57-folder-reading-hud
reviewed: 2026-08-12T21:11:46Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - extension/background.js
  - extension/config/config.js
  - extension/content/skopeo-adaptive-composer.js
  - extension/content/skopeo-runtime.js
  - extension/content/skopeo-shell.js
  - extension/utils/skopeo-hud-projector.js
  - extension/utils/skopeo-hud-schema.js
  - extension/utils/skopeo-truth-engine.js
  - tests/fixtures/skopeo-hud-evals/cases.json
  - tests/fixtures/skopeo-hud-evals/manifest.json
  - tests/lattice-provider-bridge-smoke.test.js
  - tests/skopeo-adaptive-composer.test.js
  - tests/skopeo-browser-contract.test.js
  - tests/skopeo-catalog-runtime.test.js
  - tests/skopeo-corpus-runtime.test.js
  - tests/skopeo-hud-evals.test.js
  - tests/skopeo-hud-projector.test.js
  - tests/skopeo-hud-runtime.test.js
  - tests/skopeo-hud-schema.test.js
  - tests/skopeo-sidepanel-command.test.js
  - tests/skopeo-truth-evals.test.js
  - tests/skopeo-truth-runtime.test.js
  - tests/skopeo-truth-store.test.js
findings:
  critical: 10
  warning: 3
  info: 0
  total: 13
status: issues_found
---

# Phase 57: Code Review Report

**Reviewed:** 2026-08-12T21:11:46Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

The Phase 57 suites, syntax checks, and diff check pass, but the production join does not preserve the semantics exercised by the tests. Several user-visible states are constructed only in synthetic fixtures and cannot be produced through the live background adapter. The live path can also delete derived truth after a transient read failure, suppress the HUD on ordinary configured blockers, lose the contract rail in an asynchronous renderer race, and retain action authority after the user hides the rail.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Passive inspection deletes current truth when a read merely fails

**Classification:** BLOCKER (Critical)
**File:** extension/utils/skopeo-truth-engine.js:1481-1517, 1531-1565, 1579-1616
**Issue:** inspectDisplaySnapshot converts exceptions from inspectMetadata and readActiveFamily into null, then treats null as conclusive staleness and calls withdrawStale. The final metadata read, final authority read, and final context validation follow the same destructive pattern. withdrawStale ultimately invokes withdrawFamiliesForSources. A transient storage exception, temporary authority-read failure, or context validator outage can therefore erase otherwise-current derived truth during what is nominally a display inspection. The subsequent background helper may then launch a provider recomputation because the result is reported as snapshot-stale.
**Fix:** Track read availability separately from a successfully parsed mismatch. Return a non-mutating typed blocker for exceptions/unavailable reads. Call withdrawStale only after all relevant reads succeeded and their parsed dependency values prove a mismatch. For example:

    let rawMetadata;
    try {
      rawMetadata = await truthStore.inspectMetadata({ partitionKey });
    } catch (_error) {
      return blocked(['snapshot-stale']); // no withdrawal on unavailable evidence
    }
    const metadata = displayMetadata(rawMetadata, partitionKey);
    if (!metadata) return blocked(['snapshot-stale']);
    // Withdraw only after a successful comparison proves stale dependencies.

Add fault-injection tests for first/final metadata exceptions, active-family exceptions, authority exceptions, and context-validator exceptions that assert zero withdrawal calls.

### CR-02: The live adapter fabricates a governing source and collapses distinct legal states

**Classification:** BLOCKER (Critical)
**File:** extension/background.js:2802-2831, 2834-2854, 2872-2879
**Issue:** When the governance axis has no citation, the adapter chooses the first arbitrary assertion citation as the governing citation. Even when governance citations exist, choosing the first citation does not identify which document governs; the axis may cite execution, temporal, and lineage evidence from several family members. The same guessed source controls every reading state and every fact's governing/history role. In addition, lineage historical is always mapped to superseded, and any review-required family with a citation maps every source to historical because the governingSourceId branch precedes review-required. This turns non-definitive or historical evidence into definitive legal labels and can make the primary action open the wrong source.
**Fix:** Do not infer governing identity from an arbitrary citation. Preserve or derive an explicit source/record binding for the adjudicator's accepted governing path, then compute per-source states from that binding and the accepted lineage path. Apply review-required before any definitive mapping, preserve historical and superseded as separate values, and keep all unresolved sources not-evaluated. Classify each fact from its accepted applicability decision rather than source equality.

### CR-03: No live material date can pass the projector's acceptance gate

**Classification:** BLOCKER (Critical)
**File:** extension/background.js:2893-2910; extension/utils/skopeo-hud-projector.js:724-740
**Issue:** The live adapter copies deadlineResult.trustState into materialDates, while the production deadline engine emits inferred results. acceptedDateFor discards every date whose trustState is not accepted, so eligible, current, exact live deadlines always become “No material date proven.” The adapter also emits only notice-deadline rows from deadlineResults; it has no producer for the termination, expiration, or renewal date types supported by the schema and UI. Synthetic projector fixtures inject accepted dates directly and do not exercise this conversion.
**Fix:** Define an explicit trusted acceptance step at the background boundary. Only after a result is adjudicated, eligible, current, exact, and bound to the current evaluation context should the adapter emit the HUD-level accepted state. Add authoritative producers for all four typed material-date variants and preserve their separate consequences. Add an end-to-end raw truth-to-HUD test; do not satisfy it by pre-shaping materialDates.

### CR-04: More than ten eligible facts causes the entire reading HUD to disappear

**Classification:** BLOCKER (Critical)
**File:** extension/background.js:1950-1962, 2856-2891, 3064-3087; extension/utils/skopeo-hud-projector.js:1017-1041
**Issue:** The adapter mints an action binding for every eligible assertion. The projector intentionally caps public reading facts at ten and reports factOverflow, but buildCurrentHudProjection returns every pre-cap action binding. The controller then requires the number of private bindings to equal the number of public action tokens and rejects the whole projection when they differ. Eleven facts therefore produce no bounded HUD instead of ten visible facts plus an overflow count.
**Fix:** After projection, derive the exact set of public action tokens and retain exactly one private binding for each:

    const visibleActionIds = projectionActionTokens(projection);
    const actions = truthProjection.actions.filter(
      action => visibleActionIds.has(action.actionId)
    );
    return actions.length === visibleActionIds.size
      ? { projection, actions }
      : null;

Add controller-level tests with 10, 11, and maximum upstream assertions, including a primary governing action.

### CR-05: Admitted truth and evaluation blockers produce no contract-closed rail

**Classification:** BLOCKER (Critical)
**File:** extension/config/config.js:59-61; extension/background.js:408-467, 1889-1910; extension/content/skopeo-runtime.js:748-764
**Issue:** The default configuration deliberately yields timezone-missing, and the truth path can yield source-unavailable, source-unreadable, exact-set-incomplete, snapshot-stale, or evaluation-context blockers. The controller treats every truth result other than current as an exception and returns null. Content interprets that as an invalid response and withdraws without rendering anything. Thus a verified, explicitly invoked, supported context gets neither its required anchored contract-closed recovery state nor first-class unavailable-source feedback; the default install is the simplest reproduction. The schema's closed reason vocabulary exists but is never used for these live blockers.
**Fix:** Distinguish “no authority” from “admitted authority with a blocker.” Under the admitted display operation, map trusted blocker codes to the closed HUD vocabulary (for example timezone/calendar failures to evaluation-context-missing, unavailable sources to access-unavailable, incomplete sets to partial-authority, and proven drift to stale-input), build a schema-valid contract-closed envelope with the current authority tokens, and return it. Reserve null for unsupported/unverified/no-authority contexts.

### CR-06: The contract HUD races the legacy corpus renderer for the same shell region

**Classification:** BLOCKER (Critical)
**File:** extension/content/skopeo-runtime.js:912-936, 1866-1867, 2003-2004; extension/content/skopeo-shell.js:2828-2854
**Issue:** Commit and route change launch refreshContractForCurrentContext and refreshCorpusForCurrentContext back-to-back without ordering. Both asynchronous requests render into the shell's shared _corpusScope. If the contract response wins first and the corpus response resolves later, renderCorpus disposes the contract scope and replaces it with the legacy corpus view. Runtime still retains the contract projection/action tokens, and shell retains stale contract authority fields. Which UI remains visible therefore depends on network completion order.
**Fix:** Give the shared surface one owner/generation state machine. Await the contract request and invoke the corpus renderer only as an explicit fallback, or reject any corpus completion once the current epoch is owned by a pending/rendered contract projection. Clear the displaced model's authority and actions atomically. Add both completion orders to a test using the real shared shell behavior.

### CR-07: A complete zero-vendor folder cannot reach the supported empty state

**Classification:** BLOCKER (Critical)
**File:** extension/background.js:2567-2578, 3402-3413; extension/utils/skopeo-truth-engine.js:249-262
**Issue:** The projector and schema support a complete authoritative empty folder, but visibleHudManifest rejects every manifest whose sources array is empty. The corpus operation selection also rejects an empty sourceFileIds array, and the truth engine requires at least one visible source binding. Consequently the production path can never emit the documented complete-empty folder HUD even when the enrolled root is authoritatively empty.
**Fix:** Add an explicit authenticated zero-set display path bound to the current root claim, manifest generation, and empty-set digest. Permit an empty source selection only for that exact complete display case, produce complete empty graph/truth inputs without provider work, and keep non-display operations closed. Test the real background request from an empty visible manifest through content rendering.

### CR-08: Hide and geometry withdrawal leave runtime and background action authority alive

**Classification:** BLOCKER (Critical)
**File:** extension/content/skopeo-shell.js:1896-1903, 2956-2958; extension/content/skopeo-runtime.js:660-672; extension/background.js:3185-3189
**Issue:** The hide button and geometry revalidation call shell.withdrawCorpus directly. They never call the runtime's withdrawContractProjection, so contractViewToken, action IDs, and action epochs remain current in content. They also send no revocation to background, leaving every one-shot capability in projectionStates ready. The background test simulates hide by directly calling the private revokeController method, but no production hide route performs that call. Runtime withdrawal also suppresses shell exceptions and reports success, which can leave stale DOM while local state claims it is gone.
**Fix:** Route every hide/unsafe-geometry withdrawal through one runtime-owned callback that synchronously clears content state, requires shell removal to succeed (or terminally destroys the shell), and sends an exact projection-bound revocation message to background. Background must validate the current sender/projection tuple and call revokeHudProjection. Test by clicking the actual hide control and then attempting every captured action.

### CR-09: Required missing-final, policy-missing, and urgent-gap states have no live producer

**Classification:** BLOCKER (Critical)
**File:** extension/background.js:2912-2923; extension/utils/skopeo-hud-projector.js:743-770, 803-815
**Issue:** The adapter hard-codes finalState to present or not-evaluated, priorityGaps to an empty array, and policyState to not-evaluated. The projector can emit missing-final only from proven-missing finalState, policy-document-missing only from proven-missing policyState, and urgent priorities only from priorityGaps. Those required risk states are therefore dead in the live implementation regardless of evidence. The passing E11/E15-style cases bypass the adapter by supplying these fields synthetically.
**Fix:** Extend the trusted join (and upstream proof shape if necessary) with explicit, current, exact authoritative absence and priority evidence. Map only those proofs to proven-missing/urgent; otherwise retain not-evaluated. Add raw manifest/graph/truth integration cases that prove both positive absence and unknown/incomplete evidence remain distinct.

### CR-10: A truncated source manifest can be certified as complete

**Classification:** BLOCKER (Critical)
**File:** extension/utils/skopeo-hud-projector.js:254-287, 882-887, 995-998
**Issue:** parseManifest accepts sourceOverflow greater than zero even when state is complete. Both folder and reading completeness calculations ignore sourceOverflow and compare only totalSources to the numeric cap. A caller can therefore supply fewer source rows than totalSources, mark the manifest complete, and receive a current definitive projection over the truncated subset. This violates the exact-set boundary and can omit governing or conflicting documents without any partial/closed signal.
**Fix:** Require sourceOverflow === 0 and totalSources === sources.length before either mode can be complete. Treat any overflow as partial/closed, and add complete-plus-overflow rejection tests for folder and reading modes.

## Warnings

### WR-01: JavaScript and CSS disagree at the exact 480px breakpoint

**Classification:** WARNING
**File:** extension/content/skopeo-shell.js:644-650, 2897-2918
**Issue:** CSS applies the narrow contract layout at max-width: 480px, while the geometry certificate uses viewportWidth < 480. At exactly 480px the collision check certifies the desktop rectangle, but CSS forces a different left/right layout. Host controls can therefore overlap a rail whose safety check covered another rectangle.
**Fix:** Use one shared boundary: either change the JavaScript test to <= 480 or change the media query to max-width: 479px, then add an exact-480 collision fixture.

### WR-02: A failed citation re-enables a token that background has permanently revoked

**Classification:** WARNING
**File:** extension/background.js:2071-2075; extension/content/skopeo-shell.js:3199-3222
**Issue:** Background changes a failed action to revoked, but the shell immediately re-enables the same button. Every subsequent click must fail because the token can never return to ready. This contradicts the fresh-token retry contract and presents a nonfunctional control.
**Fix:** Keep the failed control disabled and instruct the runtime to obtain a fresh projection, or refresh the projection first and replace the control with a newly issued action ID before enabling it.

### WR-03: Tests bypass the production joins that contain the failures above

**Classification:** WARNING
**File:** tests/skopeo-hud-runtime.test.js:683-719, 1080-1107; tests/skopeo-hud-evals.test.js:257-325
**Issue:** Controller tests inject pre-shaped folder/reading projections instead of executing buildCurrentHudProjection. Content tests make renderCorpus a no-op, so they cannot observe the shared-surface race. Evaluation cases likewise construct legal states, accepted dates, and blockers directly. The suite therefore reports PASS while never testing whether raw Phase 56 truth can produce those states or whether the two real renderers race.
**Fix:** Add a production-join integration harness that feeds raw manifest, graph, and truth data through the actual background adapter/controller and real shell ownership behavior. Retain unit fixtures, but require live-shaped cases for historical vs superseded, review-required, accepted dates, overflow, blockers, zero-vendor, missing-final, hide revocation, and both async completion orders.

---

_Reviewed: 2026-08-12T21:11:46Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
