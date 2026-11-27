# Phase 53: Drive Context Router & Semantic Anchors - Context

**Gathered:** 2026-07-15 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Attach the active Skopeo session to verified Drive/Docs meaning rather than DOM position. Phase 53 delivers a closed context-routing contract, semantic anchor descriptors, live binding/rebinding rules, and a concise fail-quiet projection for configured-corpus, vendor-folder, agreement-reading, focused-ask, uncertain, and unsupported contexts.

This phase may recognize and carry stable file, folder, document, and opaque downstream target identities, but it does not enroll a corpus, establish Drive account or permission authority, fetch agreement content, derive contract truth, render later contract intelligence, answer questions, or schedule alerts. Those capabilities begin in Phases 54-59.

</domain>

<decisions>
## Implementation Decisions

### Context routing and scope boundary
- **D-01:** Add a deterministic content-side context router with a closed result union: `recognized` with stable identity and evidence, `uncertain` with a machine-readable reason, or `unsupported` with a machine-readable reason.
- **D-02:** The router recognizes only the Phase 53 context classes: configured-corpus, vendor-folder, agreement-reading, focused-ask, uncertain, and unsupported. It returns classification data and does not render directly.
- **D-03:** Recognition may reconcile allowlisted URL/page signals with stable identities supplied by a trusted caller, but URL, folder name, visible label, list position, CSS class, or DOM shape alone cannot prove configured corpus or target identity.
- **D-04:** The router is not the corpus, access, or truth authority. Corpus enrollment, active-account partitioning, permission checks, content reads, and agreement intelligence remain behind later-phase boundaries.

### Semantic anchor identity contract
- **D-05:** Every anchor is an immutable semantic descriptor keyed by stable meaning: a Drive file/folder ID, a Docs document ID, or an opaque caller-supplied clause/citation key owned by a later evidence layer.
- **D-06:** An anchor descriptor carries candidate locators and explicit identity validators. A DOM element or Range is only a revocable live binding and never becomes the anchor's identity.
- **D-07:** Identity and geometry must both be revalidated immediately before an annotation commits. A locator match without semantic proof cannot authorize rendering.
- **D-08:** Phase 53 must not infer clause identity from text similarity or contract content. It accepts an opaque stable downstream key and proves only that the current host binding still represents that key.

### Rebinding, navigation, and stale-work authority
- **D-09:** The active Skopeo runtime generation owns the context router and anchor registry. Replacement rendering is authorized only when `{session generation, context epoch, semantic identity}` still matches at commit time.
- **D-10:** Use dedicated, viewport-bounded, batched observation for relevant DOM mutations plus scroll, resize, zoom/geometry, and same-document navigation signals. Do not poll or continuously observe the full Drive document.
- **D-11:** On the first relevant change, validate the current binding. If proof fails, synchronously withdraw its dependent projection before any asynchronous re-resolution begins; absence is safer than a stale or guessed annotation.
- **D-12:** A successful re-resolution may bind the same semantic anchor to a new host node or range. Recycled Drive rows can never inherit the prior row's annotation merely because the DOM node was reused.
- **D-13:** Same-document Drive/Docs SPA changes re-run routing inside the explicitly invoked session. Restricted/unsafe pages, hard-document navigation, toggle-off, and kill retain Phase 52's abort-first terminal teardown behavior.

### Fail-quiet projection
- **D-14:** `uncertain` and `unsupported` results immediately remove all anchor-dependent marks, chips, halos, ghost layers, focused surfaces, and gates.
- **D-15:** While the explicitly invoked session remains valid, the shared shell may retain only a concise, non-focus-stealing ambient explanation with a machine-readable reason and no guessed entity/page label.
- **D-16:** Ordinary recognition or anchor uncertainty never escalates into an interstitial gate. The user can retry through a later validated route change or explicit reinvocation; the UI must not imply that uncertain identity is verified.

### The agent's Discretion
- Exact closed reason-code names, evidence threshold representation, and internal module/file boundaries, provided the recognized/uncertain/unsupported contract remains exhaustive and fail-closed.
- Exact Drive/Docs signal adapters and locator candidates, provided every accepted signal is origin-pinned, fixture-backed, validated against live Chrome, and never relies on private class names or position alone.
- Exact observer batching, scheduling, and viewport-margin values, provided withdrawal is immediate, re-resolution is bounded, and Phase 52 resource-ledger/teardown guarantees remain intact.
- Exact test-fixture construction for virtualized row reuse, SPA navigation, document targets, and opaque clause/citation bindings.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and locked predecessor behavior
- `.planning/milestones/v1.2.0-SKOPEO-ROADMAP.md` — Phase 53 goal, dependency, success criteria, and boundary from later corpus/truth/view phases.
- `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md` — Normative HUD-06 fail-quiet and HUD-09 semantic-anchor requirements.
- `.planning/milestones/v1.2.0-SKOPEO-PROJECT-SNAPSHOT.md` — v1.2.0 product framing, host-integrity constraints, Drive/Docs interaction boundary, and approved Chrome-local architecture.
- `.planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-CONTEXT.md` — Locked invocation, attention, one-shell, focus, stale-work, and teardown decisions that Phase 53 must preserve.

