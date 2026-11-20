# Phase 69: MCP Descriptions and Same-Call Checks - Context

**Gathered:** 2026-10-15 (assumptions mode, auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

Make MCP calls cheaper in context and in round trips without changing the existing wire contract (MCP-01, MCP-02, MCP-04).

In scope:
- Shorter MCP-facing descriptions for every tool in the MCP `tools/list`. That is the 72 tools at the baseline pin `8a058bdf`, plus the Phase 66.1 settings tool.
- A repeatable budget check, run in CI, that compares the list against a frozen baseline.
- One optional `expect` parameter on a fixed set of 29 action tools. It is evaluated in the same call, with a bounded observation after the action, and reports `verified`, `unmet` or `uncertain`.
- Contract tests proving that tool names, required arguments, defaults and serialized payloads and responses are unchanged when `expect` is omitted.
- An automated caller test proving that one call can perform an action and read its effect.
- Redacting sensitive input values in `change_report.inputs_changed` and in the `value` entries of `change_report.attrs_changed` (D-25). This is the one recorded security exception to byte-stability.

Out of scope:
- Autopilot tool text and schemas. The shared registry `extension/ai/tool-definitions.js` is not edited, so with Jev off FSB behaves as before.
- `run_task` and its verify (Phase 70), Jev (Phases 67/68), and the settings tool itself (Phase 66.1).
- Any other new tool, any other new parameter, server `instructions`, and tool `annotations`.
- Live host runs, exact per-model token counts, version bumps and publishing. These belong to the Validation Block (see D-03).
</domain>

<decisions>
## Implementation Decisions

### Scope, tool count and validation policy

- **D-01: Change footprint.**
  - **`mcp/src`.** Changes are limited to:
    - one new MCP description module under `mcp/src/tools/`, and the registration sites that apply it: `schema-bridge.ts`, `manual.ts`, `read-only.ts`, and the inline descriptions of the 18 tools defined only in `mcp/src/tools/*.ts`;
    - the `expect` field and its sidecar in `manual.ts` and in `agents.ts` (`back`);
    - the unknown-outcome branch of `mcp/src/errors.ts`.
  - **Build files.** None of these sources compiles to one of the six force-tracked build files (`config-writer.js`, `index.js`, `install.js`, `platforms.js`, `version.js`, `version.d.ts`), so no build-file commit is expected. If a plan does touch one of those sources, it rebuilds the file and commits it in the same commit.
  - **Extension.** Changes are limited to:
    - the evaluator in `extension/utils/action-verification.js`;
    - the gate refactor in `wrapWithChangeReport`;
    - the `mcp:go-back` route;
    - the sidecar key lists;
    - the change-report harvest's input capture, the stop serialiser's masking of `value` attribute records, and the `inputs_changed` and `attrs_changed` masking in `buildChangeReport` (D-25).
  - **Not changed:**
    - the registry;
    - `importScripts` lines (the pins stay at 334 tokens and 330 calls in `tests/lattice-provider-bridge-smoke.test.js:635-636`);
    - content-script files;
    - the manifest;
    - the MCP prompt's tool table (`mcp/src/prompts/index.ts`, "FSB Tool Reference (49 tools)", pinned by `tests/mcp-version-parity.test.js:335`);
    - `fsb://config`.

    66.1 D-21 already freezes the last two, and they are not part of `tools/list`.
- **D-02: Tool count. There are 72 tools at `8a058bdf`, not 73.**
  - **Measurements.** The count was measured twice. The analyzer built a temp copy of the pin. On 2026-10-15 the orchestrator ran HEAD's `mcp/build` through an SDK `Client` over `InMemoryTransport`; `mcp/src` and the registry have zero diff since the pin.
  - **Baseline figures:**
    - 72 tools;
    - 54,024 description characters;
    - 34,217 parameter-description characters;
    - about 121.4 KB of `tools/list` JSON.
  - **How 72 arises.** The registry has 57 entries, including the 4 trigger tools:
    - 3 are never registered: `wait_for_element`, `wait_for_stable` and `report_progress` have no `MESSAGE_TYPE_MAP` builder (`mcp/src/tools/read-only.ts:114-122`).
    - The other 54, including all 4 trigger tools, reach MCP.
    - 18 more tools exist only in `mcp/src`, for 72 in total. They are:
      - `start_visual_session`, `end_visual_session`;
      - `list_sessions`, `get_session_detail`, `get_session_replay`, `replay_session`;
      - `get_logs`, `get_memory_stats`;
      - `back`;
      - `list_credentials`, `fill_credential`, `list_payment_methods`, `use_payment_method`;
      - `search_capabilities`, `invoke_capability`;
      - `run_task`, `stop_task`, `get_task_status`.

      The orchestrator verified this split against the live runtime on 2026-10-15.
  - **After Phase 66.1** the count is 73.
  - **Miscounts.** "73" in MCP-01, ROADMAP SC1 and PROJECT.md is a miscount, and so is "74 total" in the phase brief.
  - **Rules:**
    - Checks always count tools from the live runtime and never hardcode 72, 73 or 74.
    - The phase's final plan includes a doc-only wording fix: "the 72 tools at `8a058bdf`, 73 with the Phase 66.1 settings tool".
    - The verifier reads SC1's "all 73" as all 72 baseline tools plus the settings tool, each held to the same cap.
- **D-03: Validation deferral, restated for this phase.** The owner's direction of 2026-10-15 is in `.planning/STATE.md` → "### Decisions" → "v1.0.0-specific decisions".
  - Every Phase 69 plan is `autonomous: true` and has no `checkpoint:*` tasks.
  - Anything that needs the operator, a live host or account, a credential, production, spend or a human eye is not a task. Each such item goes, with its Validation Block id, into the "Manual-Only Verifications" table of `69-VALIDATION.md` and into the `<verification>`/`<output>` text of the plan that owns it.
  - Nothing from this phase is pushed to `origin/main` or any other remote before V6.
  - Mapping of success criteria to the Validation Block:

    | Success criterion | Proven automatically in Phase 69 | Deferred items |
    | --- | --- | --- |
    | SC1: descriptions and token check | budget gate against the frozen fixture, must-keep table, per-tool cap | **V4:** exact `count_tokens` figures for the baseline list and the new list on the pinned host model(s); whether shorter descriptions change caller error rate, turns and wall time in the MCP arm. **V5:** human read-through of the shortened descriptions. |
    | SC2: `expect` with three states | fake-bridge evaluator tests and the headless Chrome fixture page | **V4:** calibrate the uncalibrated timing constants (D-20) from comparative-run data. **V5:** sanity-check verdicts on real sites (SPA updates, cross-origin navigation, slow pages). |
    | SC3: byte-stability without `expect` | fully automated (D-22) | **V6:** the MCP minor-version publish and the release compatibility check (Phase 71). |
    | SC4: act and read in one call | in-process SDK caller test with a fake bridge (D-23) | **V5:** a live demonstration with a real MCP host (Claude Code) acting and reading the effect without a follow-up call. **V4:** the turn reduction measured on the comparative corpus. |
    | V1, V2, V3 | none | Not applicable. The tool-list baseline is code at the pin, measured automatically, and Phase 69 makes no Jev calls. |

### Baseline measurement and budget gate (SC1)

- **D-04: Freeze the baseline into a committed fixture.**
  - **How it is made.** A script runs `git archive 8a058bdf`, builds that copy with `tsc` in a temp directory, using `mcp/node_modules` (SDK 1.29.0, zod 3.25.76). It then reads the in-process `tools/list` through `createRuntime()` with an SDK `Client` over `InMemoryTransport`.
  - **What is committed:**
    - the full canonical `tools/list` payload (about 121 KB);
    - a header with the source commit, SDK and zod versions, the generation command, and a sha256.
  - Both the budget gate (D-06) and the shape freeze (D-22) derive from this one artifact.
  - **Regeneration.** The script also re-checks the fixture byte for byte whenever git history is available.
  - **The test never touches git history.** CI's `actions/checkout@v4` in `.github/workflows/ci.yml` has no `fetch-depth`, so `8a058bdf` is missing from CI clones.
  - **Precedents:**
    - `canonicalJson` and `toolsListDigest` in `scripts/bench/lib/identity.mjs:70-92`;
    - lazy SDK loading in `scripts/bench/lib/mcp-client.mjs`.
- **D-05: Units.** The report gives:
  - canonical-JSON bytes;
  - tool-description characters;
  - parameter-description characters;
  - estimated tokens, calculated as `ceil(chars/4)` and labelled "estimate". The same rule is in `extension/ai/transcript-store.js:32-51`.

  No tokenizer dependency is added (Phase 66 D-13). Exact per-model counts go to V4 (D-03, and External Research 3 in the discussion log).
- **D-06: The check is a gate, not just a report.** It runs in `npm test` against the current `mcp/build`. It must pass:
  - **Characters:** at least 50% fewer description plus parameter-description characters across the 72 baseline tool names. The count includes the characters of `expect`'s own description wherever `expect` appears.
  - **Whole list:** at least 20% fewer canonical `tools/list` bytes across the 72 baseline tools. The count includes all `expect` schema scaffolding. This floor stops `expect` (D-13) from eating the savings.
  - **Per tool:** at most 2,048 characters for every tool description. This applies to all tools: the 72 baseline tools, the Phase 66.1 settings tool, and the 18 tools in `mcp/src`.

  The report also:
  - shows the settings tool on its own line;
  - states whether PROJECT.md's target "tool-list tokens cut by more than half" is met on the whole-list estimate. It reports a miss honestly and does not gate on it, because the schema scaffolding is frozen by MCP-04.

  Measured context: about 33 KB of the baseline is non-description scaffolding, so the list can shrink by at most about 73% even with every description removed.

### Where the short text lives and what must survive (SC1)

- **D-07: MCP-only text lives in one MCP-side module (option b). The registry is untouched.**
  - **The module.** One module under `mcp/src/tools/` maps each tool name to its short description. It also supplies short descriptions for the common parameters (`tab_id`, `visual_reason`, `client`, `is_final`) and for per-tool parameters.
  - **How it is applied.** The text is applied at registration. `jsonSchemaToZod` accepts a description override, so only `.describe()` text changes; types, required lists, defaults and enums are untouched.
  - **Proof for autopilot.** `extension/ai/tool-definitions.js` and its copy `mcp/ai/tool-definitions.cjs` stay byte-identical to the pin. All four `EXPECTED_NON_TRIGGER_REGISTRY_HASH` pins stay unchanged and become the proof that autopilot prompts did not move:
    - `tests/tool-definitions-parity.test.js:52`
    - `tests/capability-mcp-surface.test.js:59`
    - `tests/capability-autopilot-parity.test.js:43`
    - `tests/recipe-schema-lock.test.js:45`
  - **Why not option (a).** The analyzer recommended option (a): MCP-only fields inside the registry. This decision overrides it for three reasons:
    - The MCP server serves its build-time copy of the registry, so new text reaches callers only through an MCP package release either way. Keeping the text in the extension registry moves no work into the extension.
    - Option (a) would re-baseline four hash tripwires that exist to lock the registry.
    - Option (a) would ship MCP-only prose inside the extension bundle.
  - **Precedents for MCP-only text in `mcp/src`:**
    - `CHANGE_REPORT_DESCRIPTION_SUFFIX` (`mcp/src/tools/manual.ts:27-28`);
    - the comment in `capabilities.ts` about keeping the registry byte-stable;
    - Phase 66.1 SC5 (an MCP-only tool; the autopilot list is unchanged).
  - **Owner direction.** Descriptions are part of the MCP tool schema, so editing them in `mcp/src` is within "touch `mcp/src` only where a tool schema must change". Option (c), editing the shared registry, is rejected: it would change autopilot prompts with Jev off.
- **D-08: Coverage and drift test.**
  - Every tool the MCP runtime registers from the registry has an entry in the MCP description module, so no long registry text falls through to MCP.
  - The module has no orphan keys.
  - The settings tool and the 18 tools defined in `mcp/src` are covered too.
  - Any later registry edit trips the four hash pins, which signals that the MCP text needs review.
- **D-09: Writing rules.**
  - **Search terms first.** The first sentence carries the tool's search terms. Claude Code's tool search matches only against the start of a description (External Research 2).
  - **Deduplicate, don't delete:**
    - The multi-agent rule and the `TAB_NOT_OWNED` rule are written once, in the short `tab_id` parameter description.
    - The `client` description names the common labels from the 25-label allowlist (`mcp/src/tools/visual-session.ts:9-15`) and says matching ignores case, spaces, `_` and `-`. It must not point at a source file, as it does today (`extension/ai/tool-definitions.js:41-44`).
    - `CHANGE_REPORT_DESCRIPTION_SUFFIX` shrinks to one sentence.
  - **Typed error codes.** Lists of typed error codes stay only where a caller must branch on them.
- **D-10: An automated must-keep table proves the guidance survived.** A curated table in a test asserts that each guidance item still appears in the right tool or parameter description, by key phrase. The minimum entries are:

  | Guidance that must survive | Where it must appear |
  | --- | --- |
  | `close_tab` refuses the active tab unless `allow_active` is set | `close_tab` |
  | A confirmation prompt is shown before payment | `use_payment_method` |
  | Secrets resolve inside the extension | vault tools |
  | `select_option` handles native selects only; custom dropdowns take two clicks | `select_option` |
  | When to fall back to native tools | `execute_js` |
  | Real side effects are performed | `invoke_capability` |
  | An unknown or `unmet` outcome means inspect before retrying | the change-report sentence and the `expect` description |
  | The accepted client labels | `client` |
  | Calls to tabs the agent does not own are rejected with `TAB_NOT_OWNED` | `tab_id` |

  The table lives in the budget or must-keep test. A human read-through is V5. Moving rules into server `instructions` is rejected for this phase (D-11, Deferred).

### `expect` on the wire (SC2, MCP-04)

- **D-11: `expect` is MCP-only.**
  - It is added as an extra zod shape key at registration, for the supported tools only, in `mcp/src/tools/manual.ts` and in `agents.ts` for `back`.
  - It is never added to the registry `inputSchema`. That would leak it to autopilot through `getPublicTools` (`extension/ai/agent-loop.js:708-714`) and move the registry hash.
  - It does not go through `jsonSchemaToZod`, which has no object branch (`schema-bridge.ts:86-114`, where `default` falls to `z.any()`).
  - No server `instructions` and no tool `annotations` are added (External Research 4).
- **D-12: Supported tools. The set is fixed at 29 tools.**
  - **Interaction tools.** These 24 tools already run through `wrapWithChangeReport`:

    | Group | Tools |
    | --- | --- |
    | Script | `execute_js` |
    | Clicks | `click`, `right_click`, `double_click`, `click_at`, `double_click_at`, `click_and_hold` |
    | Typing and keys | `type_text`, `insert_text`, `press_enter`, `press_key`, `clear_input` |
    | Form controls | `select_option`, `check_box`, `set_attribute` |
    | Drag, drop and files | `drag_drop`, `drag`, `drag_variable_speed`, `drop_file`, `upload_file` |
    | Selection and scrolling | `select_text_range`, `scroll_to_top`, `scroll_to_bottom`, `scroll_to_element` |

  - **Navigation tools:** `navigate`, `go_back`, `go_forward`, `refresh` and `back`.
  - **Excluded, with reasons:**

    | Tool(s) | Reason |
    | --- | --- |
    | `open_tab`, `close_tab` | Synthetic change reports (`MCP_DISPATCHER_SYNTHETIC_CHANGE_REPORT_TOOLS`, `extension/ws/mcp-bridge-client.js:62`) |
    | `switch_tab` | Tab-level effect |
    | `search`, `hover`, `focus`, `scroll`, `scroll_at` | No change report |
    | `fill_sheet` | Runs up to 150 s |
    | `trigger` | Has its own condition engine |
    | Vault and payment tools | Gated on confirmation |
    | `run_task` | Belongs to Phase 70 |

  - **One list, mirrored.** The list is a single frozen constant, mirrored on the MCP side and the extension side, and a parity test checks the mirrors (gotcha 6).
- **D-13: Shape. `expect` is one optional, flat, closed object.**
  - **Fields:**
    - `url_includes` (string);
    - `title_includes` (string);
    - `text_visible` (string);
    - `text_gone` (string);
    - `selector` (string);
    - `state`: one of `visible`, `gone`, `checked`, `unchecked`;
    - `value` (string);
    - `dialog_open` (boolean);
    - `timeout_ms` (integer).
  - **Field rules:**
    - `state` and `value` apply to `selector`. A `selector` with neither means `state: visible`.
    - At least one predicate is required. An empty `{}` is rejected rather than silently "verified".
    - Matching is by substring or equality only. Callers cannot send regular expressions.
    - `checked` reuses the toggle-state signals already in `extension/content/actions.js:2604-2609`: native checked, `aria-checked`, `aria-pressed`, `aria-selected`, `data-state`, and open state.
  - **Schema constraints:**
    - `additionalProperties:false`.
    - One description, on `expect` itself, of about 160 characters or fewer. No descriptions on sub-properties.
    - No `$ref`/`$defs`, and no `anyOf`/`oneOf`.
    - `timeout_ms` uses the coerced `z.preprocess(... z.coerce.number().int().finite())` form, so the A11 source-grep guard in `tests/mcp-numeric-param-coercion.test.js:249-286` passes.
  - **Size cap.** The budget gate asserts that the published `expect` property is at most 600 bytes of canonical JSON per tool. Measured on 2026-10-15:
    - this flat layout costs 559 bytes per tool (about 16 KB over 29 tools);
    - a nested `value_equals`/`checked` layout costs 829 bytes (about 24 KB), which would break D-06's whole-list floor.
  - **Changing field names.** The planner may rename a field only with a recorded reason, and only while keeping the capability list and the byte cap.
- **D-14: Accept `expect` sent as a JSON string as well as an object.**
  - A `z.preprocess` step parses a string whose trimmed first character is `{`, then validates it against the same closed object.
  - The published JSON Schema stays `type: object` with `additionalProperties:false`. This was verified: `z.preprocess` publishes the inner schema.
  - Precedent: `parseTriggerConditionIfStringified` in `mcp/src/tools/triggers.ts:63-81`.
  - Reason: hosts have repeatedly regressed into stringifying object arguments (External Research 1).
- **D-15: Transport as a sidecar.**
  - The MCP server removes `expect` from the caller's params before `PARAM_TRANSFORMS` run (`schema-bridge.ts:152-198`). Those transforms rebuild params from scratch for `press_key`, `drag_drop`, `click_at`, `drag` and `fill_sheet`, and Phase 246 hit the same problem with `tab_id`.
  - `expect` travels as a top-level `expect` field on the bridge payload, like `visualSession` (`manual.ts:199-210`).
  - When `expect` is absent, no key is added, so the payload is byte-identical to today's.
  - `expect` never enters `params`, so content tools and replay manifests see unchanged params.
  - These sidecar mirrors are updated together, and the parity test is extended:
    - `INTERNAL_PAYLOAD_KEYS` (`extension/utils/mcp-lattice-journal.js:44-48`);
    - the recorder's key list (`extension/utils/mcp-session-recorder.js:686-689`);
    - `RECORDING_SIDECAR_FIELDS`-style checks (`tests/mcp-tool-smoke.test.js:58`).
- **D-16: Malformed `expect` fails before dispatch.** An unknown key, a wrong type, or an empty object is a validation error. It never reaches the bridge or the queue, so no side effect happens. This matches the `VISUAL_FIELDS_REQUIRED` rejection precedent.

### Same-call evaluation in the extension (SC2)

- **D-17: Evaluation happens inside `wrapWithChangeReport`, with the gate refactored** (`extension/ws/mcp-tool-dispatcher.js:4437-4475`). `_handleExecuteAction` passes the payload's top-level `expect` into the wrapper context.
  - **Without `expect`:** today's path is unchanged. That covers the early return at `:4452-4455`, injection count and order, and the rule that the Action Change Reports toggle off means zero injections. `tests/change-report-toggle.test.js` and `tests/change-report-dispatcher.test.js` must pass unmodified.
  - **With `expect`:**
    - The harvest still runs only when it would run today.
    - `expect` is evaluated after `execute()` regardless of the toggle or the tool's `_emitChangeReport` flag.
    - For navigation tools, it is evaluated after the navigation commits. `navigate` waits only for the commit (`mcp-tool-dispatcher.js:1430`).
  - **`back`:** the `mcp:go-back` route (`handleBackRoute`, dispatcher around line 1697) calls the same evaluator after its own settle. When history exists and `expect` is present, it subscribes the main-frame commit watcher before `chrome.tabs.goBack`, because `waitForBackSettle` can return on its 2 s timeout before the new document commits (planner, plan-checker round 2, 2026-10-15).
- **D-18: How the page is probed.**
  - **URL and title.** `url_includes` and `title_includes` read `chrome.tabs.get(tabId)`, with no injection, so they stay observable across cross-origin and restricted transitions.
  - **DOM predicates.** These use self-contained functions injected in the **ISOLATED** world, the default for `chrome.scripting.executeScript`, so page scripts cannot spoof them. Today `_injectFn` hardcodes `MAIN` (`:4398-4403`). A world option or a sibling helper is added, and existing MAIN calls keep their behavior.
  - **Where the logic lives.** The pure evaluation logic and the probe functions go in `extension/utils/action-verification.js`. That file is service-worker-only and is already loaded at `extension/background.js:80`.
  - **Reuse later.** Phase 68's done checks and Phase 70's `run_task` verify can reuse the module.
- **D-19: Result contract.** The result is an additive `expect_result` field on the extension result:
  - **Shape:** `{ status, checks: [{ kind, expected, observed, status }], waited_ms, timeout_ms }`, where `status` is `verified`, `unmet` or `uncertain`.
  - **Per check:**
    - **met:** the predicate held.
    - **unmet:** the check was observable at the final evaluation, and the predicate was false.
    - **uncertain:** the check could not be observed. Causes include a restricted page, an injection failure or timeout, a closed tab, an unresponsive page, and a cross-origin page for DOM checks.
  - **Overall:** `verified` if every check is met; otherwise `unmet` if any check is unmet; otherwise `uncertain`.
  - **`success` is unchanged.** It still means "the action ran".
  - **When `expect_result` appears.** It is added only when the action result is `success:true` or `mayHaveExecuted:true`. A definitive pre-execution failure (element not found, ownership, tab resolution) has no `expect_result` key, so error shapes are unchanged.
  - **Redaction and bounds:**
    - `observed` strings are capped at about 120 characters.
    - The values of password inputs, hidden inputs and vault-filled fields are never echoed; a redaction marker is used instead.
- **D-20: Time bound.**
  - The default `timeout_ms` is 2,000. The cap is 5,000.
  - Values outside `[0, 5000]` are clamped, not rejected, and the value actually used is reported in `expect_result.timeout_ms`. `0` means one immediate check.
  - Evaluation starts after the action's own settle and returns as soon as every check is met.
  - The constants are named, and commented as uncalibrated, pending V4.
  - **Limits.** The worst case adds the cap plus one probe timeout. The 750 ms `_PAGE_INJECTION_TIMEOUT_MS` is measured at `mcp-tool-dispatcher.js:4121`, not the 450 ms the analyzer cited. That keeps a call well inside:
    - the 30 s MCP action timeout (`manual.ts:179-180`);
    - `back`'s own timeout.
  - **Content-delivery deadline.** The 12 s content-delivery deadline (`mcp-bridge-client.js:1608`) covers only the action's delivery. Evaluation runs afterwards in the service worker.
  - **Queue.** The `TaskQueue` mutation lock is held for this bounded time and no longer.
- **D-21: The unknown-outcome path carries `expect_result`.**
  - **Where.** This is the `mayHaveExecuted` branch of `mapFSBError` (`mcp/src/errors.ts:456-472`).
  - **Trailing JSON.** When `expect_result` is present, the trailing JSON becomes `{"outcome":"unknown","mayHaveExecuted":true,"expect_result":{...}}`.
  - **"Next action" line:**
    - **`verified`:** it states that the expected effect was observed and the action must not be repeated.
    - **`unmet` or `uncertain`:** the existing text is kept.
  - **Unchanged:**
    - `isError` stays `true`, preserving the 2026-09-30 single-activation semantics;
    - without `expect`, the output is byte-identical, including the existing texts pinned by `tests/mcp-recovery-messaging.test.js:176-179`.
  - **Success responses** already serialize the result verbatim (`errors.ts:452-454`), so they need no change.

### Proof (SC3, SC4) and test discipline

- **D-22: SC3 contract tests.**
  - **Shape freeze.** A shape-only projection of the current `tools/list` is compared with the projection of the frozen fixture. The projection covers:
    - names;
    - property names and types;
    - required lists;
    - defaults;
    - enums;
    - `additionalProperties` and `$schema`.

    Descriptions are excluded.
  - **Allowed differences.** Exactly two kinds:
    - the `expect` property on the 29 tools from D-12;
    - the one Phase 66.1 tool, `settings` (66.1 D-03). Tests identify it by name, never by a total count.

    Any other drift fails.
  - **Migrating the 66.1 freeze.** Phase 66.1 D-21 adds a contract test that compares the built `tools/list`, minus `settings`, against `8a058bdf` on name, description and `inputSchema` for all 72 tools. Phase 69 changes descriptions on purpose. So in the same commit that first shortens any MCP description, that test changes as follows:
    - Its description equality (top-level descriptions, and the descriptions inside `inputSchema.properties`) is replaced by this phase's shape projection, the budget gate (D-06) and the must-keep table (D-10).
    - Its name equality and shape equality stay.
    - Its "minus `settings`" rule stays.

    Its other D-21 freezes are kept unchanged: `TOOL_REGISTRY`, the prompt table and `fsb://config`.
  - **Call-level checks, with `expect` omitted:**
    1. The bridge payload deep-equals today's for representative tools, including all five `PARAM_TRANSFORMS` tools and `back`. This uses the harness in `tests/mcp-smoke-harness.js` and `invokeTool` in `tests/mcp-tool-smoke.test.js`.
    2. `mapFSBError` output is byte-identical for canned success, unknown-outcome and error results.
    3. On the extension side, responses have no `expect_result` key and injection counts are unchanged.
- **D-23: SC4 caller proof, in two layers.**
  - **Layer 1: in-process caller, never skipped, no ports.**
    - **Setup.** An SDK `Client` over `InMemoryTransport` drives `createRuntime({ bridge: fakeBridge })` from `mcp/build`. The fake bridge answers `mcp:execute-action` and `mcp:go-back` by running the real evaluator, loaded from `extension/utils/action-verification.js` through its `module.exports` guard, against canned page probes.
    - **Scenarios:**
      1. `click` with `expect.text_visible` returns `verified`, and the caller transcript has exactly one `tools/call`.
      2. `navigate` with `url_includes` returns `verified`.
      3. An unknown-outcome click with `expect` returns `isError:true`, the trailing JSON contains `expect_result` `verified`, and the "Next action" line says not to repeat.
      4. The `unmet` and `uncertain` paths.
      5. `expect` sent as a JSON string is accepted.
      6. A call without `expect` has no `expect` key in the bridge payload and returns the baseline response bytes.
  - **Layer 2: headless Chrome, skipped when Chrome is absent.**
    - **Setup.** A new fixture page under `tests/fixtures/` uses the CDP-backed `chrome.scripting` mapping from `tests/browser-editing-actions.test.mjs:40-140`.
    - **What it exercises:**
      - text present and absent;
      - selector state;
      - `checked`, `aria-pressed` and `data-state`;
      - the `value` check, including password redaction;
      - dialogs;
      - a delayed DOM change, to cover the wait.
    - **Not the sole proof.** It cannot be the only proof because it skips when Chrome is absent (`:146`).
  - **Frozen fixtures.** The bench core fixtures stay untouched (`scripts/bench/tasks/core.lock.json` is frozen through Phase 71).
- **D-24: Test wiring and tripwires.**
  - **The `npm test` chain.**
    - Each new test command goes into the root `test` chain after `npm --prefix mcp run build`.
    - In the same commit, each command is appended to `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js:129`), exactly once. The `PRE_PHASE6x` hashes are never edited.
  - **How tests load and run.**
    - Tests import `mcp/build` behind the build-staleness guard pattern in `tests/visual-session-schema-lock.test.js:165-166`.
    - Tests are safe on Node 20: no global `WebSocket`; fall back to `mcp/node_modules/ws`.
    - No test binds port 7225 or 7226.
  - **Before editing a file, grep the tests that pin it.** Pins found on 2026-10-15:

    | File | Tests that reference it |
    | --- | --- |
    | `extension/ws/mcp-tool-dispatcher.js` | 38 |
    | `extension/utils/action-verification.js` | 6 |
    | `mcp/src/tools/visual-session.ts` | 4 |
    | `mcp/src/tools/manual.ts` | 3 |
    | `mcp/src/tools/agents.ts` | 3 |
    | `mcp/src/tools/schema-bridge.ts` | 2 |
    | `mcp/src/errors.ts` | 1 |

  - **Same-commit updates.** Any pin that legitimately moves is updated in the same commit, and the full suite stays green from the phase's first commit.
  - **Hygiene:**
    - `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` are restored after full runs, never committed.
    - No AI attribution goes in commits.

