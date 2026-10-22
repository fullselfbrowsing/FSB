# Phase 69: MCP Descriptions and Same-Call Checks - Research

**Researched:** 2026-10-15
**Domain:** MCP tool-surface text (zod → JSON Schema via SDK 1.29.0), an additive optional MCP parameter, and same-call post-action verification in a Chrome MV3 service worker
**Confidence:** HIGH for code facts, measurements and SDK behaviour (each was re-run in this session). MEDIUM for the timing and commit semantics of Chrome navigation (Chrome docs do not specify them).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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
    - the sidecar key lists.
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
  - **`back`:** the `mcp:go-back` route (`handleBackRoute`, dispatcher around line 1697) calls the same evaluator after its own settle.
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

### Deferred Ideas (OUT OF SCOPE)

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

#### Reviewed Todos (not folded)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-01 | MCP clients get shorter descriptions for every existing tool, keeping enough argument and safety guidance to use them correctly. The count is the 72 tools at `8a058bdf`, plus `settings` from 66.1. | Measured baseline (Finding 13). Pin build reproduced in about 1.5 s (Finding 14). Four registry registration sites plus six inline files (Finding 3). Budget arithmetic for each parameter block (Pattern 2). One existing description-text pin (Finding 4). Must-keep and coverage tests (Validation Architecture). |
| MCP-02 | Action tools accept an optional `expect` and return a bounded outcome check in the same call. | The `expect` zod shape was verified against SDK 1.29.0: 553 B, and `refine`/`preprocess` do not appear in the published schema (Code Example 1). Sidecar path (Pattern 3). Evaluator design with commit gating for the navigation tools (Pattern 4, Findings 1 and 2). ISOLATED-world probes that can reach `FSB.querySelectorWithShadow` (Finding 15). `documentId` signals (Finding 16). Version-skew handling (Finding 10). |
| MCP-04 | Existing tool names, required arguments and wire contracts stay byte-stable; only `expect` and `settings` are added. | When `expect` is omitted, the handler params carry no `expect` key, so the payload and response bytes are unchanged (verified). `expect: null` is handled (Finding 11). Shape-freeze projection, done by recursive description strip (Pattern 5). `mapFSBError` byte-identity (Code Example 4). Registry hash pins stay unchanged. |
</phase_requirements>

## Project Constraints (from the phase brief gotchas and the owner's global CLAUDE.md)

The repo has no `CLAUDE.md` at its root. The only project skill is `.claude/skills/graphify`. Its graph is dated 2026-07 and its line numbers are stale, so do not use it for line references. The following directives bind the plans:

1. **Source-pin tripwires.** Before editing a file, grep `tests/` for `.match(/`, `.includes(`, `indexOf(` and `sha256(` pins on it, and update pins in the same commit. The `importScripts` pins (334 tokens / 330 calls) do not move in this phase because no new module is loaded.
2. **`npm test` chain.** Every new test command is added once to the `package.json` `test` chain, after `npm --prefix mcp run build` (chain index 12). It is also appended in the same commit to `REFINEMENT_ROOT_TEST_COMMANDS` (`tests/delegation-phase-contract.test.js:129`). Never edit the `PRE_PHASE6x` hashes.
3. **Minimal MCP diff.** Touch `mcp/src` only where a tool schema changes (descriptions, `expect`) and in the D-01 sites. Rebuild and commit a force-tracked `mcp/build` file only when its own source changes. None does here.
4. **Same-context dispatch.** Nothing in this phase may `chrome.runtime.sendMessage` from the service worker to itself. The evaluator is a direct function call.
5. **Node 20 in CI.** Do not use Node 22+ globals. Tests fall back to `mcp/node_modules/ws`, and `fetch` is fine (Node 18+).
6. **Producer/validator parity.** The `expect` tool list, timeout constants, sidecar strip lists and the `expect_result` shape are mirrored between MCP and the extension. A parity test must cover them.
7. **Byte-stable wire (MCP-04).** Contract tests must prove this.
8. **Restore after a full run.** Restore `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}` after any full `npm test`. Never commit them.
9. **No AI attribution in commits** (owner's global CLAUDE.md, which overrides the harness attribution reminder). No `Co-Authored-By` lines.
10. **Ports 7225/7226.** The installed daemon (pid 48247) holds both ports on this machine right now. No new test may bind them.
11. **No git writes during research.** Plans run under the orchestrator, and nothing reaches any remote before V6.

## Summary

Phase 69 has two independent halves that meet only in the shared test chain:

- **The description diet (MCP-01).** It is a pure MCP-side text change, applied at registration from one new module. The budget it must meet is measurable and reproducible. I rebuilt `8a058bdf` with `git archive` and `tsc` in about 1.5 s and listed it in-process. It matched HEAD exactly: 72 tools, 54,024 description characters, 34,217 parameter-description characters, and 121,379 bytes. Every character is ASCII, so UTF-16 length equals UTF-8 bytes.
- **`expect` (MCP-02/04).** It is an additive zod key on 29 tools that travels as a top-level bridge sidecar and is evaluated in the service worker.

I verified the planned schema against the real SDK:

- The flat closed object publishes as plain `type:object` with `additionalProperties:false`. It costs 553 canonical bytes per tool with a 150-character description.
- `z.preprocess` (JSON-string acceptance) and `.refine` (at least one predicate) do not appear in `tools/list`.
- The SDK rejects `{}`, unknown keys and a `timeout_ms`-only object before the handler runs, so before dispatch (D-16 holds for free).
- When `expect` is omitted, the handler params have no `expect` key, so payloads stay byte-identical.

CONTEXT assumes several things that the code contradicts. The plans must absorb them:

1. `back`'s MCP bridge timeout is 5,000 ms (`agents.ts:49`), while its route already spends about 2 s settling. With the 5 s `expect` cap, `back` would time out after the navigation happened, and a caller retry would navigate twice.
2. `go_back`, `go_forward` and `refresh` return as soon as `chrome.tabs.goBack/goForward/reload` resolve, with no commit wait (`mcp-tool-dispatcher.js:1474-1481`). DOM predicates could then be judged against the old document.
3. D-01's footprint leaves out `triggers.ts` and `screenshots.ts`, which register registry tools using registry text, and `mcp-bridge-client.js` (`_handleExecuteAction`), which must forward `expect`.
4. `tests/lattice-replay-background-contract.test.js:411` does pin MCP description text: `replay_session`'s phrase must stay in `observability.ts`.
5. The `_handleExecuteAction` source window is 4,500 characters. `resolveAgentTabOrError` sits at offset 4,190, so only 310 characters of headroom remain, and the guarded tests skip silently instead of failing.

**Primary recommendation:**

- Land the frozen fixture, the shape freeze and a report-only budget measurement first. Switch the budget thresholds on in the same commit that finishes the description cuts.
- Build `expect` as one MCP-side shape plus a sidecar (`manual.ts` exports, reused by `agents.ts`) and one extension evaluator in `action-verification.js`. Its probes are ISOLATED-world and `injectImmediately`, and it gates on commits for navigation tools.
- Prove SC3 and SC4 with in-process SDK tests that use a structural mock `AgentScope`. A headless-Chrome fixture is the second layer.

## Verified Findings That Correct or Extend CONTEXT

These are the facts the planner most needs. Each was checked in this session.

| # | Finding | Evidence | Planner action |
|---|---------|----------|----------------|
| 1 | **`back` will time out with `expect`.** The bridge timeout is `5_000` ("2s settle + 3s headroom"). The route does a history precheck, `goBack`, `waitForBackSettle(…, 2000)`, then `tabs.get` and `bindTab`. Adding up to 5,000 ms plus a 750 ms probe exceeds 5 s. A bridge timeout rejects (`bridge.ts:288-289`), `agents.ts` has no catch, and the caller sees an error after the history step already happened. | `mcp/src/tools/agents.ts:49`, `mcp-tool-dispatcher.js:1854` [VERIFIED: codebase] | When `expect` is present, `agents.ts` uses `5_000 + clampExpectTimeout(expect.timeout_ms) + headroom` (about 1,500). Without `expect` it keeps exactly `5_000`. Test both. |
| 2 | **`go_back`, `go_forward` and `refresh` do not wait for commit.** `handleNavigationHistoryRoute` awaits `chrome.tabs.goBack/goForward/reload` and returns at once. Chrome's docs say only `Promise<void>`. FSB's own `back` route needs a 2 s settle race, which suggests the promise resolves before commit. The `navigate` bootstrap path (`createMcpControlledTab`, no owned tab) also returns before load. | `mcp-tool-dispatcher.js:1447-1508`; Chrome tabs API reference [CITED] [ASSUMED: resolution precedes commit] | For these tools with `expect`, subscribe to `webNavigation.onCommitted`, `onReferenceFragmentUpdated` and `onHistoryStateUpdated` (tabId, frameId 0) **before** `execute()`, mirroring `navigateTabAndWaitForCommit` (`:1286-1330`). Treat every check as "not yet observable" until a commit is seen or the deadline passes. `webNavigation` is already in the manifest permissions. |
| 3 | **D-01's footprint is incomplete.** Registry tools are registered in four places: `manual.ts`, `read-only.ts`, `triggers.ts:213-224` (the 4 trigger tools) and `screenshots.ts:57-62` (`capture_screenshot`). All four pass `tool.description` and `jsonSchemaToZod(tool.inputSchema)`. `search_memory` is a registry name, but MCP registers it with inline text in `observability.ts:121-123`. `expect` passthrough needs `_handleExecuteAction` in `extension/ws/mcp-bridge-client.js`, a file D-01 does not list. | grep of `jsonSchemaToZod` and `server.tool(` callers; split script [VERIFIED] | Treat `triggers.ts`, `screenshots.ts` and `mcp-bridge-client.js` as in scope. They follow D-07's mechanism and D-17's wiring, so the decisions themselves are unchanged. Record the reason in the plan. |
| 4 | **A description-text pin exists.** `tests/lattice-replay-background-contract.test.js:411` asserts that `observability.ts` source contains "never ask the user to open target pages manually" (from `replay_session`'s description). This contradicts the discussion log's "No test asserts MCP description substrings". | test source [VERIFIED] | Either keep that phrase in `observability.ts` (for example as the module key comment, or inline), or move the assertion to the description module in the same commit. Add it to the D-10 must-keep table. |
| 5 | **The 4,500-character window has 310 characters of headroom and fails open.** `tests/action-tool-agent-scoped.test.js:56-63` and `tests/ownership-error-codes.test.js:276-279` slice 4,500 characters from `async _handleExecuteAction`. If `resolveAgentTabOrError` is not inside the slice, the tests print "skipped" and pass. The current offset is 4,190. | measured [VERIFIED] | Add only short `expect: payload && payload.expect` entries to the two `wrapWithChangeReport({...})` calls (`:2077`, `:2221`), with no new logic above `:2116`. A new Phase 69 test should assert the offset is under 4,500, so the guard can no longer skip silently. Re-measure after 66.1 lands. |
| 6 | **The wrapper body is pinned.** `tests/hung-page-recovery.test.js:41-45` (pretest chain) asserts that the `wrapWithChangeReport` body contains `'navigate', 'close_tab'` and `return execute()`. | test source [VERIFIED] | Keep the skip-list literal in its current order and keep a bare `return execute();` on the no-`expect` branch. |
| 7 | **Other MCP source pins.** `agents.ts` must have exactly one line matching `/^\s*server\.tool\(/`, with `'back'` within the next 4 lines (`tests/agent-sunset-back-end.test.js:70-83`). `capabilities.ts` must keep the literals `'search_capabilities'` and `'invoke_capability'`, plus `tab_id: z.coerce.number()`, inside the slice from `'search_capabilities'` to `// invoke_capability` (`tests/capability-search-agent-scope.test.js:16-25`). `manual.ts` must keep `TRIGGER_MANUAL_EXCLUSIONS`, `!TRIGGER_MANUAL_EXCLUSIONS.has(t.name)` and `TOOL_REGISTRY.filter(isManualTool)` in that order (`tests/trigger-tool-dispatcher.test.js:152-158`), and must not contain `delegationId` (`tests/agent-scope.test.js:298-311`). | test sources [VERIFIED] | Replace description strings in place. Do not restructure registration calls. |
| 8 | **Two harness tests are outside `npm test`, and one already fails.** `tests/mcp-tool-smoke.test.js` (168/168 pass) runs only in CI's `mcp-smoke` job (`npm run test:mcp-smoke`). `tests/back-tool.test.js` runs in no script and already fails 1/30 on HEAD ("optional tabId threads into payload (got undefined)"). | ran both [VERIFIED] | D-22's call-level byte checks need a **new chained test** that may import `tests/mcp-smoke-harness.js`. Do not rely on either file running in `npm test`, and do not count the `back-tool` failure as a Phase 69 regression. |
| 9 | **The extension sees wire verbs, not tool names.** `manual.ts` sends `tool: _contentVerb \|\| _cdpVerb \|\| name`. For example `type_text→type`, `press_key→keyPress`, `click_at→cdpClickAt`, `drag_drop→dragdrop`, `check_box→toggleCheckbox`. `wrapWithChangeReport` receives that verb. | registry dump [VERIFIED] | The extension-side check for the `expect` tool set must resolve `_mcp_getToolByNameOrVerb(verb).name` before testing membership in the 29-name mirror. The parity test compares names. |
| 10 | **Version skew is silent today.** A new MCP server sending `expect` to an older extension gets a response with no `expect_result`. The caller cannot tell "not checked" from "not requested" (research Pitfall 18, item 5). | `.planning/research/PITFALLS.md:678-713` [CITED] | Recommended: when `expect` was sent and the result is `success:true` or `mayHaveExecuted:true` without `expect_result`, `manual.ts`/`agents.ts` add `expect_result` with status `uncertain`, each check `uncertain` with `observed: null`, and a reason such as `extension_unsupported`. This only happens when `expect` is present, so it is byte-safe. It is not locked in CONTEXT; see Open Question 1. |
| 11 | **`expect: null`.** With D-13 as written (`z.preprocess(parse, obj).optional()`), `expect: null` is rejected. Today an unknown `expect` key, null or not, is silently stripped and the call succeeds. Mapping `null → undefined` inside `preprocess`, with the inner object made `.optional()`, accepts null as omitted. The published schema is byte-identical. | SDK experiment [VERIFIED] | Use `z.preprocess(parseExpectArg, expectObject.optional()).optional()`, where `parseExpectArg(null) === undefined`. A null `expect` adds no sidecar. |
| 12 | **String fields are unbounded.** D-13 strings have no length cap. `.max()` would publish `maxLength`, about 3 KB over 29 tools. An object-level `refine`/`superRefine` does not appear in the schema. | SDK experiment (refine invisible) [VERIFIED] | Enforce per-field caps (for example 2,000 characters, uncalibrated) and the rules "`state`/`value` require `selector`" and "at least one predicate" in one invisible `superRefine`. |
| 13 | **Measurement units.** 121,379 is `JSON.stringify({tools}).length`. All baseline text is ASCII, so this equals UTF-8 bytes. The settings tool and future text may add non-ASCII, such as `'OpenClaw 🦀'` in the label allowlist. SDK client objects carry `title`, `annotations` and `_meta` keys set to undefined, and every tool has `execution: {"taskSupport":"forbidden"}`. A naive canonicaliser that prints `undefined` inflates the count by about 4.3 KB. | in-process probe [VERIFIED] | Define "bytes" as `Buffer.byteLength(canonicalJson(x), 'utf8')`, using `scripts/bench/lib/identity.mjs` `canonicalJson` (it drops undefined keys). Measure the fixture and the current list through the same code path. |
| 14 | **The D-04 generator is proven.** `git archive 8a058bdf mcp`, symlink `mcp/node_modules`, run `./node_modules/.bin/tsc -p .`, and the build finishes in about 1.5 s. `mcp/ai/tool-definitions.cjs` is tracked, so it arrives with the archive and no copy step is needed. Listing that build in-process gives figures identical to HEAD. | ran it in `/tmp` [VERIFIED] | The generator script does exactly this. Its `--check` mode re-derives the list and diffs it against the committed fixture when `git cat-file -e 8a058bdf` succeeds. It is a separate npm script, not part of the chained test. |
| 15 | **ISOLATED-world probes can reach FSB's ref resolver.** `executeScript` defaults to ISOLATED, "the execution environment unique to this extension". That is the world the content scripts run in. They define `window.FSB.querySelectorWithShadow` and `window.FSB.resolveRef` (`extension/content/selectors.js:1054-1055`, `init.js:14`). | Chrome scripting reference [CITED]; source [VERIFIED] | `selector` accepts CSS or an FSB ref when `window.FSB` is present. Otherwise CSS only, and a ref when FSB is absent makes the check `uncertain`. The probe needs no new content-script file. |
| 16 | **Document identity signals.** `InjectionResult.documentId` (Chrome 106+), `webNavigation.getFrame()` → `documentId`, and commit events all exist. The manifest's minimum Chrome version is 116. `injectImmediately: true` (Chrome 102+) lets probes run on a document that is still loading, instead of waiting for document_idle. | Chrome scripting and webNavigation references [CITED] | Probes use `world: 'ISOLATED'` and `injectImmediately: true`. A DOM check counts as met only on the latest document, judged by the probe's `documentId`. |
| 17 | **Existing redaction gap; do not copy it.** The change-report harvest records `inp.value` for every `input`, password fields included, and `buildChangeReport` echoes it in `inputs_changed`. | `mcp-tool-dispatcher.js:4158-4163`, `action-verification.js:558-570` [VERIFIED] | Superseded on 2026-10-15: the owner decided to fix it in this phase (CONTEXT D-25, plan 69-03 Task 3), reusing the evaluator's predicate and `[redacted]` marker; it is the one recorded exception to MCP-04 byte-stability. The same secrets also reach `attrs_changed[].before`, because the harvest observes attributes with `attributeOldValue: true` (`mcp-tool-dispatcher.js:4209`, serialised unfiltered at `:4322`, copied at `action-verification.js:539-551`): React-synced password `value` attributes and hidden-input token rotation. D-25 covers that channel too. The `expect` evaluator must redact both `observed` and `expected` for password, hidden and credential-autocomplete fields. |
| 18 | **`createRuntime()` with a real `AgentScope` runs host process probes on first `ensure()`.** `detectMcpClientInventory` uses `execFile`. | `mcp/src/client-inventory.ts:1,84,167` [VERIFIED] | In-process caller tests pass a structural mock (`makeMockAgentScope`, `tests/mcp-client-identity.test.js:34-43`). It has no setters, so `createRuntime` skips wiring the suppliers. `listTools` alone never calls `ensure`. |
| 19 | **There is no sidecar parity test today.** D-15 says "the parity test is extended", but nothing compares `INTERNAL_PAYLOAD_KEYS`, the recorder's `mcp:` strip list and the smoke-test list. For `back`, which is recorded as `mcp:go-back`, the recorder keeps the whole payload minus its strip list (`mcp-session-recorder.js:684-690`). An unstripped `expect` would therefore enter `back`'s replay payload. | source [VERIFIED] | Create a new parity test covering the tool list, the timeout constants and the strip lists, and add `'expect'` to both extension strip lists in the same commit. |
| 20 | **The SC4 tests need ESM SDK paths.** `createRequire(mcp/package.json).resolve('@modelcontextprotocol/sdk/…')` returns `dist/cjs`, while `mcp/build/runtime.js` loads `dist/esm`. | resolution probe [VERIFIED] | Tests import `mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/{client/index.js,inMemory.js}` by `pathToFileURL`, which works (used in this session). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Short tool and parameter text | MCP server (`mcp/src/tools/` description module, applied at registration) | — | Text is part of the MCP tool schema. The registry stays the autopilot's source (D-07). |
| Budget measurement and gate | Test tooling (`scripts/` and `tests/`, run against the current `mcp/build`) | Committed fixture under `tests/fixtures/` | CI clones are shallow, so the gate reads a frozen artifact, never git. |
| `expect` schema, validation and sidecar | MCP server (`manual.ts` zod shape and handler; `agents.ts` for `back`) | — | Validation fails before dispatch (D-16), and the bridge payload stays byte-stable without `expect`. |
| Unknown-outcome text with `expect_result` | MCP server (`errors.ts` `mapFSBError`) | — | Only the MCP side formats `isError` text. |
| Same-call evaluation (wait, probe, verdict) | Extension service worker (`action-verification.js` evaluator, called from `wrapWithChangeReport` and `handleBackRoute`) | Page (ISOLATED-world probe functions, injected and read-only) | The SW owns timing, the tab APIs and commit events. The page only answers DOM questions. |
| URL and title checks | Extension SW (`chrome.tabs.get`) | — | These stay observable across origins and on restricted pages with no injection (D-18). |
| Journal and replay hygiene | Extension SW (`mcp-lattice-journal.js`, `mcp-session-recorder.js` strip lists) | — | Replay params must never contain `expect`. |

## Standard Stack

### Core (all present; no installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 (pinned in `mcp/package.json`) | `McpServer.tool`, the zod → JSON Schema publish, `Client`, `InMemoryTransport` | Already the server runtime. Its publishing behaviour for `preprocess`/`refine`/`strict` was verified in this session [VERIFIED: local SDK run]. |
| `zod` | 3.25.76 (pinned) | The `expect` shape (`z.object().strict()`, `z.preprocess`, `z.coerce.number().int().finite()`) | The A11 guard requires the coerced numeric form [VERIFIED: tests/mcp-numeric-param-coercion.test.js:249-286]. |
| `zod-to-json-schema` | bundled SDK dependency (present in `mcp/node_modules`) | Used by the SDK to publish schemas | Not called directly. Its output defines the fixture bytes [VERIFIED]. |
| `typescript` | ^5.9.3 (mcp devDependency) | Builds the pin copy for the fixture generator | Already used by `npm --prefix mcp run build` [VERIFIED]. |
| Node test runners | Node 24.14.1 locally, Node 20 in CI | Plain `node tests/x.test.js` scripts and `node --test` for `.mjs` | Repo convention [VERIFIED: package.json]. |
| Headless Chrome | 155.0.8059.40 locally (`/Applications/Google Chrome.app`); CI's ubuntu-latest checks `/usr/bin/google-chrome` | Layer-2 fixture test over CDP | The pattern already exists in `tests/browser-editing-actions.test.mjs` [VERIFIED]. |

### Supporting (in-repo helpers to reuse)
| Helper | Location | Use |
|--------|----------|-----|
| `canonicalJson`, `sha256Hex`, `toolsListDigest` | `scripts/bench/lib/identity.mjs:50-92` | Canonical bytes and the fixture sha256. Drops undefined keys. |
| `makeMockAgentScope` pattern | `tests/mcp-client-identity.test.js:34-43` | In-process `createRuntime` with no inventory probes |
| `createMcpSmokeHarness` / `invokeTool` / `normalizeRecordingSidecar` | `tests/mcp-smoke-harness.js`, `tests/mcp-tool-smoke.test.js:62-121` | Bridge-payload capture. `recordingCallId` is a random UUID, so normalise it before comparing bytes. |
| CDP `chrome.scripting` shim and `openFixture` | `tests/browser-editing-actions.test.mjs:12-140` | Layer-2 probes |
| `sweep-tests.mjs` | `scripts/bench/sweep-tests.mjs --files <paths>` | Runs every test that references an edited file. Use it after each task. |
| Build-staleness guard | `tests/visual-session-schema-lock.test.js:157-169` | Copy into every test that imports `mcp/build` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ceil(chars/4)` estimate | `js-tiktoken`, or Anthropic `count_tokens` | Locked out by D-05. Exact counts are V4. |
| Repeated short probes | One in-page polling injection with a MutationObserver | A single injection dies when the document navigates mid-wait, and on hung renderers it queues and runs late. Short probes survive navigation and re-target the new document. **Use repeated probes.** |
| `.max()` on the `expect` strings | An invisible `superRefine` | `.max()` costs about 3 KB of published schema over 29 tools (Finding 12). |

**Installation:** none. Phase 69 adds no dependency.

## Package Legitimacy Audit

No external packages are installed or added by this phase, so slopcheck was not needed. All libraries above are existing pinned dependencies (`mcp/package.json`) whose installed versions were read from `mcp/node_modules`.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
MCP host (Claude Code, Cursor, ...)
   │ tools/list ──────────────► McpServer (createRuntime)
   │                              ├─ registerManualTools / ReadOnly / Triggers / Screenshots
   │                              │     description = MCP_DESC[name]; params = jsonSchemaToZod(schema, MCP_PARAM_DESC[name])
   │                              │     + expect shape on the 29 supported tools only
   │                              └─ inline tools (agents/back, observability, vault, capabilities, autopilot, visual-session, settings)
   │                                    description = MCP_DESC[name]
   │
   │ tools/call {args, expect?}
   ▼
 SDK zod validation ──(invalid expect: unknown key / {} / type)──► isError -32602, NO dispatch (D-16)
   ▼
 handler: lift `expect` out of params ─► validateVisualSessionFields ─► strip ─► PARAM_TRANSFORMS
   ▼
 basePayload {tool: verb, params} (+ visualSession) (+ expect ONLY if present)
   │ sendAgentScopedBridgeMessage (timeout 30 s; back: 5 s, or 5 s + clamp(expect) + headroom when present)
   ▼
 Extension SW: _handleExecuteAction / handleBackRoute
   ▼
 wrapWithChangeReport(ctx{toolName: verb, tabId, params, execute, expect})
   ├─ expect absent ──► today's path, byte-for-byte (harvest or `return execute()`)
   └─ expect present & name(verb) ∈ EXPECT_TOOLS
        ├─ nav tool? subscribe to commit events BEFORE execute
        ├─ execute()  (harvest still runs only when it would today)
        ├─ result definitive failure? ──► return as-is (no expect_result)
        └─ evaluateExpectation(tabId, spec, deadline)
              ├─ tabs.get → url_includes / title_includes
              ├─ [nav] wait for commit, else checks stay "not yet observable"
              ├─ probe (ISOLATED, injectImmediately, 750 ms race) → text / selector / state / value / dialog
              └─ poll until all met or deadline → aggregate verified | unmet | uncertain
   ▼
 response (+ expect_result) ──► recorder/journal (expect stripped from payload lists)
   ▼
 MCP mapFSBError
   ├─ success ──► JSON passthrough (expect_result included verbatim)
   ├─ mayHaveExecuted ──► "Action outcome unknown" + trailer {outcome, mayHaveExecuted[, expect_result]};
   │                       verified ⇒ "do not repeat" next action
   └─ other errors ──► unchanged
```

### Recommended File Layout (names are Claude's discretion; these are suggestions)
```
mcp/src/tools/descriptions.ts          # NEW: MCP_TOOL_DESCRIPTIONS, MCP_COMMON_PARAM_DESCRIPTIONS, per-tool param text, CHANGE_REPORT sentence
mcp/src/tools/manual.ts                # expect shape + EXPECT constants (exported for agents.ts), sidecar, version-skew fill
mcp/src/tools/{schema-bridge,read-only,triggers,screenshots}.ts   # apply module text
mcp/src/tools/{agents,observability,vault,capabilities,autopilot,visual-session}.ts  # inline text → module lookups
mcp/src/tools/settings.ts (66.1)       # description → module lookup (D-08 coverage)
mcp/src/errors.ts                      # mayHaveExecuted branch only
extension/utils/action-verification.js # evaluator: normalize/clamp, probes, aggregate, redact; EXPECT_TOOL_NAMES mirror
extension/ws/mcp-tool-dispatcher.js    # wrapWithChangeReport gate refactor, ISOLATED probe injector, handleBackRoute hook
extension/ws/mcp-bridge-client.js      # pass `expect: payload && payload.expect` into the two wrap calls (≤ ~70 chars total)
extension/utils/mcp-lattice-journal.js, mcp-session-recorder.js   # add 'expect' to the strip lists
scripts/mcp/tools-list-baseline.mjs    # NEW generator: --write / --check (git-dependent; not chained)
tests/fixtures/mcp-tools-list-8a058bdf.json   # NEW frozen fixture {meta, tools}
tests/fixtures/expect-outcome.html     # NEW Layer-2 page
tests/*.test.js|mjs                    # NEW tests (see Validation Architecture)
```

### Pattern 1: Frozen-fixture gate (D-04/D-06/D-22)
**What:** One committed fixture holds `{ meta: { sourceCommit, sdkVersion, zodVersion, command, sha256 }, tools: [...] }`. Every test derives from it and from a live in-process `tools/list` of the current `mcp/build`.
**When:** The budget gate, the shape freeze, coverage, and the 66.1 freeze migration.
**Key rules:**
- The test asserts the fixture's `sha256` matches its own canonical `tools`, so a hand-edit is caught.
- The test asserts that `mcp/node_modules/@modelcontextprotocol/sdk/package.json` and the zod version equal `meta`. A future SDK bump then fails with "regenerate the fixture", instead of reporting phantom wire drift.
- The test filters the current list to the 72 fixture names for D-06 and treats `settings` by name.
- **Sequencing:** the plan that creates the fixture adds the shape freeze (green immediately, because nothing has changed) and a report-only budget run. The gate thresholds are switched on in the same commit that completes the description cuts. Otherwise the suite is red from the phase's first commit, which violates D-24.

### Pattern 2: Description module and budget arithmetic
Each step below is derived from the measured baseline:
- **Baseline text:** 88,241 characters, of which 54,024 are descriptions and 34,217 are parameter descriptions. The 50% floor leaves **≤ 44,120 characters**, including 29 copies of `expect`'s own description (about 150 × 29 = 4,350).
- **Common parameters today:**
  - `tab_id`: 55 occurrences, 13 variants, 10,248 characters;
  - `client`: 38 occurrences, 6,249 characters;
  - `is_final`: 37 occurrences, 3,700 characters;
  - `visual_reason`: 37 occurrences, 3,589 characters.
- **Common-parameter targets:** about 95, 110, 35 and 25 characters respectively, about **11.6 K** in total. The other parameters total 10,431 characters; halving them gives about **5.2 K**.
- **What remains for tool descriptions:** about **23 K characters across 72 tools, an average of about 320** (today about 750). Two sources supply the cut:
  - the change-report suffix: 33 copies of a 433-character suffix (14,325 characters) shrink to one sentence of about 90;
  - the "Multi-agent: …" sentence: 51 copies (7,472 characters) are removed, because their rule now lives in `tab_id`.
- **Remaining prose:** the other 32 K characters must shrink by about 38%.
- **Whole-list bytes after:** 121,379 − (88,241 − 39,770) + 29 × 553 ≈ **88.9 K**, about −27%, which passes the 20% floor. A cut of more than 50% would need the description text at about 20 K characters total, so report it, as D-06 directs.
- **Registry-backed tools.** Pass a per-tool parameter-text map into `jsonSchemaToZod(inputSchema, paramDescriptions?)`. Only the `.describe()` argument changes, and no other caller of `jsonSchemaToZod` is affected when the map is absent.
- **The `client` text.** Write it as a fixed list of common labels (Claude, Codex, Cursor, ChatGPT, Gemini, VS Code, Copilot, Windsurf), followed by "and others; case, spaces, `_` and `-` ignored". Do not generate all 25 labels: that costs about 7 K characters over 37 tools and includes the non-ASCII `🦀`. `BADGE_NOT_ALLOWED` already returns the full allowlist on rejection.

### Pattern 3: `expect` sidecar (MCP)
In the `registerManualTools` handler, take `expect` out of the params first. Then run the existing validator, the strip and the transform on the remaining params, unchanged. Pass `expect` to `execAction`, which sets `basePayload.expect` only when it is not undefined. `targetTabIdFromParams(finalParams)` is unchanged. For `back`, add `expect` to the destructure. Set `payload.expect` only when present, and compute the larger timeout only when present (Finding 1).

### Pattern 4: Evaluator (extension, `action-verification.js`)
- **Pure, Node-testable layer:**
  - `normalizeExpectSpec(raw)`: validates the shape again as a mirror, clamps `timeout_ms` to [0, 5000] (default 2,000), and builds the check list. A `selector` with no `state`/`value` gets `state: visible`.
  - `aggregateExpectStatus(checks)`.
  - `capObserved(s)`: about 120 characters.
  - `isRedactedField(desc)`.
  - `EXPECT_TOOL_NAMES`, `EXPECT_DEFAULT_TIMEOUT_MS`, `EXPECT_MAX_TIMEOUT_MS`, `EXPECT_POLL_INTERVAL_MS` (about 200, uncalibrated, V4).
- **Self-contained probe:** `_fsbExpectProbeInPage(spec)`. It is a read-only function with no timers, listeners or closures, so a late execution on a hung renderer is harmless. It returns per-check observations plus `ok`.
- **SW driver:** `evaluateExpectation({ tabId, spec, deps })`. `deps` injects `tabsGet`, `executeProbe`, `now` and `sleep`, so Node tests and the Layer-1 fake bridge run the real logic.
- **Order of work:**
  1. If the result is a definitive failure, attach nothing.
  2. Run one bounded settle (reuse `_fsbWaitStableInPage`, 450 ms cap) when the harvest did not already do it.
  3. For navigation tools, wait for a commit.
  4. Poll: URL and title via `tabs.get`, DOM via the probe. Stop early when every check is met.
  5. At the deadline, apply the final status rules.
- **Final status rules:**
  - **met:** the predicate held on the newest `documentId`.
  - **unmet:** the check was observable and false. A tab that is still `loading` with a `pendingUrl` makes it uncertain instead.
  - **uncertain:** the probe timed out, injection failed, the page is restricted or cross-origin for DOM checks, the tab is closed, or a ref was given while FSB is absent.
- **Negative predicates** (`text_gone`, `state: gone`, `unchecked`): require them to hold on two consecutive probes at least one interval apart before counting as met. This guards the "spinner hasn't appeared yet" race.
- **Text matching:**
  - Scan the top document's `innerText` plus open shadow roots, up to a node budget. If the budget is exhausted, `text_gone` becomes uncertain.
  - Lowercase and collapse whitespace for text and title. URL matching is case-sensitive substring.
- **Toggle state (`checked`):** any of these counts as checked: native `checked === true`, `aria-checked/pressed/selected === "true"`, `data-state ∈ {checked, on, active, open}`, or `open === true`. The same signals apply to the associated control (label → control, summary → details), mirroring `getAssociatedStateElement` (`actions.js:280-300`). `unchecked` needs at least one signal present and none positive. No signal at all makes the check uncertain.
- **`dialog_open`:** mirror `isDialogNode` (`action-verification.js:447-462`): `<dialog open>`, visible `role=dialog/alertdialog`, `aria-modal=true`. A native `alert()` blocks injection, so it surfaces as uncertain.
- **Redaction:** for `input[type=password|hidden]` or `autocomplete` values `current-password`, `new-password`, `one-time-code` or `cc-*`, redact both `expected` and `observed`.

### Pattern 5: Shape-freeze projection (D-22)
Deep-clone each tool. Delete `description` at the top level and recursively under `inputSchema`, except `expect`'s, which is handled as the allowed addition. Keep everything else: `execution`, `$schema`, `additionalProperties`, `exclusiveMinimum`, enums, defaults and required lists. Compare against the projection of the fixture. A recursive strip is stronger than enumerating keys, and it catches `exclusiveMinimum` on `back.tab_id` and the `execution` field. The allowed differences are the `expect` property on exactly the 29 names (byte-compare one canonical `expect` schema and require all 29 to be identical) and the extra `settings` tool, identified by name.

### Anti-Patterns to Avoid
- **Putting `expect` or MCP text in the registry.** It leaks to autopilot through `getPublicTools` and moves four hash pins (D-07, D-11).
- **Building `expect` on `change_report`.** Its skip paths are silent (Pitfall 18). The evaluator must run even with the toggle off, the flag off or the harvest skipped.
- **Retrying the action because `expect` was unmet.** That risks a double submit. FSB never retries, and the "Next action" text never says "retry".
- **One long-lived in-page polling injection.** It breaks on navigation and stacks up on hung renderers.
- **Comparing bridge payloads byte-for-byte without normalising `recordingCallId`.** It is a random UUID on every call.
- **Importing the SDK through `createRequire().resolve`** in tests that also load `mcp/build` (CJS versus ESM; Finding 20).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canonical JSON and digests | Your own key-sorting stringify | `canonicalJson`, `sha256Hex` (`scripts/bench/lib/identity.mjs`) | Already handles undefined keys and cycles. A naive version over-counts by about 4.3 KB (Finding 13). |
| Building the pin | A hand-copied tree or `npm run build` (prebuild scripts, clean step) | `git archive 8a058bdf mcp` plus `tsc -p .` with symlinked `node_modules` | Proven in about 1.5 s. The archive already contains `ai/tool-definitions.cjs`. |
| JSON-string object args | Ad hoc parse in the handler | `z.preprocess` (precedent: `parseTriggerConditionIfStringified`, `triggers.ts:63-81`) | Does not change the published schema, and validation still runs before dispatch. |
| Shadow-piercing selector lookup | A new walker in the probe | `window.FSB.querySelectorWithShadow` / `FSB.resolveRef` when present (ISOLATED world), falling back to `document.querySelector` | It is the same world as the content scripts (Finding 15). |
| Commit detection | Polling `tab.url` | `webNavigation` events (pattern in `navigateTabAndWaitForCommit`), `InjectionResult.documentId` | Polling misses fragment-only and same-URL reloads. |
| Dialog definition | A new heuristic | Mirror `isDialogNode` | Keeps `dialog_open` consistent with `change_report.dialogs_opened`. |
| Fake runtime in tests | Hand-registering tools | `createRuntime({ bridge, agentScope: mock })` + SDK `Client`/`InMemoryTransport` | Exercises the real zod validation and publishing path. |
| Byte-level payload capture | New harness | `tests/mcp-smoke-harness.js` + `normalizeRecordingSidecar` | Already captures `sendAndWait` calls. |

**Key insight:** every hard part here is already in the repo (canonical JSON, commit waits, toggle signals, the dialog definition, the CDP fixture harness, stringified-object handling). The risk is in wiring and tripwires, not in new algorithms.

## Common Pitfalls

### Pitfall 1: A navigation is judged against the old document
**What goes wrong:** `expect.text_visible` on `go_back` or `refresh` is "verified" against the page being left.
**Why:** These tools return before commit (Finding 2). `refresh` keeps the same URL.
**How to avoid:** Subscribe to commit events before `execute()`. Gate all checks on a commit or the newest `documentId`. If still loading at the deadline, report uncertain rather than unmet.
**Warning signs:** Verified rates near 100% on navigation tools in the Layer-2 test.

### Pitfall 2: `back` times out after navigating
**What goes wrong:** The caller gets a bridge timeout error after history already moved, and a retry navigates twice.
**How to avoid:** Make the timeout conditional on `expect` (Finding 1). Add a test that a `back` without `expect` still sends `timeout: 5000` and that one with `expect.timeout_ms: 5000` sends at least 11,000.

### Pitfall 3: A guard that skips silently in `_handleExecuteAction`
**What goes wrong:** Added lines push `resolveAgentTabOrError` past 4,500 characters. Two suites print "skipped" and pass, so the D-16 ownership coverage disappears unnoticed.
**How to avoid:** Keep the additions minimal (Finding 5) and add an offset assertion to a Phase 69 test.

### Pitfall 4: The budget gate is red from the first commit
**What goes wrong:** The fixture plan also switches on the 50%/20% thresholds before any text is cut.
**How to avoid:** The first plan lands a report-only budget run. The thresholds are switched on in the commit that completes the cuts, and the 66.1 freeze-test migration lands in the commit of the first description edit (D-22).

### Pitfall 5: A false "verified" from pre-existing state, or a racy negative check
**What goes wrong:** `text_visible: "Saved"` was already on the page, or `text_gone: "Loading"` held before the spinner appeared.
**How to avoid:** Require two probes for negative predicates (Pattern 4). Pre-existing positive matches are a documented limitation, since before-state checks are deferred. Real-site sanity checks belong to V5.

### Pitfall 6: Leaking secrets through `expect_result`
**What goes wrong:** A `value` check echoes a password, either the caller's `expected` or the page's `observed`, into the response and the journal.
**How to avoid:** Redact both for sensitive fields (Pattern 4), and strip `expect` from the journal and recorder payload lists. Do not copy the old `inputs_changed` behaviour (Finding 17); plan 69-03 Task 3 fixes it, together with the `value` entries of `attrs_changed` (CONTEXT D-25).

### Pitfall 7: The verb/name mismatch in the extension
**What goes wrong:** The membership check uses `payload.tool` (`type`, `keyPress`, `cdpClickAt`), so `expect` is silently ignored on 14 of the 24 interaction tools.
**How to avoid:** Resolve the verb with `_mcp_getToolByNameOrVerb` first (Finding 9). The Layer-1 tests must cover at least one content-verb tool and one CDP-verb tool.

### Pitfall 8: Fixture drift after a dependency bump
**What goes wrong:** A later SDK or zod upgrade changes the scaffolding bytes, and the freeze fails with an opaque diff.
**How to avoid:** Record the SDK and zod versions in `meta` and assert them first, with a "regenerate with scripts/mcp/tools-list-baseline.mjs --write at the pin" message.

### Pitfall 9: The description pin in `observability.ts`
See Finding 4. Moving `replay_session`'s text into the module without moving its assertion turns `lattice-replay-background-contract` red.

### Pitfall 10: Hidden or background tabs
**What goes wrong:** FSB reports success while CDP input was dropped in a background tab (owner memory: "background tabs drop CDP key/mouse input").
**Why it matters here:** `expect` is the honest remedy, since `unmet` exposes the dropped input. Make sure probes do not rely on `requestAnimationFrame`, which is throttled in hidden tabs. Use synchronous reads only.

## Code Examples

### 1. `expect` shape (MCP; verified publishing behaviour)
```ts
// Verified 2026-10-15 with SDK 1.29.0 + zod 3.25.76 (scratch run):
//   published as {"type":"object","properties":{…9 fields…},"additionalProperties":false,"description":"…"}
//   553 canonical bytes with a 150-char description; preprocess/refine invisible;
//   SDK rejects {} / unknown keys / timeout-only before the handler runs.
const coercedInt = z.preprocess((v) => (v === '' ? NaN : v), z.coerce.number().int().finite());
const expectObject = z.object({
  url_includes: z.string().optional(),
  title_includes: z.string().optional(),
  text_visible: z.string().optional(),
  text_gone: z.string().optional(),
  selector: z.string().optional(),
  state: z.enum(['visible', 'gone', 'checked', 'unchecked']).optional(),
  value: z.string().optional(),
  dialog_open: z.boolean().optional(),
  timeout_ms: coercedInt.optional(),
}).strict().superRefine((o, ctx) => {
  // at least one predicate; state/value require selector; per-string length cap (uncalibrated)
});
function parseExpectArg(v: unknown): unknown {
  if (v === null) return undefined;                                   // Finding 11
  if (typeof v === 'string' && v.trim().startsWith('{')) { try { return JSON.parse(v); } catch { return v; } }
  return v;
}
export const EXPECT_SHAPE = {
  expect: z.preprocess(parseExpectArg, expectObject.optional()).optional().describe(EXPECT_DESCRIPTION),
};
// EXPECT_DESCRIPTION (~150 chars, must-keep): "Optional check after the action, reported in
// expect_result as verified, unmet or uncertain. On unmet or uncertain, inspect the page before retrying."
```

### 2. Manual-tool handler with the sidecar (byte-identical when absent)
```ts
const zodShape = { ...jsonSchemaToZod(tool.inputSchema, paramTextFor(tool.name)),
                   ...(EXPECT_TOOL_SET.has(tool.name) ? EXPECT_SHAPE : {}) };
server.tool(tool.name, toolTextFor(tool), zodShape, async (params: Record<string, unknown>) => {
  const { expect, ...callerParams } = params;          // zod omits the key when not sent
  const rejection = validateVisualSessionFields(tool.name, callerParams);
  if (rejection) return rejection;
  const visualSession = buildVisualSessionSidecar(callerParams);
  const cleanedParams = stripVisualSessionFields(callerParams);
  const finalParams = transform ? transform(cleanedParams) : cleanedParams;
  return execAction(bridge, queue, agentScope, tool.name, fsbVerb, finalParams, visualSession, screenshotAttestor, expect);
});
// in execAction: if (expect !== undefined) basePayload.expect = expect;
```

### 3. `back` with a conditional timeout
```ts
async ({ tab_id, expect }) => {
  ...
  if (expect !== undefined) payload.expect = expect;
  const timeout = expect === undefined ? 5_000
    : 5_000 + clampExpectTimeoutMs((expect as { timeout_ms?: number }).timeout_ms) + EXPECT_BRIDGE_HEADROOM_MS;
  const result = await sendAgentScopedBridgeMessage(bridge, agentScope, 'mcp:go-back', payload, { timeout, targetTabId });
```

### 4. `mapFSBError` unknown-outcome branch (byte-identical without `expect_result`)
```ts
const er = fsbResult.expect_result;
const hasExpect = !!er && typeof er === 'object';
const verified = hasExpect && (er as { status?: unknown }).status === 'verified';
const nextAction = verified
  ? 'The expected effect was observed. Do not repeat the action.'     // must not contain "then retry."
  : (pageUnresponsive ? … : …);                                        // existing text unchanged
const trailer = hasExpect
  ? { outcome: 'unknown', mayHaveExecuted: true, expect_result: er }
  : { outcome: 'unknown', mayHaveExecuted: true };                     // same JSON as today
```

### 5. Wrapper gate refactor that keeps the pins
```js
async function wrapWithChangeReport(ctx) {
  // ...existing toolName/tabId/params/execute/flagOn/globalOn...
  const expectSpec = _resolveExpectSpec(ctx && ctx.expect, toolName); // null unless object + name(verb) ∈ EXPECT_TOOL_NAMES
  if (!flagOn || !globalOn || !Number.isFinite(tabId) ||
      ['navigate', 'close_tab', 'refresh', 'go_back', 'go_forward', 'open_tab', 'switch_tab'].includes(toolName)) {
    if (!expectSpec) return execute();                       // pinned by tests/hung-page-recovery.test.js
    return _executeWithExpect(ctx, expectSpec, execute);     // nav commit subscription happens inside, before execute()
  }
  // ...existing harvest unchanged; each `return response;` becomes
  //    `return expectSpec ? _attachExpectResult(response, tabId, expectSpec) : response;`
}
```

### 6. Probe injector (new sibling of `_injectFn`; existing MAIN calls are unchanged)
```js
async function _injectProbe(tabId, func, args) {
  if (typeof chrome === 'undefined' || !chrome.scripting) return { ok: false, reason: 'no_scripting' };
  try {
    const injection = chrome.scripting.executeScript({
      target: { tabId }, world: 'ISOLATED', injectImmediately: true, func, args: args || [] });
    const results = await Promise.race([injection, new Promise((_, r) =>
      setTimeout(() => r(new Error('probe timeout')), _PAGE_INJECTION_TIMEOUT_MS))]);
    const first = results && results[0];
    return first ? { ok: true, result: first.result, documentId: first.documentId || null } : { ok: false, reason: 'no_result' };
  } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
}
```

### 7. In-process caller test skeleton (Layer 1; no ports; Node 20-safe)
```js
const sdk = (p) => import(pathToFileURL(path.join(repoRoot, 'mcp/node_modules/@modelcontextprotocol/sdk/dist/esm', p)).href);
const { Client } = await sdk('client/index.js');
const { InMemoryTransport } = await sdk('inMemory.js');
const { createRuntime } = await import(pathToFileURL(path.join(repoRoot, 'mcp/build/runtime.js')).href);
const av = require('../extension/utils/action-verification.js');            // module.exports guard
const sent = [];
const bridge = { isConnected: true, on() {}, off() {},
  async sendAndWait(msg, opts) { sent.push({ msg, opts });
    if (msg.type === 'mcp:execute-action') return runActionThenEvaluate(av, msg.payload, cannedPage);
    if (msg.type === 'mcp:go-back') return runBackThenEvaluate(av, msg.payload, cannedPage);
    return { success: true }; } };
const rt = createRuntime({ bridge, agentScope: makeMockAgentScope() });   // no execFile inventory probes
const [a, b] = InMemoryTransport.createLinkedPair(); await rt.server.connect(a);
const client = new Client({ name: 'sc4', version: '0' }); await client.connect(b);
const r = await client.callTool({ name: 'click', arguments: { selector: '#save', visual_reason: 'save', client: 'Claude',
  expect: { text_visible: 'Saved' } } });
// assert: one tools/call; JSON body has expect_result.status === 'verified'; sent[0].msg.payload.expect deep-equals input
```

### 8. Budget measurement core
```js
import { canonicalJson } from '../scripts/bench/lib/identity.mjs';
const bytes = (x) => Buffer.byteLength(canonicalJson(x), 'utf8');
const descChars = (tools) => tools.reduce((n, t) => n + (t.description || '').length, 0);
const paramChars = (tools) => tools.reduce((n, t) => n + Object.values(t.inputSchema.properties || {})
  .reduce((m, p) => m + (p.description || '').length, 0), 0);   // includes expect's own description (D-06)
const estTokens = (chars) => Math.ceil(chars / 4);              // labelled "estimate" (D-05)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| A 2,048-character description cap on every MCP tool (Claude Code) | 4,096 for upfront tools and server instructions; 16,384 for tools loaded by tool search; search matches only the start | Claude Code v2.1.295 and v2.1.296 | The 2,048 per-tool cap (D-06) keeps older builds whole. Search terms go first [CITED: code.claude.com/docs/en/mcp]. |
| Tools loaded upfront | Tool search on by default: "Only tool names and server instructions load at session start" | Current docs | Description size matters mostly after a tool loads. That is why V4 judges by wall time and errors as well as tokens [CITED]. |
| `chrome.scripting` world defaulting to MAIN in FSB's `_injectFn` | ISOLATED is the API default; `documentId` in results (106+); `injectImmediately` (102+) | Chrome 95–106 | Enables spoof-resistant probes that can follow navigation [CITED: Chrome scripting reference]. |

**Deprecated/outdated:** the research probe figures 54,482 / 33,961 / 121,402 are stale. Use the pin measurement (Finding 13).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `chrome.tabs.goBack/goForward/reload` resolve once navigation starts, not at commit | Finding 2, Pitfall 1 | Low. The commit gating is correct either way. If they resolved at commit, the gating would only cost one immediate event check. |
| A2 | `tab.status` becomes `loading` and `pendingUrl` is set during a pending navigation | Pattern 4 final rules | Low to medium. If not, the "loading → uncertain" downgrade misses some cases. The commit gating still prevents old-document verdicts. |
| A3 | BF-cache restores fire `webNavigation.onCommitted` | Pattern 4 | Medium. If not, `go_back` to a BF-cached page waits for the deadline and returns uncertain, which is safe but slow. V5 real-site check. |
| A4 | GitHub `ubuntu-latest` provides Chrome at `/usr/bin/google-chrome`, so Layer 2 runs in CI | Validation | Low. If absent, Layer 2 skips and Layer 1 remains the proof (D-23 already plans for this). |
| A5 | `superRefine` stays out of the published schema, like `refine` (both are ZodEffects) | Code Example 1 | Low. The 600-byte gate and shape freeze would catch it immediately. |
| A6 | Uncalibrated constants (poll 200 ms, 1,500 ms back headroom, 2,000-character string cap, two-probe rule for negative predicates) | Pattern 4, Findings 1 and 12 | Low. These are named constants with V4 calibration. |

## Open Questions (RESOLVED)

All four questions were resolved during planning (2026-10-15). Each entry names the plan and task that adopts the resolution.

1. **Version-skew fill (Finding 10).** (RESOLVED)
   - What we know: an older extension drops `expect` silently. CONTEXT does not address this, and research Pitfall 18 recommends "unsupported, not dropped".
   - What's unclear: whether adding an MCP-side `expect_result` (status `uncertain`, with a reason) fits D-19's "shape" exactly. It needs one extra field or a sentinel `observed`.
   - Recommendation: add it, using D-19's shape plus a top-level `reason: 'extension_unsupported'`. Mirror the field in the parity test. It is byte-safe because it appears only when `expect` was sent.
   - RESOLVED: adopted. 69-06 Task 1 adds `buildUnsupportedExpectResult` and `withUnsupportedExpectFill` in `mcp/src/tools/manual.ts`; the fill appears only when `expect` was sent and the extension returned a success or unknown-outcome result without `expect_result`. 69-03 Task 1 defines the optional top-level `reason` and `EXPECT_UNCERTAIN_REASONS` (which includes `extension_unsupported`). 69-07 Task 1 mirrors both sides in the parity test.
2. **What 66.1 actually lands.** (RESOLVED)
   - What we know: 66.1 is not yet planned. Its D-21 freeze test has no file name, and its own method of reading `8a058bdf` is unknown. If it uses git, it is CI-shallow-unsafe.
   - Recommendation: Phase 69 plan 1 starts by discovering the test (`grep -rln "8a058bdf" tests/`). If 66.1 committed its own fixture, reuse it as the D-04 fixture rather than adding a second copy of the same payload. Also re-measure Finding 5's offset after 66.1.
   - RESOLVED: 69-01 Task 1 checks the preconditions before any edit: `mcp/src/tools/settings.ts` exists, and `grep -rln "BASELINE_8A058BDF_TOOLS_DIGEST" tests/` finds the 66.1 freeze test (expected `tests/mcp-settings-tool-contract.test.js`). It records that path and re-measures the `_handleExecuteAction` offset in its SUMMARY, and stops if 66.1 has not landed. The committed fixture is tied to 66.1's `BASELINE_8A058BDF_TOOLS_DIGEST` (69-01 Task 2), so the two cannot drift apart. 69-02 Task 3 migrates the 66.1 freeze.
3. **Journaling `expect` and `expect_result` (Claude's discretion).** (RESOLVED)
   - Recommendation: strip `expect` from the journal and replay payloads. Keep `expect_result` inside the recorded response; it is already bounded and redacted, and it is useful diagnosis. This needs no extra metadata field.
   - RESOLVED: adopted. 69-05 Task 2 appends `'expect'` to `INTERNAL_PAYLOAD_KEYS` and to the recorder's `mcp:` strip list, and keeps `expect_result` in recorded responses. 69-07 Task 1 asserts both lists in the parity test.
4. **Selector refs.** (RESOLVED)
   - Recommendation: accept FSB refs (Finding 15). If the content script is absent, report `uncertain` with the observation "ref unavailable". Keep "CSS or ref" out of the 150-character `expect` description if space is tight. The `selector` parameter descriptions already teach refs.
   - RESOLVED: adopted. 69-03 Task 2's probe resolves selectors matching `/^e\d+$/` through `window.FSB.resolveRef`. When FSB is absent, the check is `uncertain` with reason `ref_unavailable`. 69-07 Task 3 asserts `ref_unavailable` on the fixture page. The live ref path on the real extension is a V5 item.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | 24.14.1 locally (CI Node 20) | — |
| npm | test chain | ✓ | 11.19.0 | — |
| `mcp/node_modules` (SDK 1.29.0, zod 3.25.76, typescript) | fixture generator, build, tests | ✓ | pinned | — |
| git with commit `8a058bdf` | fixture `--write`/`--check` only | ✓ locally; ✗ in CI (shallow) | — | The chained tests read the committed fixture and never git (D-04) |
| Google Chrome (headless) | Layer-2 test | ✓ | 155.0.8059.40 | Skip when absent; Layer 1 is the proof |
| Free ports 7225/7226 | none of the new tests | ✗ (daemon pid 48247 holds both) | — | New tests bind no ports. A full local `npm test` may stop at port-bound suites; owner memory says all 320 pass with the hub up since 2026-10-12. A red port-bound suite is real. |
| `timeout` CLI | — | ✗ | — | Not used, as in Phase 66 |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** git history in CI (committed fixture); Chrome in some environments (skip, with Layer 1 as the proof).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Plain Node test scripts (`node tests/<file>.test.js` with custom check helpers) plus `node:test` for `.mjs` suites |
| Config file | none. `package.json` `pretest` (16 commands) and `test` (304 commands) `&&` chains. New Phase 69 commands go into `test` after index 12 (`npm --prefix mcp run build`) and into `REFINEMENT_ROOT_TEST_COMMANDS`. |
| Quick run command | the task's own command, plus `node scripts/bench/sweep-tests.mjs --files <edited files>` |
| Full suite command | `npm test` (restore the three showcase files afterwards; ports 7225/7226 caveat above) |
| CI | Node 20, `npm run validate:extension && npm test` (`extension` job). `npm run test:mcp-smoke` runs in the `mcp-smoke` job. |

### Phase Requirements → Test Map (proposed file names; Claude's discretion)
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-01 | The fixture is intact (sha256 of canonical tools equals `meta.sha256`), SDK and zod versions match `meta`, and there are 72 names | contract | `node tests/mcp-tools-list-baseline.test.js` | ❌ Wave 0 |
| MCP-01 | Budget report and gate: ≥50% characters (including `expect` descriptions), ≥20% canonical bytes over the 72 names, ≤2,048 characters per tool for every tool, `settings` on its own line, ">50% tokens" reported honestly | contract | `node tests/mcp-description-budget.test.js` | ❌ Wave 0 (report-only first, gate switched on with the cuts) |
| MCP-01 | Must-keep table (D-10 plus `replay_session` "never ask the user to open target pages"); coverage, with no orphan keys and every listed tool from the module (D-08) | contract | same file, or `node tests/mcp-description-coverage.test.js` | ❌ Wave 0 |
| MCP-01 | Autopilot unchanged: the four registry hash pins | existing | `node tests/tool-definitions-parity.test.js && node tests/capability-mcp-surface.test.js && node tests/capability-autopilot-parity.test.js && node tests/recipe-schema-lock.test.js` | ✅ unchanged |
| MCP-04 | Shape freeze: recursive description-stripped projection equals the fixture, except `expect` on exactly 29 tools (one identical canonical schema, ≤600 B) and `settings` by name | contract | `node tests/mcp-tools-list-shape-freeze.test.js` | ❌ Wave 0 |
| MCP-04 | Without `expect`: bridge payloads deep-equal today's (5 `PARAM_TRANSFORMS` tools, `back`, plus 2–3 representative content and CDP tools, with `recordingCallId` normalised); `back` timeout stays 5,000; `expect: null` behaves like omitted; `mapFSBError` bytes are identical for success, unknown-outcome, PAGE_UNRESPONSIVE and error fixtures | contract | `node tests/mcp-expect-wire.test.js` | ❌ |
| MCP-04 | Extension without `expect`: change-report suites are unmodified and green; no `expect_result` key; injection counts unchanged | existing + unit | `node tests/change-report-toggle.test.js && node tests/change-report-dispatcher.test.js && node tests/change-report-cross-origin.test.js && node --test tests/hung-page-recovery.test.js` | ✅ unchanged |
| MCP-02 | MCP validation: `{}`, unknown key, `state` without `selector` and a wrong type all reject before dispatch (zero bridge calls); a JSON string is accepted; `timeout_ms` coerced; `back` timeout raised only with `expect`; version-skew fill | contract | `node tests/mcp-expect-wire.test.js` | ❌ |
| MCP-02 | Evaluator pure logic: clamp [0,5000] with 2,000 default; aggregation; redaction of `expected` and `observed`; `observed` cap; two-probe negatives; commit gating; uncertain on probe timeout, restricted page, closed tab or missing ref | unit (Node, injected deps) | `node tests/expect-evaluator.test.js` | ❌ |
| MCP-02 | Dispatcher wiring: evaluation runs with the toggle off or the flag off; navigation tools subscribe before `execute`; no `expect_result` on definitive failure; `handleBackRoute` hook; verb→name membership (`type`, `cdpClickAt`) | unit (stubbed `chrome`) | `node tests/expect-dispatcher.test.js` | ❌ |
| MCP-02 | Parity: the 29-name list (MCP `build/tools/manual.js` versus the extension), the timeout constants, the `expect_result` keys, the strip lists contain `expect`, the `_handleExecuteAction` offset is under 4,500 | contract | `node tests/expect-parity.test.js` | ❌ |
| MCP-02 / SC4 | Layer 1: in-process SDK caller with a fake bridge running the real evaluator, D-23 scenarios 1–6, exactly one `tools/call` | integration (no ports) | `node --test tests/mcp-expect-caller.test.mjs` | ❌ |
| MCP-02 / SC4 | Layer 2: headless Chrome fixture covering text present/absent, selector state, `checked`/`aria-pressed`/`data-state`, `value` with password redaction, `<dialog>`, a delayed change, and a refresh with commit gating | browser (skips without Chrome) | `node --test tests/expect-outcome-browser.test.mjs` | ❌ (+ `tests/fixtures/expect-outcome.html`) |
| — | Fixture regeneration check (git-dependent, not chained) | tool | `node scripts/mcp/tools-list-baseline.mjs --check` | ❌ |

### Sampling Rate
- **Per task commit:** the task's command, then `node scripts/bench/sweep-tests.mjs --files <every edited source>`. When `mcp/src` changed, run `npm --prefix mcp run build` first; the build-staleness guards otherwise fail loudly.
- **Per wave merge:** `npm test`. A red `EADDRINUSE` means the chain stopped early, not that it passed. Afterwards restore `showcase/angular/public/{llms.txt,llms-full.txt,sitemap.xml}`.
- **Phase gate:** full `npm test` green, `npm run validate:extension` green, `npm run test:mcp-smoke:tools` green (168+ checks), and the new suites passing once under Node 20 (the official tarball, not `npx node@20`, per owner memory).
- **Max feedback latency:** about 60 s per task check (the Layer-2 Chrome cold start can take up to 30 s).

### Wave 0 Gaps
- [ ] `scripts/mcp/tools-list-baseline.mjs` and `tests/fixtures/mcp-tools-list-8a058bdf.json`. Unless 66.1 already landed an equivalent (Open Question 2).
- [ ] `tests/mcp-tools-list-baseline.test.js`, `tests/mcp-tools-list-shape-freeze.test.js` and a report-only `tests/mcp-description-budget.test.js`.
- [ ] A shared helper for in-process listing (ESM SDK paths, mock `AgentScope`), for example `tests/helpers/mcp-in-process.mjs`.
- [ ] `tests/fixtures/expect-outcome.html`.
- [ ] Each new command goes into both the `test` chain and `REFINEMENT_ROOT_TEST_COMMANDS` in the same commit.

### Manual-Only Verifications (each tagged with its Validation Block)
| Behavior | Requirement | Block | Why Manual | Instructions |
|----------|-------------|-------|------------|--------------|
| Exact `count_tokens` for the baseline (fixture) and new `tools/list` on the pinned host model(s) | MCP-01 | **V4** | Needs an Anthropic API key, and the counts differ by model | Run `count_tokens` with `tools=` for both lists. Record the ratio next to the chars/4 estimate. |
| Effect of the shorter descriptions on caller error rate, turns and wall time | MCP-01 | **V4** | Comparative live runs | MCP arm of the comparative corpus, before and after |
| Human read-through of all shortened descriptions (73 tools) | MCP-01 | **V5** | Judgement of clarity and safety wording | Read the budget report's dump against the must-keep table |
| Calibrate `expect` constants (default 2,000 / cap 5,000 / poll interval / probe timeout / back headroom / string cap) | MCP-02 | **V4** | Needs real-site timing distributions | Use comparative-run data to adjust the named constants |
| Verdict sanity on real sites (SPA updates, cross-origin navigation, slow pages, BF-cache back, shadow DOM, iframes, native `alert()`, background tabs) | MCP-02 | **V5** | Live browsing | Spot-check `expect_result` against observed reality |
| ISOLATED-world probe behaviour and FSB ref resolution on the real unpacked extension | MCP-02 | **V5** | The Layer-2 harness evaluates probes in the MAIN world over CDP | Run a ref-based `selector` check on a live page |
| Live SC4: Claude Code acts and reads the effect in one call, with no follow-up verification call | MCP-02 / SC4 | **V5** | Needs a real host session | Transcript showing one `tools/call` with `expect_result` |
| Turn reduction from `expect` on the comparative corpus | MCP-02 / SC4 | **V4** | Comparative live runs | Count verification calls per task, before and after |
| MCP minor publish and release compatibility check; publish the extension before MCP (version skew); docs for `expect` and counts (README, `skills/fsb`, showcase) | MCP-04 | **V6** | Publishing and owner approval | Phase 71 release steps |

## Security Domain

`security_enforcement` is absent from the config, so it is treated as enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (no auth surface changes) |
| V3 Session Management | no | — |
| V4 Access Control | yes | Existing ownership gates are unchanged. `expect` evaluation runs only after `resolveAgentTabOrError` / `checkOwnershipGate` approve the tab, and only on that tab. Keep the 4,500-character guard live (Finding 5). |
| V5 Input Validation | yes | zod `.strict()` closed object, an invisible `superRefine` for predicate rules and length caps, coerced integer timeout clamped in the extension, no caller regexes, and selectors passed as JSON-serialised `args`, never concatenated into code |
| V6 Cryptography | no | — |
| V7/V8 Data Protection and Logging | yes | Redact `expected` and `observed` for password, hidden and credential fields. Cap `observed` at about 120 characters. Strip `expect` from the journal and replay payloads. Redact sensitive values in `change_report.inputs_changed` and in the `value` entries of `change_report.attrs_changed` with the same predicate and marker (CONTEXT D-25). |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A page script spoofs probe results by patching DOM APIs | Tampering | Probes run in the ISOLATED world. URL and title come from `chrome.tabs.get`. Note: a page can still render the expected text, so `verified` means "page state observed", not "server-side effect confirmed". |
| A secret echoed through `expect_result` into the response or journal | Information disclosure | Redaction rules (Pattern 4), and `expect` is not journaled |
| A secret echoed through `change_report.inputs_changed` or through `attrs_changed[].before` of a `value` attribute record (pre-existing, Finding 17) | Information disclosure | In-page redaction with the same predicate and marker, masked again in `buildChangeReport` (CONTEXT D-25) |
| Huge `expect` strings, or long waits holding the mutation queue | Denial of service | Per-field caps, a 5 s cap, a 750 ms per-probe race, and early exit when every check is met |
| Code injection through `selector` | Tampering / elevation | `func` and `args` serialisation only. An invalid selector is caught and reported as uncertain. |
| Duplicate side effect after an unmet or uncertain outcome | Tampering (integrity) | No automatic retry anywhere. "Next action" text never says retry, and `isError` stays true on unknown outcomes. |
| Version skew makes callers believe they were checked | Repudiation / integrity | Version-skew fill (Finding 10, Open Question 1) |

## Sources

### Primary (HIGH confidence)
- Local codebase, read in this session: `mcp/src/tools/{manual,agents,schema-bridge,read-only,triggers,screenshots,observability,capabilities,visual-session}.ts`, `mcp/src/{errors,runtime,agent-bridge,agent-scope,bridge,queue,client-inventory}.ts`, `extension/ws/{mcp-tool-dispatcher,mcp-bridge-client}.js`, `extension/utils/{action-verification,mcp-lattice-journal,mcp-session-recorder}.js`, `extension/content/{actions,selectors,init}.js`, `extension/manifest.json`, `package.json`, `.github/workflows/ci.yml`, and the tests cited inline.
- Experiments run in this session (scratch scripts under `/tmp/p69`, nothing written to the repo):
  - an in-process `tools/list` of HEAD and of a `git archive 8a058bdf` + `tsc` build: identical 72 / 54,024 / 34,217 / 121,379;
  - `expect` schema publishing, validation, null handling and the 553-byte size under SDK 1.29.0 + zod 3.25.76;
  - SDK subpath resolution (CJS versus ESM);
  - runs of `tests/mcp-tool-smoke.test.js` (pass) and `tests/back-tool.test.js` (1 pre-existing failure).
- https://code.claude.com/docs/en/mcp (`.md` fetched 2026-10-15): tool search loads only names and instructions; the 4,096 / 16,384 limits; the 2,048 limit before v2.1.296; search reads the start of a description.
- https://developer.chrome.com/docs/extensions/reference/api/scripting: ISOLATED is the default and is unique to the extension; `documentId` in `InjectionResult` (106+); `injectImmediately` (102+).
- https://developer.chrome.com/docs/extensions/reference/api/webNavigation: `getFrame` and `documentId` (106+).
- https://developer.chrome.com/docs/extensions/reference/api/tabs: `goBack`, `goForward` and `reload` return `Promise<void>`, with no commit semantics documented.

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` Pitfall 18 (version skew, silent `expect`), Pitfall 22 (tripwires); `.planning/research/FEATURES.md` (`expect` vocabulary shared with Phase 70's `verify`).
- MDN `tabs.goBack` (Firefox: the promise is fulfilled "when the page navigation finishes"). This does not establish Chromium's semantics.

### Tertiary (LOW confidence)
- Commit-event behaviour for BF-cache restores, and `pendingUrl`/`status` transitions (A2, A3). They need the V5 real-site check.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new dependencies, and the versions were read from `mcp/node_modules`.
- Architecture: HIGH for the MCP side (verified by experiment). MEDIUM-HIGH for the extension evaluator (the design reuses verified primitives; navigation-commit timing is MEDIUM).
- Pitfalls and tripwires: HIGH. Each pin was located in test source, and the offsets were measured.

**Research date:** 2026-10-15
**Valid until:** about 2026-11-14 for the code facts, provided Phase 66.1 lands first (re-measure Finding 5 and re-check the 66.1 freeze test). External docs are stable.
