# Phase 69: MCP Descriptions and Same-Call Checks - Discussion Log

> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-10-15
**Mode:** assumptions, auto (yolo). No user was available to confirm, so every Likely or Unclear item was resolved to the option that best fits the owner's stated direction. Those directions are in ROADMAP, REQUIREMENTS, the STATE.md v1.0.0 decisions, the 2026-10-15 Validation Block deferral, and the project gotchas.
**Areas analyzed:**
1. Tool count, baseline and token check
2. Where the shorter descriptions live and what must survive
3. `expect` on the wire
4. Same-call evaluation in the extension
5. Proof (SC3 and SC4) and test wiring

## Assumptions Presented

Paths are relative to the repo root.

### Measured baseline (analyzer)
The analyzer built `8a058bdf` in a temp directory (`git archive` plus `tsc`) and listed tools in-process through `createRuntime()` with an SDK `Client` over `InMemoryTransport`. It found:
- 72 tools;
- 54,024 description characters and 34,217 parameter-description characters;
- 121,369 bytes of `tools/list` JSON.

Four repeated blocks make up about 52% of that text:

| Block | Characters |
| --- | ---: |
| `change_report` suffix | 14,325 |
| Visual-session parameter descriptions | 13,538 |
| `tab_id` descriptions | 10,248 |
| "Multi-agent: ..." sentence | 7,472 |

54 tool names come from the shared registry and 18 come only from `mcp/src/tools/*.ts`. The 2026-09-28 research probe numbers (54,482 / 33,961 / 121,402) are stale. The baseline must be re-measured at the pin.

### 1. Tool count, frozen baseline and token check

**1a. "73 tools" is a miscount.** (Confident)
- The surface at `8a058bdf` has 72 tools, and there will be 73 after Phase 66.1.
- The check should count tools, not hardcode a number.
- The registry has 57 entries, but `read-only.ts:114-122` skips tools without a `MESSAGE_TYPE_MAP` builder (`wait_for_element`, `wait_for_stable`, `report_progress`).

**1b. Freeze the baseline into a committed fixture.** (Likely)
- A script builds the pin and reads `tools/list`. The test compares `mcp/build` against the fixture and never touches git.
- Reason: CI's `actions/checkout@v4` is shallow, so `8a058bdf` is absent there.
- Alternatives:
  - (a) A frozen fixture plus a regenerate script (recommended).
  - (b) A manual script only, which gives no CI gate.
  - (c) `fetch-depth: 0` in `ci.yml`, which is outside this phase's scope.

**1c. "Tokens" means a deterministic estimate.** (Likely)
- The estimate is `ceil(chars/4)` plus bytes, with no new dependency. `transcript-store.js` already uses this rule.
- Alternatives:
  - (a) chars/4 plus bytes (recommended).
  - (b) A js-tiktoken devDependency.
  - (c) An exact `count_tokens` call, which needs a credential, so it is V4.

**1d. The check is a gate.** (Likely)
- Alternatives:
  - (a) A floor of at least 50% on description plus parameter-description characters, and a per-tool cap of at most 2,048 characters (recommended).
  - (b) A report only.
  - (c) A lower floor, around 35%.

### 2. Where the shorter descriptions live and what must survive

**2a. Only MCP clients see the shorter text; autopilot stays byte-identical.** (Unclear)
- The analyzer said this needs an owner call.
- Facts:
  - `getPublicTools` (`agent-loop.js:708-714`) sends registry descriptions and schemas to all seven provider formatters.
  - Three of the four repeated blocks live in the shared registry.
- Alternatives:
  - (a) MCP-only fields inside the registry (`_mcpDescription` plus a parameter-description map), read only by `mcp/src`. This moves the registry hash. **Analyzer's recommendation.**
  - (b) An override layer in `mcp/src/tools` that changes descriptions at registration. The registry and its hash stay untouched, but the `mcp/src` diff is larger.
  - (c) Edit the shared registry directly. Autopilot prompts change, which needs owner sign-off.

**2b. Any registry edit moves `EXPECTED_NON_TRIGGER_REGISTRY_HASH`.** (Confident)
- The hash is pinned in four tests: `tool-definitions-parity:52`, `capability-mcp-surface`, `capability-autopilot-parity:42` and `recipe-schema-lock:45`.
- The research listed only three of them.