### Security exception to MCP-04

- **D-25: Sensitive input values in `change_report.inputs_changed` and in the `value` entries of `change_report.attrs_changed` are redacted (owner-level security decision, made by the orchestrator on 2026-10-15; extended to `attrs_changed` the same day).**
  - **Problem (RESEARCH Finding 17).** The change-report harvest records `inp.value` for every input, password fields included. This happens in `extension/ws/mcp-tool-dispatcher.js` `_fsbHarvestStartInPage` and `_fsbHarvestStopInPage`, at about lines 4158-4163 and 4255. `buildChangeReport` (`extension/utils/action-verification.js:558-590`) then echoes the value in `change_report.inputs_changed` to the MCP caller, which is an LLM.
  - **Second channel (found in plan review, 2026-10-15).** The harvest observes attributes with `attributeOldValue: true` (`mcp-tool-dispatcher.js:4209`). `_fsbHarvestStopInPage` serialises `rec.oldValue` unfiltered (`:4322`), and `buildChangeReport` copies it into `attrs_changed[].before` (`action-verification.js:539-551`). Two common cases carry raw secrets there. React-controlled password inputs sync the `value` content attribute on every change, so typing leaks prefixes and a later clear or submit leaks the full value. Hidden inputs reflect `.value` to the content attribute (the HTML "default" value mode), so rotating a CSRF token leaks the old token. Redacting only `inputs_changed` would leave the "raw values never leave the page" claim false.
  - **Decision.** Fix it in this phase (plan 69-03, Task 3) instead of leaving it as a Validation Block note.
    - **Predicate.** The same one the `expect` evaluator uses (`isRedactedField`, D-19), applied to:
      - `input` type `password` or `hidden`;
      - autocomplete `current-password`, `new-password`, `one-time-code`, or any `cc-` token;
      - a name, id or autocomplete matching the sensitive-name pattern (password, passcode, pwd, cvv, cvc, card number, security code, one-time code, otp).
      - The short terms (otp, pwd, cvv, cvc, cc number) are boundary-aware: no letter may stand on either side, after a camelCase word split. So `otp-code`, `otpCode` and `userPwd` are sensitive, while ordinary ids such as `footprint`, `hotpot` and `notpad` are not and keep today's bytes. Run-together lowercase ids such as `otpcode` are not caught by the name rule; the type and autocomplete rules still apply.
    - **Vault-filled fields** are covered where they can be detected. Credential fills land in password fields, and payment fills land in `cc-*` or card-like fields. No vault-filled marker exists, and content scripts stay frozen (D-01), so nothing else can be detected.
    - **Marker.** For a sensitive field, each side of an `inputs_changed` entry is the fixed marker `[redacted]` when the value is non-empty, and `''` when it is empty. This is the evaluator's `EXPECT_REDACTED`, so callers see one marker.
    - **Value-attribute records (`attrs_changed`).** For an `attributes` mutation record whose `attributeName` is `value` and whose target passes the same predicate, both `before` and `after` of its `attrs_changed` entry follow the same rule: `[redacted]` when non-empty, `''` when empty, `null` when absent. The page serialiser masks `oldValue` and flags the record `valueRedacted: true`. The flag exists only on the page-to-service-worker hop and never reaches the caller. Records for other attributes, and `value` records on non-sensitive inputs, are unchanged.
    - **Change detection.** A changed secret is still reported as changed. Raw values never leave the page: the comparison runs on the page-side harvest handle, which is deleted at stop or expiry as today.
    - **Defence in depth.** `buildChangeReport` masks the listed keys again. It also masks both sides of any `value` record that is flagged, or whose target id is a listed sensitive key.
  - **Scope of the exception.**
    - This is the only intentional change to an existing response shape in Phase 69.
    - The keys and structure of `change_report` stay the same; only the values of sensitive entries change: sensitive `inputs_changed` entries and the `value` entries of `attrs_changed` for sensitive inputs.
    - Non-sensitive inputs and every other byte of `change_report` stay as today, and the six existing change-report suites pass unmodified.
    - The exception is recorded in the contract test `tests/change-report-redaction.test.js` (its header and a check named "MCP-04 security exception (CONTEXT D-25)") and in `69-VALIDATION.md` row MCP-04-g.
  - **Effect on recordings.** Session recordings and the journal store responses, so they stop holding these values too.

