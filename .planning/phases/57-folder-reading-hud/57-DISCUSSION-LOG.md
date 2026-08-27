# Phase 57: Folder & Reading HUD - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `57-CONTEXT.md`; this log preserves the analysis and confirmation.

**Date:** 2026-08-06
**Phase:** 57-folder-reading-hud
**Mode:** assumptions
**Areas analyzed:** Trusted View Projection, Folder HUD Composition, Reading State and Source Navigation, Gap and Date Semantics

## Assumptions Presented

### Trusted View Projection

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Add one background-only Phase 57 projector that combines the exact current corpus manifest, graph records, and Phase 56 truth snapshots into a bounded recursively frozen folder or reading model. Run it through current corpus `display` authority and keep raw stores/facades and cross-record joins out of content code. | Confident | `extension/background.js`; `extension/utils/skopeo-truth-engine.js`; Phase 54–56 context contracts |

**If wrong:** Cross-record joins would move into untrusted content code or the private truth boundary would widen, weakening permission, currentness, and stale-context guarantees.

**Alternatives considered:** expose the existing private truth facade to content; let content request and join corpus, graph, and truth projections independently; build a detached projection service.

### Folder HUD Composition

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Use one bounded composite right-side HUD, activated explicitly and anchored to the verified Drive folder/root, with vendor rows, next deadlines, urgent gaps, and explicit overflow. Do not annotate every recycled Drive row in Phase 57. | Likely | `extension/content/skopeo-runtime.js`; `extension/content/skopeo-shell.js`; `extension/content/skopeo-anchor-registry.js`; `.context/hud-design-reference/export/canvas-4/Canvas-4.dc.html` |

**If wrong:** Phase 57 would expand into a multi-anchor compositor plus independently verified identity and revocation for every decorated Drive row, materially increasing wrong-target and residue risk.

**Alternatives considered:** right-side HUD plus badges only on currently visible independently verified rows; full multi-row folder annotation matching the visual reference.

### Reading State and Source Navigation

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Render a definitive governing, historical, or superseded banner only when accepted Phase 56 lineage proves it; render exact cited facts and use a new background `citation-open` path with fresh access certification for the direct governing-source/clause route. Keep ask, draft, send, and policy decisions out of Phase 57. | Confident | `extension/utils/skopeo-truth-schema.js`; `extension/background.js`; `.planning/phases/56-governing-lineage-evidence-deadline-engine/56-CONTEXT.md`; reading-state canvas reference |

**If wrong:** Presentation could manufacture a legal-status conclusion from filename or page context, stale URLs could bypass current access, or Phase 57 could absorb Phase 58 interaction/policy scope.

**Alternatives considered:** reuse stored URLs; let content derive navigation from filenames/host DOM; include the reference mock's ask and draft controls now.

### Gap and Date Semantics

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Keep notice deadline, renewal, termination, and expiration explicitly typed with the consequence of inaction separate. Render gaps only from authoritative evidence and reserve first-class neutral slots for policy/memo/notification statuses until Phase 58 or 59 provides the authority to claim a required memo, missing policy obligation, or notification failure. | Likely | `.planning/REQUIREMENTS.md`; `extension/utils/skopeo-corpus-schema.js`; `extension/utils/skopeo-graph-schema.js`; `extension/utils/skopeo-truth-schema.js`; Phase 58–59 roadmap boundaries |

**If wrong:** Phase 57 would have to implement part of the policy or alert engines despite their later phase ownership, or infer missing/failed states from absence without a completeness proof.

**Alternatives considered:** treat absence of a graph record as proof of a missing policy/memo; introduce an early notification ledger; omit later-owned statuses entirely instead of reserving honest neutral slots.

## User Confirmation

The user replied **“yes”** and confirmed all four assumptions without correction.

## Corrections Made

No corrections — all assumptions were confirmed.

## External Research

No external research was required; current repository contracts, planning artifacts, implementation code, tests, and the supplied visual reference were sufficient. The dedicated assumptions sub-agent could not refresh its authentication token, so the same read-only evidence pass was completed inline before assumptions were presented.

## The agent's Discretion

- Exact module/file split, schema names, versions, finite caps, and closed reason-code vocabulary.
- Exact vendor ordering, grouping, overflow control, and empty/loading/error copy.
- Exact closed-atom composition and visual polish inside the existing Skopeo UI contract.
- Exact deterministic test and fixture decomposition within the approved authority and lifecycle boundaries.

## Deferred Ideas

- Per-row Drive badges and multi-anchor composition require a later independently verified design.
- Cited free-form ask plus Document 10 and complex-memo policy are Phase 58.
- Notification delivery, ledger, failure states, and recipient reconciliation are Phase 59.
- A detached contract application remains outside the milestone boundary.