### Architecture, product behavior, and risk
- `.planning/research/ARCHITECTURE-v1.2.0-SKOPEO.md` — Context-router/anchor-registry separation, semantic anchor descriptor contract, trust boundaries, and dependency-respecting build order.
- `.planning/research/FEATURES-v1.2.0-SKOPEO.md` — Meaning-attached-to-content product behavior, three Drive/Docs contexts, failure states, and semantic-anchoring rationale.
- `.planning/research/PITFALLS-v1.2.0-SKOPEO.md` — Drive virtualization/recycled-row failure mode, fail-quiet/rebind guidance, bounded observation, and required anchor regression coverage.
- `.planning/research/SUMMARY-v1.2.0-SKOPEO.md` — Milestone architecture sequence and the context/anchoring foundation's boundary before permission and truth work.

### Supplied product evidence
- `.context/hud-design-reference/export/canvas-4/Canvas-4.dc.html` — Primary overlay/router, Drive folder, reading, focused-ask, primitive, and attention-state design evidence; grammar evidence rather than production code.
- `.context/attachments/PPgV1d/AI-Driven Vendor Contract Lifecycle and Compliance Management System_summary.txt` — Source workflow defining the designated Drive hierarchy and the business contexts later phases project through these anchors.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/content/skopeo-runtime.js` — Current per-invocation generation, abort, activate/terminate, and stale-work authority that should own context and anchor epochs.
- `extension/content/skopeo-shell.js` — One Shadow shell, attention-state rendering, commit-time geometry validation, scoped disposal, ambient live-region copy, and exact resource-ledger teardown.
- `extension/utils/skopeo-session-state.js` — Per-tab generation and controller/request authority patterns for rejecting obsolete work.
- `extension/catalog/handlers/gdrive.js` — Existing Drive handler precedent for normalizing stable file/folder identifiers without treating DOM position as identity.
- `extension/catalog/handlers/gdocs.js` — Existing allowlisted Docs URL/document-ID normalization precedent.
- `extension/content/lifecycle.js` — Existing Google SPA/navigation observation and cleanup patterns that can inform a narrower Skopeo context handoff.
- `tests/skopeo-browser-contract.test.js` and existing `tests/skopeo-*.test.js` — Real-Chrome geometry rollback, lifecycle, stale-work, shell, accessibility, and resource contract harnesses to extend for Phase 53.

### Established Patterns
- Skopeo is dynamically injected on explicit request and has one lifecycle owner; Phase 53 cannot become an always-loaded Drive observer.
- The shell treats geometry as a revocable commit-time certificate and removes richer surfaces when layout safety is lost.
- Session/controller generations are monotonic authorities; late async work must prove current authority at its final side effect.
- Cross-context operations return structured success/error data and fail closed rather than throwing page-derived state into rendering.
- Production code is direct ES2021+ JavaScript using existing namespace/conditional-export conventions and explicit injection order.

### Integration Points
- `extension/content/skopeo-runtime.js`: own route/context epochs, start and stop the router/registry, and serialize fail-quiet versus recognized projections into the shell.
- `extension/content/skopeo-shell.js`: expose the minimal ambient fail-quiet projection and anchor-dependent surface withdrawal without weakening exact teardown.
- `extension/background.js`: distinguish safe same-document context handoff from hard navigation/unsafe-page terminal teardown while retaining per-tab authority.
- Existing Drive/Docs handlers: provide stable-identity normalization precedents only; Phase 53 should not absorb their later permission/content responsibilities.
- Test suite: add deterministic fixtures for wrong-row prevention, row recycling, reorder, detach/rebind, navigation epochs, scroll/resize/zoom, stale async resolution, unsupported/uncertain copy, and zero residue.

</code_context>

<specifics>
## Specific Ideas

- Treat a live DOM binding as a short-lived lease or certificate over a semantic identity, not as the identity itself.
- Withdraw first and rebind second: a brief absence is acceptable; even one frame of a badge on the wrong Drive row is not.
- Fail quiet means explaining that Skopeo could not verify the current context without guessing what the page, folder, file, or clause is.
- Live Drive/Docs reconnaissance must capture which current host signals reliably expose file/folder/document targets across list/grid density, reorder, recycled rows, SPA routes, and document views. Those signals become committed fixtures and negative controls; undocumented class names do not become contracts.

</specifics>

<deferred>
## Deferred Ideas

- Drive account identity, corpus enrollment, permission/access authority, source readability, revocation, and account switching — Phase 54.
- Chrome-local graph records, source ownership, atomic replacement, and untrusted-data extraction boundaries — Phase 55.
- Governing lineage, exact facts, citations, evidence confidence, and deadline derivation — Phase 56.
- Contract-derived folder and reading projections — Phase 57.
- Cited answers, Document 10, and complex-memo policy — Phase 58.
- Current-user alerts and milestone-wide live/adversarial release hardening — Phase 59.

</deferred>

---

*Phase: 53-drive-context-router-semantic-anchors*
*Context gathered: 2026-07-15*