### Claude's Discretion
- File names and locations for:
  - the MCP description module;
  - the budget script;
  - the baseline fixture;
  - the new tests;
  - the fixture page.
- The exact short wording of each description, within D-09, D-10 and the 2,048-character cap.
- How the evaluator polls:
  - one in-page polling injection, or repeated probes;
  - the poll interval;
  - text normalization (for example, case-insensitive matching with collapsed whitespace for text and title);
  - the maximum amount of page text scanned;
  - how to re-probe after a mid-wait navigation.
- Whether `selector` accepts FSB element refs as well as CSS. Only allow refs if the ref resolver is reachable from the ISOLATED world without a new content-script file. Otherwise allow CSS only, and say so in the `expect` description.
- Whether `expect` and `expect_result` are kept, bounded and redacted, as session-journal metadata for diagnosis. Replayable params must never contain them.
- User-facing docs:
  - Documenting `expect` and any tool counts in `mcp/README.md`, `skills/fsb/` and the showcase follows 66.1 D-22: it moves with the Phase 71 release (V6), not this phase.
  - The pinned doc counts in `tests/mcp-version-parity.test.js:327-335` stay unchanged.
  - Only the planning-doc wording fix in D-02 lands here.
- How to split plans into waves. Suggested order:
  1. The baseline fixture, budget gate and shape freeze.
  2. The descriptions.
  3. The `expect` wire and the evaluator.
  4. The caller tests and the doc-count wording fix.

