# Phase 53: Drive Context Router & Semantic Anchors - Research

**Researched:** 2026-07-15
**Scope:** Planning evidence for HUD-06 and HUD-09
**Overall confidence:** High for repository integration, authority, and automated contract shape; medium for current Drive/Docs host identity signals until fixture-backed live reconnaissance is completed

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Context routing and scope
- The content-side router returns an exhaustive `recognized`, `uncertain`, or `unsupported` result with machine-readable reasons.
- Recognized contexts are limited to configured corpus, vendor folder, agreement reading, and focused ask.
- URL, visible text, list position, CSS class, or DOM shape alone cannot prove configured corpus or target identity.
- Phase 53 is not the corpus, account, permission, content, extraction, or contract-truth authority.

#### Semantic anchor identity
- Stable Drive file/folder IDs, Docs document IDs, or opaque downstream clause/citation keys are anchor identity.
- DOM nodes and Ranges are revocable live bindings only.
- Identity and geometry are revalidated immediately before every annotation commit.
- Phase 53 does not infer clause identity from similarity or contract text.

#### Rebinding and authority
- The active Skopeo runtime generation owns routing and anchoring.
- A replacement commit must match `{session generation, context epoch, semantic identity}`.
- Observation is viewport-bounded and batched across relevant mutation, scroll, resize, zoom/geometry, and same-document navigation signals.
- Failed proof withdraws the current projection synchronously before asynchronous re-resolution.
- Same-document Drive/Docs navigation re-routes within the active session; hard navigation and terminal actions preserve Phase 52 teardown.

#### Fail quiet
- Uncertain/unsupported states remove every anchor-dependent primitive immediately.
- The valid invoked shell may retain one concise, non-focus-stealing ambient explanation with a machine-readable reason.
- Recognition uncertainty does not guess a label and never opens an interstitial gate.

### The agent's Discretion
- Exact module boundaries, reason-code names, signal adapters, locator candidates, evidence representation, observer scheduling, and fixture layout.
- Those choices remain bounded by origin pinning, committed fixtures, live Chrome evidence, exact teardown, and the locked result/authority contracts.

### Deferred Ideas (OUT OF SCOPE)
- Account identity, enrolled corpus, permissions, readability, revocation, and source access — Phase 54.
- Graph/source truth and atomic replacement — Phase 55.
- Governing lineage, exact facts, citations, confidence, and deadlines — Phase 56.
- Contract-derived folder/reading projection — Phase 57.
- Cited answers and decision policy — Phase 58.
- Alerts and milestone release hardening — Phase 59.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Planning implication |
|----|-------------|----------------------|
| HUD-06 | User gets a concise fail-quiet state when corpus, vendor folder, agreement document, focused ask, or target cannot be confidently recognized | Router output must be exhaustive, render-independent, reason-coded, and projected through the existing ambient shell without focus theft or guessed labels |
| HUD-09 | An annotation stays attached to validated file/document/clause identity across virtualization, reuse, reorder, SPA navigation, scrolling, zoom, and resize, or withdraws immediately | Semantic identity must be separate from DOM binding; every commit needs identity + epoch + geometry proof; tests must force ABA row reuse and stale async resolution |

</phase_requirements>

## Executive Recommendation

Add two small classic-script foundations ahead of the existing shell/runtime injection: a pure context contract/router and a semantic anchor registry. Keep classification, live binding, and rendering separate:

```text
host snapshot + trusted identity hints
  -> context router
      -> recognized(contextEpoch, contextKind, semanticIdentity, evidence)
      -> uncertain(reason, retryability)
      -> unsupported(reason)

recognized + semantic anchor descriptor
  -> anchor registry resolves a candidate binding
  -> validates semantic identity
  -> stages geometry
  -> final authority check {generation, contextEpoch, semanticIdentity}
  -> shell commits projection OR registry withdraws it
```

Do not implement a Drive selector pack. Candidate locators are adapter inputs and must be backed by captured fixtures and live evidence. The safe product behavior is absence plus a concise reason whenever stable meaning cannot be established.

## Current Repository Findings

### Phase 52 authority is reusable, not replaceable

`extension/content/skopeo-runtime.js` already provides the outer session authority:

- `isLive(generation)` requires the current generation, a non-terminal owner, and a live `AbortController`.
- `prepare()` rejects older generations and tears down the predecessor before a newer generation installs.
- `commit()` accepts only the current prepared generation and terminates on failed mount or stale authority.
- `terminateOwner()` establishes the terminal flag before aborting and releasing owned resources.
- `pagehide` currently requests terminal navigation teardown.