**2c. The 18 tools outside the registry can only be shortened in `mcp/src/tools/*.ts`.** (Confident) None of those files has a force-tracked build output.

**2d. A curated must-keep table in a test proves the guidance survived.** (Likely)
- Blocks are deduplicated, not deleted.
- Alternatives:
  - (a) An automated table (recommended).
  - (b) Human review only, in V5.
  - (c) Move shared rules into server `instructions`, which needs an MCP-04 ruling.

### 3. `expect` on the wire

**3a. `expect` is added only in the MCP zod shape, for the supported tools.** (Likely)
- A registry-level `expect` would leak to autopilot. `jsonSchemaToZod` has no object branch.
- Alternatives:
  - (a) An MCP-only zod addition (recommended).
  - (b) A registry-level `withExpectField()` plus an autopilot strip.

**3b. `expect` is one optional, closed, structured object.** (Likely)
- Predicates: URL, title, text visible and gone, selector visible and gone, `value_equals`, checked or toggle state, and dialog opened. Plus `timeout_ms`.
- Alternatives:
  - (a) A closed object (recommended).
  - (b) A string mini-grammar.
  - (c) Accept both an object and a JSON string.

**3c. `expect` travels as a top-level sidecar.** (Likely)
- It is moved out of params before `PARAM_TRANSFORMS` run. When absent, no key is added.
- Alternatives:
  - (a) A sidecar (recommended).
  - (b) Keep it in params and split it out in `_handleExecuteAction`.

**3d. Which tools support `expect`.** (Unclear)
- Alternatives:
  - (a) The interaction tools wrapped by the change report, `execute_js`, and the navigation family including `back` (recommended).
  - (b) The wrapped interaction tools only.
  - (c) All 37 visual-session action tools plus `back`.

### 4. Same-call evaluation in the extension

**4a. Evaluate inside `wrapWithChangeReport`, with the gate refactored.** (Likely)
- "Toggle off and no `expect` means zero injections" must hold.
- Alternatives:
  - (a) Inside the wrapper (recommended).
  - (b) A separate wrapper, which costs one extra round trip.

**4b. Result contract.** (Likely)
- Additive `expect_result` with `{status: verified|unmet|uncertain, checks, waited_ms}`. `success` still means "the action ran".
- Alternatives:
  - (a) Three states plus per-check detail (recommended).
  - (b) A boolean `met`.

**4c. The unknown-outcome path carries `expect_result`.** (Likely)
- `mapFSBError`'s `mayHaveExecuted` branch appends it only when present. `isError` is unchanged.
- Alternatives:
  - (a) Append it and keep `isError` (recommended).
  - (b) Promote the response to a success shape when `verified`.
  - (c) Leave `errors.ts` untouched.

**4d. The wait is bounded.** (Likely)
- Alternatives:
  - (a) A 2 s default with a 5 s cap (recommended).
  - (b) A 2 s default with a 10 s cap.

**4e. Where the evaluator lives.** (Likely)
- Pure logic goes in `extension/utils/action-verification.js`, with self-contained injected probes. No new `importScripts` line.
- Note: `_injectFn` uses the MAIN world; the ISOLATED world is safer for probes.
- Alternatives:
  - (a) Extend `action-verification.js` (recommended).
  - (b) A new module, which needs paired `importScripts` pin bumps.
  - (c) Inline it in the dispatcher.

### 5. Proof and wiring

**5a. SC3 contract tests.** (Likely)
- A shape-only projection is compared with the frozen fixture. The only allowed differences are `expect` and the settings tool.
- Call-level checks cover bridge payloads, `mapFSBError` bytes, the absence of `expect_result`, and injection counts.
- Alternatives:
  - (a) A frozen shape fixture plus the call-level tests (recommended).
  - (b) Replace the four registry hashes with a shape hash.

**5b. SC4 proof in two layers.** (Likely)
- An in-process SDK client with a fake extension that runs the real evaluator, plus headless Chrome on a fixture page. The Chrome layer skips when Chrome is absent.
- Alternatives:
  - (a) Both layers (recommended).
  - (b) The fake-extension layer only.
  - (c) The full stack: unpacked extension plus a hub on port 7225.

