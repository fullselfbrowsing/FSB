# Phase 69: MCP Descriptions and Same-Call Checks - Pattern Map

**Mapped:** 2026-10-15
**Files analyzed:** 36 (16 new, 20 modified)
**Analogs found:** 35 / 36. The odd one out is the pin-build generator, which has only partial analogs.

Line numbers are from HEAD `469907cb`. `mcp/src` and the registry have no diff since the pin `8a058bdf`. Phase 66.1 runs before Phase 69 and will move some of these lines in `manual.ts`, `errors.ts`, `mcp-tool-dispatcher.js`, `mcp-bridge-client.js` and `mcp-session-recorder.js`. Re-grep the anchor strings quoted below; do not trust the bare line numbers.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `mcp/src/tools/descriptions.ts` (NEW) | config / text table | transform (lookup) | `mcp/src/tools/manual.ts:27-28` (`CHANGE_REPORT_DESCRIPTION_SUFFIX`) + `mcp/src/tools/visual-session.ts:8-38` (exported const + accessors) | role-match |
| `mcp/src/tools/schema-bridge.ts` (MOD) | utility | transform | itself, `jsonSchemaToZod` 78-132 | exact |
| `mcp/src/tools/manual.ts` (MOD) | tool registrar + handler | request-response (bridge) | itself: `visualSession` sidecar 199-213, registration 250-297; `triggers.ts:70-81` for stringified objects | exact |
| `mcp/src/tools/read-only.ts` (MOD) | tool registrar | request-response | itself 116-129 | exact |
| `mcp/src/tools/triggers.ts` (MOD) | tool registrar | request-response | itself 212-225 | exact |
| `mcp/src/tools/screenshots.ts` (MOD) | tool registrar | request-response | itself 57-63 | exact |
| `mcp/src/tools/agents.ts` (MOD, `back`) | tool registrar + handler | request-response | itself 32-54; `manual.ts` 207-213 for the sidecar | exact |
| `mcp/src/tools/{observability,vault,capabilities,autopilot,visual-session}.ts` (MOD) | tool registrars (inline text) | request-response | themselves (`server.tool('<name>', '<text>', {...describe()})`) | exact |
| `mcp/src/tools/settings.ts` (66.1, MOD if present) | tool registrar | request-response | `capabilities.ts:41-49` (inline-text registrar) | exact |
| `mcp/src/errors.ts` (MOD) | utility (error mapping) | transform | itself, `mapFSBError` 448-472 | exact |
| `extension/utils/action-verification.js` (MOD) | service-worker utility (pure logic + injected probe) | request-response / polling | itself (constants 15-25, `isDialogNode` 447-462, cross-origin branch 484-498, export guard 627-642) + `content/actions.js:270-319` (toggle signals) + dispatcher `_fsbHarvestStartInPage` 4129-4218 (self-contained injected function) | exact |
| `extension/ws/mcp-tool-dispatcher.js` (MOD) | service (route wrapper) | request-response + event-driven (webNavigation) | itself: `wrapWithChangeReport` 4437-4544, `_injectFn` 4393-4412, `navigateTabAndWaitForCommit` 1286-1330, `handleBackRoute` 1853-1902, exports 4546-4583 | exact |
| `extension/ws/mcp-bridge-client.js` (MOD) | router | request-response | itself 2077-2082, 2221-2226 | exact |
| `extension/utils/mcp-lattice-journal.js` (MOD) | config table (strip list) | transform | itself 44-48, 821-829 | exact |
| `extension/utils/mcp-session-recorder.js` (MOD) | config table (strip list) | transform | itself 685-690 | exact |
| `scripts/mcp/tools-list-baseline.mjs` (NEW) | build tool / CLI | batch (git archive, tsc, in-process list, file I/O) | `scripts/bench/lib/identity.mjs` 53-104 (`canonicalJson`, `sha256Hex`, `runGit`) + `scripts/bench/sweep-tests.mjs` 56-80, 306-315 (argv + main guard) + `tests/mcp-native-host-packaging.test.js` 971-981 (InMemoryTransport) | partial |
| `tests/fixtures/mcp-tools-list-8a058bdf.json` (NEW) | frozen fixture | file-I/O | `scripts/bench/tasks/core.lock.json` (header `note` + sha256 pins) | role-match |
| `tests/fixtures/expect-outcome.html` (NEW) | fixture page | n/a | `tests/fixtures/editing-regressions.html`, `browser-editing-actions.html` | exact |
| `tests/helpers/mcp-in-process.mjs` (NEW) | test helper | request-response (in-process) | `tests/mcp-native-host-packaging.test.js` 971-981 + `tests/mcp-client-identity.test.js` 34-43, 60-61 + `tests/visual-session-schema-lock.test.js` 158-169 | exact |
| `tests/mcp-tools-list-baseline.test.js` (NEW) | test (contract) | file-I/O | `tests/mcp-pricing-data-parity.test.js` (frozen-artifact compare) + `identity.mjs` 75-93 | role-match |
| `tests/mcp-tools-list-shape-freeze.test.js` (NEW) | test (contract) | transform | `identity.mjs` `toolsListDigest` 81-93 + 66.1's `tests/mcp-settings-tool-contract.test.js` (Analog C) | role-match |
| `tests/mcp-description-budget.test.js` (NEW; may also hold must-keep and coverage) | test (gate + report) | transform | `tests/visual-session-schema-lock.test.js` 30-57 (verbatim tables, `check`) + `identity.mjs` 53-73 | role-match |
| `tests/mcp-expect-wire.test.js` (NEW) | test (contract) | request-response | `tests/mcp-tool-smoke.test.js` 58-121, 283-300, 448-453 + `tests/mcp-recovery-messaging.test.js` 172-180 | exact |
| `tests/expect-evaluator.test.js` (NEW) | test (unit) | transform | `tests/change-report-builder.test.js` 1-60 | exact |
| `tests/expect-dispatcher.test.js` (NEW) | test (unit, stubbed chrome) | request-response | `tests/change-report-toggle.test.js` 47-110 + `tests/change-report-dispatcher.test.js` 35-80 + `tests/back-tool-ownership.test.js` 35-90 | exact |
| `tests/expect-parity.test.js` (NEW) | test (mirror parity) | transform | `tests/mcp-pricing-data-parity.test.js` + `tests/action-tool-agent-scoped.test.js` 50-66 (`blockOf`) | role-match |
| `tests/mcp-expect-caller.test.mjs` (NEW) | test (SC4, Layer 1) | request-response | `tests/mcp-native-host-packaging.test.js` 971-981 + `tests/mcp-client-identity.test.js` 34-43 | exact |
| `tests/expect-outcome-browser.test.mjs` (NEW) | test (SC4, Layer 2, headless Chrome) | request-response | `tests/browser-editing-actions.test.mjs` 1-170 | exact |
| `package.json` (MOD) | config (test chain) | n/a | `scripts.test` (304 `&&` commands; build at index 12) | exact |
| `tests/delegation-phase-contract.test.js` (MOD) | test (chain registry) | n/a | itself 129-161, 2378-2394 | exact |
| `tests/mcp-settings-tool-contract.test.js` (66.1, MOD) | test (freeze) | n/a | 66.1-PATTERNS Analog C (`BASELINE_8A058BDF_TOOLS_DIGEST`) | exact |
| `tests/lattice-replay-background-contract.test.js` (MOD only if the phrase moves) | test (source pin) | n/a | itself 410-411 | exact |
| `.planning/{REQUIREMENTS,ROADMAP,PROJECT}.md` (MOD, doc-only) | docs | n/a | REQUIREMENTS.md:36, ROADMAP.md:132, PROJECT.md:37,44 | exact |
| `69-VALIDATION.md` (planner output) | docs | n/a | `.planning/phases/66-baseline-and-session-timing/66-VALIDATION.md` | exact |

