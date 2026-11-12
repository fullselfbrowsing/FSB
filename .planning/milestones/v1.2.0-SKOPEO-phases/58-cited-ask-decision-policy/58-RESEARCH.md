# Phase 58: Cited Ask & Decision Policy - Research

**Researched:** 2026-08-27
**Domain:** Permission-scoped contract question answering and deterministic local decision safeguards in a Manifest V3 Chrome extension
**Confidence:** High for repository integration, authority boundaries, policy mechanics, and automated validation; medium for legal-domain applicability and representative live Drive/Docs behavior pending human review

## User Constraints (verbatim from CONTEXT.md)

### Phase Boundary

Deliver a permission-scoped cited-ask experience for the current vendor/agreement or explicitly selected enrolled corpus, plus deterministic Document 10 and complex-agreement memo policy gates. Answers may expose only current accessible evidence, must distinguish governing evidence from relevant history, and must visibly abstain or block clearance when required policy evidence is missing, inaccessible, conflicting, or stale. This phase does not add alerts, team delivery, autonomous contract action, source mutation, or AI-authored memos.

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

### Deferred Ideas

None — discussion stayed within the Phase 58 boundary.

## Phase Requirements

<phase_requirements>

| Requirement | Required observable result | Research implication |
|---|---|---|
| VIEW-06 | A user explicitly asks the current vendor/agreement or enrolled accessible corpus and receives an answer based only on currently accessible evidence. | Add a background-only, abortable ask engine over a freshly certified exact source set; content supplies only bounded question text and an opaque scope token. |
| VIEW-07 | Material conclusions separate governing evidence from history and expose current citations, categorical trust, conflicts, gaps, abstention, and source navigation. | Treat model output as candidate claims; deterministically bind every published claim to an admitted evidence handle and current Phase 56 lineage/citation proof before projection. |
| POLICY-01 | Document 10 has a stable configured identity and current review is visibly required for applicable decisions. | Persist stable file identity only inside an account/corpus partition; derive applicability from a local closed rule and require a fresh one-shot open plus current-decision acknowledgement. |
| POLICY-02 | Missing or inaccessible Document 10 blocks applicable clearance and appears as an explicit gap. | Compute clearance locally after access/revision revalidation; never let answer state or model output imply clearance, and never suppress accessible informational evidence. |
| POLICY-03 | Memo status appears only for explicitly complex agreements; routine agreements have no implied or AI-authored memo. | Persist an explicit stable-agreement complex flag, prove memo absence only from a complete accessible set, and provide no authoring path or provider prompt for a memo. |

</phase_requirements>

## Executive Summary

Phase 58 should be built as one narrow extension of the Phase 57 HUD pipeline, not as a general chatbot and not as a content-side policy system.

The repository already provides the decisive primitives: a current account/corpus/source authority boundary, fresh `query` and `citation-open` operations, a background-only exact graph and truth closure, provider binding/revalidation, an exact-key HUD controller with revocable actions, a closed content composer, and one lifecycle-owned Shadow DOM rail. The new implementation needs to add four trusted capabilities:

1. a closed ask schema that admits bounded question text, provider candidate output, cited answer projections, and typed failures;
2. a deterministic local policy store/engine for Document 10 identity, stable complex-agreement classification, current review acknowledgement, memo evidence state, and clearance;
3. a background-only ask engine that reads a freshly authorized exact source set, invokes the configured provider with inert bounded excerpts, then independently validates every candidate claim and citation;
4. controller/content/shell integration that reuses the existing projection token, action registry, focused rail, citation navigation, abort, stale withdrawal, accessibility, and teardown paths.

The most important design rule is that synthesis and authority remain different operations. The provider may propose wording and evidence handles. It cannot select scope, invent a source, assign governing status, configure policy identity, classify complexity, acknowledge review, decide applicability, or publish `cleared`. Deterministic background code owns each of those decisions.

No external package, new manifest permission, MCP surface, remote UI asset, secondary provider, persistent conversation store, source mutation, or memo-authoring path is required.

## Standard Stack

