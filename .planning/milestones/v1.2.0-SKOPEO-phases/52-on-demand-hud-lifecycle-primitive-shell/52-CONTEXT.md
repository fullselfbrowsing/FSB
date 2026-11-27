# Phase 52: On-Demand HUD Lifecycle & Primitive Shell - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the safe, accessible Skopeo shell: explicit current-tab invocation, reversible attention-state transitions, the shared six-primitive contract, and a teardown path that leaves the host page exactly as Skopeo found it. This phase proves lifecycle, host integrity, and interaction grammar only.

Drive/Docs genre detection and semantic target anchoring begin in Phase 53. Corpus enrollment, the Chrome-local Graphify-style truth layer, contract extraction, governing-lineage analysis, cited answers, alerts, and other vendor-contract capability behavior remain in later phases.

</domain>

<decisions>
## Implementation Decisions

### Invocation surface
- **D-01:** Skopeo starts off. Arbitrary pages do not activate it automatically, and no dormant in-page launcher, rail, mark, or other Skopeo residue remains while it is off.
- **D-02:** Put a dedicated Skopeo toggle inside the existing FSB side panel and expose a configurable Chrome command for direct invocation. The existing extension-toolbar click continues to open FSB's side panel; Phase 52 must not repurpose it.
- **D-03:** Invocation and active state are scoped to the current tab. The design reference's `Option+Space` gesture is the preferred shortcut where Chrome's command constraints permit it; planning may select and document a valid fallback while preserving configurability.

### Primitive shell and visual priority
- **D-04:** Implement one shared contract for all six primitives: anchor mark, entity chip, halo, rail, ghost layer, and gate. Capability packs compose these primitives rather than introducing pack-specific chrome.
- **D-05:** Normal invocation initially renders only a compact ambient lens/edge-rail surface. The shell must not display all six primitives at once merely to demonstrate availability.
- **D-06:** Apply four attention levels: ambient, anchored, focused, and interstitial. Anchor marks and entity chips belong to anchored context; ghosting is temporary and focused; halos are scarce anomaly signals; gates are reserved for explicitly consequential moments.

### Dismissal and universal kill
- **D-07:** A visible close control or a single `Escape` dismisses the topmost Skopeo surface and returns to the prior active attention level. Dismissing the ambient root returns the tab to off.
- **D-08:** Toggling Skopeo off or pressing `Escape` twice is the universal kill action for the current tab. It aborts in-flight Skopeo work, tears down the complete Skopeo session, and does not affect Skopeo sessions in other tabs or unrelated FSB automation.
- **D-09:** Kill establishes a monotonic terminal boundary for the ended session. Late async results, queued messages, timers, or observers from that session cannot recreate the HUD; a later explicit invocation starts a new session generation.

### Accessibility and host integrity
- **D-10:** Use one dynamically injected Skopeo Shadow DOM shell with one lifecycle owner. Do not create a persistent host per primitive or extend an always-loaded page layer.
- **D-11:** The shell's outer geometry layer is viewport-fixed/top-layer-capable and pointer-transparent; only visible Skopeo controls accept pointer input. Render geometry overlays instead of applying persistent inline styles or layout mutations to host elements.
- **D-12:** Ambient and anchored states do not steal focus. Focused and interstitial surfaces manage focus deliberately, provide visible focus, and restore focus to the originating control or host target when closed.
- **D-13:** Hidden primitives leave both the rendered page and accessibility tree. Every supported state must expose usable names/roles, keyboard operation, screen-reader behavior, sufficient contrast, supported zoom behavior, and a reduced-motion treatment that removes nonessential effects.
- **D-14:** Teardown is idempotent and removes every Skopeo root, listener, observer, timer, animation, focus hook, pointer interceptor, temporary style, and pending render path without disturbing supported Drive/Docs controls or unrelated FSB state.

### The agent's Discretion
- Exact valid Chrome shortcut fallback and command naming when the preferred `Option+Space` chord cannot be declared by Manifest V3.
- Exact FSB-token-derived spacing, type scale, focus-ring geometry, motion timing, and reduced-motion substitutions, provided the supplied HUD reference and scarcity rules remain intact.
- Internal file/module boundaries, lifecycle state representation, and session-generation mechanism.
- The minimal demonstration fixtures used to prove each primitive and attention transition before semantic anchors arrive in Phase 53.

</decisions>

<specifics>
## Specific Ideas

