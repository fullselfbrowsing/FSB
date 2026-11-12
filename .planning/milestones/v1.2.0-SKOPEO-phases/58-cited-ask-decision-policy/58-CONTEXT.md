# Phase 58: Cited Ask & Decision Policy - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a permission-scoped cited-ask experience for the current vendor/agreement or explicitly selected enrolled corpus, plus deterministic Document 10 and complex-agreement memo policy gates. Answers may expose only current accessible evidence, must distinguish governing evidence from relevant history, and must visibly abstain or block clearance when required policy evidence is missing, inaccessible, conflicting, or stale. This phase does not add alerts, team delivery, autonomous contract action, source mutation, or AI-authored memos.

</domain>

<decisions>
## Implementation Decisions

### Ask Scope and Interaction
- **D-01:** Ask appears as a focused state inside the existing Drive/Docs Skopeo HUD, never as a detached chatbot or persistent sidebar.
- **D-02:** The user explicitly selects either the current vendor/agreement or the enrolled accessible corpus; Skopeo never infers cross-vendor scope.
- **D-03:** Every ask is independently authorized against fresh account, corpus, source, and revision state; prior answers confer no authority on a follow-up.
- **D-04:** When relevant evidence is incomplete, the response may show verified facts and gaps but must abstain from a material conclusion until the relevant evidence set is complete and current.

### Answer Evidence and Presentation
- **D-05:** Every answer leads with one closed outcome: `answered`, `review-required`, or `abstained`, followed by the conclusion, evidence, conflicts/gaps, and available actions.
- **D-06:** Governing evidence and relevant history appear in separate, explicitly labelled sections; historical evidence never silently supports the governing conclusion.
- **D-07:** Every material conclusion and exact fact has a validated citation bound to its currently accessible source revision and locator.
- **D-08:** Confidence uses explained categorical trust states. A model score is never clearance authority.

### Document 10 Policy Gate
- **D-09:** Document 10 is configured by stable Drive file identity inside the current account/corpus partition; filenames, labels, list order, and folder position never establish its identity.
- **D-10:** A closed deterministic policy rule derives whether Document 10 applies to a decision kind from verified inputs; the model cannot declare applicability.
- **D-11:** Review requires opening the current accessible revision and explicitly acknowledging it for the current decision. Revision, account, corpus, access, or decision-authority drift invalidates the acknowledgement.
- **D-12:** Missing or inaccessible Document 10 does not hide otherwise accessible informational evidence, but it creates an explicit blocking gap and the applicable decision can never appear cleared.

### Complex-Agreement Memo Safeguard
- **D-13:** Only an explicit trusted human/configuration action bound to the stable agreement identity may classify an agreement as complex; model inference and document wording alone cannot.
- **D-14:** Routine agreements omit memo-requirement status entirely and acquire no implied memo obligation.
- **D-15:** Skopeo reports a memo missing only when the complex flag is current and the complete accessible evidence set proves that no qualifying human-authored memo is on file.
- **D-16:** For a flagged complex agreement, a missing or inaccessible required memo blocks `cleared` status without hiding otherwise accessible cited information.
- **D-17:** Skopeo may navigate to or report a human-authored memo, but it never drafts, synthesizes, or claims authorship of one.

### the agent's Discretion
- Exact closed schema field names, enum spellings, finite caps, reason codes, durable key prefixes, and module boundaries within the accepted authority model.
- Exact arrangement and copy inside the established Skopeo focused rail, provided the fixed outcome, evidence separation, policy gaps, citations, and accessibility requirements remain explicit.
- Exact deterministic policy-rule representation and review-acknowledgement lifetime, provided policy applicability is model-independent and every authority or revision change invalidates clearance.
- Exact fixture organization and evaluation cases, provided permission-negative, stale-authority, fake-citation, hostile-source, policy, memo, and abstention behavior receive deterministic coverage.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/utils/skopeo-hud-schema.js` and `extension/utils/skopeo-hud-projector.js` already provide closed folder/reading models, categorical trust states, typed gaps, citation tokens, and reserved policy/memo slots.
- `extension/background.js` already owns exact-set truth projection, opaque citation bindings, fresh `citation-open` revalidation, corpus-operation authority, and one-shot HUD actions.
- `extension/content/skopeo-adaptive-composer.js`, `extension/content/skopeo-runtime.js`, and `extension/content/skopeo-shell.js` already provide the focused-ask context, closed renderer atoms, one lifecycle-owned Shadow rail, synchronous stale withdrawal, and accessible citation controls.
- The Phase 54-57 corpus, graph, truth, deadline, and HUD modules already separate current authority, governing evidence, relevant history, conflicts, gaps, and source navigation.

### Established Patterns
- Background-only trusted facades expose minimized recursively frozen projections; content scripts never receive raw corpus, graph, truth, provider, or storage authority.
- Every consequential effect is exact-key, generation-owned, abortable, one-shot, revalidated immediately before use, and withdrawn before replacement.
- Model output is inert candidate data parsed through closed schemas; deterministic local code owns identity, applicability, clearance, citations, and publication.
- Classic scripts use dependency-first load order, conditional CommonJS/browser exports, two-space indentation, single quotes, semicolons, null-prototype cloning, exact-key parsers, finite caps, and network-free Node tests plus real-Chrome contract coverage.

### Integration Points
- Extend the private background truth/corpus closure with the smallest exact-set query and policy projection needed for Phase 58; do not introduce content-readable stores or a new MCP surface.
- Replace the Phase 57 `memoRequirement: not-evaluated` reservation and policy display seams only when Phase 58 authority supplies a current decision-policy result.
- Route cited-ask results through the existing content projection/runtime/composer/shell lifecycle and route source actions through the current opaque citation-open boundary.
- Preserve the current provider path and bounded-excerpt extraction boundary for synthesis, with fresh authority before and after every provider call.

</code_context>

<specifics>
## Specific Ideas

- The experience should feel like asking the proof objects already visible in the Drive/Docs HUD, not opening a general chatbot.
- Lead with a clear answer state, then keep governing evidence, relevant history, conflicts, gaps, and citations structurally distinct.
- Informational evidence remains useful when a policy safeguard blocks clearance; the blocked state must be unmistakable without suppressing accessible facts.
- Document 10 and memo safeguards are policy authority, not retrieval heuristics or model judgments.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within the Phase 58 boundary.

</deferred>