| Concern | Existing implementation to use | Phase 58 use |
|---|---|---|
| Runtime | Classic JavaScript MV3 service worker and content scripts | Add dual-export IIFE modules loaded dependency-first with `importScripts`; keep content code framework-free. |
| Provider | `UniversalProvider` through existing configured provider/model settings | Use one fresh provider binding per ask, bounded request/response sizes, abort signal, timeout, model-binding recheck, and no tools. |
| Source authority | `runSkopeoCorpusOperation`, Phase 54 certificates, Drive transport, current manifest | Authorize the exact current agreement/vendor/corpus source set before reading excerpts and again before publication. |
| Evidence authority | Phase 55 graph snapshot plus Phase 56 display truth/citation projection | Classify governing/history, conflicts, trust, source revision, and locator independent of provider text. |
| Projection | `skopeo-hud-schema.js`, `skopeo-hud-projector.js`, controller-local action registry | Add closed ask/result/policy modes and new one-shot policy actions without exposing source IDs or URLs. |
| Storage | `chrome.storage.local` behind background-only versioned stores | Persist Document 10 and complex classification by partition/stable identity; keep current-decision acknowledgement controller-local. |
| Content | Existing adaptive composer/runtime/shell | Render an explicit Focused ask/result state inside the current rail and withdraw it synchronously on drift. |
| Tests | Network-free Node `assert`/VM/fake-Chrome harnesses plus browser contract | Add focused schema/policy/engine/eval tests and extend existing HUD runtime/browser coverage. |

No package legitimacy or installation audit is needed because Phase 58 adds no dependency.

## Existing Foundation and Integration Seams

### Exact current scope

`extension/background.js` already resolves a content claim to a current controller binding containing generation, exact Drive/Docs origin, profile version, context epoch, semantic entity token, account/corpus tuple, exact source IDs, source-set digest, revision digest, and access digest. Phase 58 should derive scope from this binding:

- current agreement scope: exactly the certified current agreement/document family and its accepted governing family bindings;
- current vendor scope: exactly the certified sources whose stable `vendorScopeFileId` matches the current vendor token;
- enrolled corpus scope: exactly the complete current visible manifest, capped by the existing authority boundary.

Content must not send a file ID, folder ID, vendor label, URL, account ID, or caller-built source list. It sends an opaque scope token minted for the current Phase 57 projection. Background resolves that token to the exact current set, rejects cross-scope or cross-vendor reuse, and rechecks the binding after every await.

### Bounded source evidence for arbitrary questions

The truth display snapshot is excellent authority for accepted facts, lineage, conflicts, and citations, but it is not a complete arbitrary-question text index. A cited ask therefore needs a fresh bounded excerpt step inside `runSkopeoCorpusOperation('query', ...)`:

1. open the exact current source selection under the corpus operation signal;
2. read only certified currently accessible content through the existing transport;
3. split it into bounded inert excerpts with opaque evidence handles and exact locator/revision bindings;
4. include Phase 56 accepted fact/citation summaries and governing/history roles as separate machine-owned prompt sections;
5. fail closed on source-count, excerpt-count, byte, provider-response, or relevant-set completeness caps.

The provider receives no URL, file ID, account/corpus identity, policy configuration, action token, storage key, tool, or navigation capability. Source text is explicitly labelled as untrusted evidence and cannot alter the output contract.

If the complete relevant set cannot be certified, the engine may publish individually verified cited facts and exact gaps only under `abstained`. It may not publish a material conclusion from a prefix.

### Candidate synthesis and deterministic adjudication

The provider response should be a closed JSON candidate, parsed by a new `FsbSkopeoAskSchema`. Recommended candidate vocabulary:

- candidate outcome: `answered`, `review-required`, or `abstained`;
- zero or one bounded candidate conclusion;
- candidate claims referencing only prompt-issued opaque evidence handles;
- requested evidence role for each claim, treated as advisory;
- categorical explanation text, conflicts, and gaps from closed enums.

The local ask engine then rebuilds the publishable answer:

