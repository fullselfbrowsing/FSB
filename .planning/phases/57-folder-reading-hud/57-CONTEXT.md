# Phase 57: Folder & Reading HUD - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 57 projects the current permission-scoped corpus, graph, and governing-truth state into sparse overlays on the supported Drive folder and Drive/Docs reading surfaces. It delivers a bounded vendor overview, explicitly typed dates and gaps, an unmistakable governing-versus-historical reading state, exact cited facts, and a freshly authorized route to the governing source or clause. It does not create a detached contract application, re-adjudicate governing truth in content code, answer free-form questions, enforce Document 10 or complex-memo decision policy, or schedule and deliver notifications; those later responsibilities remain in Phases 58 and 59.

</domain>

<decisions>
## Implementation Decisions

### Trusted view projection
- **D-01:** Add one background-only Phase 57 projection boundary that joins the exact current corpus manifest, relevant graph records, and Phase 56 truth snapshots into a bounded, recursively frozen folder or reading model.
- **D-02:** Every projection runs through the existing corpus operation authority under the exact current account, root, origin, generation, profile, context epoch, semantic entity, and source certificate. Folder and reading views use a `display` operation; source navigation uses `citation-open`.
- **D-03:** Content scripts receive only minimized display fields and opaque action identifiers. They may not read corpus, graph, or truth storage directly, reconstruct cross-record joins, inspect raw records, or receive the private graph/truth facade.
- **D-04:** Extend the trusted closure with the smallest bounded truth-family overview needed for folder projection. Do not turn the private per-family truth API into a generic content-accessible listing or storage bridge.
- **D-05:** Stale, withdrawn, inaccessible, incomplete, or tuple-mismatched inputs fail closed and withdraw their rendered state before any replacement is shown.

### Folder HUD composition
- **D-06:** After explicit Skopeo invocation on an enrolled and verified Drive root/folder, render one composite right-side HUD anchored to that semantic context. Do not place badges on every visible Drive row in this phase.
- **D-07:** The bounded folder HUD contains vendor rows plus dedicated next-deadline and urgent-gap summaries. Each vendor row has slots for owner, document/index state, governing status, next material date, relevant memo status, and urgent gaps; overflow is explicit rather than silently omitted.
- **D-08:** Reuse the one Skopeo shell, lifecycle, attention grammar, and closed renderer atoms. The HUD remains an overlay on Drive, leaves host layout and DOM ownership intact, and tears down with zero residue.
- **D-09:** Multi-row Drive decoration is out of scope because the current runtime owns one active anchor and Drive recycles row DOM. It may be reconsidered only with independently verified row identity and a lifecycle-safe multi-anchor compositor.

### Reading state and governing-source route
- **D-10:** On an exact Drive file or Docs document, show a definitive `governing`, `historical`, or `superseded` state only when the accepted Phase 56 lineage projection proves that conclusion. Ambiguous, conflicting, inaccessible, or review-required truth receives an equally prominent non-definitive state and never a false governing label.
- **D-11:** The reading HUD shows exact truth-backed facts and citations while preserving the distinction between governing evidence and relevant history. It does not summarize uncited page text or infer status from filename, recency, folder order, or host-page labels.
- **D-12:** “Open governing source/clause” is the only new contract action in Phase 57. Background authority resolves the current source and locator from the opaque citation/action identity under a fresh certificate; stored URLs, filenames, and content-side navigation authority are prohibited.
- **D-13:** Ask, draft, send, approval, Document 10, and policy-decision controls do not appear in the Phase 57 HUD.

### Dates, gaps, and downstream-owned statuses
- **D-14:** A notice deadline, renewal, termination, and expiration remain separate typed values everywhere. The UI names the date type explicitly and presents the evidence-backed consequence of inaction separately; it never substitutes renewal or expiration for a notice deadline.
- **D-15:** Gaps use a closed, evidence-backed status and reason-code vocabulary. Absence is not proof unless the authoritative upstream projection certifies a complete relevant set; unknown, inaccessible, unreadable, pending, ambiguous, conflicting, and missing remain distinct.
- **D-16:** Phase 57 can render current authoritative states for missing finals, unreadable scans, incomplete indexing, owner gaps, and version conflicts. A policy document or memo may be shown as present when current evidence proves it, but `required` or `missing required` is not asserted until Phase 58 policy authority establishes the obligation.
- **D-17:** The folder model and renderer reserve first-class typed slots for policy-document, required-memo, and notification-delivery results. Until their owning Phase 58 or Phase 59 authority supplies evidence, those slots show a neutral `not evaluated`/`not available` state rather than claiming a missing obligation or failed notification.

### the agent's Discretion
- Exact module split, schema/version names, finite caps, opaque action-ID encoding, and closed reason-code vocabulary within the authority and scope boundaries above.
- Exact vendor ordering, grouping, pagination/overflow treatment, and empty/loading/error copy, provided no vendor or urgent result disappears silently.
- Exact arrangement, typography, spacing, and atom selection within the established shell and Drive/Docs deep-pack UI contract.
- Exact test-file organization and fixture decomposition, provided folder, reading, stale-withdrawal, permission-negative, ambiguity, and fresh citation-navigation contracts receive deterministic coverage.

</decisions>

<specifics>
## Specific Ideas