### Folded Todos
None.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope, requirements and policy
- `.planning/ROADMAP.md`: the Phase 69 goal and success criteria, plus the Phase 70/71 dependencies on the additive contract gate.
- `.planning/REQUIREMENTS.md`: MCP-01, MCP-02, MCP-04 (`expect` and the settings tool are the only additions), and SET-02 (the autopilot tool list is unchanged).
- `.planning/STATE.md`:
  - "v1.0.0-specific decisions", which defines Validation Block V1-V6 and says the Phase 66 baseline is `8a058bdf`;
  - the INV-01 byte-freeze rule.
- `.planning/PROJECT.md`:
  - the MCP tool-surface facts;
  - the target "tool-list tokens cut by more than half";
  - the rule that with Jev off, FSB behaves as before.
- `.planning/phases/66-baseline-and-session-timing/66-CONTEXT.md`:
  - D-01 and D-02 (minimal MCP diff; additive only);
  - D-18 (the tool-list digest is part of run identity).
- `.planning/phases/66-baseline-and-session-timing/66-VALIDATION.md`: the format to follow for `69-VALIDATION.md` and its "Manual-Only Verifications" table.
- `.planning/phases/66.1-mcp-settings-tool/66.1-CONTEXT.md` and the 66.1 plans and summaries. This phase runs after 66.1. The relevant 66.1 decisions are:
  - D-02 and D-03: the `settings` tool in `mcp/src/tools/settings.ts`, kept out of `TOOL_REGISTRY`, with a description of about 200 characters or less;
  - D-21: the `tools/list` freeze test that Phase 69 migrates (see D-22);
  - D-22: doc counts move with Phase 71.