- resolve every handle against the current in-memory evidence registry;
- assign governing/history from current Phase 56 lineage, never from the requested role;
- derive citation ID, revision, locator, trust state, and action binding from current proof;
- drop uncited or mismatched claims;
- require every material conclusion sentence to have admitted governing support;
- force `review-required` for current governing conflicts;
- force `abstained` and omit the conclusion for incomplete, over-cap, inaccessible, fake-citation, or insufficient-support states;
- publish categorical trust only; discard numeric confidence fields as invalid shape.

The result is a minimized recursively frozen semantic projection. Raw excerpts and raw provider output are discarded on success, failure, abort, or replacement and never enter content or durable storage.

### Policy identity and persistence

Add a background-only versioned policy store using the same storage discipline as current trusted stores: exact schema, null-prototype maps, serialized setters, cloned immutable reads, malformed/version-mismatched payloads closed, and best-effort storage errors that never manufacture clearance.

Recommended durable envelope:

- partition key derived from the current account permission and corpus root;
- optional Document 10 stable Drive file identity plus the configuration revision metadata needed to detect replacement;
- per-stable-agreement classification `routine` or explicit `complex`, with only explicit current human actions allowed to write `complex`;
- no filenames, labels, folder positions, model judgments, answer text, citation URLs, raw excerpts, or review acknowledgements.

Document 10 configuration must start from the exact current Drive/Docs document, pass through the existing Interstitial consequence gate, and be re-derived in background immediately before storage. Clearing/replacing it and removing complex classification require equally explicit confirmations. These are local policy writes only; Drive content is never modified.

### Deterministic applicability, acknowledgement, and clearance

Use a small closed local policy table. The table consumes a trusted background decision kind and verified inputs; the provider cannot provide or change either. Phase 58's cited-answer decision projection uses one explicit local kind, `cited-contract-decision`, while purely informational evidence remains separately publishable. The engine may expand the closed catalog later only through reviewed code.

For an applicable current decision, compute a decision-authority digest over the partition, agreement/scope identity, question digest, source-set digest, revision digest, access digest, truth generation/evaluation-context digest, policy-rule version, and current policy inputs. The acknowledgement is controller-local and keyed by this digest plus the current Document 10 revision.

The acknowledgement sequence is intentionally strict:

1. mint a current one-shot `policy-review-open` action only for the configured accessible Document 10 revision;
2. open it through the existing fresh `citation-open` authorization sandwich;
3. mark only that controller/decision digest as eligible to acknowledge;
4. accept `policy-review-acknowledge` only with exact current authority after the open succeeded;
5. revoke the acknowledgement and all derived clearance on any generation, account, corpus, scope, question, source set, access, revision, truth, rule, policy, or controller change.

`answered` is not `cleared`. Clearance is a separate closed policy value. It is `cleared` only when all applicable local safeguards are current. Missing, inaccessible, stale, unreviewed Document 10; governing conflict; or a required memo gap always yields `blocked`. Informational cited evidence remains present in the answer projection.

### Complex agreement and memo proof

Only a current explicit `Classify as complex` action bound to a stable current agreement identity may create the complex flag. Neither question wording, document language, filename, graph record label, nor provider output may set it.

For routine agreements, omit memo-requirement state entirely. Do not display `not required`, `not evaluated`, a neutral placeholder, or existing memo evidence in the Phase 58 policy section.

For a current complex agreement:

- `on-file` requires a current accessible graph memo record/relation with evidence bound to the complete exact set and a qualifying human-authored provenance category;
- `missing` requires a complete current accessible source/graph set and proof that no qualifying memo exists;
- `inaccessible` is allowed only for the already configured/known stable required identity when current authority can disclose that state;
- incomplete or ambiguous sets yield review-required/unknown and never `missing` or `cleared`.

There must be no prompt, action, module export, content control, or capability for drafting or synthesizing a memo. Navigation may open an existing current memo through the opaque citation boundary.

### Controller and content lifecycle

Extend the current Phase 57 HUD controller rather than create another lifecycle owner. Add exact-key messages for ask dispatch/cancel, policy configuration/review/acknowledgement, and complex classification. Each action is projection-owned, one-shot where consequential, and revoked on replacement.

The content runtime should keep one ask epoch and one abort/replacement sequence inside its existing state. Entering Focused ask, changing scope, dispatching, asking again, backing out, navigating, hiding, or killing Skopeo withdraws the prior result and action set before the next request. A provider completion after cancellation or drift has no visible or durable effect.

