# Phase 52 Discussion Log

**Phase:** On-Demand HUD Lifecycle & Primitive Shell  
**Date:** 2026-07-14  
**Mode:** Assumptions review  
**Outcome:** All surfaced assumptions confirmed by the user

This file is an audit trail of the discussion. Downstream agents must use `52-CONTEXT.md`, not this log, as the implementation contract.

## Framing Presented

Phase 52 was framed as the lifecycle and shared primitive foundation only: explicitly invoke Skopeo, render a safe accessible shell, dismiss or kill it reliably, and leave no residue. Semantic anchoring, the Drive contract pack, and the local graph layer were identified as later-phase work.

## Areas Reviewed

### Invocation surface

**Recommended assumption:** Add a dedicated Skopeo toggle inside the existing FSB side panel plus a configurable Chrome command. Preserve the toolbar icon's existing job of opening FSB, and leave no dormant in-page launcher while Skopeo is off. Prefer the design reference's `Option+Space` chord where Chrome permits it.

**Alternatives surfaced:**
- Repurpose the extension toolbar click to toggle Skopeo.
- Keep a dormant launcher visible on every page.

**Decision:** Recommended assumption confirmed without correction.

### Primitive shell and visual priority

**Recommended assumption:** Build all six primitives behind one shared contract, while normal invocation shows only a compact ambient lens/edge rail. Reveal anchor marks and chips in anchored states, ghosting in focused states, halos for anomalies, and gates only for consequential moments.

**Alternative surfaced:** Display the full primitive set together to demonstrate the design system.

**Decision:** Recommended assumption confirmed without correction.

### Dismissal and universal kill

**Recommended assumption:** A close control or single `Escape` dismisses the topmost surface and restores the preceding attention level. Toggle-off or `Escape Escape` kills the current-tab Skopeo session, aborts pending work, clears all state, and prevents late results from resurrecting the HUD. Other tabs and unrelated FSB behavior remain untouched.

**Alternatives surfaced:**
- Treat every close or single `Escape` as a complete shutdown.
- Make the kill action terminate Skopeo in all tabs/windows.

**Decision:** Recommended assumption confirmed without correction.

### Accessibility and host integrity

**Recommended assumption:** Use one dynamically injected Shadow DOM shell and one lifecycle owner. Keep the outer overlay pointer-transparent, enable pointer input only on visible Skopeo controls, avoid focus theft in ambient/anchored states, manage and restore focus in focused/interstitial states, remove hidden primitives from the accessibility tree, respect reduced motion, and use geometry overlays instead of persistent host styling.

**Alternatives surfaced:**
- Create a separate Shadow DOM host for every primitive.
- Extend existing automation overlay singletons directly instead of keeping a distinct Skopeo lifecycle boundary.

**Decision:** Recommended assumption confirmed without correction.

## Research Routing

No Phase 52 decision required external product research before context capture. Planning still needs code-level validation of Chrome command constraints, current side-panel integration points, lifecycle messaging, accessibility test infrastructure, and zero-residue verification.

---

*Audit log only — canonical decisions are in `52-CONTEXT.md`.*
