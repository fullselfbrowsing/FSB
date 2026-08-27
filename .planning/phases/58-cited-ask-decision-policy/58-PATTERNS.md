# Phase 58: Cited Ask & Decision Policy - Pattern Map

**Mapped:** 2026-08-27
**Files analyzed:** 19 planned new/modified paths
**Analogs found:** 19 / 19
**Analog families:** closed schemas, versioned background stores, deterministic gates, provider extraction, exact HUD controllers, content lifecycle, Shadow rendering, deterministic evals

## Scope Interpretation

The file set combines the module boundaries in `58-RESEARCH.md`, the Wave 0 artifacts in `58-VALIDATION.md`, and the approved `58-UI-SPEC.md`.

The phase should not edit `extension/manifest.json`, add permissions, initialize a UI framework, expose a new MCP action, or add a content-readable policy/source store. `extension/config/config.js`, graph/truth stores, and Drive transport remain regression-only unless a focused RED contract proves the new background ask engine cannot use their existing injected interfaces.

Existing Phase 57 files are extended in place because they already own the current contract projection, content action epoch, composer boundary, Shadow rail, and browser/eval seams. Do not create a second HUD controller, content runtime, or shell.

## File Classification

| New/Modified File | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `extension/utils/skopeo-ask-schema.js` | model / utility | transform | `extension/utils/skopeo-hud-schema.js` | role-match |
| `extension/utils/skopeo-decision-policy-store.js` | store | CRUD / file-I/O | `extension/utils/skopeo-corpus-store.js` plus `extension/utils/consent-policy-store.js` | role-match |
| `extension/utils/skopeo-decision-policy.js` | policy service | deterministic request-response | `extension/utils/skopeo-consequence-gate.js` | role-match |
| `extension/utils/skopeo-ask-engine.js` | provider service | bounded request-response / batch | `extension/utils/skopeo-truth-extractor.js` | role-match |
| `extension/utils/skopeo-hud-schema.js` | projection model | transform | same file's Phase 57 folder/reading parser | exact |
| `extension/utils/skopeo-hud-projector.js` | projector | batch transform | same file's Phase 57 pure projector | exact |
| `extension/background.js` | controller/provider | request-response / event-driven | same file's HUD projection controller and private truth closure | exact |
| `extension/content/skopeo-adaptive-composer.js` | component / utility | transform | same file's `composeContractView()` | exact |
| `extension/content/skopeo-runtime.js` | content controller | event-driven / request-response | same file's contract request/action epoch | exact |
| `extension/content/skopeo-shell.js` | Shadow component | event-driven | same file's `renderContractView()` | exact |
| `tests/skopeo-ask-schema.test.js` | unit/security test | transform | `tests/skopeo-hud-schema.test.js` | role-match |
| `tests/skopeo-decision-policy.test.js` | unit/security test | CRUD / deterministic policy | `tests/skopeo-consequence-gate.test.js` plus `tests/consent-policy-store.test.js` | role-match |
| `tests/skopeo-ask-engine.test.js` | unit/integration test | provider batch | `tests/skopeo-truth-extractor.test.js` | role-match |
| `tests/skopeo-hud-runtime.test.js` | integration/security test | request-response / event-driven | same file's Phase 57 HUD controller/runtime harness | exact |
| `tests/skopeo-adaptive-composer.test.js` | unit test | transform | same file's contract-view tests | exact |
| `tests/skopeo-browser-contract.test.js` | browser/a11y test | event-driven | same file's Phase 57 Drive/Docs contract flows | exact |
| `tests/skopeo-ask-evals.test.js` | eval aggregate | batch | `tests/skopeo-hud-evals.test.js` | role-match |
| `tests/fixtures/skopeo-ask-evals/` | fixture set | batch | `tests/fixtures/skopeo-hud-evals/` | role-match |
| `package.json` | script config | batch | existing `test:skopeo-graph-evals`, `test:skopeo-truth-evals`, `test:skopeo-hud-evals` | exact |

## Pattern Assignments

### `extension/utils/skopeo-ask-schema.js`

**Analog:** `extension/utils/skopeo-hud-schema.js`.

Use the same classic IIFE/CommonJS dual export, versioned closed vocabulary, `Reflect.ownKeys` exact-data validation, accessor/symbol/prototype rejection, Unicode/control checks, null-prototype rebuilt records, finite caps, UTF-8 serialized cap, and recursive freeze. Create new output records; never freeze caller-owned provider/input objects.

