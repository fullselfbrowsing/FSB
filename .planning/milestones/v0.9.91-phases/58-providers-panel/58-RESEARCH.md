---
phase: 58
slug: providers-panel
status: complete
researched: 2026-07-12
requirements: [PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PROV-06]
---

# Phase 58 — Providers Panel Research

## Research Question

What does the planner need to know to implement the Providers panel without breaking the existing seven-provider BYOK path, Phase 57 identity evidence, options-page save semantics, or source-pin-heavy regression suite?

## Summary

Implement Phase 58 as a thin options-page presentation layer over two deliberately separate state domains:

1. **Saved user intent** — `providerKind`, `agentProviderId`, and the existing API-only `modelProvider`/`modelName`/keys.
2. **Observed recommendation evidence** — the Phase 57 `getMcpClients` result, recomputed into one advisory `{kind,id}` without mutating saved or in-form selection.

Keep recommendation and settings rules in a small classic-script helper loaded before `options.js`; keep DOM, Chrome runtime/storage, and Save-bar integration in `options.js`; keep the ten accessible radio rows and kind-specific panels in `control_panel.html`; extend existing tokens in `options.css`. This isolates deterministic logic for direct Node tests and reduces changes inside the 8,000-line options script.

The current generic subscription copy is factually unsafe for OpenCode and for API/credit-backed Claude or Codex sessions. The approved UI contract correctly narrows the promise: FSB does not need the CLI credential; `Included in your subscription` appears only when auth metadata confirms that billing mode. Phase 58 otherwise renders `Billing not reported` or provider-specific billing guidance.

## Existing Architecture and Seams

### Control panel markup

`extension/ui/control_panel.html` currently has:

- nav item `data-section="api-config"` and label `API Configuration` near line 47;
- section `id="api-config"`, title `API Configuration`, and one form card beginning near line 144;
- visible seven-value `#modelProvider` select followed by the model combobox and provider-specific key/server groups;
- scripts loaded at the bottom, with helper scripts before `options.js`.

The new chooser should be static markup so it is keyboard-accessible before asynchronous evidence arrives and never flashes empty. Keep `#modelProvider` in the document as an API-only compatibility value source, but make it a hidden native control with a dedicated exclusion class (for example `provider-roster__native`). `initFsbSelects()` currently transforms `.form-select` controls except the model combobox native select, so it must also skip this hidden provider select.

### Options-page lifecycle

`extension/ui/options.js` provides all required integration points:

- `defaultSettings` at the top: add `providerKind: 'api'` and a latent `agentProviderId` value (empty is safest until the user chooses an agent).
- `initializeDashboard()` near lines 131-180: caches elements, wires listeners, calls `loadSettings()`, enhances selects, then initializes sections.
- `cacheElements()` near lines 200+: cache the roster, radio nodes, API details container, agent details container, status/error/usage nodes, refresh button, and hidden `#modelProvider`.
- `setupEventListeners()` near lines 312+: wire the radio group once, reuse `markUnsavedChanges()`, and extend the existing debounced `chrome.storage.onChanged` listener for `local.fsbAgentProviders` and `session.fsbAgentRegistry`.
- provider select change handler near lines 613-626: retain this as the API model-discovery/key-visibility path. Radio selection of an API provider should set `#modelProvider.value` and dispatch or invoke this same path; agent selection must not feed an agent id into it.
- `switchSection()` / `initializeSections()` near lines 1165-1200: normalize `api-config` to `providers` before matching nav/section ids and before `history.replaceState`. Entering Providers may re-query evidence without changing selection.
- `updateApiKeyVisibility()` near lines 1301-1321: remains API-only; kind-level rendering should hide the containing API details region before this helper chooses one provider group.
- `loadSettings()` near lines 1324+: normalize legacy/new settings, restore both latent selections, run API discovery only with a valid API `modelProvider`, render the chosen kind without marking dirty, and skip API connection checks while agent kind is active.
- `saveSettings()` near lines 1628+: append `providerKind` and `agentProviderId`; keep `modelProvider` sourced solely from the hidden seven-value select; preserve every inactive-kind field.
- `discardChanges()` reloads storage, so provider state should be restored through `loadSettings()` with no special reset path.
- CommonJS export at the file end is small and source-sensitive. Prefer exposing pure provider logic from a separate helper rather than expanding the `options.js` test export unnecessarily.