- Use the supplied canvas reference for its right-side vendor overview, “Next deadlines,” “Gaps,” unmistakable superseded banner, exact-fact rail, and direct governing-document route—not for its per-row Drive badges, ask bar, draft notice, or later-phase decision controls.
- Treat the HUD as a view of existing proof objects: display labels, conclusions, dates, consequences, gaps, and citations arrive from trusted projections rather than being recomputed from presentation strings.
- Prefer explicit state language such as “Notice deadline,” “Renewal,” “Review required,” and “Not evaluated” over color-only or compressed status shorthand.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/ROADMAP.md` § Phase 57: Folder & Reading HUD — fixed phase goal, dependency, success criteria, and Phase 58–59 boundaries.
- `.planning/REQUIREMENTS.md` § Folder, Reading, and Cited Ask Experience — authoritative VIEW-01 through VIEW-05 requirements and adjacent later-phase requirements.
- `.planning/PROJECT.md` — v1.2 Skopeo product boundary, Chrome-local architecture, permission/provenance invariants, and explicit non-goals.

### Upstream implementation contracts
- `.planning/phases/52-on-demand-hud-lifecycle-primitive-shell/52-CONTEXT.md` — explicit invocation, one-shell lifecycle, attention states, host safety, accessibility, and zero-residue teardown.
- `.planning/phases/53-drive-context-router-semantic-anchors/53-CONTEXT.md` — closed Drive/Docs context routing, stable semantic identities, revocable anchors, and stale-generation behavior.
- `.planning/phases/53.1-generalize-skopeo-adaptive-huds-across-the-capability-catalo/53.1-CONTEXT.md` — one data-only profile platform, one composer/shell, closed atoms, and background-owned authority.
- `.planning/phases/53.1-generalize-skopeo-adaptive-huds-across-the-capability-catalo/53.1-UI-SPEC.md` — shared shell geometry, Drive/Docs deep-pack atoms, attention grammar, typography, density, and interaction constraints.
- `.planning/phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md` — exact current corpus partition, source-state vocabulary, current-access certification, and withdrawal rules.
- `.planning/phases/55-chrome-local-graph-incremental-truth-foundation/55-CONTEXT.md` — immutable graph records, owner/policy/memo relations, provenance, and background-only graph facade.
- `.planning/phases/56-governing-lineage-evidence-deadline-engine/56-CONTEXT.md` — governing lineage, exact facts, conflict/abstention semantics, citations, typed deadlines, and private truth facade.

### Visual direction
- `.context/hud-design-reference/export/canvas-4/Canvas-4.dc.html` — folder and reading HUD composition reference; Phase 57 adopts the approved subset described above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/background.js`: `runSkopeoCorpusOperation` already recognizes `display` and `citation-open`, binds exact controller/corpus tuples, and keeps corpus, graph, and truth dependencies inside the trusted background boundary.
- `extension/utils/skopeo-corpus-schema.js` and `extension/utils/skopeo-corpus-store.js`: current source records, source states, vendor-scope file IDs, complete active manifests, and purge/currentness machinery provide the folder projection base.
- `extension/utils/skopeo-graph-schema.js`: closed `owner`, `policy-document`, and `memo` record kinds plus `assigned-owner`, `references-policy`, and `references-memo` relations provide evidence-backed display inputs without establishing policy obligations by themselves.
- `extension/utils/skopeo-truth-engine.js` and `extension/utils/skopeo-truth-schema.js`: immutable lineage, fact, conflict, citation, deadline, and status projections provide the only authority for reading-state conclusions and material dates.
- `extension/content/skopeo-adaptive-composer.js`, `extension/content/skopeo-renderer-registry.js`, and `extension/content/skopeo-shell.js`: the bounded model/composer, closed text-only atom registry, and existing auxiliary corpus region can be extended into the composite Phase 57 HUD.

### Established Patterns
- Background services own storage, transport, cross-record joins, currentness checks, and effects; content owns semantic binding, composition, rendering, focus, and teardown only.
- Display models are exact-key validated, finite, recursively frozen, and generation-bound. Revocation or context drift withdraws first and stale asynchronous completion cannot repaint.
- One shared Skopeo shell and the Drive/Docs deep-pack renderer must be extended rather than introducing a second visual system or detached contract surface.
- Host content is untrusted text. Rendering uses closed atoms and text content only; filenames, contract text, comments, and page labels never become instructions, HTML, or authority.

### Integration Points
- Add bounded Phase 57 folder/reading projection and citation-open controller actions inside the corpus boundary in `extension/background.js`.
- Add the smallest private truth-family overview/query seam required by the folder projector in `extension/utils/skopeo-truth-engine.js`, preserving the existing private facade and exact tuple checks.
- Extend `extension/content/skopeo-runtime.js` to request, currentness-check, and withdraw Phase 57 models for verified folder/document contexts.
- Extend `extension/content/skopeo-adaptive-composer.js` and `extension/content/skopeo-shell.js` to compose and render the composite folder and reading HUD through the current closed atoms and lifecycle.
- Expand deterministic content/background/unit/browser contracts without weakening existing static gates against direct content storage/Drive access or global truth-facade exposure.

</code_context>

<deferred>
## Deferred Ideas

- Per-row Drive vendor badges and general multi-anchor composition are deferred until each recycled row can be independently bound and revoked without wrong-target residue.
- Permission-scoped free-form ask, answer citations, Document 10 enforcement, and complex-agreement memo obligation policy remain Phase 58.
- Notification scheduling, current-user recipient rules, delivery attempts, persistent delivery ledger, failure classification, and reconciliation remain Phase 59.
- A detached contract dashboard or replacement application remains outside the Skopeo product boundary.

</deferred>

---

*Phase: 57-folder-reading-hud*
*Context gathered: 2026-08-06*
