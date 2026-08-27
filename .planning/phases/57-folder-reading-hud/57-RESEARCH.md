# Phase 57: Folder & Reading HUD - Research

**Researched:** 2026-08-06  
**Domain:** Trusted Chrome-extension projection of contract truth into Drive/Docs overlays  
**Confidence:** High for repository integration, authority, lifecycle, and validation architecture; medium for final visual density and live Google navigation until UI specification and authorized Drive/Docs UAT exist

## User Constraints (from CONTEXT.md)

### Phase Boundary

Phase 57 projects the current permission-scoped corpus, graph, and Phase 56 truth into sparse overlays on verified Drive folder and Drive/Docs reading contexts. It owns the folder vendor overview, explicitly typed material dates and gaps, governing-versus-historical reading state, exact cited facts, and a freshly authorized route to the governing source or clause. It does not build a detached application, perform legal adjudication in content code, answer free-form questions, enforce Document 10 or complex-memo obligations, or schedule/deliver notifications. [VERIFIED: `57-CONTEXT.md`; `ROADMAP.md`]

### Locked Decisions

- One background-only projector joins the exact current corpus manifest, graph records, and truth snapshots into bounded recursively frozen folder/reading models.
- Final view publication is authorized as `display`; governing-source navigation is authorized as `citation-open`.
- Content receives minimized presentation fields and opaque action identities only. It never reads or joins corpus, graph, or truth storage and never receives a private facade.
- The trusted truth closure may gain only the smallest bounded family overview needed for display.
- Stale, withdrawn, inaccessible, incomplete, or tuple-mismatched inputs withdraw before replacement and fail closed.
- The folder experience is one explicitly invoked composite right-side HUD, not badges attached to every virtualized Drive row.
- Vendor rows expose owner, document/index state, governing status, next material date, memo status, and urgent gaps with explicit overflow.
- A reading view says governing, historical, or superseded only when accepted Phase 56 lineage proves it. Ambiguous/review-required remains unmistakably non-definitive.
- “Open governing source/clause” is the only new contract action. It resolves current authority in background and never trusts a stored URL or content-supplied source ID.
- Notice deadline, renewal, termination, and expiration remain distinct. Consequence of inaction is separate.
- Absence is not proof without an authoritative complete set. Policy/memo obligations and notification outcomes remain neutral until Phase 58/59 authority supplies them.

## Executive Summary

Plan Phase 57 as a thin, trusted presentation adapter over Phases 54–56—not as a new query engine and not as an expansion of the generic capability-action renderer.

The repository already has the hard security foundations:

1. exact generation/origin/profile/context/entity tuples in the Skopeo controller and content runtime;
2. fresh `display` and effectful `citation-open` corpus operations with pre/post currentness checks;
3. a complete current corpus manifest carrying source state and `vendorScopeFileId` ancestry;
4. an exact-set graph snapshot carrying owner/policy/memo records and relations;
5. immutable truth families carrying four-axis lineage, exact assertions, conflicts, citations, and deadline proofs;
6. one Shadow DOM shell with closed atoms, focus management, accessibility, and synchronous teardown.

The missing work is an integration layer:

1. Add a closed Phase 57 semantic projection schema and pure projector.
2. Add one private, bounded truth display-snapshot seam so the projector can enumerate current families without exposing the truth store.
3. Add controller actions for folder/reading projection and opaque citation navigation, with a controller-local revocable action registry.
4. Add a dedicated content composition model that maps closed semantic states to existing atom vocabulary and renders inside the existing shell/corpus region.
5. Prove stale withdrawal, access-negative behavior, gap/date semantics, safe text rendering, exact action routing, accessibility, and no host-page residue.

Two integration prerequisites must be explicit in plans:

- **Truth currently has no production caller.** `recompute` and all `inspect*` methods are used only in tests. An explicit HUD request must either consume a current snapshot or trigger one deduplicated background recomputation through the existing Phase 56 facade, then display an honest blocker if provider, exact-set, or evaluation-context prerequisites are absent.
- **Evaluation context has no current production builder.** Phase 56 requires an explicit civil date, configured governing timezone binding, and exact calendars. Phase 57 must build this tuple in trusted background code from explicit configuration and an injected/testable clock. Missing configuration is `not evaluated`/`timezone missing`; browser locale, implicit UTC, or content-supplied dates are not fallbacks.