The composer maps closed enums to the exact UI-SPEC copy. The shell renders with native fieldset/radio/textarea/button semantics and `textContent` only. The result reuses the current evidence rows, typed gaps, citation buttons, live region, geometry certificate, focus boundary, and zero-residue teardown.

## Recommended Module Boundaries

| File | Responsibility | Explicit non-responsibility |
|---|---|---|
| `extension/utils/skopeo-ask-schema.js` | Exact-key parsers, caps, candidate schema, published ask/policy projection schema, deep-freeze | Provider calls, storage, UI copy, clearance |
| `extension/utils/skopeo-decision-policy-store.js` | Versioned background-only stable Document 10 and complex-agreement configuration | Applicability, memo inference, acknowledgement, content access |
| `extension/utils/skopeo-decision-policy.js` | Pure closed applicability/memo/acknowledgement/clearance evaluation and reason codes | Model synthesis, Drive writes, durable acknowledgement |
| `extension/utils/skopeo-ask-engine.js` | Bounded excerpt registry, provider request, candidate parse, deterministic citation/evidence adjudication, abort/discard | UI rendering, policy identity writes, source navigation effect |
| `extension/utils/skopeo-hud-schema.js` | Admit the minimized Phase 58 result envelope and action vocabulary | Raw source/provider/policy authority |
| `extension/utils/skopeo-hud-projector.js` | Join current ask result and deterministic policy result into a closed HUD projection | Provider inference, storage writes |
| `extension/background.js` | Fresh scope resolution, corpus/provider orchestration, action registry, policy effects, import order | Exposing facades or stable identities to content |
| `extension/content/skopeo-adaptive-composer.js` | Map semantic answer/policy enums to approved local copy/models | Trust/policy decisions |
| `extension/content/skopeo-runtime.js` | Explicit ask state, exact messages, cancellation, withdraw-first currentness | Raw storage/source/provider reads |
| `extension/content/skopeo-shell.js` | Approved Focused ask/result UI, accessibility, focus, teardown | Any authority or inference |

## Architectural Responsibility Map

| Capability | Owning tier | Why |
|---|---|---|
| Question text validation | Shared closed schema, re-run in background | Content validation improves feedback, but background must enforce the trust boundary. |
| Exact scope and source selection | MV3 background/controller + corpus authority | Content cannot be trusted with source identity or disclosure scope. |
| Provider invocation and raw excerpts | MV3 background ask engine | Raw evidence and credentials must never enter page/content authority. |
| Citation, governing/history, conflict, and completeness adjudication | MV3 background ask engine + Phase 56 truth | These are authority decisions, not presentation or model decisions. |
| Document 10 / complex configuration persistence | MV3 background policy store | Stable account/corpus/agreement identities are private durable authority. |
| Applicability, memo requirement, acknowledgement, clearance | MV3 background deterministic policy engine/controller | Security-sensitive decision state must be model-independent and revalidated. |
| Source/configuration/classification effects | MV3 background one-shot action registry | Effects require fresh tab/context/source authorization and replay defense. |
| Enum-to-copy composition | Content composer | Content receives only closed minimized states and can safely map them to local copy. |
| Rendering, focus, keyboard, collision, teardown | Existing Shadow shell/runtime | This tier owns presentation but no evidence or policy authority. |
| Human legal/domain approval | Authorized counsel/legal-operations review | Synthetic fixtures cannot establish legal applicability or domain correctness. |

## Data Contracts and Key Links

1. `content ask claim` → `background current binding`: opaque scope token and exact lifecycle tuple are resolved to a fresh exact source set.
2. `corpus query` → `ask engine evidence registry`: current certificates and bounded transport excerpts become opaque in-memory handles.
3. `provider candidate` → `ask schema` → `ask adjudicator`: only exact closed candidate fields survive; evidence handles are re-bound to current truth/citation proof.
4. `ask result` + `decision policy result` → `HUD projector/schema`: answer state and clearance remain separate fields in one frozen minimized projection.
5. `HUD projection action ID` → `controller registry` → `citation-open` or local policy effect: content never supplies a URL, stable identity, revision, or policy record.
6. `composer model` → `shell`: closed local copy and native controls render in the one current Shadow rail.