**5c. Test-chain wiring.** (Confident)
- Each new test command goes into the `npm test` chain and `REFINEMENT_ROOT_TEST_COMMANDS` in the same commit, after the MCP build step, with the build-staleness guard.

### Orchestrator verification (2026-10-15, read-only)
- **Tool count.** HEAD's `mcp/build`, listed in-process through `InMemoryTransport`, gives:
  - 72 tools;
  - 54,024 description characters and 34,217 parameter-description characters;
  - 121,379 bytes with `JSON.stringify({tools})`.

  `git diff 8a058bdf HEAD -- mcp/src extension/ai/tool-definitions.js` is empty, so HEAD equals the pin.
- **Name split.**
  - 54 registry names reach MCP, including all 4 trigger tools.
  - 3 registry names never reach MCP: `wait_for_element`, `wait_for_stable` and `report_progress`.
  - 18 names come only from `mcp/src`.
- **The phase brief's "74 total" is wrong.** The count is 73 after Phase 66.1.
- **Repetition counts** in the `tools/list` JSON:

  | String | Occurrences |
  | --- | ---: |
  | `Multi-agent:` | 51 |
  | `RETURNS change_report` | 33 |
  | `TAB_NOT_OWNED` | 55 |

- **Registry hash.** It is pinned in exactly four tests, confirming 2b. It hashes whole registry entries, so any new underscore field would move it.
- **`importScripts` pins.** `extension/background.js` has 334 `importScripts` tokens and 330 calls, which match the pins at `tests/lattice-provider-bridge-smoke.test.js:635-636`.
- **Line-reference corrections to the analyzer:**
  - `_PAGE_INJECTION_TIMEOUT_MS` is 750 ms (`mcp-tool-dispatcher.js:4121`), not 450.
  - The safety net `_CHANGE_REPORT_SAFETY_NET_MS` is 500 ms.
  - Only `open_tab` and `close_tab` are in `MCP_DISPATCHER_SYNTHETIC_CHANGE_REPORT_TOOLS` (`mcp-bridge-client.js:62`). `switch_tab` is excluded by the wrapper's skip list, not by the synthetic set.
- **`_emitChangeReport`** is true on 32 registry tools, including `navigate`, `go_back`, `go_forward`, `refresh`, `open_tab`, `switch_tab` and `close_tab`. `wrapWithChangeReport` skips those seven, so 25 wrapped interaction tools remain. Without `fill_sheet`, that leaves 24.
- **Published schema of a stringified-object guard.** `z.preprocess(parseIfString, z.object(...).strict())` publishes as `{"type":"object","properties":{...},"additionalProperties":false}`. The JSON-string acceptance is therefore invisible in the published schema.
- **Cost of `expect`** in canonical JSON per tool, with a 116-character description:

  | Layout | Bytes per tool | Over 29 tools |
  | --- | ---: | ---: |
  | Nested (`value_equals` and `checked` objects) | 829 | about 24 KB |
  | Flat (`selector` plus `state`/`value`) | 559 | about 16 KB |

  This cost was not in the analyzer's assumptions. It conflicts with MCP-01's budget, and it drove D-06's whole-list floor and D-13's flat layout.
- **No test asserts MCP description substrings.** Only the registry hashes lock description text. Raw-source readers per file:

  | File | Tests that read it |
  | --- | ---: |
  | `mcp-tool-dispatcher.js` | 38 |
  | `action-verification.js` | 6 |
  | `visual-session.ts` | 4 |
  | `manual.ts` | 3 |
  | `agents.ts` | 3 |
  | `schema-bridge.ts` | 2 |
  | `errors.ts` | 1 |

- **Test chain.** `tests/browser-editing-actions.test.mjs` runs in the `pretest` chain. `tests/delegation-phase-contract.test.js` checks only the `test` chain.

## Corrections Made

No corrections — auto mode. No user was available to review the assumptions. Where the orchestrator's verification found a factual error (tool count, injection timeout, synthetic tool set, name split), CONTEXT.md uses the verified fact.

## Auto-Resolved