Phase 53 should add a context epoch inside that live generation rather than inventing another session lifecycle. A context epoch changes on same-document route/identity changes; a Skopeo generation changes only when the Phase 52 session is replaced or terminated.

### The shell already has the right disposal primitives

`extension/content/skopeo-shell.js` already exposes the behaviors an anchor projection needs:

- One Shadow host and one resource ledger.
- `_buildSurfaceScope`, `_commitSurfaceScope`, `_disposeSurfaceScope`, and `_restoreSurfaceScope` provide transactional surface replacement.
- `render()` stages richer attention states and rejects unsafe geometry before commit.
- The polite live region supports concise ambient announcements.
- `destroy()` is idempotent and returns the exact owned-resource snapshot.

Phase 53 should add a narrow projection model rather than letting the anchor registry manipulate shell DOM. The registry resolves validated bindings; the runtime serializes a typed model into shell calls; the shell remains the only visual-resource owner.

### Existing Drive/Docs handlers prove stable ID shapes, not DOM bindings

`extension/catalog/handlers/gdrive.js` maps Drive file records with `id`, `parents`, `name`, MIME type, timestamps, and `web_view_link`. It uses an origin-pinned, bounded page-read bridge and typed fallback reasons.

`extension/catalog/handlers/gdocs.js` pins `https://docs.google.com`, derives a document ID only from the allowlisted `/document/d/{id}` URL or a trusted explicit argument/current context, and maps Drive metadata by stable `id`.

These are useful normalization precedents. They do not prove that a current Drive row represents a file ID, that a folder is enrolled, that content is accessible, or that a Docs text range is a known clause. Phase 53 should depend on a stable identity hint only after a dedicated adapter validates it; later phases own permission/content authority.

### Current injection and tests are exact contracts

`extension/background.js` currently injects exactly:

```js
['content/skopeo-shell.js', 'content/skopeo-runtime.js']
```

`tests/skopeo-sidepanel-command.test.js` asserts that exact order and absence from always-loaded bundles. Planning must update the dedicated injection list and its assertions together while preserving the rule that no Skopeo module joins `CONTENT_SCRIPT_FILES` or the fallback bundle.

`tests/skopeo-browser-contract.test.js` already proves real computed geometry, collision rollback, resize revocation, focus preservation/restoration, one-root behavior, and exact zero after destroy. Phase 53 should extend this harness with live binding rectangles and row-reuse fixtures instead of creating an unrelated browser harness.

## Recommended Contracts

### 1. Closed context result

Use one frozen discriminated result contract. Exact names are planner discretion, but the data boundary should be equivalent to:

```js
// recognized
{
  status: 'recognized',
  contextKind: 'configured-corpus' | 'vendor-folder' | 'agreement-reading' | 'focused-ask',
  contextEpoch: positiveInteger,
  semanticIdentity: { kind: string, id: string },
  evidence: [{ signal: closedSignalName, value: boundedValue }]
}

// uncertain / unsupported
{
  status: 'uncertain' | 'unsupported',
  contextEpoch: positiveInteger,
  reason: closedReasonCode,
  retryable: boolean
}
```

Requirements:

- Reject unknown keys and unknown context/signal/reason vocabulary.
- Treat page strings and attributes as untrusted data; no dynamic code, selector, HTML, or shell copy comes from them.
- Never return `recognized` from origin/path or label alone.
- Redact diagnostic evidence to IDs/types/reason codes; do not log page text or agreement content.
- Reclassification increments the context epoch even if the new context kind is the same but semantic identity changes.

### 2. Semantic descriptor and live binding

Separate immutable meaning from disposable host state:

```text
descriptor = {
  anchorId,
  semanticIdentity {kind, id},
  contextEpoch,
  candidateLocators[],
  validators[]
}

binding = {
  anchorId,
  elementOrRange,
  boundIdentity,
  geometryCertificate,
  bindingEpoch
}
```

The descriptor is frozen/normalized. The binding is never persisted and is invalid when detached, recycled, outside its context epoch, semantically mismatched, or geometrically unsafe. Candidate locators identify where to check; validators decide whether the candidate represents the descriptor.

### 3. Withdraw-first re-resolution

For every relevant signal:

1. Coalesce the signal into one scheduled validation pass.
2. Validate the current binding synchronously where possible.
3. If invalid, dispose the anchor-dependent surface immediately and mark the binding withdrawn.
4. Resolve candidate locators within the bounded root/viewport.
5. Validate the semantic identity and compute geometry.
6. Before committing, recheck the active session generation, context epoch, anchor identity, attachment, validator result, and geometry certificate.
7. Commit or remain withdrawn; never restore the previous binding by default.