## Existing Foundation and Exact Integration Seams

### Background corpus authority

`extension/background.js` already defines the only acceptable authorization seam:

- `runSkopeoCorpusOperation(kind, exactTuple, sourceSelection, callback[, commitCallback])` accepts only `ingestion`, `query`, `display`, `citation-open`, and `alert-delivery`.
- `display` is read-only. `citation-open` is effectful and requires a guarded commit callback.
- Exact source selection is either one source or a unique set capped at 32.
- It recreates current controller state, starts a fresh Phase 54 authority operation, and checks the exact tuple before and after every callback.
- Effectful operations receive the existing prepare/commit authority sandwich.

Phase 57 should add final publication and navigation through this function. It must not add a parallel message-to-Drive or message-to-tabs path.

`projectActiveCorpus()` is the closest presentation analogue. It reads the current manifest, opens one `display` operation, emits opaque row tokens and bounded labels/states, freezes its result, and returns `corpus-closed` on malformed or stale input. It is intentionally only a source-status list; extending it with ad hoc truth joins would make the function untestable and blur Phase 54 versus Phase 57 schemas. Prefer a separate projector with the same authority pattern.

### Current corpus grouping data

Every visible source record in `extension/utils/skopeo-corpus-schema.js` carries:

- current source state;
- display name and metadata fingerprint;
- content fingerprint for ready sources;
- `membershipFingerprint.physicalParentChain`;
- `membershipFingerprint.vendorScopeFileId`, which is exactly the first child below the enrolled root.

This is enough to group files by stable vendor folder identity, but not enough to label that folder: the reconciler persists non-folder sources only, and the source record stores the document display name rather than the vendor folder name.

Recommended vendor-label resolution:

1. group current source records by certified `vendorScopeFileId`;
2. inside the final `display` operation, use the current kernel transport to re-read each unique vendor folder's metadata under the same live controller signal;
3. require exact ID, folder MIME type, non-trashed state, and agreement with a freshly re-certified source ancestry;
4. expose only the bounded folder name to the projector;
5. if any check fails, use an opaque fallback label and a typed metadata gap—never infer a vendor from a contract filename.

Do not persist a second vendor-folder catalog unless research during implementation proves fresh lookup cannot satisfy latency. Persisting it would require new folder-change reconciliation, purge ownership, and revocation tests.

Root-level sources have `vendorScopeFileId: null`. They belong in corpus-level policy/gap evidence and must not be silently assigned to a vendor.

### Graph data

`extension/utils/skopeo-graph-engine.js` already exposes a background-only `snapshotExactSet` operation. Its result includes the complete current set of records, relations, record/relation versions, evidence locators, source bindings, and an `sgx1:` authorized-set digest. The relevant closed records/relations are:

- `owner` + `assigned-owner`;
- `memo` + `references-memo`;
- `policy-document` + `references-policy`;
- `agreement`, `amendment`, `clause`, and their evidence-backed relations.

Labels are bounded untrusted display text. Relation presence can prove “owner identified,” “memo on file,” or “policy document referenced” for the exact current graph. It cannot prove an obligation, absence, or governing applicability by itself.

The projector should accept a complete graph snapshot as an injected immutable input. It should never use lexical search or bounded traversal to infer completeness.

### Truth data

`extension/utils/skopeo-truth-engine.js` exposes a frozen private facade with:

- `recompute`;
- `inspectLineage`;
- `inspectFacts`;
- `inspectConflicts`;
- `inspectCitations`;
- `inspectDeadline`;
- `inspectStatus`.

All inspections require a caller-known `familyId` plus exact evaluation context. The durable truth store has a complete active partition generation with family IDs, but its public facade only reads a known active family or family metadata. Therefore the current API cannot implement a folder overview or map the current reading source to a family without guessing IDs.

Recommended seam: add one private `inspectDisplaySnapshot(exactTuple, { evaluationContext })` method. It should:

1. obtain fresh visible-source and exact graph authority using existing Phase 56 helpers;
2. read and validate the complete active partition generation;
3. read every referenced family proof and require pointer/generation membership;
4. require the same authorized-set digest, evaluation context, source bindings, record versions, relation versions, and schema/rule versions for every family;
5. return sorted bounded family summaries containing source bindings, four lineage axes, accepted display assertions, conflicts, citations, deadline results, and blocker codes;
6. re-run authority/context currentness immediately before return;
7. withdraw stale influence using the existing truth invalidation path;
8. return no prefix on family/byte caps.

The truth store may need one engine-private active-generation read. The store object remains injected into the truth engine; neither method is registered on `globalThis`, content messaging, MCP, or the corpus boundary object.

### Truth recomputation and evaluation context

No production code currently calls the Phase 56 facade. A Phase 57 controller request should use this bounded sequence:

1. derive one exact evaluation context in background;
2. request `inspectDisplaySnapshot`;
3. if the result is current, project it;
4. if it reports only an absent/currently-invalid truth generation and all recompute prerequisites are exact, call `recompute` once for the controller generation/context digest;
5. re-read `inspectDisplaySnapshot` and publish through a final `display` operation;
6. on any provider, source, cap, context, or stale failure, publish typed gaps and no governing assertion.

Use a controller-local in-flight map keyed by exact tuple plus evaluation-context digest to deduplicate folder and reading requests. Abort and delete it with the controller. Never recompute on passive navigation, worker boot, or hidden background cadence; Skopeo remains explicitly invoked.

The evaluation-context builder should:

- add nullable/default-closed configuration keys for the governing timezone binding and immutable calendars if necessary so `config.getAll()` can actually read them;
- parse them with `FsbSkopeoTruthSchema` before use;
- derive the current civil date from an injected clock using the explicitly configured IANA timezone and `formatToParts`, never locale-formatted string parsing;
- produce no context when the binding/calendar set is missing, malformed, or stale;
- keep timezone/calendar configuration out of content messages.

Adding a user-facing timezone settings workflow is not required by Phase 57. The HUD must make the missing configuration visible as a neutral blocker and tests/UAT may provide an explicit approved configuration. Do not silently choose browser timezone or UTC to make fixtures pass.

### Content runtime and composition

`extension/content/skopeo-runtime.js` already owns:

- one current semantic entity and `activeAnchorId`;
- exact authority tuples and entity tokens;
- action-token generation;
- asynchronous currentness checks;
- corpus request/compose/render/withdraw flow;
- teardown on abort, navigation, identity drift, and shell disposal.

Extend the corpus refresh path for Drive/Docs deep-pack contexts:

- enrolled root/folder → request folder projection;
- enrolled current Drive file or Docs document → request reading projection;
- unenrolled root → preserve enrollment behavior;
- stale/invalid response → synchronously withdraw the Phase 57 region.

Do not create a second runtime or independent lifecycle. Preserve the existing one-anchor invariant; the Phase 57 HUD is anchored to the verified folder/document context, not each host row.

`extension/content/skopeo-adaptive-composer.js` is the right closed presentation boundary. Add a separate versioned contract-view model rather than overloading `active-corpus` rows with optional fields. Recommended modes:

- `folder`;
- `reading`;
- `contract-closed`.

The background projection should remain semantic: closed state/date/gap types, bounded evidence-backed labels/values, and opaque action IDs. The content composer maps enums/reason codes to literal UI copy and existing atoms. This prevents background or contract text from manufacturing instructions while keeping one visual vocabulary.

### Shell and renderer

`extension/content/skopeo-shell.js` already has a separate `.skopeo-corpus-region` in the same Shadow root with exact authority checking, lifecycle scope ownership, pointer-surface tracking, live announcements, responsive behavior, and synchronous withdrawal. This is the lowest-risk surface to evolve into the composite folder/reading HUD.

Reuse the existing atom renderers for:

- `status-row` for governing/index/memo status;
- `fact-list` for reading facts and owner/date details;
- `item-list` for gaps;
- `timeline` for explicitly typed material dates;
- `notice` for review-required, unreadable, missing configuration, and historical/superseded banners.