Apply it to question text, prompt-issued evidence handles, provider candidate claims, categorical trust, answer state, conflicts/gaps, policy state, and minimized projection records. Numeric confidence, raw URLs/IDs, unknown fields, duplicate handles/actions, sparse arrays, and material conclusions without admitted citations are invalid.

### `extension/utils/skopeo-decision-policy-store.js`

**Analogs:** `extension/utils/skopeo-corpus-store.js` for strict versioned parsing/immutable reads and `extension/utils/consent-policy-store.js` for serialized `chrome.storage.local` setters and null-prototype maps.

Persist one versioned background-only envelope. Clone and validate all reads; serialize mutations through a promise chain; keep partition and agreement maps safe for prototype-shaped keys; fail closed on malformed/version-mismatched storage. Store only stable configured identities and explicit classification—not labels, filenames, answers, provider output, raw excerpts, action tokens, or acknowledgements.

### `extension/utils/skopeo-decision-policy.js`

**Analog:** `extension/utils/skopeo-consequence-gate.js`.

Use a pure closed state machine with exact authority inputs, an explicit local decision-kind catalog, deterministic action/ack states, current digest equality, and typed closed failures. Like the consequence gate, every effect token is bound to the exact current authority and becomes stale on mismatch. Unlike the generic consequence gate, this module performs no effect itself; it only evaluates applicability, Document 10, complex/memo state, and `blocked`/`cleared`.

Routine agreement output must omit memo requirement entirely. `missing` requires a complete proof. A model field must never enter the policy input shape.

### `extension/utils/skopeo-ask-engine.js`

**Analog:** `extension/utils/skopeo-truth-extractor.js` (with `skopeo-graph-extractor.js` as a secondary provider analogue).

Reuse dependency injection, provider settings/model binding, `buildRequest` → `sendRequest` → `parseResponse`, abort checks before and after every await, bounded response length, closed status records, discard semantics, and immutable final result. Prompt source excerpts as inert data, issue unpredictable evidence handles, and mutate no shared evidence buffer.

Phase 58 differs after parsing: provider JSON remains a candidate. Resolve every handle against the current registry, assign governing/history and citations from injected Phase 56 proof, drop unsupported claims, and force abstention on incomplete authority. Return no raw provider response or excerpt.

### `extension/utils/skopeo-hud-schema.js`

**Analog:** the same file's `parseProjection()` and exact folder/reading body parsers.

Add closed Phase 58 modes/bodies without weakening Phase 57 validation. Preserve envelope authority fields, max-byte enforcement, unique action-token accounting, and rebuild/freeze behavior. Answer state and policy clearance must be separate fields. Routine results omit memo policy fields at the schema level.

### `extension/utils/skopeo-hud-projector.js`

**Analog:** the same file's `createProjection()` pure injected transform.

Join only already-current ask and deterministic policy inputs. Sort/cap claims, evidence, history, conflicts, gaps, and sources deterministically. Preserve evidence roles and explicit overflow. Never read Chrome/storage/provider/DOM APIs or infer identity, applicability, complexity, citation, absence, or clearance.

### `extension/background.js`

**Analog:** `createFsbSkopeoHudProjectionController()`, `runSkopeoCorpusOperation()`, `ensureCurrentHudTruthDisplaySnapshot()`, and the controller-local citation action registry in the same file.

Load new utilities after corpus/graph/truth and before HUD construction. Add exact message key lists. Resolve opaque scope/action tokens against the current binding; authorize the exact source set through `query`; recheck after every await/provider call; publish only schema-valid frozen output. Extend the existing projection state/action registry for ask cancel, citation, Document 10 configure/review/acknowledge, and complex classify/remove. Reuse `citation-open` for source effects and the consequence gate for explicit local configuration confirmation.

Keep created provider/policy facades lexical and private. Do not register raw identities or stores on `globalThis`, content messaging, MCP, diagnostics, or projection records.

### `extension/content/skopeo-adaptive-composer.js`

**Analog:** the same file's `composeContractView()` and `validateContractViewModel()`.

Add a versioned closed Focused ask/result model. Map enums/reasons to the exact UI-SPEC copy and existing atom semantics; validate exact keys/actions; preserve explicit governing/history/policy sections; express categorical trust in words. The composer does not decide answer state, citations, applicability, memo proof, acknowledgement, or clearance.

### `extension/content/skopeo-runtime.js`

**Analog:** the same file's contract projection claim, `contractActionEpoch`, pending/consumed action sets, currentness checks, and `withdrawContractProjection()`.