Shared raw buffers must be immutable. Redaction or prompt framing creates copies; it must not mutate evidence registry records that citation validation needs later.

## Security Domain

Security enforcement is enabled by default because no project override exists. Treat ASVS Level 1 as the minimum and block High/Critical findings.

| Threat | Risk | Required mitigation and proof |
|---|---|---|
| T58-01 hostile question/source/prompt injection changes instructions or crosses scope | High | Exact bounded text, inert excerpt delimiters, no provider tools/IDs, candidate schema, cross-vendor fixtures, and local authority for every decision. |
| T58-02 incomplete or inaccessible evidence produces a plausible material conclusion | High | Complete relevant exact-set certificate, whole-result abstention, no-prefix publication, and max/max+1/access-negative tests. |
| T58-03 fake or stale citations support claims or navigate elsewhere | High | Opaque evidence handles, current revision/locator rebind, one-shot action registry, fresh `citation-open`, replay/revision/access tests. |
| T58-04 stale generation/account/corpus/scope/question/provider completion repaints | High | Abortable request epoch, exact pre/post await checks, withdraw-first replacement, late-completion and ABA tests. |
| T58-05 model output configures policy, complexity, applicability, review, or clearance | High | Those fields are absent from provider schema; deterministic engine owns them; hostile-output fixtures assert rejection. |
| T58-06 filename/order/label impersonates Document 10 or an agreement | High | Stable Drive identity derived only in background from current certified source; rename/reorder/duplicate-name fixtures. |
| T58-07 acknowledgement or policy action is replayed after authority/revision drift | High | Controller/decision digest, open-before-ack, one-shot exact-key actions, synchronous revocation, cross-tab/revision/account tests. |
| T58-08 memo absence is inferred for routine or incomplete agreements | High | Explicit stable complex flag; routine omission; complete-set absence proof; inaccessible/ambiguous fixtures. |
| T58-09 raw evidence, provider output, IDs, URLs, or policy storage leak to content/MCP/logs | High | Minimized schema allowlist, private facades, storage-boundary scanner, static message assertions, log-redaction tests. |
| T58-10 focused UI traps focus, blocks Drive/Docs, or leaves provider/action residue | Medium | Existing geometry/resource ledger, native controls, browser/zoom/a11y tests, cancellation and exact teardown assertions. |

The implementation should add no new externally reachable network endpoint, content-readable storage, runtime message wildcard, `externally_connectable` entry, or host permission. Every new message needs an exact key list and a trusted extension sender check at the content boundary.

## Validation Architecture

### Test layers

| Layer | Purpose | Focused command |
|---|---|---|
| Ask schema | Exact keys, Unicode/control rejection, caps, candidate/projection invariants, freeze, hostile shapes | `node tests/skopeo-ask-schema.test.js` |
| Decision policy | Stable identity store, partition isolation, deterministic applicability, complex omission, memo proof, acknowledgement invalidation, clearance | `node tests/skopeo-decision-policy.test.js` |
| Ask engine | Provider binding, bounded excerpts, candidate repair/rejection, citation rebind, governing/history separation, abstention, abort/discard | `node tests/skopeo-ask-engine.test.js` |
| Background/runtime | Exact messages, current scope, provider races, action registry, policy effects, stale withdrawal, no content authority | `node tests/skopeo-hud-runtime.test.js` |
| Composer/shell/browser | Approved copy/model, native controls, focus, zoom, preferences, collision, host integrity, zero residue | `node tests/skopeo-adaptive-composer.test.js && node tests/skopeo-browser-contract.test.js` |
| Requirement evals | Permission-negative, cross-vendor, fake-citation, policy, memo, hostile-source, cap, stale, and teardown matrix | `npm run test:skopeo-ask-evals` |
| Full regressions | Phase 54–57 authority/truth/HUD plus extension validation and full suite | `npm run test:skopeo-truth-evals && npm run test:skopeo-hud-evals && npm run test:skopeo-ask-evals && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension && npm test` |