The present 280px corpus region and two-column source rows are too narrow for six vendor dimensions. The Phase 57 UI specification should set exact rail width/density and small-viewport stacking while retaining 16px viewport margins, scroll containment, high-contrast behavior, reduced motion, keyboard access, and zero host-layout mutation.

The shell may render a dedicated vendor-card structure internally, but it should consume only the validated contract-view model and reuse existing tokens/atom semantics. No `innerHTML`, arbitrary markup, host CSS mutation, or portal outside the Shadow root.

## Recommended Semantic Projection Contract

Exact enum spelling is discretionary, but the plan should fix a closed contract before controller and UI work.

### Common authority envelope

Every folder/reading response should include only:

- projection schema/version;
- exact generation/origin/profile version/context epoch/entity token;
- mode;
- one response/action token;
- currentness/result state;
- bounded semantic body.

Do not include tab ID, account permission ID, corpus root ID, partition/storage keys, source IDs, graph/truth IDs, raw URLs, resource keys, provider data, or source text.

### Folder projection

Each vendor projection should carry:

- opaque vendor token and bounded current folder label;
- owner state plus optional bounded label;
- document/index aggregate state plus typed source counts;
- governing state (`governing`, `partially-governing`, `review-required`, `not-evaluated`);
- at most one selected next material date with explicit type, civil date, eligibility/currentness, and separate consequence;
- memo evidence state (`on-file`, `not-evaluated`, with later-owned values admitted only from an authoritative provider);
- sorted typed gaps;
- explicit hidden/overflow count.

Selecting a “next” date is deterministic presentation logic over current accepted values. Recommended precedence is earliest civil date after the evaluation date, with date type retained; never prioritize renewal over an earlier notice deadline and never replace a missing notice deadline with expiration. If no eligible comparison can be made, show all bounded typed dates or `review-required` rather than guessing.

### Reading projection

The reading projection should carry:

- current-source state;
- definitive or non-definitive governing context;
- bounded exact facts, each with type, formatted value, trust state, citation label, and opaque open-action ID where current;
- typed conflicts/gaps;
- governing-source action only when a current accepted governing path and citation exist.

The content model may display historical context alongside governing facts, but it must label which source supplies each fact. A current historical document does not become the source of a governing fact merely because it is open.

### Gap mapping

Use one closed mapping table owned by the projector/composer:

| Required result | Current authoritative input | Allowed Phase 57 presentation |
|-----------------|-----------------------------|-------------------------------|
| Missing final copy | Complete graph/truth family proof showing no accepted executed final under the exact set | Confirmed `missing-final`; otherwise `not evaluated` |
| Unreadable scan | Current corpus source state `unreadable` | Confirmed `unreadable-scan` |
| Incomplete indexing | Current corpus/graph blocker or source ready without a current graph generation | Confirmed/blocked `incomplete-indexing` |
| Owner gap | Complete relevant graph relation set with no accepted owner | Confirmed `owner-gap`; incomplete graph remains `not evaluated` |
| Version conflict | Current truth conflict or review-required lineage | Confirmed `version-conflict` |
| Missing policy document | Exact configured identity/complete relation evidence only | Confirmed only if upstream proves exact missing identity; otherwise `not evaluated` |
| Missing required memo | Phase 58 policy result | Neutral slot in Phase 57 |
| Notification failure | Phase 59 ledger result | Neutral slot in Phase 57 |

The renderer should show neutral slots as first-class rows, not omit them, so VIEW-03 has a stable surface without inventing Phase 58/59 authority.

## Governing-Source Navigation

### Opaque action registry

Create a background/controller-local action registry. Each admitted projection action maps an unpredictable or controller-sequenced opaque token to:

- exact controller tuple and entity token;
- truth output generation/context digest;
- family/citation identity;
- governing source ID and current content binding;
- one allowed action kind;
- consumed/revoked state.

Clear the registry on controller abort, context drift, projection replacement, source withdrawal, and successful one-shot consumption. Content sends only the opaque token plus its exact current authority envelope.

### Fresh open effect

On button activation:

1. validate exact message keys and current controller/entity;
2. resolve the token from that controller's registry;
3. re-read the current truth display/citation binding;
4. run an effectful `citation-open` operation for exactly the mapped governing source;
5. in the prepare callback, re-resolve current file metadata/MIME and verify the citation/source revision;
6. in the guarded commit callback, construct or resolve an allowlisted Google Drive/Docs HTTPS target and call the Chrome tabs API;
7. consume the token only for the committed current effect;
8. return a closed acknowledgement with no URL or source ID.

If no stable clause anchor exists, open the exact governing document and preserve/display the byte-range citation in the HUD. Do not fabricate a Docs heading/bookmark fragment from a byte range.

Resource keys are opaque WeakMap handles inside the Drive transport. If link-shared files require them, add a transport-internal target resolver consumed only by the background commit callback. Do not serialize raw resource keys or URLs to content.

## Boundedness and Partial State

The existing operation and truth limits are 32 sources, while corpus inventory may contain more. Phase 57 must not display the first 32 as if they were the full truth set.

- If the exact truth set is over cap, governance/date status is `not evaluated` with `exact-set-over-cap`.
- A bounded page of independently certified vendor/source status may still render if its incompleteness and total overflow are explicit.
- Counts derived only from the current trusted manifest may label corpus overflow, but they cannot establish governing completeness.
- Renderer caps must fail closed or expose explicit overflow counts; truncating gaps, vendors, dates, facts, or citations silently is prohibited.

The planner should choose caps small enough for the existing 64 KiB minimized truth result and content model limits, then test exact maximum and maximum-plus-one behavior.

## Security Threat Model Inputs

Every Phase 57 plan must account for these threats:

| Threat | Failure mode | Required mitigation |
|--------|--------------|---------------------|
| Stale async paint | Old folder/document result paints after navigation or source change | Exact tuple/entity/action token checks before compose and commit; withdraw first |
| Content projection forgery | Page/content supplies governance, dates, source IDs, or actions | Closed background messages; projector-owned semantics; opaque controller-local actions |
| Wrong vendor attribution | Source/family is assigned by filename or label | Certified `vendorScopeFileId` + exact source bindings only; ambiguous scope becomes corpus-level gap |
| Partial set presented complete | Over-cap/unreadable/inaccessible input is omitted | Complete-set digest/currentness; explicit blocker and overflow states; no prefix truth |
| Inaccessible-source disclosure | Hidden file/vendor existence leaks into content | Project only currently authorized minimized labels; preserve Phase 54 hidden-state rules |
| Untrusted text injection | Contract/Drive text becomes HTML or instructions | Strict bounded safe text, literal copy mapping, `textContent`, closed atoms, no `innerHTML` |
| Definitive false status | Review-required/historical source appears governing | Phase 56 governance axis is sole authority; non-definitive states remain prominent |
| Date conflation | Renewal/expiration is shown as notice deadline | Closed date-type discriminator retained through projector/composer/render tests |
| Forged/replayed citation action | Content opens arbitrary or stale Drive file | Revocable one-shot action registry + fresh `citation-open` prepare/commit revalidation |
| Raw authority leakage | IDs, URLs, resource keys, storage keys, or facades escape | Minimized exact-key model; static boundary tests; no global truth/projector facade |
| Host DOM residue | Drive virtualized row or page layout is mutated | One Shadow-root rail; no row badges; exact teardown and browser residue assertions |

No new storage category is required for display models or action tokens. Keep them controller-local and ephemeral. Phase 57 does not take ownership of the reserved `alerts` purge participant.

## Recommended Module and File Shape

Exact file names are discretionary; this split keeps pure contracts, trusted joins, effects, and DOM work independently testable.