Add ask state inside the existing owner. Every scope change/dispatch/back/cancel/navigation/kill increments or invalidates the request epoch and withdraws old results/actions first. Messages contain the exact lifecycle tuple, projection token, opaque scope/action ID, and bounded question only. Continue to clone background responses before validation and dispatch only current action IDs.

### `extension/content/skopeo-shell.js`

**Analog:** the same file's `renderContractView()`, contract section/text-slot helpers, trusted keyboard boundary, focus restoration, live region, and resource ledger.

Render the approved 384px Focused ask/result contract in the existing Shadow root. Use native fieldset/radio/textarea/button/heading/list elements and `textContent`; reuse current tokens and geometry. No `innerHTML`, host mutation, page node per claim, remote asset, new root, or detached sidebar. Cancellation and teardown are synchronous and leave the existing exact resource certificate at zero.

### Tests and evals

**Analogs:** corresponding Phase 57 HUD/schema/runtime/browser/eval tests, `tests/skopeo-truth-extractor.test.js`, and `tests/skopeo-consequence-gate.test.js`.

Use network-free `node:assert`, VM-loaded production code, fake Chrome storage/runtime/provider/transport, controlled-RED environment markers, explicit pass markers, exact call counts, permutation/max/max+1 matrices, and source-level boundary assertions. Browser coverage extends the current local Chrome harness; evals load versioned manifest/case fixtures and report structural/security separately from human legal/live evidence.

### `package.json`

**Analog:** existing Skopeo aggregate scripts.

Add `test:skopeo-ask-evals` with schema, policy, engine, runtime, composer/browser coverage as appropriate. Include it once in the normal `test` chain after truth/HUD prerequisites. Do not add a dependency or change the lockfile.

## Shared Patterns

### Authorization and currentness

Every request/effect binds generation, exact origin, profile version, context epoch, semantic entity, scope/source-set/revision/access digest, request/projection token, and controller epoch. Recheck before/after awaits and immediately before publication/effect. Withdraw before replacement.

### Fail-closed behavior

Malformed, partial, inaccessible, over-cap, stale, provider-failed, fake-citation, or policy-ambiguous state produces typed abstention/blocking or complete withdrawal. Never publish a usable prefix or invent a fallback provider, source, identity, policy, or memo obligation.

### Model isolation

Provider output is inert candidate data. It has no tools and cannot supply stable identities, scope, evidence role authority, citation IDs, applicability, complexity, review, acknowledgement, or clearance.

### Validation and immutability

Exact-own-data parsers reject accessors, symbols, extra/missing keys, unsafe text, sparse/over-cap arrays, duplicates, and prototype surprises. Rebuild into fresh recursively frozen records.

### Background-only minimized authority

Content receives local display text, closed enums, counts, categorical trust, and opaque action IDs only. Raw excerpts, provider output, URLs, file/account/corpus IDs, revisions, graph/truth records, storage keys, and private facades stay in background.

### One-shot effects

Citation, policy review, configuration, acknowledgement, and classification actions are current projection-owned and replay-safe. Configuration/classification additionally require an explicit Interstitial confirmation. Every drift revokes the action and acknowledgement.

### DOM, accessibility, and teardown

One Shadow root and one lifecycle owner; native semantics; text-only sinks; exact UI-SPEC copy; visible focus; IME-aware Escape; narrow/200% zoom; forced colors; reduced motion; no host obstruction; exact zero residue.

### Tests

Create the controlled RED oracle before production, keep focused commands below 30 seconds, run affected Phase 54–57 regressions per wave, and keep synthetic/automated evidence distinct from human legal/live approval.

## No Analog Found

None. The combined behavior is new, but each planned file has a direct repository pattern. The policy engine must compose existing store/gate/currentness idioms rather than import a new policy framework.

## Regression-Only and Conditional Files

- `extension/manifest.json`: regression-only; no new permission/content script.
- `extension/config/config.js`: regression-only unless a focused test proves existing provider settings cannot be read fresh.
- `extension/utils/skopeo-truth-engine.js`, `skopeo-graph-engine.js`, stores, and Drive transport: consume existing private interfaces; modify only with a focused RED proof and update this map first.
- `tests/skopeo-session-lifecycle.test.js`, `tests/skopeo-shell-contract.test.js`, `tests/skopeo-corpus-runtime.test.js`, truth/HUD evals, and storage-boundary script: run as regressions; edit only for a demonstrated missing assertion rather than to weaken a gate.

## Metadata

- No `AGENTS.md`, `.codex/skills`, or `.agents/skills` project directives were found.
- No graph artifact was present under `.planning/graphs/`; mapping used current repository source and Phase 54–57 artifacts.
- No external package or web source is involved.