---

## Pattern Assignments

### `mcp/src/tools/descriptions.ts` (NEW: MCP-only text table)

**Analog A: MCP-only text constant** (`mcp/src/tools/manual.ts:18-28`). The precedent for MCP-side prose that never enters the registry:
```ts
// Phase 245 D-04 / D-05: action tools return a `change_report` field ...
const CHANGE_REPORT_DESCRIPTION_SUFFIX =
  ' RETURNS change_report: when this tool runs, the response includes a `change_report` field ...';
```
D-09 shrinks this to one sentence. Move it into the new module and keep the D-10 key phrase "inspect before retrying".

**Analog B: exported table + accessors** (`mcp/src/tools/visual-session.ts:8-38`):
```ts
const MCP_VISUAL_CLIENT_LABELS: string[] = [
  'Claude', 'Codex', 'ChatGPT', 'Perplexity', 'Windsurf', ...
];
export function getAllowedMcpVisualClientLabels(): string[] {
  return MCP_VISUAL_CLIENT_LABELS.slice();
}
```
Apply the same shape: a frozen `Record<string, string>` of tool text plus `Record<string, Record<string, string>>` of per-tool parameter text, a common map for `tab_id`, `visual_reason`, `client` and `is_final`, and one accessor per lookup. An accessor throws on a missing key, so D-08 coverage also fails at registration time.

**Rules taken from the code:**
- The file sits in `mcp/src/tools/`, so the A11 guard (`tests/mcp-numeric-param-coercion.test.js:249-286`) scans it. It is text only, and no string may contain the bare substring `z.number(`.
- The source text of `client` today is `extension/ai/tool-definitions.js:41-44`: "…(see mcp/src/tools/visual-session.ts -- MCP_VISUAL_CLIENT_LABELS)". D-09 forbids the file pointer.
- `tests/lattice-replay-background-contract.test.js:410-411` greps **`observability.ts`** for `never ask the user to open target pages manually`. Keep that phrase in `observability.ts` (for example as a comment next to the lookup), or move the assertion in the same commit (Finding 4).
- Module-level exports such as `EXPECT_TOOL_NAMES` may live here or in `manual.ts`. `tests/expect-parity.test.js` imports them from the build.

---

### `mcp/src/tools/schema-bridge.ts` (MOD: description override in `jsonSchemaToZod`)

**Analog: itself, lines 78-132.** Only the `.describe()` argument may change:
```ts
export function jsonSchemaToZod(
  inputSchema: ToolDefinition['inputSchema'],
): Record<string, z.ZodTypeAny> {
  ...
    if (prop.description) {
      zodType = zodType.describe(prop.description);
    }
    if (prop.default !== undefined) {
      zodType = zodType.default(prop.default);
    }
    if (!required.has(key)) {
      zodType = zodType.optional();
    }
```
Add an optional second parameter, for example `paramDescriptions?: Record<string, string>`. Use `paramDescriptions?.[key] ?? prop.description` inside the existing `if`. Keep the order `.describe` → `.default` → `.optional`, because it defines the published JSON bytes and the shape freeze compares those. When the map is absent, behaviour stays byte-identical for every caller.

**Do not touch** `PARAM_TRANSFORMS` (152-198). It rebuilds params from scratch, which is why `expect` must be lifted out before the transform runs (D-15).

---

### `mcp/src/tools/manual.ts` (MOD: description lookup, `expect` shape, sidecar)

**Registration site** (lines 250-266). Replace the description and add the shape:
```ts
  for (const tool of manualTools) {
    const zodShape = jsonSchemaToZod(tool.inputSchema);
    const fsbVerb = tool._contentVerb || tool._cdpVerb || tool.name;
    const transform = PARAM_TRANSFORMS[tool.name];
    const description = (tool._emitChangeReport === true)
      ? `${tool.description}${CHANGE_REPORT_DESCRIPTION_SUFFIX}`
      : tool.description;
    server.tool(
      tool.name,
      description,
      zodShape,
      async (params: Record<string, unknown>) => {
```
Target shape: `{ ...jsonSchemaToZod(tool.inputSchema, paramTextFor(tool.name)), ...(EXPECT_TOOL_SET.has(tool.name) ? EXPECT_SHAPE : {}) }` (RESEARCH Code Example 2).

**Sidecar precedent** (lines 207-213). `expect` copies this exactly: top-level, and set only when present:
```ts
      const basePayload: Record<string, unknown> = { tool: fsbVerb, params: outboundParams };
      if (visualSession) {
        basePayload.visualSession = visualSession;
      }
      if (managedScreenshotAttested) {
        basePayload.managedScreenshotAttested = true;
      }
```
Add `if (expect !== undefined) basePayload.expect = expect;`. Pass `expect` as a new trailing argument of `execAction` (signature at 162-171).

**Handler order** (lines 271-294). Lift `expect` out first, then run everything else on the remainder:
```ts
        const rejection = validateVisualSessionFields(tool.name, params);
        if (rejection) return rejection;
        const visualSession = buildVisualSessionSidecar(params);
        const cleanedParams = stripVisualSessionFields(params);
        const finalParams = transform ? transform(cleanedParams) : cleanedParams;
        return execAction(bridge, queue, agentScope, tool.name, fsbVerb, finalParams, visualSession, screenshotAttestor);
```
`targetTabIdFromParams(params)` at line 219 keeps reading the post-transform params unchanged.

**Stringified-object precedent** for `parseExpectArg` (`mcp/src/tools/triggers.ts:70-81`):
```ts
function parseTriggerConditionIfStringified(params: Record<string, unknown>): Record<string, unknown> {
  const raw = params.condition;
  if (typeof raw !== 'string') return params;
  const trimmed = raw.trim();
  if (!trimmed || trimmed[0] !== '{' && trimmed[0] !== '[') return params;
  try {
    const parsed = JSON.parse(trimmed);
    return { ...params, condition: parsed };
  } catch {
    return params;
  }
}
```
For `expect`, accept `{` only, and map `null → undefined` (Finding 11): `z.preprocess(parseExpectArg, expectObject.optional()).optional()`.

**Coerced numeric form** for `timeout_ms` (`schema-bridge.ts:104-107`). It must be byte-for-byte this pattern to pass A11:
```ts
        zodType = z.preprocess(
          (v) => (v === '' ? NaN : v),
          z.coerce.number().int().finite(),
        );
```

**Timeout constant precedent** (lines 179-180): `const LONG_TIMEOUT_TOOLS = new Set(['fill_sheet', 'read_sheet']); const timeout = ... 150_000 : 30_000;`. The 30 s action timeout stays unchanged. The default 2,000 and the cap 5,000 for `expect` fit inside it.