This ordering makes row recycling and delayed resolver promises safe. An ABA return to the same DOM node is still rejected if the binding/context epoch changed.

### 4. Navigation split

- `pagehide`, restricted URL, unsafe page, kill, and toggle-off remain terminal Phase 52 events.
- Same-document Drive/Docs route transitions increment the context epoch, withdraw existing anchors, and re-run routing inside the active generation.
- The background controller remains the per-tab generation authority; content-side history/DOM signals cannot create a new Skopeo session or claim permission authority.
- Avoid permanent monkey-patching of host history APIs unless a fixture proves it necessary and teardown restores exact originals. Prefer extension/navigation events plus bounded DOM/URL observation.

### 5. Fail-quiet projection

The runtime maps uncertain/unsupported results to a shell-owned ambient model with:

- One short generic message.
- One closed reason code for diagnostics/tests.
- No page/entity name unless that identity was independently validated.
- No mark, chip, halo, ghost, focused surface, or gate.
- No focus write and no interception of unrelated keyboard/pointer events.
- A later valid context result may replace it without reinvocation; terminal conditions still destroy the session.

## Security and Threat Model Guidance

Every plan must include a `<threat_model>` block because plan-phase security enforcement defaults to ASVS L1 and blocks high-severity threats.

| Threat | Severity | Required mitigation/evidence |
|--------|----------|------------------------------|
| T-53-01 wrong-row projection after Drive recycles a node | High | Semantic ID validator independent of node identity; withdraw-first ordering; ABA/reorder fixtures; final identity check at commit |
| T-53-02 stale async resolver commits after route/generation change | High | `{generation, contextEpoch, semanticIdentity}` commit tuple; AbortSignal; delayed-promise negative tests |
| T-53-03 hostile page data forges a context, selector, reason, or shell string | High | Origin pinning, closed vocabularies, bounded data, text-only rendering, no page-supplied selectors/code/HTML; hostile attribute/text fixtures |
| T-53-04 cross-origin or unsupported page is treated as Drive/Docs | High | Exact origin allowlist before path parsing; restricted/opaque/near-neighbor origin negatives; terminal/unsupported result |
| T-53-05 observer/listener/rAF leak survives off or replacement | Medium | All resources registered in the existing eleven-category ledger; repeated teardown and 100-cycle evidence |
| T-53-06 annotation obscures/intercepts a host control after geometry changes | Medium | Existing collision certificate plus revalidation on scroll/resize/zoom; pointer-transparent envelope; browser contract |
| T-53-07 diagnostic output leaks Drive names or contract text | Medium | Metadata-only reason/ID diagnostics; explicit negative log assertions |

## Likely File and Integration Shape

### New production modules

- `extension/content/skopeo-context-router.js` — frozen result vocabulary, origin/context classification, evidence normalization, context-epoch reducer, and pure test exports.
- `extension/content/skopeo-anchor-registry.js` — descriptor normalization, binding state, viewport-bounded observation, withdraw/re-resolve scheduling, and final authority/geometry gate.

Exact names remain discretionary. Separate files are recommended because the pure router and DOM-bound registry have different test and trust boundaries.

### Existing production modules to modify

- `extension/background.js` — inject the new modules in dependency order and preserve hard-navigation/per-tab generation authority.
- `extension/content/skopeo-runtime.js` — create/dispose router and registry under the active generation, own context epochs, map results to shell models, and split same-document re-route from terminal navigation.
- `extension/content/skopeo-shell.js` — accept a typed fail-quiet/anchored projection model and synchronously dispose anchor-dependent scopes without allowing page-derived HTML or focus changes.

### Tests to add or extend

- New `tests/skopeo-context-router.test.js` for closed result vocabulary, origin/path near-neighbors, evidence thresholds, epoch changes, hostile inputs, and HUD-06 copy/reason mapping.
- New `tests/skopeo-anchor-registry.test.js` for descriptor normalization, detach/rebind, node reuse/ABA, reorder, delayed resolution, viewport bounds, signal coalescing, and resource disposal.
- Extend `tests/skopeo-session-lifecycle.test.js` for generation + context-epoch authority and same-document versus terminal navigation.
- Extend `tests/skopeo-shell-contract.test.js` and `tests/skopeo-accessibility.test.js` for fail-quiet/anchor projection disposal, text-only reasons, focus preservation, and hidden-surface exclusion.
- Extend `tests/skopeo-sidepanel-command.test.js` for the dedicated injection order and continued absence from always-loaded bundles.
- Extend `tests/skopeo-browser-contract.test.js` for real geometry during row reuse/reorder/scroll/zoom/resize and synchronous withdrawal.
- Register new tests in `package.json` near the existing Skopeo phase suite.