- Skopeo is a "heads-up display" in the sense that assistance appears over the work it concerns; Iron Man is only a conceptual reference, not the visual style.
- Styling remains native to FSB: dark instrument surfaces, restrained orange attention, Space Mono-style micro-labels, thin bordered rails, and sparse glow.
- The supplied board establishes the overlay-not-app framing, the six primitives, four-level attention ladder, on-demand invocation, and `Escape Escape` kill gesture. Illustrative contract actions in the board are not automatically Phase 52 scope.
- The invoked shell should feel quiet and ready, not like a movie HUD or generic chatbot sidebar.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/milestones/v1.2.0-SKOPEO-ROADMAP.md` — Phase 52 goal, dependencies, requirements, and success criteria.
- `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md` — Normative definitions for HUD-01 through HUD-05, HUD-07, and HUD-08.
- `.planning/milestones/v1.2.0-SKOPEO-PROJECT-SNAPSHOT.md` — v1.2.0 milestone framing, platform constraints, and approved Skopeo decisions.

### Product and risk research
- `.planning/research/FEATURES-v1.2.0-SKOPEO.md` — On-demand behavior, shared primitive grammar, attention-budget matrix, host-integrity expectations, and explicit anti-features.
- `.planning/research/PITFALLS-v1.2.0-SKOPEO.md` — Teardown, host-page integrity, accessibility, stale-render, and overlay-resilience risks and release checks.
- `.planning/research/SUMMARY-v1.2.0-SKOPEO.md` — Milestone architecture sequence and lifecycle-first recommendation.

### Design evidence
- `.context/hud-design-reference/export/canvas-4/Canvas-4.dc.html` — Primary interaction and visual reference for overlay states, primitives, attention levels, invocation, and kill behavior. Treat it as grammar evidence, not production code or blanket approval of every pictured action.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/content/visual-feedback.js`: Existing Shadow DOM overlay classes, top-layer promotion, pointer-isolation techniques, reduced-motion CSS, and synchronous `destroy()` patterns provide implementation precedent. Reuse patterns deliberately; do not couple Skopeo's lifecycle to unrelated automation overlays.
- `extension/utils/overlay-state.js`: Existing normalization and version-ordering helpers demonstrate stale-update suppression for visual state.
- `extension/utils/mcp-visual-session-lifecycle.js`: Existing per-tab lifecycle cleanup, storage, alarm, and idempotent clear patterns are useful references for session-generation and late-result rejection.
- `extension/content/accessibility.js`: Existing accessibility helpers and host-page semantics should inform keyboard and screen-reader integration.
- `extension/content/badge-combine.js`: Existing badge collision/combination behavior may inform sparse overlay coexistence.

### Established Patterns
- `extension/background.js` injects the current content runtime in dependency order, including `content/init.js`, `content/visual-feedback.js`, and `content/lifecycle.js`. Skopeo must remain dynamically request-loaded rather than joining an always-on content-script surface.
- `extension/content/lifecycle.js` already handles SPA navigation and observer cleanup for the automation runtime. Skopeo needs its own single owner and idempotent teardown while coexisting with those established hooks.
- Existing overlays attach styles inside Shadow DOM and explicitly destroy roots on lifecycle exit. Phase 52 should preserve that isolation while adding stronger session cancellation and zero-residue verification.

### Integration Points
- `extension/manifest.json`: Add a configurable Chrome command without changing the existing toolbar action contract.
- `extension/background.js`: Route side-panel/command invocation to the active tab, inject the small Skopeo runtime on demand, and own per-tab session/cancellation messages.
- `extension/ui/sidepanel.html` and its existing controller/style modules: Add the dedicated Skopeo toggle using current FSB side-panel conventions.
- New Skopeo content modules: Own the shell, primitive renderer, attention state machine, focus behavior, and teardown behind a single namespace/lifecycle boundary.
- Tests around manifest, background messaging, content lifecycle, and visual feedback: Extend established test patterns with zero-residue, stale-result, host-interaction, keyboard, and accessibility assertions.

</code_context>

<deferred>
## Deferred Ideas

- Drive/Docs genre routing, semantic identity, and resilient content anchoring — Phase 53.
- Permission-scoped corpus enrollment and Drive source access — Phase 54.
- The bundled Chrome-local Graphify-style knowledge layer and all contract-specific intelligence — Phases 55-59.
- Cross-person notification delivery and additional webpage capability packs — future milestone scope.

</deferred>

---

*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Context gathered: 2026-07-14*