**Source pins in this file. Do not restructure:**
- `tests/trigger-tool-dispatcher.test.js:152-158` requires `TRIGGER_MANUAL_EXCLUSIONS`, `!TRIGGER_MANUAL_EXCLUSIONS.has(t.name)` and `TOOL_REGISTRY.filter(isManualTool)`, in that order (line 30 + line 248).
- `tests/agent-scope.test.js:298-311`: the file must not contain `delegationId`.
- `tests/visual-session-schema-lock.test.js:158-169` imports `mcp/build/tools/manual.js` and uses a `server.tool(name, _desc, _zod, handler)` recording server. The handler signature must stay `(params) => …`.

---

### `mcp/src/tools/read-only.ts`, `triggers.ts`, `screenshots.ts` (MOD: description lookup only)

These are the three other registry-driven registration sites (Finding 3). Each passes `tool.description` and `jsonSchemaToZod(tool.inputSchema)`:
- `read-only.ts:117,126-129`: `const zodShape = jsonSchemaToZod(tool.inputSchema); … server.tool(tool.name, tool.description, zodShape, …)`
- `triggers.ts:218,222-225`: same, inside `for (const toolName of TRIGGER_TOOL_NAMES)`
- `screenshots.ts:60-63`: `server.tool(tool.name, tool.description, jsonSchemaToZod(tool.inputSchema), …)`

Change only those two arguments, to `toolTextFor(tool.name)` and `jsonSchemaToZod(tool.inputSchema, paramTextFor(tool.name))`. `read-only.ts:120-122` (`if (!messageBuilder) continue;`) is why `wait_for_element`, `wait_for_stable` and `report_progress` never reach MCP. D-08 coverage must therefore count tools from the live runtime, not from the registry.

---

### `mcp/src/tools/agents.ts` (MOD: `back` text, `expect`, conditional timeout)

**Analog: itself, lines 32-54:**
```ts
  server.tool(
    'back',
    'Navigate one step back in browser history on the agent\'s active tab. ... RETURNS change_report: ...',
    { tab_id: z.coerce.number().int().positive().finite().optional().describe('Target tab in agent pool. If omitted, defaults to the agent\'s active tab.') },
    async ({ tab_id }) => {
      ...
      return queue.enqueue('back', async () => {
        const targetTabId = typeof tab_id === 'number' ? tab_id : null;
        const payload: Record<string, unknown> = {};
        if (typeof tab_id === 'number') payload.tabId = tab_id;
        const result = await sendAgentScopedBridgeMessage(
          bridge, agentScope, 'mcp:go-back', payload,
          { timeout: 5_000, targetTabId },  // 2s settle + 3s headroom (RESEARCH Pattern 1)
        );
        return mapFSBError(result);
```
- Spread `EXPECT_SHAPE` (imported from `manual.ts` or `descriptions.ts`) into the shape object, and destructure `{ tab_id, expect }`.
- `if (expect !== undefined) payload.expect = expect;`
- Without `expect` the timeout stays the literal `5_000`. With `expect` it is `5_000 + clampExpectTimeoutMs(expect.timeout_ms) + EXPECT_BRIDGE_HEADROOM_MS` (Finding 1, Code Example 3).
- The `tab_id` line keeps `exclusiveMinimum` through `.positive()`. The shape freeze sees it.

**Pin** (`tests/agent-sunset-back-end.test.js:70-83`): exactly one line in the file may match `/^\s*server\.tool\(/`, and `'back'` must appear within the next 4 lines. Keep `'back'` on the line right after `server.tool(` and the description lookup on the line after that. The commented-out legacy block (55+) starts with `//` and does not count.

---

### `mcp/src/tools/{observability,vault,capabilities,autopilot,visual-session}.ts` and 66.1's `settings.ts` (MOD: inline text → lookups)

**Analog: `capabilities.ts:41-49`** (the inline pattern used by all 18 mcp-only tools):
```ts
  server.tool(
    'search_capabilities',
    'Search the FSB capability catalog by intent. Use before DOM tools ...',
    {
      query: z.string().describe('Natural-language intent, e.g. "show my github notifications"'),
      ...
      tab_id: z.coerce.number().int().positive().finite().optional().describe('Optional tab id; omit to use the active/owned tab'),
```
Replace each string literal with a lookup, for example `toolText('search_capabilities')` and `.describe(paramText('search_capabilities', 'tab_id'))`. Leave every zod chain (`z.coerce.number().int().positive().finite().optional()`) byte-identical, because the shape freeze compares types and `exclusiveMinimum`.

**Pins:**
- `tests/capability-search-agent-scope.test.js:16-25`: the literals `'search_capabilities'` and `'invoke_capability'`, and `tab_id: z.coerce.number()`, must stay inside the slice from `'search_capabilities'` to `// invoke_capability` (`capabilities.ts:42-78`).
- `tests/lattice-replay-background-contract.test.js:411`: `observability.ts` must still contain `never ask the user to open target pages manually` (now at line 84).
- `search_memory` is a registry name but is registered inline at `observability.ts:121-123`. Its text goes in the module under the inline-tool group.

**D-10 must-keep source phrases already present** (keep the meaning; shorten the wording):
- `vault.ts:57` `fill_credential`: "The password is resolved inside the extension …"
- `vault.ts:107` `use_payment_method`: "Shows a confirmation prompt with card brand, last 4 digits, and merchant domain before any fill occurs."
- `capabilities.ts:80` `invoke_capability`: "Mutating ready capabilities perform real side effects …"
- The repeated "Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED" (for example `vault.ts:57,107`) moves once into the common `tab_id` text (D-09).

---

### `mcp/src/errors.ts` (MOD: unknown-outcome branch only)

**Analog: itself, lines 452-472:**
```ts
  if (fsbResult && fsbResult.success) {
    return { content: [{ type: 'text', text: JSON.stringify(fsbResult, null, 2) }] };
  }

  if (fsbResult?.mayHaveExecuted === true) {
    const pageUnresponsive = fsbResult.errorCode === 'PAGE_UNRESPONSIVE' || fsbResult.code === 'PAGE_UNRESPONSIVE';
    const nextAction = pageUnresponsive
      ? 'The page stopped responding, so reads will wait on it too. ...'
      : fsbResult.errorCode === 'ACTION_RESPONSE_TIMEOUT' || fsbResult.code === 'ACTION_RESPONSE_TIMEOUT'
        ? 'The operation may still be running. ...'
        : 'Inspect the current page with read_page or get_dom_snapshot before deciding whether to retry.';
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `Detected: Action outcome unknown\nWhy: ${...}\nNext action: ${nextAction}\n\n${JSON.stringify({ outcome: 'unknown', mayHaveExecuted: true })}`,
      }],
    };
  }
```
- The success passthrough (452-454) stays untouched, because `expect_result` rides through verbatim.
- In the `mayHaveExecuted` branch, a `verified` `expect_result` prepends one more arm to the ternary. The trailer object gains `expect_result` only when it is present (Code Example 4).
- **Pin** (`tests/mcp-recovery-messaging.test.js:172-180`): the text must contain "Action outcome unknown" and "Inspect the current page", and never "then retry.". The `verified` line must not contain "then retry." either.
- 66.1 also edits this file (`RECIPE_.+` passthrough, `LAYER_LABELS`). Rebase on 66.1's version and keep the edit inside the `mayHaveExecuted` block.

---

### `extension/utils/action-verification.js` (MOD: evaluator, probes, constants, exports)