| File | Responsibility |
|------|----------------|
| `extension/utils/skopeo-hud-schema.js` | Closed folder/reading projection, date/gap/status enums, caps, exact parsers, deep-freeze contract |
| `extension/utils/skopeo-hud-projector.js` | Pure deterministic corpus/graph/truth-to-HUD join, vendor aggregation, next-date selection, gap mapping |
| `extension/utils/skopeo-truth-store.js` | Small engine-private complete active-generation read if required |
| `extension/utils/skopeo-truth-engine.js` | One bounded current `inspectDisplaySnapshot` facade method |
| `extension/background.js` | Import/construct trusted projector, build evaluation context, dedupe recompute, exact messages, action registry, final display and citation-open authority |
| `extension/content/skopeo-adaptive-composer.js` | Versioned folder/reading content model and enum-to-copy/atom composition |
| `extension/content/skopeo-runtime.js` | Request/currentness/withdraw flow and opaque action dispatch for verified Drive/Docs contexts |
| `extension/content/skopeo-shell.js` | Composite rail/reading banner rendering in the existing Shadow root, focus/a11y/responsive lifecycle |
| `tests/skopeo-hud-schema.test.js` | Hostile shape, cap, freeze, enum, text, and projection-contract tests |
| `tests/skopeo-hud-projector.test.js` | Vendor/family joins, dates, gap evidence, neutral later-phase slots, permutation/cap tests |
| `tests/skopeo-hud-runtime.test.js` | Background/content messages, recompute/currentness, revocable actions, source-open and boundary tests |
| `tests/skopeo-browser-contract.test.js` | Simulated Drive/Docs visual lifecycle, keyboard/a11y, responsive, stale withdrawal, zero-residue proof |
| `tests/skopeo-hud-evals.test.js` | Requirement-level deterministic aggregate and honest human-evidence labels |

All new utility modules should preserve the repository's classic-script/global plus CommonJS test export pattern, two-space indentation, single quotes, exact-own-key parsing, and recursively frozen outputs.

## Validation Architecture

### Test layers

| Layer | Target | Required proof |
|-------|--------|----------------|
| Pure schema | HUD semantic/display contracts | Exact keys, accessors/symbols/prototypes rejected, deep freeze, safe text, enums, finite caps, exact/max+1 |
| Pure projector | Corpus + graph + truth join | Stable vendor grouping, owner/memo evidence, no absence inference, typed dates, deterministic ordering, explicit overflow, neutral Phase 58/59 slots |
| Truth display seam | Store/engine private overview | Complete active generation only, family/source/version/digest/context equality, stale withdrawal, no prefix on cap/fault, facade remains private |
| Background runtime | Projection/recompute/action controller | Exact message keys, current tuple, deduplicated recompute, display recheck, token revocation/replay rejection, citation-open prepare/commit |
| Content composition | Runtime + composer | No direct storage/Drive/tabs, exact semantic model, enum-to-copy mapping, stale response ignored, withdrawal first |
| Shell DOM | Existing Shadow-root surface | One root/rail, semantic regions/headings/lists/buttons, keyboard/focus/live-region behavior, narrow/high-contrast/reduced-motion, no unsafe HTML |
| Browser contract | Simulated Drive/Docs lifecycle | Folder and historical reading flows, identity drift, same-tab navigation, close/escape, exact zero residue, no host mutation |
| Domain/UAT | Approved corpus + live Drive/Docs | Correct legal-status/date/citation labels and real governing-source navigation; remains human-needed until performed |

### Deterministic fixture inventory

Create a small versioned Phase 57 projection corpus covering at least:

1. two vendor folders plus one root-level policy source;
2. active governing agreement with owner, ready index, memo on file, and future notice deadline;
3. historical/superseded current document with a different governing source;
4. partially governing amendment and inherited base clause;
5. review-required/conflicting lineage;
6. unreadable scan and download-blocked source;
7. ready source without current graph fragment;
8. complete owner absence versus incomplete graph where absence is not proof;
9. missing final proven by complete truth versus merely unknown execution;
10. notice deadline earlier than renewal/expiration with separate consequence;
11. termination earlier than expiration;
12. missing governing timezone/evaluation context;
13. over-32-source exact set and renderer overflow;
14. vendor-scope ambiguity/root-level source;
15. policy/memo present but obligation not evaluated;
16. neutral notification status without a Phase 59 ledger;
17. stale response after context epoch/entity change;
18. citation token replay, cross-tab use, source revision drift, and access revocation;
19. hostile vendor/owner/contract labels and prompt-like text;
20. narrow viewport, keyboard-only, reduced-motion, high-contrast, and teardown.

### Requirement-to-test map