| # | Item | Chosen option | Reason |
| --- | --- | --- | --- |
| 1 | Tool count, 1a (D-02) | Confirmed 72 at the pin, 73 after Phase 66.1. Checks count from the runtime. A doc-only wording fix to REQUIREMENTS, ROADMAP and PROJECT goes in the final plan. | Measured twice. The brief's "74" and the docs' "73" are both miscounts. |
| 2 | Baseline fixture, 1b (D-04) | (a) A frozen fixture of the full canonical `tools/list` at the pin, plus a regenerate script that runs when history is available. | CI is shallow. One artifact serves both the budget gate and the shape freeze. |
| 3 | Token unit, 1c (D-05) | (a) Bytes, characters, and `ceil(chars/4)` labelled "estimate". Exact counts go to V4. | No new dependency (Phase 66 D-13). Exact counts need a credential (External Research 3). |
| 4 | Gate thresholds, 1d (D-06) | (a), with one addition: at least 50% fewer description plus parameter-description characters over the 72 baseline names, at most 2,048 characters per tool, **plus** at least 20% fewer whole-list bytes including the `expect` scaffolding. PROJECT.md's "more than half" is reported, not gated. | The measured `expect` cost of 16-24 KB would otherwise silently eat the savings. 2,048 is the description limit on Claude Code builds before v2.1.296 (External Research 2). |
| 5 | Location of the short text, 2a, Unclear (D-07) | **(b)**: an MCP-side description module. The registry and the four hash pins are untouched. **This deviates from the analyzer's recommendation (a).** | See "Reason for item 5" below. |
| 6 | Must-keep proof, 2d (D-10) | (a) An automated table in a test. A human read-through goes to V5. Server `instructions` (c) are rejected. | It fits the validation deferral policy. `instructions` are an unapproved wire addition (External Research 4). |
| 7 | `expect` location, 3a (D-11) | (a) MCP-only zod addition. | Phase 66.1 SC5 precedent. The autopilot list stays unchanged and the registry hash does not move. |
| 8 | `expect` shape, 3b (D-13, D-14) | (a) A closed object in a **flat** layout (`selector` plus `state`/`value`, with `dialog_open`), **plus (c)**: also accept a JSON-string form through `z.preprocess`. | Flat costs 559 bytes per tool against 829 for nested. Hosts have repeatedly stringified object arguments (External Research 1). An in-repo precedent exists in `triggers.ts`, and the published schema is unchanged. |
| 9 | Transport, 3c (D-15) | (a) A top-level sidecar, removed before `PARAM_TRANSFORMS`. When absent, no key is added. | Five transforms rebuild params from scratch. The `visualSession` precedent exists. Payloads stay byte-identical. |
| 10 | Supported tools, 3d, Unclear (D-12) | (a) 29 tools: the 24 wrapped interaction tools (`fill_sheet` excluded) plus `navigate`, `go_back`, `go_forward`, `refresh` and `back`. | See "Reason for item 10" below. |
| 11 | Where evaluation runs, 4a (D-17) | (a) Inside `wrapWithChangeReport`, with the gate refactored. Without `expect`, the path is unchanged. `back` uses the same evaluator. | It reuses the stability race and URL capture with no extra round trip. The toggle tests must pass unmodified. |
| 12 | Result contract, 4b (D-19) | (a) Three states plus per-check detail. Aggregation: all met gives `verified`; any unmet gives `unmet`; otherwise `uncertain`. The field is omitted on definitive pre-execution failures. | Roadmap SC2 requires three states. Error shapes stay unchanged. |
| 13 | Unknown-outcome path, 4c (D-21) | (a) Append `expect_result` to the trailing JSON and keep `isError:true`. **Plus** when the status is `verified`, the "Next action" line says the effect was observed and the action must not be repeated. | This is the case where `expect` matters most. Keeping `isError` keeps the 2026-09-30 single-activation semantics. The changed wording appears only when `expect` is present, so output is byte-identical without it. |
| 14 | Time bound, 4d (D-20) | (a) A 2,000 ms default and a 5,000 ms cap. Values are clamped, not rejected, and the constants are labelled uncalibrated (V4). | It fits the 30 s MCP timeout. The serialized `TaskQueue` stall stays bounded. |
| 15 | Evaluator location, 4e (D-18) | (a) Extend `action-verification.js`. DOM probes run in the ISOLATED world; URL and title checks use `chrome.tabs.get`. | No `importScripts` pin bumps. Page scripts cannot spoof the probes. URL and title stay observable across origins. |
| 16 | SC3 proof, 5a (D-22) | (a) A frozen shape fixture plus call-level byte checks. The registry hashes are kept, not replaced. | The registry is untouched under item 5, so the existing hashes become free proof. |
| 17 | SC4 proof, 5b (D-23) | (a) Both layers: an in-process SDK caller with a fake bridge running the real evaluator (never skipped), and a headless Chrome fixture page (may skip). | The validation policy requires an automated caller test. Port 7225 may be held by the installed daemon. The bench core fixtures are frozen. |
| 18 | The 66.1 `tools/list` freeze (cross-phase, found during orchestration; D-22) | In the same commit that first shortens any description, replace the description-equality part of 66.1 D-21's contract test with the Phase 69 shape projection, budget gate and must-keep table. Keep name and shape equality, "minus `settings`", and the `TOOL_REGISTRY`, prompt-table and `fsb://config` freezes. | See "Reason for item 18" below. |
| 19 | User-facing docs for `expect` (D-01, Claude's Discretion) | Defer to the Phase 71 release (V6). The prompt table and the pinned README counts stay untouched. Only the planning-doc count wording is fixed here. | It aligns with 66.1 D-22 (docs move with the release) and avoids churn on pinned doc counts. |

**Reason for item 18 (the 66.1 freeze).**
- A sibling session wrote `66.1-CONTEXT.md` while this phase was being analyzed. Its D-21 adds a test pinning the 72 tools' descriptions byte-equal to `8a058bdf`.
- Phase 69 changes those descriptions on purpose (MCP-01), so that test must change in the same commit, or the suite goes red.
- 66.1 also confirms the tool is named `settings`, lives in `mcp/src/tools/settings.ts` outside `TOOL_REGISTRY`, and that 72 tools at the pin become 73, which is consistent with D-02.

**Reason for item 5 (description location).**
- **Same release path either way.** The MCP server serves its build-time copy of the registry (`mcp/ai/tool-definitions.cjs`, copied by `mcp/package.json:47`). New descriptions reach callers only through an MCP release under option (a) or (b), so (a) moves no work into the extension.
- **Tripwires.** Option (a) would re-baseline four tripwires that exist to lock the registry, and would ship MCP-only prose in the extension bundle. Under (b), the unchanged hashes prove that autopilot prompts did not move, which is the owner's rule that with Jev off FSB behaves as before.
- **Owner direction.** Descriptions are part of the MCP tool schema, so editing them in `mcp/src` is within "touch `mcp/src` only where a tool schema must change".
- **Precedents for MCP-only text in `mcp/src`:**
  - `CHANGE_REPORT_DESCRIPTION_SUFFIX`;
  - the note in `capabilities.ts` about keeping the registry byte-stable;
  - Phase 66.1 SC5.
- **Option (c) is rejected.** It changes autopilot prompts with Jev off.

**Reason for item 10 (supported tools).**
- "Navigate, then check" is the most common verification flow, so leaving navigation out would weaken SC4.
- The excluded tools fall into these groups:
  - tools with synthetic results or tab-level effects (`open_tab`, `switch_tab`, `close_tab`);
  - tools with no change report (`search`, `hover`, `focus`, `scroll`, `scroll_at`);
  - long-running tools (`fill_sheet`);
  - tools with their own engine (`trigger`);
  - tools gated on confirmation (vault and payment);
  - `run_task`, which belongs to Phase 70.
- Each extra tool costs about 560 bytes of schema.

Confident items 1a, 2b, 2c and 5c were accepted as stated, with the verification notes above. Items 2b and 2c became background facts in D-01, D-07 and D-24. Item 5c became D-24.

## External Research

**1. Do hosts send nested-object tool arguments as JSON objects or JSON strings?**
- **Finding: yes, it recurs.** Anthropic clients have repeatedly regressed into sending object or array arguments as JSON-encoded strings:
  - claudeissues #59227 (May 2026): the Agent SDK bundled in Claude Desktop 1.7196.0 and Claude Code CLI 2.1.138 sent `array`/`object` arguments as strings. It was closed as a duplicate of a run of earlier issues resolved across v2.1.62 to v2.1.270.
  - #81477 (July 2026, closed October 2026): Claude Cowork stringified object parameters declared through `$ref`/`$defs`. The Claude Code CLI was not affected.
- **In-repo precedent.** The repository already works around this for the trigger `condition` (`mcp/src/tools/triggers.ts:63-81`), and for numbers (commit `9c25405b`).
- **Not verified:** Cursor, Codex and VS Code. Their behavior is not established here.
- **Decision.** `expect` accepts a JSON string as well as an object (D-14), and its schema avoids `$ref`, `$defs`, `anyOf` and `oneOf` (D-13).
- **Verified locally.** The `z.preprocess` guard does not change the published schema.
- Sources: https://claudeissues.com/issue/59227-mcp-tool-calls-list-dict-arguments-sent-as-json-encoded-strings-instead-of-nativ , https://claudeissues.com/issue/81477-bug-cowork-object-mcp-tool-arguments-arrive-as-json-strings-is-not-of-type-objec , https://claudeissues.com/issue/25962-mcp-tools-with-nested-object-parameters-are-broken-serialized-as-string-instead

**2. How hosts load descriptions, and their limits.**
- **Claude Code docs** (fetched 2026-10-15 from code.claude.com/docs/en/mcp.md, "Scale with MCP tool search"):
  - Tool search is on by default.
  - "Only tool names and server instructions load at session start."
  - Claude Code cuts descriptions that run past these limits:

    | Text | Limit |
    | --- | ---: |
    | Server instructions, and the description of a tool loaded upfront | 4,096 characters |
    | The description of a tool loaded through tool search | 16,384 characters |

  - "Before v2.1.296, the shorter limit was 2,048 characters, and before v2.1.295 it applied to every tool description."
  - Tool search matches a query against only the start of a description, so search terms should come first.
  - `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` overrides both limits.
- **Decision.**
  - Keep the per-tool cap of at most 2,048 characters, so every description is whole on older Claude Code builds. `execute_js`, at 2,187 characters, is cut today.
  - Put search terms in the first sentence (D-09).
  - Pitfall 11 is confirmed: with tool search on, description size matters mostly once a tool is loaded, so V4 also judges by wall time and caller error rate.
- **Not verified:** Cursor's truncation and loading behavior.
- Source: https://code.claude.com/docs/en/mcp

**3. How good is chars/4?**
- **Findings:**
  - Claude tokenizers differ by model. Anthropic disclosed that Opus 4.7's tokenizer produces 1.0 to 1.35 times as many tokens as earlier Claude models for the same text, depending on content type (OpenRouter's analysis measured about 32-45% more).
  - JSON- and selector-heavy text has fewer characters per token than prose.
  - So chars/4 is unreliable in absolute terms. As a ratio it is reasonable, but it is biased here: cutting prose while keeping the fixed schema scaffolding shifts the mix toward denser text, so the true token cut is likely smaller than the character cut.
  - Anthropic's `count_tokens` endpoint accepts `tools`, and it is free, but it needs an API key and is rate-limited by tier.