**Constant block style** (lines 15-25). Named, commented constants at the top:
```js
// D-04 size cap: serialized payload budget in bytes (~600 tokens).
const CHANGE_REPORT_SIZE_CAP_BYTES = 2400;
// Text snippet caps (T-245-01 mitigation).
const TEXT_SNIPPET_MAX = 80;
```
Add `EXPECT_TOOL_NAMES` (frozen, 29 names), `EXPECT_DEFAULT_TIMEOUT_MS = 2000`, `EXPECT_MAX_TIMEOUT_MS = 5000`, `EXPECT_POLL_INTERVAL_MS` and `EXPECT_OBSERVED_MAX` (about 120). Comment each one as uncalibrated, pending V4 (D-20). The file is a classic `importScripts` script (`background.js:80`), so top-level names share the SW global scope. A grep on 2026-10-15 found no existing `EXPECT_*`, `evaluateExpectation`, `normalizeExpectSpec` or `_injectProbe` symbols.

**Dialog definition to mirror** for `dialog_open` (lines 447-462):
```js
function isDialogNode(node) {
  if (!node || typeof node.tagName !== 'string') return false;
  const tag = node.tagName.toLowerCase();
  if (tag === 'dialog') return true;
  let role = null;
  if (typeof node.getAttribute === 'function') {
    try { role = node.getAttribute('role'); } catch (_) { role = null; }
  }
  if (role === 'dialog' || role === 'alertdialog') return true;
  ...
```

**"Labelled, never invented" precedent** (cross-origin branch, lines 483-498). It returns a fixed shape with an explicit flag instead of guessing. The `uncertain` path follows the same idea:
```js
  if (opts.crossOrigin === true) {
    return { url: { before: urlBefore, after: urlAfter, changed: urlChanged }, ..., cross_origin: true };
  }
```

**Self-contained injected function pattern** for `_fsbExpectProbeInPage`. Copy the structure of `mcp-tool-dispatcher.js:4129-4218` (`_fsbHarvestStartInPage`): nested helper functions declared inside the function body, no closure over SW scope, the whole body in `try { … } catch (e) { return { ok: false, error: String(e && e.message || e) }; }`. Unlike the harvest, the probe must be read-only: no `setTimeout`, no `MutationObserver`, no `requestAnimationFrame` (RESEARCH Pattern 4, Pitfall 10).

**Toggle signals to mirror** (`extension/content/actions.js:270`, `280-300`, `307-319`):
```js
const TOGGLE_STATE_ATTRIBUTES = ['aria-checked', 'aria-pressed', 'aria-selected', 'aria-expanded'];
function describeToggleState(el) {
  ...
    return [
      el.checked !== undefined ? String(el.checked) : '',
      el.open !== undefined ? String(el.open) : '',
      ...TOGGLE_STATE_ATTRIBUTES.map(attr => el.getAttribute(attr) ?? ''),
      el.getAttribute('data-state') ?? ''
    ].join('|');
```
`getAssociatedStateElement` (280-300) gives the label → control and summary → details resolution. Copy its logic into the probe, because content-script files are not edited (D-01). D-13's `checked` set is native `checked`, `aria-checked`, `aria-pressed`, `aria-selected`, `data-state` and `open`. `aria-expanded` is in the content list but not in D-13, so leave it out or record why it was included.

**Export guard** (lines 627-642). Append the new symbols here:
```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    capturePageState,
    ...
    buildChangeReport,
    applyChangeReportSizeCap
  };
}
```
Add `normalizeExpectSpec`, `aggregateExpectStatus`, `evaluateExpectation`, `_fsbExpectProbeInPage`, `isRedactedField`, `capObserved` and the `EXPECT_*` constants. Six change-report tests `require` this file (`change-report-builder`, `-cross-origin`, `-size-cap`, `-dispatcher`, `-toggle`, `-read-tools-excluded`). They stub `window`, `document` and `MutationObserver` before requiring (`change-report-builder.test.js:21-38`), so new top-level code must not touch `chrome`, `window` or `document` at load time.

**Do not copy** the password-echo gap in `buildChangeReport` `inputs_changed` (558-571) or in the harvest `captureState` (dispatcher 4158-4163). The evaluator redacts both `expected` and `observed` (Finding 17).

---

### `extension/ws/mcp-tool-dispatcher.js` (MOD: gate refactor, ISOLATED probe injector, commit wait, back hook)

**Gate to refactor** (lines 4446-4455):
```js
  const toolDef = (typeof _mcp_getToolByNameOrVerb === 'function') ? _mcp_getToolByNameOrVerb(toolName) : null;
  const flagOn = !!(toolDef && toolDef._emitChangeReport === true);
  const globalOn = !!fsbChangeReportsEnabled;

  if (!flagOn || !globalOn || !Number.isFinite(tabId) ||
      ['navigate', 'close_tab', 'refresh', 'go_back', 'go_forward', 'open_tab', 'switch_tab'].includes(toolName)) {
    return execute();
  }
```
- `toolName` here is the **wire verb** (`mcp-bridge-client.js:2222` passes `payload.tool`). Resolve membership in the 29-name set with `toolDef && toolDef.name` (Finding 9, Pitfall 7). `_mcp_getToolByNameOrVerb` is `var _mcp_getToolByNameOrVerb = _mcp_defs.getToolByNameOrVerb;` at line 9.
- **Pin** (`tests/hung-page-recovery.test.js:41-45`): the wrapper body must still contain `'navigate', 'close_tab'` and a bare `return execute()`. Keep the array literal in its current order and keep `if (!expectSpec) return execute();` as the no-`expect` branch (Code Example 5).
- Without `expect`, the rest (4457-4543) must stay byte-for-byte. `tests/change-report-toggle.test.js` asserts `scriptingCalls === 0` with the toggle off (lines 67-75), and `change-report-dispatcher.test.js` feeds exactly 3 queued scripting results (start, waitStable, stop). Every `return response;` on the harvest path becomes `return expectSpec ? <attach> : response;`.

**Probe injector**: add a sibling of `_injectFn` (lines 4393-4412). Do not change `_injectFn` itself:
```js
async function _injectFn(tabId, func, args) {
  if (typeof chrome === 'undefined' || !chrome.scripting || typeof chrome.scripting.executeScript !== 'function') {
    return null;
  }
  try {
    const injection = chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func,
      args: args || []
    });
    const results = await Promise.race([
      injection,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Page injection timed out')), _PAGE_INJECTION_TIMEOUT_MS))
    ]);
    return results && results[0] ? results[0].result : null;
  } catch (_) {
    return null;
  }
}
```
The new `_injectProbe` uses `world: 'ISOLATED', injectImmediately: true`. It returns `{ ok, result, documentId, reason }` instead of collapsing to `null`, because the evaluator needs the failure reason to report `uncertain` (Code Example 6). Reuse `_PAGE_INJECTION_TIMEOUT_MS = 750` (line 4121).

**Commit subscription** for `navigate`, `go_back`, `go_forward` and `refresh` (`navigateTabAndWaitForCommit`, lines 1311-1321). Subscribe **before** `execute()`:
```js
  const listen = (event, listener) => {
    if (!event) return;
    event.addListener(listener);
    listeners.push([event, listener]);
  };
  const committed = details => {
    if (details.tabId === tabId && details.frameId === 0) finish({ success: true, url: details.url });
  };
  listen(events.onCommitted, committed);
  listen(events.onReferenceFragmentUpdated, committed);
  listen(events.onHistoryStateUpdated, committed);
```
Removal on finish happens at 1303-1310 (`for (const [event, listener] of listeners) event.removeListener(listener);`). `handleNavigationHistoryRoute` (1474-1480) returns right after `chrome.tabs.goBack/goForward/reload` with no commit wait (Finding 2), which is why the gate lives in the wrapper.