| Requirement | Automated proof | Human proof |
|-------------|-----------------|-------------|
| VIEW-01 | Folder projection/schema/shell tests cover every vendor field, bounded overflow, and source/truth blockers | Authorized Drive root confirms correct vendor names and useful density |
| VIEW-02 | Date enum, ordering, label, consequence, and no-substitution fixtures | Legal operations confirms displayed date meaning against source clauses |
| VIEW-03 | Closed gap mapping covers all eight categories; later-owned categories remain first-class neutral without forged states | Human confirms gaps are understandable and no real missing/failed state is hidden |
| VIEW-04 | Historical/superseded fixtures plus fresh opaque citation-open/replay/revocation tests | Live Drive/Docs confirms unmistakable banner and governing-document route |
| VIEW-05 | Reading model shows governance context and exact facts in one Shadow overlay with no detached page | Human checks exact cited facts and host-workflow usability |

### Nyquist sampling cadence

- After schema/projector tasks: run their owned Node tests plus `node --check` for changed classic scripts.
- After truth/background tasks: run the new HUD runtime tests, `npm run test:skopeo-truth-evals`, `npm run test:skopeo-graph-evals`, `node tests/skopeo-corpus-runtime.test.js`, and `node scripts/verify-skopeo-storage-boundary.mjs`.
- After content/shell tasks: run HUD runtime, adaptive composer, corpus runtime, shell contract, accessibility, session lifecycle, and browser contract tests.
- Add `npm run test:skopeo-hud-evals` in the final integration plan and include it exactly once in the normal `npm test` chain.
- Focused Phase 57 gate:

  `npm run test:skopeo-truth-evals && npm run test:skopeo-hud-evals && node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-browser-contract.test.js && node scripts/verify-skopeo-storage-boundary.mjs && npm run validate:extension`

- Final repository gate: `npm test`.
- Keep deterministic structural/security, provisional synthetic regression, and human legal/live-UAT statuses separate. Phase 56's deferred domain fidelity and authorized live UAT do not become approved merely because Phase 57 renders fixtures.

### Wave 0 assets

The first owning plans should create RED contracts for:

- HUD semantic schema and caps;
- pure vendor/family/date/gap projection;
- private complete truth display snapshot;
- background exact message and action registry;
- content compose/render/withdraw lifecycle;
- requirement-level fixture manifest and aggregate command.

Each implementation plan should own the narrow oracle for its code. Do not defer all authority and UI safety checks to a final browser plan.

### Human-only evidence

The following cannot be promoted by deterministic tests:

- counsel/legal-operations approval of governing/historical/date/gap semantics;
- authorized live Drive folder inventory and Docs document binding;
- real navigation to the exact current governing document and useful citation location;
- subjective density/readability of the vendor rail on representative folders;
- confirmation that missing policy/memo/notification neutral states match operational expectations before Phases 58/59.

Record these as `human_needed`, not failed and not automated pass.

## Recommended Plan Sequence

### Plan 57-01 — Closed HUD language and pure projection

Deliver the Phase 57 schema, vendor/family/date/gap join, exact caps, neutral downstream slots, and hostile/permutation tests. This fixes the semantic contract before background or DOM work.

### Plan 57-02 — Private truth display snapshot and evaluation context

Deliver the complete active-generation truth projection, explicit configuration/context builder, stale withdrawal, and deduplicated current recompute orchestration tests. Keep the truth facade private.

### Plan 57-03 — Trusted folder/reading controller and citation-open

Deliver vendor metadata resolution, folder/reading background projection, exact content messages, controller-local action registry, and freshly authorized Google source navigation.

### Plan 57-04 — Content composition and runtime lifecycle

Deliver versioned contract-view composition, Drive/Docs request routing, currentness checks, opaque action dispatch, and withdrawal integration without a second runtime.

### Plan 57-05 — Composite shell UI and browser/accessibility proof

Deliver the UI-spec-compliant rail and reading banner inside the existing shell, responsive/accessibility behavior, browser lifecycle tests, aggregate HUD evals, package integration, and honest UAT ledger.

Plans 57-01 and the UI specification can proceed before runtime integration. Plan 57-02 depends on the semantic contract. Plan 57-03 depends on 57-01/02. Plan 57-04 can begin from 57-01 but requires controller message shapes from 57-03 for final wiring. Plan 57-05 depends on the composed model and runtime.