### Research (v1.0.0; it uses an older phase numbering, so match sections by content)
- `.planning/research/SUMMARY.md`:
  - the description budget (no description over 2,048 characters);
  - the "72 vs 73" note;
  - Pitfalls 10-12: the description diet deletes contract text; hosts already defer descriptions; an `expect` that checks nothing.
- `.planning/research/FEATURES.md`: "`expect` on action tools" and "What stays in a tool description and what moves".
- `.planning/research/ARCHITECTURE.md`: section 4, the `expect` path end to end, and the tripwire register.
  - **Superseded by D-07 and D-11:** registry-level `withExpectField()`, the autopilot strip, and the plan to re-baseline the registry hash.
  - Its list of three hash pins misses `recipe-schema-lock`.
- `.planning/research/PITFALLS.md` and `.planning/research/STACK.md`: host truncation and tool-loading notes.

### Code: MCP side
- `mcp/src/runtime.ts:33-60`: `createRuntime`, the order tools are registered, and the injectable `bridge`.
- `mcp/src/tools/manual.ts`:
  - `CHANGE_REPORT_DESCRIPTION_SUFFIX` at `:27-28`;
  - the action timeout at `:179-180`;
  - the `visualSession` sidecar at `:199-210`;
  - registration at `:250-265`.
- `mcp/src/tools/schema-bridge.ts`: `jsonSchemaToZod` at `:80-120` and `PARAM_TRANSFORMS` at `:145-198`.
- `mcp/src/tools/read-only.ts:110-125`: tools that have no builder are skipped.
- `mcp/src/tools/agents.ts:28-55`: `back` and its inline description.
- `mcp/src/tools/visual-session.ts:9-38`: the client label allowlist.
- The other inline-described tools: `mcp/src/tools/vault.ts`, `autopilot.ts`, `observability.ts`, `capabilities.ts`, `screenshots.ts`, `triggers.ts`. `triggers.ts:63-81` holds the stringified-object precedent.
- `mcp/src/errors.ts:448-472`: `mapFSBError`, the success passthrough and the unknown-outcome branch.