## Planning Dependencies and Suggested Waves

1. **Wave 0 — contract/fixture foundation:** pure router and anchor tests, reusable virtualized-row/route fixtures, hostile inputs, and explicit test-registration expectations.
2. **Wave 1 — independent pure foundations:** context router/result contract and semantic descriptor/binding reducer can proceed in parallel if they share one small frozen contract defined first.
3. **Wave 2 — runtime/shell/background integration:** context epochs, observation ownership, injection order, same-document handoff, and fail-quiet projection depend on Wave 1.
4. **Wave 3 — browser/adversarial closure:** real geometry, recycling, zoom/resize, accessibility, teardown, and live-recon evidence depend on integrated behavior.

Plans should be split by coherent authority boundary rather than by requirement ID; both HUD-06 and HUD-09 cut across the final integration and verification plan.

## Validation Architecture

### Test infrastructure

| Property | Value |
|----------|-------|
| Framework | Standalone Node tests using `node:assert`, VM sandboxes/fake Chrome APIs, existing lightweight DOM fixtures, plus the current real-Chrome Skopeo browser contract |
| Existing patterns | `tests/skopeo-session-lifecycle.test.js`, `tests/skopeo-shell-contract.test.js`, `tests/skopeo-accessibility.test.js`, `tests/skopeo-sidepanel-command.test.js`, `tests/skopeo-browser-contract.test.js`, `tests/helpers/skopeo-resource-ledger.js` |
| Proposed quick command | `node tests/skopeo-context-router.test.js && node tests/skopeo-anchor-registry.test.js` |
| Proposed phase suite | `node tests/skopeo-context-router.test.js && node tests/skopeo-anchor-registry.test.js && node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-shell-contract.test.js && node tests/skopeo-sidepanel-command.test.js && node tests/skopeo-accessibility.test.js && node tests/skopeo-browser-contract.test.js` |
| Full regression | `npm run validate:extension && npm test` |
| Feedback target | Pure contract tests under 10 seconds; focused phase suite under 60 seconds on the current local setup |

### Requirement-to-test map

| Requirement | Automated proof | Live/manual proof |
|-------------|-----------------|-------------------|
| HUD-06 | Closed router accepts only recognized/uncertain/unsupported results; configured-corpus/vendor-folder/agreement-reading/focused-ask positives require stable evidence; unsupported/near-neighbor/ambiguous/hostile cases render exact generic ambient copy/reason, zero anchors, no focus write, no gate | Invoke on representative Drive corpus/vendor/document views plus unrelated Drive, Docs, and web pages; confirm recognized contexts are correct and uncertain contexts explain without guessing |
| HUD-09 | Virtualized row fixture reuses one node for two file IDs; old projection withdraws before rebind; reorder/detach/ABA/delayed promise/SPA epoch/scroll/zoom/resize cases require matching generation+context+identity and safe geometry; teardown returns exact eleven-category zero | Live Drive list/grid/density scroll and reorder, SPA navigation, Docs document/tab targets, browser zoom/resize; capture current stable signals and confirm no wrong-target frame |

### Wave 0 test gaps

- [ ] Build a deterministic virtualized-row harness that can recycle the same node from `file-A` to `file-B`, reorder rows, detach/reattach, change geometry, and resolve candidate work out of order.
- [ ] Build a context-route fixture matrix covering exact Drive/Docs origins, near-neighbor/spoof origins, folder/document URL shapes, trusted/absent/conflicting identity hints, and every fail-quiet reason class.
- [ ] Add clock/scheduler control for mutation/scroll/resize coalescing without real sleeps.
- [ ] Extend the resource ledger to make anchor observers, scheduled validation frames, and pending resolver work non-vacuously visible in the existing categories.
- [ ] Add a live-recon evidence format recording Chrome build, page kind, route, stable identity signal, locator candidate, negative control, and withdrawal observation without storing contract text.

These fixtures must land with or before the first corresponding implementation task. A final browser test cannot rescue a selector/authority contract that lacks deterministic wrong-row negatives.

### Per-task sampling cadence