### Phase 57 data contract

`extension/background.js` has exactly one guarded `case 'getMcpClients'` around line 7681. An options page may call `chrome.runtime.sendMessage({ action: 'getMcpClients' })`; the service-worker prohibition applies only to self-sending inside the same SW context.

The successful response is `{ success: true, clients }`, where each canonical row preserves:

```js
{
  id,
  raw,
  displayName,
  clicked: recordOrNull,
  installed: recordOrNull,
  connected: recordOrNull,
  live: recordOrNull
}
```

Only `live` means currently connected. `connected` without `live` is historical observation. Unknown/raw identities are intentionally non-authoritative and must never become selectable or recommended.

### BYOK boundary

`extension/ai/universal-provider.js` reads only `settings.modelProvider` in its constructor. Do not add provider-kind branching there. The strongest INV-03 implementation is structural: `modelProvider` remains one of the existing seven values at storage and UI boundaries, while `agentProviderId` is stored separately.

## Recommended Helper Contract

Create `extension/ui/providers-panel.js` as a CSP-safe classic script loaded before `options.js`. Expose a frozen `globalThis.FSBProvidersPanel` namespace and CommonJS export for Node tests. Keep it pure: no DOM, Chrome APIs, timers, or storage.

Recommended closed data:

```js
const API_PROVIDERS = ['xai', 'gemini', 'openai', 'anthropic', 'openrouter', 'lmstudio', 'custom'];
const AGENT_PROVIDERS = ['claude-code', 'opencode', 'codex'];
```

Recommended functions:

- `normalizeSettings(settings)` → valid `{ providerKind, modelProvider, agentProviderId }` without mutating input. Missing/invalid `providerKind` migrates to API using a valid saved `modelProvider`, otherwise xAI. Invalid agent kind/id fails closed to API; evidence never participates.
- `getRecommendation(clients)` → exactly one `{ providerKind, providerId, reason }`. For each tier, scan fixed agent order: non-null `live`; `installed.detected === true`; non-null `clicked`; fallback `{api,xai,'fallback'}`. Ignore `connected`, unknown ids, recency, saved selection, and object order.
- `getAgentStatus(row)` → presentation-safe booleans/labels for live, installed, seen-before, clicked, not-installed, checkedAt; do not infer auth.
- `isApiProvider(id)` / `isAgentProvider(id)` → own closed allowlist checks.
- optional `getProviderDefinition(kind,id)` for display names and official links, using frozen records.

Use `Object.freeze` for provider definitions and return fresh result objects. Test that inputs are unchanged.

## DOM and Rendering Contract

### Static chooser

Add one `fieldset`/radio group spanning:

- Agent CLIs: Claude Code, OpenCode, Codex.
- API providers: xAI, Google Gemini, OpenAI, Anthropic, OpenRouter, LM Studio, Custom.

Every input has the same `name`, `data-provider-kind`, and `data-provider-id`. The recommendation badge is a separate descendant with `hidden`; checked state remains native radio state. A refresh may move the badge but never check a radio.

### In-memory page state

Keep a small page-realm state object separate from `dashboardState`, for example:

```js
{
  providerKind: 'api',
  agentProviderId: '',
  recommendation: { providerKind: 'api', providerId: 'xai', reason: 'fallback' },
  clients: Object.create(null),
  evidenceStatus: 'idle'
}
```

`renderProviderSelection()` reads only saved/in-form state; `renderProviderRecommendation()` reads only recommendation; `renderAgentEvidence()` reads only evidence. Keeping three render paths prevents an evidence refresh from overwriting user intent.

### Evidence refresh

Implement one promise-returning `refreshProviderEvidence({ announce = false } = {})`:

1. set loading/`aria-busy` without clearing previous rows;
2. send `{ action: 'getMcpClients' }`;
3. validate `success` and plain-object `clients` defensively;
4. compute recommendation and render evidence/status;
5. on failure, retain prior evidence when available or render status-unavailable with xAI fallback;
6. never call `markUnsavedChanges()` and never update checked radios.