**Builder resolution precedent** for reaching the evaluator from the SW and from Node (`_resolveChangeReportBuilders`, lines 4362-4383):
```js
  if (typeof buildChangeReport === 'function' && typeof applyChangeReportSizeCap === 'function') {
    return { buildChangeReport, applyChangeReportSizeCap };
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.buildChangeReport === 'function' ...) { ... }
  if (typeof require !== 'undefined') {
    try { const av = require('../utils/action-verification.js'); ... } catch (_) { /* not available */ }
  }
  return null;
```
Add a sibling resolver for `evaluateExpectation`. If the evaluator is missing, attach `uncertain`. Never throw out of the wrapper (see the catch at 4534-4541).

**`back` hook** (`handleBackRoute`, lines 1853-1902). Call the evaluator after step 7 (post-back `chrome.tabs.get`) and before building `response`, only when `payload.expect` is an object and the result is `success:true`:
```js
  const settled = await waitForBackSettle(targetTabId, 2000);
  ...
  const response = { success: true, status, resultingUrl: postUrl, historyDepth, tabId: targetTabId, tool: 'back' };
  if (bindResult && bindResult.ownershipToken) {
    response.ownershipToken = bindResult.ownershipToken;
  }
  return response;
```
- The `no_history` early return (1815-1824) is `success:true`, so per D-19 it gets an `expect_result`. With no navigation and no commit to wait for, evaluate immediately.
- Invariant (1516-1518): the back section never calls `chrome.tabs.update`.

**Exports** (lines 4546-4583). Add test-only accessors next to the Phase 245 block (`wrapWithChangeReport, _getChangeReportsEnabled, _setChangeReportsEnabledForTest`).

**Pin count:** 38 tests reference this file. Run `node scripts/bench/sweep-tests.mjs --files extension/ws/mcp-tool-dispatcher.js` after each edit.

---

### `extension/ws/mcp-bridge-client.js` (MOD: forward `expect` into the two wrap calls)

**Analog: itself, lines 2076-2082 and 2220-2226:**
```js
      if (typeof wrapWithChangeReport === 'function' && !usesDispatcherSyntheticChangeReport) {
        return wrapWithChangeReport({
          toolName,
          tabId: tabIdForReport,
          params,
          execute: executeFn
        });
      }
...
      actionResult = await wrapWithChangeReport({
        toolName: payload.tool,
        tabId,
        params,
        execute: executeFn
      });
```
Add one line to each call: `expect: payload && payload.expect,`. That is the whole change. **Constraint** (Finding 5): `tests/action-tool-agent-scoped.test.js:56-63` and `tests/ownership-error-codes.test.js:276-279` slice 4,500 characters from `async _handleExecuteAction` (line 2036), and `resolveAgentTabOrError` sits at offset about 4,190. The first wrap call (2077) is inside that window, so add only the one short line there and no other logic above line 2115. `MCP_DISPATCHER_SYNTHETIC_CHANGE_REPORT_TOOLS` (line 62, `open_tab`/`close_tab`) bypasses the wrapper, which is consistent with D-12's exclusions.

---

### `extension/utils/mcp-lattice-journal.js` and `extension/utils/mcp-session-recorder.js` (MOD: strip lists)