### Code: extension side
- `extension/ai/tool-definitions.js`: read-only reference. It must not change. `VISUAL_SESSION_FIELDS` is at `:36-49`.
- `extension/ai/agent-loop.js:708-714`: `getPublicTools`, which is why nothing MCP-only may enter the registry.
- `extension/ws/mcp-tool-dispatcher.js`:
  - `wrapWithChangeReport` at `:4437-4520`;
  - `_fsbWaitStableInPage` at `:4337`;
  - `_injectFn`, which uses the MAIN world, at `:4394-4410`;
  - the constants at `:4120-4121`;
  - the `mcp:go-back` route at `:149` and around `:1697`;
  - `navigate`, which waits for the commit, at `:1430`.
- `extension/ws/mcp-bridge-client.js`:
  - the synthetic change-report set at `:62`;
  - the content-delivery deadline at `:1608`;
  - the `_handleExecuteAction` wrapper call at `:2184-2235`.
- `extension/utils/action-verification.js`: `buildChangeReport` and the cross-origin branch at `:474-498`. This is where the evaluator goes.
- `extension/content/actions.js`:
  - the unknown outcome with no second click at `:205-238`;
  - the toggle-state signals and the click effect rules at `:2598-2665`.
- `extension/utils/mcp-lattice-journal.js:44-48` and `extension/utils/mcp-session-recorder.js:684-692`: the sidecar strip lists.
- `extension/background.js:80`: `action-verification.js` is already loaded.