Call it on initial settings load, when switching into `providers`, on manual Refresh, and through a 100 ms debounced storage listener for relevant evidence keys. Do not poll and do not trigger daemon detection from the UI.

### Agent detail and usage

Agent selection hides the entire API configuration/details container with `hidden`, not just its key group. It reveals:

- Installation: Installed / Not installed / Status unavailable.
- Connection: Connected now only for `live`; Seen before for historical `connected`.
- Account: Not reported in Phase 58.
- Setup action: existing onboarding/setup path rather than a new hardcoded shell command.
- Usage: Tokens `—`, Turns `—`, Duration `—`, `No delegated runs yet`; no currency node.
- Billing copy/link selected from the frozen agent definition.

The `Included in your subscription` label is a conditional future branch for adapter-confirmed subscription auth. Phase 58's unknown auth renders `Billing not reported`.

## Billing and Link Verification

Verified from official provider sources on 2026-07-12:

| Agent | Official destination | Implementation implication |
|-------|----------------------|----------------------------|
| Claude Code | `https://claude.com/pricing` | Claude Code can follow a Claude plan or API configuration; copy cannot guarantee subscription inclusion |
| OpenCode | `https://opencode.ai/docs/providers/` | OpenCode can use many API or local providers |
| OpenCode Zen | `https://opencode.ai/docs/zen/` | Zen is optional and pay-per-request; it uses its own API key |
| Codex | `https://help.openai.com/en/articles/20001106-codex-rate-card-2` | Current Codex accounting includes plan credits/token-based usage; copy cannot promise zero incremental charge |

Use exact HTTPS URLs in frozen definitions and regression tests. Links use `target="_blank"` plus `rel="noopener noreferrer"`.

## Compatibility and Source-Pin Risks

1. **`initFsbSelects()` enhancement:** explicitly skip the hidden native provider select or the custom dropdown wrapper will reappear.
2. **Load ordering:** `loadSettings()` is asynchronous while `initFsbSelects()` runs immediately. Static radios avoid an empty chooser, but selection rendering must occur inside the storage callback.
3. **Connection check:** the delayed `checkApiConnection()` call inside `loadSettings()` must not run in agent mode. Its provider/key maps remain seven-value API-only.
4. **Source token pins:** `tests/lattice-provider-bridge-smoke.test.js` extracts `saveSettings()` and `checkApiConnection()` bodies and pins their shapes. Preserve `.trim()` counts, `lattice-test-connection`, and DOM-input reads. Update only intentional assertions in the same commit.
5. **Model discovery:** `tests/model-discovery-ui.test.js` and `tests/model-combobox-ui.test.js` require the model controls and `#modelProvider`/`#modelName` sources. Hide rather than delete them.
6. **Sunset boundary:** do not reuse `extension/agents/*`, `listAgents`, or retired Agents UI. This phase consumes MCP client identity only.
7. **Recommendation terminology:** durable `connected` is not current. Tests need a historical-only case to prevent regression.
8. **Prototype safety:** Phase 57 already hardens special keys. The helper must still read only its three allowlisted agent ids and never spread unknown client maps into definitions.
9. **No settings collision:** invalid agent settings must normalize before render; an agent id must never be assigned to `#modelProvider` or passed into model discovery/test-connection.
10. **Hash compatibility:** normalize `api-config` before `document.getElementById(hash)` or old bookmarks silently land on Dashboard.

## Threat Model

| Ref | Threat | Severity | Mitigation / proof |
|-----|--------|----------|--------------------|
| T-58-01 | Unknown/raw MCP identity becomes a selectable or recommended provider | Medium | closed allowlists; fixed-order scan; unknown-id tests |
| T-58-02 | Recommendation silently changes user selection | High (consent/integrity) | separate state/render functions; non-mutation tests; refresh selection test |
| T-58-03 | Agent id leaks into BYOK request construction | High | separate storage keys; seven-value normalization; universal-provider source/behavior regression |
| T-58-04 | Billing copy implies a credentialless or included run when provider charges apply | Medium | provider-specific copy, conditional subscription label, exact official URLs, forbidden-claim tests scoped to agent details |
| T-58-05 | External billing link controls opener or points to a fabricated destination | Medium | fixed HTTPS allowlist; `noopener noreferrer`; exact URL assertions |
| T-58-06 | Malformed runtime response breaks the options page or clears intent | Low | defensive envelope checks; retain selection/evidence on failure; failure-path tests |