### Planned task sampling

Every implementation task must have a focused automated command. Each wave reruns all Phase 58 tests whose artifacts exist plus directly affected Phase 54–57 suites. No watch flags are allowed, and a focused command should remain below 30 seconds. The final aggregate must run the full regression command; a focused pass cannot override a failed repository gate.

### Wave 0 artifacts

- `tests/skopeo-ask-schema.test.js`
- `tests/skopeo-decision-policy.test.js`
- `tests/skopeo-ask-engine.test.js`
- Phase 58 additions to `tests/skopeo-hud-runtime.test.js`
- Phase 58 additions to `tests/skopeo-adaptive-composer.test.js`
- Phase 58 additions to `tests/skopeo-browser-contract.test.js`
- `tests/skopeo-ask-evals.test.js`
- `tests/fixtures/skopeo-ask-evals/`
- `package.json` script `test:skopeo-ask-evals`

No new test framework is required.

### Human-only validation

Keep automated structural/security status separate from:

- counsel/legal-operations approval of decision-kind applicability and memo qualification;
- representative authorized Drive/Docs validation of stable identity, current revision, access changes, and exact citation navigation;
- human assessment of answer usefulness, governing/history presentation, VoiceOver output, 200% zoom, and host coexistence.

These remain `human_needed` even if every deterministic fixture passes.

## Recommended Plan Sequence

1. Closed ask schema plus deterministic policy store/engine and tests.
2. Background-only provider ask engine and evidence/citation adjudication.
3. HUD/background controller integration, scope tokens, one-shot policy effects, and runtime security harness.
4. Content composer/runtime Focused ask/result state and cancellation/currentness.
5. Shadow shell, browser/a11y behavior, requirement evals, package registration, and full regression closure.

The sequence is intentionally authority-first. The UI cannot safely precede the closed data and action contracts it consumes.

## Open Questions (RESOLVED)

1. **Does Phase 58 need a new framework or package?** RESOLVED: No. Use existing classic JavaScript, UniversalProvider, Chrome storage, and Node/browser harnesses.
2. **Where does arbitrary-question evidence come from?** RESOLVED: A fresh bounded exact-set corpus `query` operation supplies inert excerpts; Phase 56 truth supplies governing/history/citation authority.
3. **Can provider output decide citations or policy?** RESOLVED: No. It may reference prompt-issued evidence handles only; local code rebinds citations and owns all policy state.
4. **Where should review acknowledgement live?** RESOLVED: Controller-local and decision-digest-bound, so teardown or any authority/revision change invalidates it without durable stale consent.
5. **How is Document 10 applicability represented?** RESOLVED: A versioned closed local rule table consumes a trusted background decision kind; Phase 58 cited-decision clearance uses `cited-contract-decision` and remains distinct from informational answer state.
6. **How is a missing memo proved?** RESOLVED: Only for an explicit current complex flag and a complete accessible graph/source set with no qualifying human-authored memo; otherwise status is unknown/review-required, never missing or cleared.

## Research Sources

Primary repository evidence inspected on 2026-08-27:

- `extension/background.js`
- `extension/utils/skopeo-hud-schema.js`
- `extension/utils/skopeo-hud-projector.js`
- `extension/utils/skopeo-truth-extractor.js`
- `extension/utils/skopeo-truth-engine.js`
- `extension/utils/skopeo-graph-extractor.js`
- `extension/utils/consent-policy-store.js`
- `extension/content/skopeo-adaptive-composer.js`
- `extension/content/skopeo-runtime.js`
- `extension/content/skopeo-shell.js`
- `tests/skopeo-hud-schema.test.js`
- `tests/skopeo-hud-projector.test.js`
- `tests/skopeo-hud-runtime.test.js`
- `tests/skopeo-hud-evals.test.js`
- `tests/skopeo-truth-runtime.test.js`
- `tests/consent-policy-store.test.js`
- `package.json`
- Phase 54–57 planning, research, validation, summary, and UI artifacts

No web research was necessary: the phase introduces no dependency or external API contract, and the relevant provider, Chrome-extension, authority, storage, UI, and test conventions are all repository-local and already implemented.