- **Decision.**
  - Gate on deterministic characters and bytes, and label tokens as an estimate (D-05, D-06).
  - Run exact per-model counts of the baseline list and the new list in V4.
- Sources: https://platform.claude.com/docs/en/build-with-claude/token-counting , https://openrouter.ai/blog/opus-47-tokenizer-analysis , https://simonwillison.net/2026/Apr/20/claude-token-counts/

**4. Are server `instructions` and tool `annotations` metadata, or a wire-contract change?**
- **Findings** (MCP spec 2025-11-25):
  - `instructions` is an optional field of `InitializeResult` (basic/lifecycle).
  - Tool `annotations` are optional behavior hints (server/tools). "Clients MUST consider tool annotations to be untrusted unless they come from trusted servers."
  - FSB sets neither today: `mcp/src/server.ts` has no `instructions`, and `mcp/src/tools` has no `annotations`.
  - Both would change the serialized `initialize` or `tools/list` responses.
  - MCP-04 allows only `expect` and the Phase 66.1 settings tool.
- **Decision.** Neither is used in Phase 69. Both are deferred ideas. `instructions` would be worth a reviewed MCP-04 amendment after V4, because Claude Code loads them at session start under tool search.
- Sources: https://modelcontextprotocol.io/specification/2025-11-25/server/tools , https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
