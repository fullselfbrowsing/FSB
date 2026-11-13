# Phase 53: Drive Context Router & Semantic Anchors - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `53-CONTEXT.md`; this log preserves the analysis and confirmation.

**Date:** 2026-07-15
**Phase:** 53-drive-context-router-semantic-anchors
**Mode:** assumptions
**Areas analyzed:** Context routing and phase boundary, semantic anchor identity, rebinding and stale-work authority, fail-quiet projection

## Assumptions Presented

### Context Routing and Phase Boundary

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Add a deterministic content-side router returning recognized-with-evidence, uncertain-with-reason, or unsupported-with-reason for the Phase 53 context classes, without absorbing Phase 54+ corpus, permission, content, or truth authority. | Likely | `.planning/milestones/v1.2.0-SKOPEO-ROADMAP.md`; `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md`; `.planning/research/ARCHITECTURE-v1.2.0-SKOPEO.md`; `extension/catalog/handlers/gdrive.js`; `extension/catalog/handlers/gdocs.js` |

### Semantic Anchor Identity Contract

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Key anchors by stable Drive/Docs meaning and opaque downstream target keys; treat DOM nodes as revocable bindings with explicit validators and commit-time identity/geometry proof. | Confident | `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md`; `.planning/research/ARCHITECTURE-v1.2.0-SKOPEO.md`; `.planning/research/PITFALLS-v1.2.0-SKOPEO.md`; `extension/catalog/handlers/gdrive.js`; `extension/catalog/handlers/gdocs.js` |

### Rebinding, SPA Navigation, and Stale-Work Authority

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Let the active Skopeo generation own a viewport-bounded, batched registry; withdraw invalid bindings before re-resolution and authorize replacement only for a matching session generation, context epoch, and semantic identity. Re-route same-document SPA changes while retaining terminal teardown for kill, unsafe pages, and hard navigation. | Likely | `extension/content/skopeo-runtime.js`; `extension/content/skopeo-shell.js`; `extension/utils/skopeo-session-state.js`; `extension/content/lifecycle.js`; `extension/background.js`; `tests/skopeo-browser-contract.test.js`; `.planning/research/PITFALLS-v1.2.0-SKOPEO.md` |

### Fail-Quiet Projection and Verification

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Uncertain or unsupported contexts remove all anchor-dependent surfaces immediately and retain only a concise, non-focus-stealing ambient reason in the existing shell; uncertainty never guesses a label or triggers a modal gate. | Confident | `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md`; `.planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-CONTEXT.md`; `extension/content/skopeo-shell.js`; `.planning/research/PITFALLS-v1.2.0-SKOPEO.md` |

## Corrections Made

No corrections. The user selected **Yes, proceed** on 2026-07-15 and confirmed all four assumptions.

## Open Research and Validation Requirement

- Live Drive/Docs reconnaissance must establish which host signals reliably expose stable file, folder, document, and target identity across Drive list/grid density, row recycling, reorder, SPA navigation, and Docs views.
- This cannot be certified from undocumented CSS classes or public web research. Planning must capture live signals as committed fixtures and negative controls and preserve fail-quiet behavior wherever identity cannot be proven.