**Journal** (`mcp-lattice-journal.js:44-48`):
```js
  var INTERNAL_PAYLOAD_KEYS = Object.freeze([
    'agentId', 'agent_id', 'ownershipToken', 'ownership_token',
    'connectionId', 'connection_id', 'recordingRunId', 'recordingCallId',
    'recordingLeaseMs'
  ]);
```
It is used at 821-824 (`INTERNAL_PAYLOAD_KEYS.forEach(function (key) { delete next[key]; });`). If you choose to keep bounded `expect` metadata (Claude's discretion), the bounded-copy precedent is `visualSession` right below it (825-829: `visualReason.slice(0, 2000)`). Otherwise append `'expect'` to the list.

**Recorder** (`mcp-session-recorder.js:685-690`). This list applies to `mcp:` message routes such as `mcp:go-back`:
```js
    if (typeof tool === 'string' && tool.indexOf('mcp:') === 0) {
      [
        'agentId', 'agent_id', 'ownershipToken', 'ownership_token',
        'connectionId', 'connection_id', 'visualSession', 'client'
      ].forEach(function (key) { delete source[key]; });
      return source;
    }
    return source.params && typeof source.params === 'object' ? source.params : {};
```
Append `'expect'` (Finding 19: otherwise `back`'s replay payload keeps it). Action tools return `source.params` (line 692), and `expect` is never inside `params` (D-15). Mirror the list with `RECORDING_SIDECAR_FIELDS` (`tests/mcp-tool-smoke.test.js:58`) in the new parity test. 66.1 also edits the recorder (`JOURNAL_FULL_RESULT_TOOLS`, 107-125), so rebase.

---

### `scripts/mcp/tools-list-baseline.mjs` (NEW: pin build + `--write` / `--check`)

There is no single analog. Compose it from these:

**Git runner** (`scripts/bench/lib/identity.mjs:95-104`):
```js
function runGit(repoRoot, args, label) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    maxBuffer: MAX_GIT_OUTPUT,
    shell: false,
  });
  if (result.error || result.signal || result.status !== 0) throw new Error(`${label} failed`);
  return Buffer.from(result.stdout).toString('utf8');
}
```
Use it for `git cat-file -e 8a058bdf^{commit}` (the `--check` precondition) and `git archive 8a058bdf mcp`. Pipe the archive to `tar -x` in a `mkdtempSync` directory, symlink `mcp/node_modules`, then `spawnSync(<tmp>/mcp/node_modules/.bin/tsc, ['-p', '.'])`. Do not run `npm run build`, whose `clean` and `cp` steps are not needed: `ai/tool-definitions.cjs` is tracked and comes with the archive (Finding 14).

**Canonical bytes and hash** (`identity.mjs:53-77`): import `canonicalJson` and `sha256Hex`. Do not write a new stringify (Finding 13: a naive one over-counts by about 4.3 KB because SDK tool objects carry `undefined` keys).

**In-process listing** (`tests/mcp-native-host-packaging.test.js:971-981`):
```js
    const sdkRoot = join(packageRoot, 'node_modules/@modelcontextprotocol/sdk/dist/esm');
    const { Client } = await import(pathToFileURL(join(sdkRoot, 'client/index.js')));
    const { InMemoryTransport } = await import(pathToFileURL(join(sdkRoot, 'inMemory.js')));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'packed-icon-test', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
```
Use `createRuntime({ bridge: stub, agentScope: makeMockAgentScope() })` from the temp build's `build/runtime.js` (Finding 18 explains the mock scope). Load the ESM `dist/esm` paths, not `createRequire().resolve` (Finding 20; contrast with `scripts/bench/lib/mcp-client.mjs:86-92`, which uses CJS on purpose).

**CLI shape** (`scripts/bench/sweep-tests.mjs:56-80` `parseArgs`, which throws on unknown flags, and the main guard at 306-315):
```js
const invokedPath = process.argv[1] ? (() => {
  try { return pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return null; }
})() : null;
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    process.stderr.write(`sweep-tests: ${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 2;
  });
}
```
Export the listing and projection functions so the chained tests can import them without running git. The script itself is **not** chained into `npm test` (D-04).

---

### `tests/fixtures/mcp-tools-list-8a058bdf.json` (NEW: frozen fixture)

**Analog:** `scripts/bench/tasks/core.lock.json` header:
```json
{
  "schemaVersion": 1,
  "note": "Core benchmark set frozen through Phase 71 (D-15). Changing any core task or fixture requires a version bump and a deliberately regenerated lock.",
  "tasks": [ { "id": "...", "version": 1, "fixtureSha256": "63db…" } ]
```
Shape: `{ meta: { sourceCommit: "8a058bdf…", sdkVersion: "1.29.0", zodVersion: "3.25.76", command: "node scripts/mcp/tools-list-baseline.mjs --write", sha256 }, tools: [...] }`. Here `sha256 = sha256Hex(canonicalJson(tools))`. Pretty-print it for diffability; the test recomputes the canonical bytes, so the formatting does not matter. **Do not** touch `scripts/bench/tasks/core.lock.json` or the bench fixtures, which are frozen through Phase 71.

---

### `tests/helpers/mcp-in-process.mjs` (NEW: shared in-process runtime)

**Mock agent scope** (`tests/mcp-client-identity.test.js:34-43`). It has no setters, so `createRuntime` skips the inventory suppliers (`mcp/src/runtime.ts:39-44`):
```js
function makeMockAgentScope() {
  return {
    ensure: async () => 'agent-test',
    ownershipTokenFor: () => null,
    currentOwnershipToken: () => null,
    currentConnectionId: () => null,
    captureOwnershipToken: () => {},
    reset: () => {},
  };
}
```
**Build import** (`tests/mcp-client-identity.test.js:60-61`): `const { createRuntime } = await import(pathToFileURL(runtimeBuildPath).href);`

**Staleness guard** (`tests/visual-session-schema-lock.test.js:158-169`). Generalize it to every `mcp/src/tools/*.ts` and `mcp/src/errors.ts` against its build file:
```js
if (!fs.existsSync(BUILD_PATH)) {
  console.error('  FAIL: mcp/build/tools/manual.js missing -- run `npm --prefix mcp run build` ...');
  process.exit(1);
}
if (fs.existsSync(SRC_PATH) && fs.statSync(SRC_PATH).mtimeMs > fs.statSync(BUILD_PATH).mtimeMs) {
  console.error('  FAIL: mcp/build/tools/manual.js is older than mcp/src/tools/manual.ts -- run `npm --prefix mcp run build` to refresh');
  process.exit(1);
}
```
`createRuntime` registers in this order (`runtime.ts:46-57`): visual-session, triggers, manual, read-only, screenshots, observability, agents, vault, capabilities, autopilot. 66.1 adds settings. `listTools()` order follows registration, so sort by name before projecting, as `toolsListDigest` does.

---

### `tests/mcp-tools-list-baseline.test.js`, `tests/mcp-tools-list-shape-freeze.test.js`, `tests/mcp-description-budget.test.js` (NEW: SC1/SC3 gates)

**Plain-node check harness** (`tests/visual-session-schema-lock.test.js:33-39`, also used by every CJS suite):
```js
let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
```
End with `if (failed > 0) process.exit(1);` inside an async IIFE plus `.catch(err => { …; process.exit(1); })` (lines 335-338).

**Verbatim tables, not derived lists** (`visual-session-schema-lock.test.js:41-57` comment: "Embed verbatim instead of deriving from TOOL_REGISTRY at runtime so a regression … surfaces here as a FAIL"). Use this for the 29-name `expect` list, the D-10 must-keep table and the allowed-difference set (`settings` by name).

**Digest projection precedent** for the shape freeze (`identity.mjs:81-93`). It sorts by name and projects with `canonicalJson`. The shape freeze uses a recursive strip of `description` instead (RESEARCH Pattern 5), keeping `execution`, `$schema`, `additionalProperties`, `exclusiveMinimum`, enums, defaults and required lists.

**Frozen-artifact failure message precedent** (`tests/mcp-pricing-data-parity.test.js:33-34`): print the exact remediation command. Here that is `node scripts/mcp/tools-list-baseline.mjs --write` at the pin, printed on an SDK/zod mismatch with `meta` (Pitfall 8).

**Sequencing** (RESEARCH Pattern 1, Pitfall 4): the first commit ships the budget test as report-only, and the 50% / 20% / 2,048 gates switch on in the commit that completes the cuts.

---

### `tests/mcp-expect-wire.test.js` (NEW: SC3 call-level byte checks + MCP validation)

**Harness** (`tests/mcp-smoke-harness.js:333-411`, `createToolHarness`). It records `{ message, options }` per `sendAndWait`, mints a deterministic `agent_test_smoke`/`token_test_smoke` on `agent:register`, and accepts `bridgeResponses` by message type.

**Call + normalize** (`tests/mcp-tool-smoke.test.js:58-121`). Copy `RECORDING_SIDECAR_FIELDS`, `normalizeRecordingSidecar` and `invokeTool`. Do not `require` the smoke test file itself, because it runs on load.

**Golden payloads to reuse verbatim** (`mcp-tool-smoke.test.js:283-300`, `448-453`):
```js
  assertDeepEqual(clickCall && clickCall.message, {
      type: 'mcp:execute-action',
      payload: {
        tool: 'click',
        params: { selector: 'e5' },
        visualSession: { visualReason: 'smoke test', client: 'Codex', isFinal: false },
        agentId: 'agent_test_smoke',
        ownershipToken: 'token_test_smoke',
      },
    }, '...');
  ...
  { type: 'mcp:go-back', payload: { agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } }
```
Also assert `bridgeCalls[i].options.timeout === 5000` for `back` without `expect` (Pitfall 2), and that `Object.keys(payload)` has no `expect` key.

**Registration** (`mcp-tool-smoke.test.js:124-136`). Load each module with `loadBuildModule(pathJoin('tools', '<x>.js'))` and call `register*Tools(harness.server, harness.bridge, harness.queue, agentScope)`.

**`mapFSBError` byte fixtures** (`tests/mcp-recovery-messaging.test.js:172-180` style):
```js
    {
      label: 'uncertain_mutation',
      input: { success: false, outcome: 'unknown', mayHaveExecuted: true, error: 'Port closed after dispatch' },
      checks(text) {
        assert(text.includes('Action outcome unknown'), ...);
        assert(!text.includes('then retry.'), ...);
      },
    },
```
For byte-identity, hardcode today's full output string per fixture (success, unknown, `PAGE_UNRESPONSIVE`, `ACTION_RESPONSE_TIMEOUT`, generic error) and compare with `===`.

`tests/mcp-tool-smoke.test.js` runs only in CI's `mcp-smoke` job and `tests/back-tool.test.js` runs nowhere (it already fails 1/30). Neither is proof (Finding 8).

---

### `tests/expect-evaluator.test.js` (NEW: pure evaluator unit tests)

**Analog: `tests/change-report-builder.test.js:19-47`.** Stub the browser globals, clear the require cache, then require:
```js
global.window = global.window || { location: { href: 'https://example.com/' } };
global.document = global.document || { title: 'Example', body: { innerText: '' }, ..., querySelector: () => null };
global.MutationObserver = global.MutationObserver || function StubObserver() { this.observe = () => {}; this.disconnect = () => {}; };
const MODULE_PATH = require.resolve('../extension/utils/action-verification.js');
delete require.cache[MODULE_PATH];
const { buildChangeReport } = require(MODULE_PATH);
function check(label, fn) {
  try { fn(); passed++; console.log('  PASS:', label); }
  catch (e) { failed++; console.error('  FAIL:', label, '\n    ', e.message); }
}
```
Drive `evaluateExpectation({ tabId, spec, deps: { tabsGet, executeProbe, now, sleep } })` with fake clocks. Use the `stubEl` helper (lines 49-60) to unit-test `_fsbExpectProbeInPage` against element-like objects.

---

### `tests/expect-dispatcher.test.js` (NEW: wrapper and back-route wiring)

**Analog: `tests/change-report-toggle.test.js:47-110`.** Stub `chrome`, clear three require caches, require the dispatcher, then flip the toggle with `_setChangeReportsEnabledForTest(false)` and count scripting calls:
```js
  delete require.cache[require.resolve('../extension/ws/mcp-tool-dispatcher.js')];
  delete require.cache[require.resolve('../extension/utils/action-verification.js')];
  delete require.cache[require.resolve('../extension/ai/tool-definitions.js')];
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  dispatcher._setChangeReportsEnabledForTest(false);
  scriptingCalls = 0;
  let resp = await dispatcher.wrapWithChangeReport({
    toolName: 'click', tabId: 1, params: { selector: '#submit' },
    execute: async () => ({ success: true, message: 'Clicked', tool: 'click' })
  });
  ok(scriptingCalls === 0, 'OFF: zero chrome.scripting calls (zero overhead)');
```
New cases:
- With `expect` and the toggle off, `expect_result` is attached.
- A verb such as `type`, `cdpClickAt` or `toggleCheckbox` resolves to its name in the 29-set.
- A navigation tool subscribes to `webNavigation` before `execute()`. Stub `chrome.webNavigation.on{Committed,ReferenceFragmentUpdated,HistoryStateUpdated}.addListener/removeListener`.
- A definitive failure carries no `expect_result`.
- The `world: 'ISOLATED'` option is recorded in the `executeScript` calls.

**`back` route stub** (`tests/back-tool-ownership.test.js:35-90`): `global.chrome.tabs.{get,goBack,update,query,onUpdated}` with a `tabGetSequence` hook and an immediate `'complete'` event. Drive it through `dispatcher.dispatchMcpMessageRoute({ type: 'mcp:go-back', payload, client })` (the route is registered at `mcp-tool-dispatcher.js:149`).

---

### `tests/expect-parity.test.js` (NEW: producer/validator mirrors)

**Analog A, frozen-artifact equality with a remediation hint** (`tests/mcp-pricing-data-parity.test.js`): read both sides and compare. On failure, print what drifted.

**Analog B, source-window guard** (`tests/action-tool-agent-scoped.test.js:56-63`):
```js
function blockOf(source, startNeedle) {
  const start = source.indexOf(startNeedle);
  if (start === -1) return '';
  return source.slice(start, start + 4500);
}
const executeActionBlock = blockOf(bridgeClientSrc, 'async _handleExecuteAction');
```
Assert `executeActionBlock.includes('resolveAgentTabOrError')`, so the 4,500-character guards can no longer pass silently (Finding 5).

**Mirrors to compare:**
- MCP `EXPECT_TOOL_NAMES` (imported from `mcp/build/tools/<module>.js`) against the extension `EXPECT_TOOL_NAMES` (`require('../extension/utils/action-verification.js')`);
- the default and cap constants;
- the `expect_result` key set;
- `'expect'` present in the journal `INTERNAL_PAYLOAD_KEYS` (read the source text, since it is an IIFE var), in the recorder `mcp:` strip list, and in the test's sidecar list.

---

### `tests/mcp-expect-caller.test.mjs` (NEW: SC4 Layer 1, no ports)

**Analog:** the in-process client from `tests/mcp-native-host-packaging.test.js:971-981` (excerpt above) plus RESEARCH Code Example 7. Write it as `node:test` ESM like `browser-editing-actions.test.mjs` (`import test from 'node:test'`). Load the CJS evaluator with `createRequire(import.meta.url)('../extension/utils/action-verification.js')`, the same way that file loads `ws` (lines 12-14):
```js
const WebSocketClient = globalThis.WebSocket
  ?? createRequire(import.meta.url)('../mcp/node_modules/ws');
```
The fake bridge needs `isConnected: true` and `sendAndWait(msg, opts)` (shape from `mcp-smoke-harness.js:340-371`). It answers `agent:register` like the harness, and answers `mcp:execute-action` / `mcp:go-back` by running the real evaluator against canned probes. Count `tools/call` requests by wrapping `client.callTool`.

---

### `tests/expect-outcome-browser.test.mjs` + `tests/fixtures/expect-outcome.html` (NEW: SC4 Layer 2)

**Analog: `tests/browser-editing-actions.test.mjs`.** Copy these:
- the Chrome discovery list (16-18);
- `cdp()`, `evaluate()` and `openFixture(name)` (22-121), including the 30 s cold-start deadline and profile cleanup;
- the `{ skip: !chrome }` test option (146).

The CDP shim for `chrome.scripting.executeScript` (lines 134-136) is the probe adapter:
```js
      scripting: { executeScript: async ({ func, args }) => [{
        result: await evaluate(ws, `(${func})(${args.map(arg => JSON.stringify(arg)).join(', ')})`)
      }] },
```
It evaluates in the MAIN world over CDP, so ISOLATED-world behaviour on a real extension is a V5 item (RESEARCH Manual-Only table).

**Fixture page analog** (`tests/fixtures/editing-regressions.html`): a single-line `<!doctype html><html><body>…` with stable `id`s and an inline `<script>` that sets up state. For `expect-outcome.html`, add:
- a `#status` text that changes after a `setTimeout` (the delayed DOM change);
- a native checkbox, an `aria-pressed` button and a `data-state` toggle;
- `<input type="password">` with a value;
- a `<dialog>`;
- an element removed after a delay (`text_gone`).

Unlike `editing-regressions.html`, it must not load `extension/content/*.js`. The probe is self-contained, and `window.FSB` is absent, so a ref selector reports `uncertain`.

---

### `package.json` + `tests/delegation-phase-contract.test.js` (MOD: same commit as each new test)

**Chain** (`package.json` `scripts.test`, 304 commands joined with ` && `; `npm --prefix mcp run build` is index 12; the last entry is the `node --test tests/bench-export-history.test.mjs …` line). Append each new command after the build. Appending at the end satisfies that, and matches 66.1's plan.

**Registry** (`tests/delegation-phase-contract.test.js:129-161`). Append the identical string:
```js
const REFINEMENT_ROOT_TEST_COMMANDS = Object.freeze([
  'node tests/mcp-bridge-events.test.js',
  ...
  'node --test tests/content-click-single-activation.test.js',
  'node --test tests/bench-export-history.test.mjs tests/bench-stats.test.mjs ... tests/bench-drivers.test.mjs',
]);
```
The exact-once check is at 2378-2382:
```js
const rootCommands = packageJson.scripts.test.split(' && ');
for (const command of REFINEMENT_ROOT_TEST_COMMANDS) {
  check(rootCommands.filter((candidate) => candidate === command).length === 1,
    `${command} appears exactly once in the refinements root chain`);
}
```
The subtraction filter at 2387-2394 keeps `PRE_PHASE61_ROOT_TEST_HASH` stable. Never edit the `PRE_PHASE6x` hashes. Plans that add tests must be serialized across waves, because two plans appending in parallel conflict on both files.

---

### `tests/mcp-settings-tool-contract.test.js` (66.1 output, MOD: freeze migration per D-22)

66.1-PATTERNS (Analog C) pins `BASELINE_8A058BDF_TOOLS_DIGEST = { count: 72, sha256: '8321cc72…' }` over `toolsListDigest(tools.filter(t => t.name !== 'settings'))`. That digest includes descriptions. In the same commit as the first description edit, replace that one assertion with: name equality, the Phase 69 shape projection against the committed fixture (excluding `settings` and allowing `expect` on the 29), the budget gate and the must-keep table. Keep its other freezes (`TOOL_REGISTRY` hash, the prompt table, `fsb://config`) unchanged. Find the file first with `grep -rln "8a058bdf\|BASELINE_8A058BDF" tests/` (RESEARCH Open Question 2). If 66.1 committed its own `tools/list` fixture, reuse it as the D-04 fixture.

---

### Planning-doc wording fix (D-02, last plan)

These lines say 73 and should read "the 72 tools at `8a058bdf`, 73 with the Phase 66.1 settings tool":
- `.planning/REQUIREMENTS.md:36` (MCP-01: "all 73 existing tools")
- `.planning/ROADMAP.md:132` (SC1: "All 73 existing tool descriptions")
- `.planning/PROJECT.md:37` ("all 73 MCP tools") and `:44` ("73 tools with about 54.5k characters", also stale against the measured 54,024 / 34,217)

Leave the user-facing doc counts and `tests/mcp-version-parity.test.js:327-335` alone, because they move with Phase 71 (V6).

---

## Shared Patterns

### Additive-only wire (MCP-04)
**Source:** `mcp/src/tools/manual.ts:207-213`; `schema-bridge.ts:162,170,178,190,196` (`...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {})`)
**Apply to:** `manual.ts`, `agents.ts`, `mcp-bridge-client.js`, the dispatcher response
A new key appears only when its input was supplied: `if (x !== undefined) payload.x = x;` or a conditional spread. Never write `payload.expect = undefined`, because `canonicalJson` drops it but `JSON.stringify` order and `Object.keys` checks do not.

### Sidecars travel top-level, never inside `params`
**Source:** `manual.ts:199-213` (comment + code); journal `mcp-lattice-journal.js:44-48`, `821-829`; recorder `mcp-session-recorder.js:685-692`; smoke `tests/mcp-tool-smoke.test.js:58`
**Apply to:** `expect` end to end. Update all three strip lists and the parity test in one commit (gotcha 6).

### Service-worker classic script with a `module.exports` guard
**Source:** `extension/utils/action-verification.js:627-642`; `extension/ws/mcp-tool-dispatcher.js:4585-4611` (`globalThis.*` exposure + `module.exports`)
**Apply to:** every new extension symbol. Use no `import`/`export`, no load-time `chrome` access, and unique top-level names. No new `importScripts` line, so the `importScripts` pins (334 tokens / 330 calls) in `tests/lattice-provider-bridge-smoke.test.js:635-636` do not move.

### Never block the action on a report failure
**Source:** `mcp-tool-dispatcher.js:4534-4543` (catch, `console.warn`, `return response`) and the `_injectFn` swallow at 4409-4411
**Apply to:** the evaluator, `_injectProbe` and the back hook. Every failure becomes an `uncertain` check, never a thrown error and never a changed `success`.

### Self-contained injected page functions
**Source:** `mcp-tool-dispatcher.js:4129-4218` (`_fsbHarvestStartInPage`), `4337-4357` (`_fsbWaitStableInPage`)
**Apply to:** `_fsbExpectProbeInPage`. Declare all helpers inside the function and pass only JSON-serialisable `args` (selectors are never concatenated into code). Wrap the body in try/catch returning `{ ok:false, error }`.

### Built-MCP import with a staleness guard
**Source:** `tests/visual-session-schema-lock.test.js:158-169`; ESM import via `pathToFileURL` (`tests/mcp-client-identity.test.js:60-61`)
**Apply to:** every new test that imports `mcp/build`. In `.mjs` tests use `dist/esm` SDK paths (Finding 20).

### Node 20 safety
**Source:** `tests/browser-editing-actions.test.mjs:12-14`; `tests/mcp-smoke-harness.js:10`
**Apply to:** all new tests. Do not rely on a global `WebSocket`; fall back to `mcp/node_modules/ws`. `fetch` is fine. No test binds 7225 or 7226.

### Source-pin pre-flight
**Apply to:** every task that edits a source file. Before editing, run `grep -rln "<basename>" tests/`. After editing, run `node scripts/bench/sweep-tests.mjs --files <edited paths>`. The known pins for this phase are listed above and in CONTEXT D-24:

| File | Count | Specific pins |
|---|---|---|
| dispatcher | 38 | `hung-page-recovery` 41-45 |
| `mcp-bridge-client.js` | | 4,500-character windows |
| `agents.ts` | | `agent-sunset-back-end` 70-83 |
| `capabilities.ts` | | `capability-search-agent-scope` 16-25 |
| `manual.ts` | | `trigger-tool-dispatcher` 152-158, `agent-scope` 298-311 |
| `observability.ts` | | `lattice-replay-background-contract` 411 |
| `errors.ts` | | `mcp-recovery-messaging` 172-180 |

The four registry hash pins must **not** move: `tool-definitions-parity:52`, `capability-mcp-surface:58`, `capability-autopilot-parity:42`, `recipe-schema-lock:44`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/mcp/tools-list-baseline.mjs` (the `git archive` + temp `tsc` build) | build tool | batch | No script builds a historical commit in a temp directory. The git runner, canonical JSON, InMemoryTransport listing and CLI shape all have analogs (above). For the archive → extract → symlink `node_modules` → `tsc -p .` sequence, follow RESEARCH Finding 14, which was proven in about 1.5 s. |

## Metadata

**Analog search scope:**
- `mcp/src/tools/*.ts`
- `mcp/src/{errors,runtime}.ts`
- `extension/utils/{action-verification,mcp-lattice-journal,mcp-session-recorder}.js`
- `extension/ws/{mcp-tool-dispatcher,mcp-bridge-client}.js`
- `extension/content/actions.js`
- `extension/ai/tool-definitions.js` (read-only)
- `scripts/bench/{lib,tasks}`, `scripts/*.mjs`
- `tests/*.test.{js,mjs}`, `tests/mcp-smoke-harness.js`, `tests/fixtures/`
- `.planning/phases/66.1-mcp-settings-tool/66.1-PATTERNS.md`

**Files scanned:** about 45. 26 were read in targeted ranges, and the rest were grep-located.
**Pattern extraction date:** 2026-10-15

**Notes:**
- graphify was consulted first, as the hook requires. Its graph is from 2026-07 and its line numbers are stale (it places `wrapWithChangeReport` at L3114; the real location is L4437), so all line numbers here come from direct reads at HEAD.
- 66.1 is planned but not executed (`mcp/src/tools/settings.ts` does not exist yet). Re-anchor after it lands.