### Tests and tooling
- Registry hash pins, which must stay unchanged: `tests/tool-definitions-parity.test.js:52`, `tests/capability-mcp-surface.test.js:59`, `tests/capability-autopilot-parity.test.js:43`, `tests/recipe-schema-lock.test.js:45`.
- `tests/mcp-numeric-param-coercion.test.js:249-286`: the A11 guard against bare `z.number(`.
- `tests/visual-session-schema-lock.test.js`: field presence, plus the build-staleness guard at `:165-166`.
- `tests/change-report-toggle.test.js` and `tests/change-report-dispatcher.test.js`: injection counts.
- `tests/mcp-smoke-harness.js` and `tests/mcp-tool-smoke.test.js`: `invokeTool` and `RECORDING_SIDECAR_FIELDS` at `:58`.
- `tests/mcp-recovery-messaging.test.js:176-179`: the unknown-outcome text.
- `tests/content-click-single-activation.test.js`: the single-activation rule.
- `tests/browser-editing-actions.test.mjs:40-146`: the headless Chrome fixture pattern.
- `tests/delegation-phase-contract.test.js:129,2378-2400`: `REFINEMENT_ROOT_TEST_COMMANDS`.
- `tests/lattice-provider-bridge-smoke.test.js:635-636`: the `importScripts` pins (334 and 330).
- `tests/mcp-version-parity.test.js:327`: pinned doc counts.
- Bench helpers:
  - `scripts/bench/lib/identity.mjs:70-92`: canonical JSON and the tool-list digest;
  - `scripts/bench/lib/mcp-client.mjs`: SDK loading;
  - `scripts/bench/tasks/core.lock.json`: frozen; do not touch.
- `.github/workflows/ci.yml`: shallow `actions/checkout@v4` and Node 20.
- `mcp/package.json:47`: the build copies the registry to `mcp/ai/tool-definitions.cjs`.