## Common Pitfalls

### Treating Phase 55 labels as truth

Owner/memo/policy labels are display text and relations are evidence candidates. Governing status, obligation, exact fact applicability, and deadlines come only from current Phase 56 truth.

### Treating a missing record as a gap

Only a complete authoritative set can prove absence. Otherwise show `not evaluated`, `unknown`, or the exact source/index blocker.

### Recomputing truth on every render

Recompute is provider-backed and effectful. Deduplicate by exact controller/context, reuse current durable truth, abort on teardown, and never run passively.

### Inventing an evaluation timezone

Do not use browser locale, `Date.parse`, implicit UTC, or host midnight. Require an explicit configured/cited binding and display a blocker when absent.

### Joining by display names

Vendor, source, owner, memo, and family names can collide or change. Join only stable certified IDs/versions inside background and discard those IDs before content projection.

### Calling a page complete

The 32-source operation/truth cap is not pagination semantics. A subset can show explicitly partial source status, never a governing corpus conclusion.

### Reusing stored URLs

Phase 56 citations intentionally have IDs and byte ranges, not navigation authority. Resolve the current source under `citation-open` at click time.

### Fabricating a clause anchor

A UTF-8 byte range is not a Google Docs heading/bookmark. Open the exact document when no stable host anchor exists and keep citation location visible.

### Building Phase 58/59 early

Do not add ask bars, draft/send controls, Document 10 decisions, memo obligation rules, alarms, delivery ledger, recipient logic, or notification effects.

### Recreating multi-row Drive badges

The reference mock's badges require independently verified identities for virtualized rows. The confirmed Phase 57 surface is one composite HUD anchored to the root/document context.

## Codebase Evidence

Primary local sources reviewed:

- `.planning/phases/57-folder-reading-hud/57-CONTEXT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- Phase 52–56 context, UI specification, summary, research, validation, verification, and UAT artifacts relevant to the current contracts
- `.context/hud-design-reference/export/canvas-4/Canvas-4.dc.html`
- `extension/background.js`
- `extension/config/config.js`
- `extension/utils/skopeo-corpus-schema.js`
- `extension/utils/skopeo-corpus-store.js`
- `extension/utils/skopeo-drive-corpus-transport.js`
- `extension/utils/skopeo-drive-authority.js`
- `extension/utils/skopeo-drive-reconciler.js`
- `extension/utils/skopeo-graph-schema.js`
- `extension/utils/skopeo-graph-engine.js`
- `extension/utils/skopeo-truth-schema.js`
- `extension/utils/skopeo-truth-store.js`
- `extension/utils/skopeo-truth-engine.js`
- `extension/content/skopeo-context-router.js`
- `extension/content/skopeo-anchor-registry.js`
- `extension/content/skopeo-adaptive-composer.js`
- `extension/content/skopeo-renderer-registry.js`
- `extension/content/skopeo-shell.js`
- `extension/content/skopeo-runtime.js`
- Phase 54–56 corpus, graph, truth, runtime, shell, accessibility, lifecycle, storage-boundary, and browser tests
- `package.json`

No repository `AGENTS.md`, project-local `.codex/skills/**/SKILL.md`, or project-local `.agents/skills/**/SKILL.md` was present.

No external research was required. The current repository defines all security, architecture, domain-shape, and visual constraints needed to plan this phase.

## Ready for Planning

Phase 57 has a viable implementation path with two honest prerequisites: a private complete truth display snapshot and a trusted explicit evaluation-context/recompute caller. Neither requires exposing raw authority or moving adjudication into content.

The highest-risk planning items are:

- exact-set versus bounded-overflow semantics;
- current vendor-folder labeling without a second durable catalog;
- production evaluation context and recompute deduplication;
- complete truth family enumeration while keeping the facade private;
- evidence-only gap claims across Phase 58/59 boundaries;
- revocable citation-open tokens and fresh source resolution;
- preserving the one-shell/one-anchor/zero-residue lifecycle while adding a denser rail.

Make these explicit must-haves with owned tests. Do not leave them as final-integration details.