- After router/result work: `node tests/skopeo-context-router.test.js`.
- After descriptor/registry work: `node tests/skopeo-anchor-registry.test.js`.
- After runtime generation/context integration: `node tests/skopeo-context-router.test.js && node tests/skopeo-anchor-registry.test.js && node tests/skopeo-session-lifecycle.test.js`.
- After shell projection work: `node tests/skopeo-shell-contract.test.js && node tests/skopeo-accessibility.test.js`.
- After injection/background work: `node tests/skopeo-sidepanel-command.test.js && node tests/extension-content-script-files-completeness.test.js`.
- After each wave: run the proposed phase suite.
- Before phase verification: `npm run validate:extension && npm test`, then complete live Drive/Docs anchor reconnaissance/UAT or explicitly retain it as human-needed debt without claiming live approval.

### Automated adversarial matrix

| Case | Required outcome |
|------|------------------|
| Recycled row changes file ID before resolver completes | Old surface removed synchronously; delayed old result cannot commit; new identity may bind only after validation |
| Same node returns to original ID after an intervening identity (ABA) | Old binding epoch remains invalid; fresh resolution and final tuple proof required |
| Drive row label matches configured vendor but stable ID is absent/conflicting | `uncertain`; no vendor label or anchor rendered |
| `docs.google.com.evil.example/document/d/...` | `unsupported`; no parsing of document ID |
| Host attribute contains selector/code/HTML-like payload | Treated as bounded text/data or rejected; no selector execution, HTML insertion, or reason-vocabulary expansion |
| Same-document route changes twice with reversed async completion order | Only newest context epoch can commit |
| Scroll/resize/zoom makes target detached or unsafe | Dependent surface withdrawn before next paint/commit opportunity; ambient fail-quiet remains safe |
| Kill/replacement while observer/rAF/resolver is pending | Terminal generation wins; exact resource zero; no later outbound ready/render |

### Manual-only/live evidence

| Behavior | Why live evidence is required | Minimum evidence |
|----------|------------------------------|------------------|
| Drive row/folder stable identity signals | Google does not publish a stable DOM contract and virtualized layouts vary | Current Chrome build; list/grid and density variants; signal capture; same-row reuse negative control; no private class-name-only proof |
| Docs document/tab/clause target binding | URL proves document identity but not an arbitrary clause/text binding | Document URL ID match, tab/view variants, selection/range changes, opaque downstream key handoff, withdrawal on invalidation |
| No wrong-target frame during real scrolling/navigation | VM fixtures cannot prove browser paint ordering on current Drive | Slow/rapid scroll, row reuse, SPA route, back/forward, zoom, resize, screenshot/video or observer trace showing withdrawal-before-rebind |
| Host control coexistence and accessibility tree | Current Google controls, Shadow DOM accessibility, and hit testing need a renderer/AT | Drive menus/rows/scrollbar and Docs editing remain usable; keyboard/VoiceOver; ambient failure copy announced once; no hidden anchor surface remains |

### Nyquist coverage rule

The phase is not verified by happy-path recognition alone. Every accepted identity signal needs at least one paired rejection or invalidation test. Every asynchronous bind path needs a later epoch/generation negative. Every acquired observer/scheduled render needs a teardown assertion. Live evidence may remain `human_needed`, but the implementation and plans cannot describe undocumented host signals as proven.

## Planning Risks and Resolutions

1. **Do not merge Phase 54 permission work into recognition.** A stable file ID is not proof of current access or corpus enrollment.
2. **Do not let the shell become the identity authority.** Rendering consumes a validated projection; it does not inspect Drive labels to decide meaning.
3. **Do not preserve an invalid surface while “loading” a replacement.** Withdraw first; absence is the safe transitional state.
4. **Do not treat `AbortController` as the only stale-work defense.** Final tuple equality is mandatory after every await.
5. **Do not hard-code current Google class names into the semantic contract.** Locators are replaceable adapter evidence with negative fixtures.
6. **Do not turn same-document navigation into a second automatic invocation path.** It may re-route only an already active explicit session.
7. **Do not claim live Drive/Docs coverage from VM or synthetic browser fixtures.** Record the evidence gap honestly until current Chrome reconnaissance passes.

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Generation/context-epoch authority | High | Direct extension of Phase 52's tested monotonic generation and commit-time checks |
| Semantic descriptor/live-binding separation | High | Locked requirement, research architecture, and deterministic fixture strategy align |
| Fail-quiet shell projection | High | Existing ambient live region and scoped disposal already provide the needed ownership boundary |
| Injection/runtime integration | High | Dedicated injection list and exact tests make the modification surface explicit |
| Current Drive row identity signals | Medium | Stable Drive IDs exist, but host DOM binding signals require live capture and negative controls |
| Docs clause/range binding | Medium | Document ID is well founded; clause identity must come from a later trusted key and live binding evidence |

---

*Research complete for Phase 53 planning. Permission, content, graph truth, contract projections, answers, and alerts remain outside this phase.*