No database or schema push applies.

## Recommended Plan Decomposition

Three sequential plans keep every extension-touching commit independently testable:

1. **Pure contracts and tests** — add `providers-panel.js`, recommendation/settings/status tests, script loading, and focused source pins. No visible UI behavior yet.
2. **Accessible roster and kind-aware settings** — markup/CSS plus options load/save/radio/hash behavior, preserving model discovery and universal-provider parity.
3. **Evidence, honest detail states, and closeout** — runtime/storage refresh, recommendation badges, status/usage/billing rendering, error/stale states, full regression and browser/visual verification.

Plans 2 and 3 both depend on Plan 1; Plan 3 depends on Plan 2 because evidence rendering targets the roster/details markup.

## Validation Architecture

### Test infrastructure

- Framework: direct Node `assert` scripts and existing handcrafted DOM/VM harnesses.
- No new dependency is needed.
- Quick pure-logic command: `node tests/providers-panel-logic.test.js`.
- UI/settings command: `node tests/providers-panel-ui.test.js`.
- Compatibility cluster: `node tests/model-discovery-ui.test.js && node tests/model-combobox-ui.test.js && node tests/lattice-provider-bridge-smoke.test.js && node tests/mcp-client-merged-view.test.js && node tests/agent-sunset-control-panel.test.js`.
- Full suite: `npm test` from a clean committed source state with required root/MCP/showcase dependencies available.

### Requirement coverage

| Requirement | Automated proof |
|-------------|-----------------|
| PROV-01 | static HTML/hash tests assert Providers nav/header/id, absence of canonical `id="api-config"`, and alias normalization to `#providers` |
| PROV-02 | helper allowlists and ten static radios have explicit `api`/`agent`; invalid values fail closed |
| PROV-03 | UI harness selects each kind and asserts inactive container hidden, agent statuses/auth/caption present, API discovery receives API ids only |
| PROV-04 | load/save round-trip preserves both kinds; helper/source tests prove agent ids never enter `modelProvider`; universal-provider regressions remain green |
| PROV-05 | table-driven tests cover live > installed > clicked > xAI, fixed ties, unknown/raw, historical-only, refresh non-mutation, exactly one badge |
| PROV-06 | agent detail source/harness asserts tokens/turns/duration and em-dash empty state, no currency node, conditional subscription label, exact official links, no unqualified zero-cost/restriction claims |

### Sampling

- After every task commit: run the new focused test for that task plus any directly touched existing contract test.
- After each plan: run both new tests and the compatibility cluster.
- Before verification: run `npm test` in a clean worktree at the committed phase source HEAD.
- Maximum focused feedback latency target: 15 seconds; full suite may be long and runs at plan/phase gates rather than after every small edit.

### Visual/browser verification

After automated tests pass, open the unpacked extension control panel and verify:

1. `#api-config` redirects to `#providers` and the nav/title say Providers.
2. Exactly one Recommended badge is visible and selecting a different row does not move selection after Refresh.
3. Agent selection removes API/model/key controls from keyboard navigation and shows evidence/account/usage/billing details.
4. API selection restores the previous model/key configuration.
5. Keyboard-only radio navigation, focus retention during Refresh, and error announcement work.
6. Layout passes light/dark, desktop, <=640px, and reduced-motion checks with no horizontal overflow.

These are human/visual checks for presentation quality only; all functional acceptance criteria have automated contracts.

## Planning Checklist

- [ ] All PROV-01..PROV-06 appear in plan frontmatter.
- [ ] Every task includes a threat-model reference or explicitly marks no new threat surface.
- [ ] Each source-touching task updates/runs its paired source pins in the same commit.
- [ ] The hidden `#modelProvider` remains seven-value API-only and is skipped by custom-select enhancement.
- [ ] Recommendation never enters load/migration/save paths.
- [ ] Current `live` and historical `connected` are distinct in code and tests.
- [ ] Billing copy and official destinations match the approved UI-SPEC.
- [ ] Full `npm test` is the final automated gate.