### External (verified 2026-10-15)
- Claude Code MCP docs, "Scale with MCP tool search" and the description limits: https://code.claude.com/docs/en/mcp
- MCP spec 2025-11-25, tools (`annotations`): https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP spec 2025-11-25, lifecycle (`instructions`): https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- Anthropic token counting: https://platform.claude.com/docs/en/build-with-claude/token-counting
- Reports of stringified object arguments: https://claudeissues.com/issue/59227-mcp-tool-calls-list-dict-arguments-sent-as-json-encoded-strings-instead-of-nativ and https://claudeissues.com/issue/81477-bug-cowork-object-mcp-tool-arguments-arrive-as-json-strings-is-not-of-type-objec
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createRuntime()`** (`mcp/src/runtime.ts`) takes an injectable `bridge`, `queue` and `agentScope`. An SDK `Client` over `InMemoryTransport` lists and calls tools in-process, with no ports. The orchestrator used this on 2026-10-15 to count tools and to probe schemas.
- **`canonicalJson` and `toolsListDigest`** (`scripts/bench/lib/identity.mjs`) give deterministic tool-list projections.
- **`mapFSBError`** passes success results through verbatim, so a new `expect_result` key reaches callers with no MCP change on the success path.
- **`wrapWithChangeReport`** already has what evaluation needs:
  - the tab URL before and after (`_safeGetTabUrl`);
  - the stability race (300 ms quiet window and the `_CHANGE_REPORT_SAFETY_NET_MS = 500` safety net);
  - cross-origin detection.
- **The click path in `actions.js`** already computes toggle-state signals and returns `outcome:'unknown'` with `mayHaveExecuted:true`, without a second click.
- **`parseTriggerConditionIfStringified`** (`mcp/src/tools/triggers.ts`) is the pattern for accepting stringified object arguments.
- **`tests/browser-editing-actions.test.mjs`** maps `chrome.scripting.executeScript` onto CDP `Runtime.evaluate` against fixture pages.

### Established Patterns
- **Wire changes are additive only.** When an optional input is absent, no key is added (the `visualSession` and `managedScreenshotAttested` precedents in `manual.ts`).
- **Sidecars travel top-level, never inside `params`.** They are stripped from journal and recorder payloads by exact key lists, which must be mirrored (gotcha 6).
- **Numeric MCP params use the coerced `z.preprocess` form.** The A11 grep guard rejects bare `z.number(`.
- **Registry changes are locked by whole-entry sha256 pins in four tests.** MCP-only additions live in `mcp/src` instead (Phase 66.1 SC5, `capabilities.ts`).
- **Service-worker modules are classic `importScripts` scripts with a `module.exports` guard.** Tests `require` them directly.
- **Missing or unobservable values are labelled, never invented.** That is why `uncertain` exists instead of a guessed `verified` or `unmet`.
- **Extension edits ship with their pin updates.** Source-pin tripwires mean every extension edit updates its pins in the same commit.

### Integration Points
- **MCP registration:**
  - `registerManualTools` (`manual.ts:250-265`) for descriptions, the `expect` shape and the sidecar;
  - `registerReadOnlyTools` (`read-only.ts`) for descriptions only;
  - `registerAgentTools` (`agents.ts`) for `back`'s description and `expect`;
  - the other `register*Tools` modules for descriptions.
- **Bridge payload:** `sendAgentScopedBridgeMessage` merges the top-level sidecars.
- **Extension receive path:** `_handleExecuteAction` reads `payload.expect` and passes it to `wrapWithChangeReport`. `handleBackRoute` reads it for `mcp:go-back`.
- **Error mapping:** the `mapFSBError` unknown-outcome branch.
- **Recording:** `_recordMcpSessionAction` and the journal and recorder strip lists.
- **Test chain:** the root `package.json` `test` script plus `REFINEMENT_ROOT_TEST_COMMANDS`.
</code_context>

<specifics>
## Specific Ideas

- **Measured on 2026-10-15** (HEAD build, identical to the pin): the four repeated blocks below make up about 52% of all description text and are the main savings.

  | Block | Characters | Occurrences |
  | --- | ---: | ---: |
  | `change_report` suffix | 14,325 | 33 |
  | Visual-session parameter descriptions | 13,538 | — |
  | `tab_id` descriptions | 10,248 | — |
  | "Multi-agent: ..." sentence | 7,472 | 51 |

  The string `TAB_NOT_OWNED` appears 55 times.
- **Longest descriptions today:**

  | Tool | Characters |
  | --- | ---: |
  | `execute_js` | 2,187 |
  | `back` | 1,934 |
  | `upload_file` | 1,681 |
  | `click` | 1,639 |
  | `select_option` | 1,435 |

  `execute_js` is already cut short on Claude Code builds before v2.1.296.
- **Published size of the candidate `expect` schemas**, with a 116-character description:

  | Layout | Bytes per tool | Over 29 tools |
  | --- | ---: | ---: |
  | Flat (D-13) | 559 | about 16 KB |
  | Nested | 829 | about 24 KB |

  This size difference is why D-13 uses the flat layout and why D-06 adds the whole-list floor.
- **Expected outcome, with the description cuts at the 50% floor:**
  - descriptions save about 44 KB;
  - `expect` adds about 16 KB;
  - so the whole list shrinks by about 23%.

  Reaching PROJECT.md's "more than half" needs about a 69% description cut before `expect` is counted. The report states whichever happens.
- **The `client` label allowlist** has 25 labels. Matching normalizes case and ignores spaces, `_` and `-`. A short description can name the common ones (Claude, Codex, Cursor, ChatGPT, Gemini, VS Code, Copilot, Windsurf) and say the match is case-insensitive.
- **Owner direction carried forward:**
  - Minimal MCP diff; the extension does the runtime work (Phase 66 D-01).
  - With Jev off, FSB behaves exactly as before (2026-09-29).
  - All human validation waits for the Validation Block (2026-10-15).
</specifics>

<deferred>
## Deferred Ideas

- **Server `instructions` and tool `annotations`.**
  - Both are optional fields in the MCP spec, but they change serialized `initialize` and `tools/list` responses and are not among MCP-04's two approved additions.
  - `instructions` are attractive because Claude Code loads only tool names and server instructions at session start when tool search is on (cap 4,096 characters).
  - Adding either needs a reviewed MCP-04 amendment, after V4.
- **Shortening autopilot (registry) descriptions.** This would change autopilot prompts with Jev off, so it needs explicit owner sign-off and an autopilot re-baseline. It is a candidate after V4.
- **`expect` on more tools:**
  - `open_tab`, `switch_tab` and `close_tab`;
  - `search`;
  - `hover`, `focus`, `scroll` and `scroll_at`;
  - `fill_sheet` and `trigger`;
  - the vault and payment tools.

  `run_task`'s own verify belongs to Phase 70.
- **More expressive `expect` predicates:** caller-supplied regular expressions, several selectors in one `expect`, and checks against the before-state.
- **Exact per-model token counts** with Anthropic `count_tokens` (V4).
- **Measured effect of the shorter descriptions and `expect`** on caller error rate, turns and wall time (V4).
- **Live host demonstration of SC4** (V5).

### Reviewed Todos (not folded)
None.
</deferred>

---

*Phase: 69-mcp-descriptions-and-same-call-checks*
*Context gathered: 2026-10-15*
