# Feature Research

**Domain:** Decision-model-accelerated browser automation (Jev as a fast "System One" beside an LLM) inside a Chrome MV3 extension, plus latency-focused design of an MCP tool surface driven by external agent callers
**Milestone:** v1.0.0 Jev Fast Mode
**Researched:** 2026-09-28
**Confidence:** MEDIUM overall. HIGH for MCP client behavior and SDK support (official docs, the MCP spec 2026-07-28, VS Code and Claude Code source, the installed SDK types) and for FSB code facts (read and measured in this repo). MEDIUM for Jev integration patterns (consistent across many builds, but nearly all self-reported and small-n). LOW for any claim that Jev raises task success.

> Supersedes the v0.9.91 feature research (archived as `FEATURES-v0.9.91-MCP-CLIENTS.md`). Jev facts are consolidated in `JEV-REFERENCE.md`; this file cites it instead of repeating it.

**Evidence labels used below:** **(official)** vendor documentation or protocol spec; **(source)** read directly in code, FSB's or a client's; **(measured)** computed locally on this repo; **(independent)** measured by someone other than the builder; **(self-reported)** a builder's own numbers on its own workload; **(vendor)** a company measuring its own product; **(community)** wiki, blog, forum or issue thread, unverified.

## How comparable systems do this (survey)

**1. The jev-ultrafast pattern and its Chrome-extension port.** Browser Use's jev-ultrafast is the template almost every Jev browser agent copies. One in-page script builds a numbered table of visible, enabled, in-viewport controls (capped at 250 actions) plus up to 6,000 characters of visible text. Each step sends one request carrying an `operation` Choice over only the operations currently possible and a speculative target Choice per operation ("Two decisions, one network round trip"). A small LLM writes text only for `TYPE_TEXT`, returning exactly `{"text": ...}` or `{"text": null}` when the value is missing. Code rejects any answer that is not an offered ID, whose probabilities do not sum to about 1, or that is not the argmax; it re-checks freshness and occlusion before input, and "model output never becomes selectors, coordinates, shell commands, or executable JavaScript" (self-reported, [README](https://github.com/browser-use/jev-ultrafast)). **Jev for Chrome** is the closest analogue to FSB: an unofficial MV3 port that drives the user's own tab, gives each element a code-owned index, role, accessible name, current value and section heading, sends input through CDP via the `debugger` permission, and adds two independent Nouls ("task achieved", "stuck") that withhold a DONE or BLOCKED once when they score it below 50%. It never presses Enter implicitly, ends a run as BLOCKED when one control is chosen 3 times in 6 steps, stops after 3 consecutive actions that change nothing, and passed 13 of 17 tasks judged by URL or text checks; its longest failure was a stale-DOM executor bug fixed by hit-testing every control (self-reported, [repo](https://github.com/chy4pro/jev-for-chrome)). Per-decision speed is real across builds (150–450 ms), but the third-party checks are sobering: 25/49 on raw DOM controls versus 49/49 with WebMCP tools (independent, [WindTunnel](https://github.com/nekuda-ai/WindTunnel)), an LLM-only loop beat jev-ultrafast's published flight time (independent, [dejevu](https://github.com/idovmamane/dejevu)), and one WebArena subset saw median task time double even as each decision got faster (self-reported, Jevry via jevwiki).

**2. Bounded one-call executors behind MCP.** The builds that save the calling agent time run the whole loop server-side and return a typed outcome. `jev-ultrafast-mcp`'s `browser_goal(goal, url, verify=[...])` returns `status`, `steps`, a per-step trace with model and browser milliseconds, and a code-checked `verified: PASS` that "outranks the model's own account"; its example 3-step form took 3.3 s in one caller turn, and it also offers `needs_confirmation`, domain allow/deny lists and zero-model macro replay (self-reported, [README](https://github.com/jiawei686/jev-ultrafast-mcp)). Ying-Kai-Liao's server returns `ambiguous` or `likely_done` on low confidence and reports 40 of 42 live tasks with zero false "done" (self-reported, via aggregator). forvela's executor takes explicit values from the parent agent so Jev never generates text, puts `none_of_the_above` on every target head, ends on `goal_reached ≥ 0.8` (or `≥ 0.6` plus completion evidence), and escalates a structured state when ambiguous, repetitive or blocked (self-reported, [decision.js](https://github.com/forvela/jev-agent-browser/blob/HEAD/src/decision.js)). The most transferable number is Mahmoud Adelbghany's: a Jev executor under Claude finished 12 of 12 tasks in 12.2 s for $0.20 against 18.4 s and $0.31 for Claude on Playwright MCP, using confidence floors of 0.3 for reversible actions with next-step verification and 0.5 otherwise (self-reported, Claude arms run once, [RESULTS.md](https://github.com/MahmoudAdelbghany/jev-browser/blob/HEAD/RESULTS.md)). Non-Jev bounded executors converge on the same contract: Stagehand's `agent.execute({instruction, maxSteps, output})` returns `success`, `completed`, `message`, `actions`, a typed `output` and `usage` including inference time (official, [docs](https://docs.stagehand.dev/v3/references/agent)).

**3. Verify-in-the-same-call.** Playwright MCP returns a fresh accessibility snapshot after most actions and offers `browser_wait_for` plus `browser_verify_*` assertion tools behind `--caps=testing`, which "fail immediately if the condition isn't met", so action, wait and verify cost three caller turns (official, [assertions](https://microsoft-playwright-mcp.mintlify.app/tools/test-assertions)). The Jev executors above fold the check into the executing call. FSB already returns a `change_report` on every change-reporting action after a stability race capped at 500 ms (source, `wrapWithChangeReport` in `extension/ws/mcp-tool-dispatcher.js`), but its `execute_js` description tells callers to "verify with read_page or get_page_snapshot" after a JS click, which costs an extra turn each time (source, `extension/ai/tool-definitions.js`).

**4. What MCP clients actually do with descriptions, annotations and instructions (Sep 2026).**
- **Claude Code** turns on tool search by default: "Only tool names and server instructions load at session start", and it truncates each tool description and the server instructions at 2 KB (official, [MCP docs](https://code.claude.com/docs/en/mcp-servers)). Its client maps `readOnlyHint` to both "concurrency safe" and "read only", so read-only tools can be dispatched in parallel (source, client snapshot; MEDIUM because the snapshot is a third-party mirror), but its permission engine does not auto-approve on annotations (open issues [#87452](https://github.com/anthropics/claude-code/issues/87452), [#83886](https://github.com/anthropics/claude-code/issues/83886)). It honors per-tool `_meta["anthropic/alwaysLoad"]` (v2.1.121+) and `_meta["anthropic/requiresUserInteraction"]` (v2.1.199+, prompts on every call even in bypass modes), warns above 10,000 output tokens and caps at 25,000, supports elicitation dialogs, and lets an `Elicitation` hook auto-answer them (official). It prefers `structuredContent` over text when both are present (Anthropic staff reply on [#9962](https://github.com/anthropics/claude-code/issues/9962)).
- **Cursor** has synced MCP tool descriptions to files since January 2026 and gives the agent only tool names up front, which cut total agent tokens by 46.9% in runs that used an MCP tool (vendor A/B, [blog](https://cursor.com/blog/dynamic-context-discovery)). It supports elicitation and routes approvals through Auto-review, allowlists and `permissions.json` (official, [docs](https://cursor.com/docs/mcp)). A result carrying only `structuredContent` reaches its model empty, so Cursor effectively reads the text channel (community forum, staff-confirmed). Whether Cursor reads server instructions or annotations is unverified.
- **VS Code Copilot** stores `InitializeResult.instructions` (source, [mcpServer.ts](https://github.com/microsoft/vscode/blob/234229df/src/vs/workbench/contrib/mcp/common/mcpServer.ts)) and reportedly skips its confirmation dialog only for tools marked `readOnlyHint: true` (community, consistent with its documented confirm-by-default behavior).
- **Claude Desktop and claude.ai** drop server instructions (community, [#23808](https://github.com/anthropics/claude-code/issues/23808), [claude-ai-mcp#131](https://github.com/anthropics/claude-ai-mcp/issues/131)).
- **The spec** has defined `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` since 2025-03-26 with conservative defaults (not read-only, destructive, open-world), and clients "MUST consider tool annotations to be untrusted unless they come from trusted servers" (official, [tools spec 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)). The 2026-07-28 revision also adds an `input_required` tool result carrying elicitation requests, which is too new to rely on.
- **FSB's pinned SDK (1.29.0)** already exposes the annotations overload of `server.tool()`, per-tool `_meta`, the server `instructions` option and `elicitInput` (source, installed type definitions), so none of these needs an SDK upgrade.

## What this means for FSB

1. **MCP time is the caller's time.** FSB executes a call in roughly 0.3–1 s of a 4.6–9.5 s median, so a feature speeds MCP only if it removes caller turns or shrinks what each turn must read. `expect` removes verification turns, a bounded `run_task` fast mode collapses a click sequence into one call, `readOnlyHint` enables parallel reads in Claude Code and removes read prompts in VS Code, and server `instructions` help discovery. Shorter descriptions mainly cut tokens and cost.
2. **Claude Code sees almost nothing of FSB at session start.** With tool search on by default it loads names and server instructions, and FSB sends no instructions (source, `mcp/src/server.ts`). `execute_js` goes out at 2,187 characters, so Claude Code already cuts the end of its `change_report` contract (measured).
3. **The ">50% shorter" target is mostly deduplication.** About 45k of the roughly 88k characters in FSB's tool list are four blocks repeated verbatim: the `change_report` suffix (434 characters on 32 tools, 13.9k), the visual-session field descriptions (111 parameters, 13.4k), the `tab_id` description (51 parameters, 10.0k) and the multi-agent sentence (43 tools, 7.9k) (measured from `TOOL_REGISTRY` plus `manual.ts`).
4. **Autopilot has no pre-execution confirmation gate for Jev to tighten.** `PermissionContext.isAllowed()` always returns true, the `confirmSensitive: true` default has no reader, and the only irrevocable-verb logic records clicks into memory after they happen (source). "Jev can only add confirmations" therefore needs a deterministic gate built first; otherwise Jev becomes the sole gate, the design the evidence warns against most.
5. **Journal-backed MCP sessions list but cannot be opened.** The Lattice journal stores runs in IndexedDB and adds them to `fsbSessionIndex`, which `list_sessions` reads, but `get_session_detail` reads only `fsbSessionLogs` and the in-flight map (source). The benchmark depends on fixing this.
6. **Tool descriptions are shared with autopilot.** The tool-use adapter sends each registry `description` to the autopilot LLM (source, `extension/ai/tool-use-adapter.js`), so the description cut is also an autopilot change: it trims every iteration's input and must be benchmarked on both sides.
7. **Plan for speed and cost, not success.** Whole-agent A/B tests mostly cut cost and context without raising success (community), and DOM-only Jev scored 25/49 (independent). Every fast path must escalate rather than guess, and "done" must be earned by code checks.

## Feature Landscape

### Table Stakes (the milestone's promise fails without these)

| Feature | Why Expected | Complexity | Depends on (existing FSB) and notes |
|---|---|---|---|
| **Per-call timing split** for MCP and autopilot | Every speed claim needs FSB time separated from caller time; the current baseline was assembled by hand | MEDIUM | MCP session recorder and Lattice journal already stamp events and attempts. Stamp received, dispatched and completed at the MCP server boundary; derive `fsb_ms`, `settle_ms` (already in `change_report`) and `caller_gap_ms`; per autopilot iteration record `llm_ms`, `jev_ms`, `tool_ms` |
| **`get_session_detail` resolves journal-backed MCP sessions** | Benchmark runs and users inspect MCP work through it | LOW | Additive fallback in `handleGetSessionMessageRoute` to the journal's `getRun`/`getEvents`/`exportHumanReadable`; same response shape; confirm with a live repro first |
| **Repeatable before/after benchmark suite** | The goal is "measurably faster"; jev-ultrafast's own authors call three matched pairs "too few for a strong statistical claim" (self-reported) | HIGH | Tasks drawn from the recorded categories (UAT checks, Jira reading, hotel booking) plus click-heavy forms; success judged by URL, text or DOM checks, never by DONE; at least 5 runs per arm; pinned client, model and Jev snapshot. No recorded autopilot sessions exist, so the autopilot baseline must be produced from scratch before anything else lands |
| **Jev decision provider (opt-in)** | Core dependency of every Jev seam | MEDIUM | New provider type beside `UniversalProvider`, since `/v1/systemone` is not a chat endpoint. Default: the stored OpenRouter key, `POST https://openrouter.ai/api/v1/systemone`, pinned `typesafe/jev-1.13` (official); optional direct TypeSafe key with `jev-1.13.0`. Thin `fetch` client in the service worker; base URL, key and model bound together; returned model/snapshot logged on every call; `usage.cost` fed to `cost-tracker.js`; Providers panel entry with a test button |
| **Clean fallback and availability states** | No SLA, dynamically adjusted rate limits, direct signups closed (official) | LOW–MEDIUM | Short per-call timeout (about 1.5–2 s), bounded retries on 429/503/529 only, no retry on 400/401/422, a circuit breaker. Each seam defines its no-Jev behavior: autopilot falls back to today's LLM loop, `run_task` fast returns a typed `unavailable`. A task never fails because Jev failed |
| **State hygiene** | Every call sends page text and URLs off the machine; one popular build also sends typed passwords (self-reported, [jev-browse](https://github.com/kyrylosyzonenko/jev-browse)) | MEDIUM | Skip password, file and hidden inputs and their values; never serialize vault values (route logins to `fill_credential`); reuse `redactForLog`; mark page text untrusted in the instructions; keep state plus all questions under OpenRouter's 32k-token total (official), which is tighter than direct TypeSafe's per-question budget. Disclose in the Providers panel that page text leaves the machine |
| **Per-step element table and operation menu** | Jev can only pick what code offers; jev-ultrafast's first DOM reader "failed independent verification because name/value extraction was incomplete" (self-reported) | MEDIUM–HIGH | Build from `getFilteredElements` and `refMap`, which today cut names to 60 characters and do not list values. Include index, role, full accessible name, current value, checked/selected/expanded, section heading and href; offer only operations possible now; rebuild every step; keep each target head under about 200 options (255 is the hard cap) |
| **One fan-out Jev request per step** | "Two decisions, one network round trip" (self-reported); batching 13 questions was about 10× faster and 12× cheaper (official) | MEDIUM | Operation Choice plus one target Choice per offered operation, each with `none_of_the_above`, plus goal-reached and stuck Nouls. Pace at most about 2 requests/s per agent: 8 agents at jev-ultrafast's 2.4 requests/s would reach about 1,150 of TypeSafe's documented 1,200 per minute (OpenRouter's Jev limits are undocumented) |
| **Validate, re-check, then act** | Jev can pick a wrong index with high confidence, and stale DOM was Jev for Chrome's longest failure (self-reported) | MEDIUM | Reject answers that are not offered, do not sum to about 1 or are not the argmax; confirm same URL and snapshot generation, element attached, visible and not covered. Use strict readiness: FSB's click paths fall back to a programmatic click when a target is obscured (`content/actions.js`), which Jev picks must not do. Consume each decision once so a retry cannot double-click |
| **LLM keeps plan, text, reading and hard steps** | Jev cannot write text; reading and extraction were better left to the LLM (self-reported, Mahmoud); counting and sorting are documented Jev weaknesses (official) | MEDIUM–HIGH | `TYPE_TEXT` goes to a small LLM with the jev-ultrafast `{"text": ...}` contract; reading questions go to the LLM; anything below threshold, `none_of_the_above`, BLOCKED or stuck gets one ordinary LLM iteration, then Jev resumes. Same tool registry (INV-02) and provider parity (INV-03) |
| **DONE veto and a separate step budget** | "DONE is never independent evidence of success" (self-reported, jev-ultrafast); FSB's iteration cap counts LLM turns | MEDIUM | Accept a Jev DONE only when the goal Noul clears its cut and FSB's completion signals agree; the goal Noul may also veto the LLM's `complete_task` (tighten only). Cap Jev steps and wall time separately from `maxIterations`; stop after 3 actions that change nothing |
| **Decision log, then shadow mode before thresholds go live** | Thresholds must come from FSB's own labels on a pinned version; community cut points ran from 0.77 to 0.95 across datasets (community) | MEDIUM | Log per step: decider (Jev, LLM or code), operation, target, confidence, latency, model snapshot, instrument version. Shadow mode runs Jev beside the normal loop and records its pick against the LLM's actual call and the code-verified outcome, then reports accuracy per confidence bucket |
| **Shorter, deduplicated tool descriptions** (names and schemas unchanged) | Milestone target; about half the tool-list text is repetition (measured); Claude Code cuts each description at 2 KB (official) | MEDIUM | Edits `tool-definitions.js` (shared with autopilot), `CHANGE_REPORT_DESCRIPTION_SUFFIX` in `mcp/src/tools/manual.ts`, and the visual-session and `tab_id` parameter text. Shared contracts move to server instructions, the FSB skill and typed-error `recoveryHint`s. Source-pin tests need paired updates |
| **`expect` on action tools, checked in the same call** | Removes the verification turn Playwright MCP spends two extra calls on; each removed caller turn saves one median turn (4.6–9.5 s) | MEDIUM | Evaluated in code after `wrapWithChangeReport`'s stability wait, with a bounded poll; returns `expect_result` and leaves the meaning of `success` unchanged. Adds one optional property to each action tool's schema, so the schema-lock tests change. The baseline phase should count how many recorded calls were post-action verification reads, to size the win |
| **Bounded fast mode on the existing `run_task`, with typed outcomes** | Collapsing N clicks into one call is where "one call instead of a turn per click" and the 1.5× result come from (self-reported) | HIGH | Additive optional parameters only; reuses the autopilot fast-mode executor, `run_task`'s lifecycle (30 s heartbeats, 600 s safety net, `partial_state`) and the `mcp-agent` execution mode with a much tighter budget. With no new parameters, `run_task` behaves exactly as today |
| **`run_task` description invites the bounded mode** | Its description says to use it only when the user asks for autopilot (source), and agents ignore optional tools they are not steered to (0 calls in 150, community) | LOW | Keep the full-autopilot opt-in wording; add one line recommending fast mode with `verify` for short, checkable sub-goals |
| **Deterministic sensitive-action gate (the baseline Jev tightens)** | "Keep classification separate from authorization" (official, Vercel); no source recommends Jev as the only gate | MEDIUM–HIGH | Replaces the stub path: code rules for purchase, payment, delete, send, post, account and permission changes, `use_payment_method`, and checkout-form submits. Autopilot shows a side-panel approval card (reuse the replay consent-card pattern); `run_task` fast returns `needs_confirmation`; manual MCP tools are unchanged because the caller already confirms per `skills/fsb/SKILL.md` |
| **Jev risk signals can only add confirmations** | Several narrow signals plus policy code had 0.0% false allows against 12.4% for a single Jev verdict (self-reported, authors' own labels, [Kinde](https://github.com/kinde-starter-kits/jev-agent-authorization)) | MEDIUM | Nouls for irreversible, moves money, publishes or sends, matches the request, follows page-text instructions, plus a severity Score, OR-combined with the code gate. Asked in a second short request only for actions code flags as possibly consequential. If Jev is down, the code gate alone applies, so users never get fewer confirmations than the baseline |
| **Release and version discipline** | Milestone requirement | LOW | `CHANGELOG.md` `## v1.0.0` first, then `npm run version:set:extension -- 1.0.0` (`sync-product-version.mjs` refuses otherwise); MCP 0.11.0 → 0.12.0 for the additive parameters; update `skills/fsb/SKILL.md` and the MCP README for `expect`, fast mode and the new descriptions |

### Differentiators (valuable, not required for launch)

| Feature | Value Proposition | Complexity | Notes and dependencies |
|---|---|---|---|
| **Accurate tool `annotations` from an explicit per-tool table** | VS Code stops prompting on reads; Claude Code can run read-only tools in parallel (source) | LOW–MEDIUM | The SDK overload already exists (source). Do not derive hints from `_readOnly`: it also marks `complete_task`, `partial_task`, `fail_task` and `stop_trigger`, which change state. Adds tool-list metadata, so it needs an explicit INV-01 ruling |
| **Server `instructions`** (2 KB or less, most important first) | Claude Code's tool search loads only names and instructions (official); VS Code stores them (source) | LOW | What FSB is for, the fast path (navigate, read, act with `expect`, or `run_task` fast for multi-step flows), and the multi-agent, visual-session and vault rules in one line each. Never the only home for a rule |
| **`anthropic/alwaysLoad` on 5–8 core tools** | Skips a ToolSearch round trip, which is a model turn, in Claude Code (official) | LOW | Only after descriptions shrink; measure context cost; needs the same INV-01 ruling |
| **Caller-supplied `values` for fast mode** | The calling LLM already knows what to type; Jev maps provided strings to fields (self-reported, forvela and Mahmoud), removing the second model and working when FSB has no LLM key configured | MEDIUM | Returns `needs_input` instead of inventing a value |
| **Timing trace in every fast-mode result** | Makes speed checkable per call, as jev-ultrafast-mcp's "4 decisions · 1.8 s model + 1.1 s page · 3.3 s wall" line does (self-reported) | LOW | Reuses per-call timing |
| **Automated caller-side benchmark driver** | MCP arms are 85–90% caller time; scripted headless runs beat hand runs | MEDIUM | The Claude Code, OpenCode and Codex adapters from v0.9.91 already spawn agents and parse their streams (the Claude result event is parsed with passthrough; confirm timing and cost fields at phase time). Include a stub arm (FSB heuristics only, or always escalate) |
| **Tool-list size budget in CI** | Stops description creep after the cut | LOW | Sits beside the existing source-pin tests |
| **Instrument versioning and model-drift refusal** | "A reworded question is a new instrument", and aliases move silently (community, official) | LOW–MEDIUM | Hash question text, criteria and their order, the state builder, thresholds and the model pin into one version; refuse to act on answers from an unexpected model; re-run calibration on any change |
| **Fast-mode visibility** | Users should see why a run was faster and when it asked the LLM | LOW–MEDIUM | Overlay "Fast" state; session detail shows "Jev decided N of M steps, K escalations"; Providers status (ready, rate-limited, unavailable); no raw probabilities for end users |
| **Faster LLM steps inside fast mode** | The LLM steps that remain dominate wall time | MEDIUM | Small fast model for `TYPE_TEXT`; cache-friendly prompt order (history before page state); screenshots only when needed, about 0.8 s each (vendor, [Browser Use](https://browser-use.com/posts/speed-matters)) |
| **Jev pre-ranking of elements for the normal LLM path** | Could shrink what the LLM reads: 4.4× fewer tokens at equal accuracy in a skill router (community) | MEDIUM | Scores flatten with about 53 near-identical candidates; batch 16–32 (community). Defer until shadow data exists |
| **Elicitation for `needs_confirmation`** | An in-client confirm dialog in Claude Code, Cursor and VS Code (official) | MEDIUM | Not a hard gate, because Claude Code's `Elicitation` hook can auto-answer; the typed return stays the primary path |
| **Zero-model replay of a verified fast-mode path** | The second run costs no model calls (self-reported, jev-ultrafast-mcp) | MEDIUM | FSB already has signed session replay and procedural memory; defer |

### Anti-Features (commonly proposed, harmful here)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| An "ask Jev" MCP tool, or Jev offered to the caller as a tool | Looks like the simplest integration | An optional Jev tool was called 0 times in 150 (community); it would also add a tool | Call Jev from code inside FSB |
| Jev removing or auto-approving confirmations | Fewer prompts feel faster | Approval-framed injections got dangerous commands through, and catching all attacks escalated 58% of normal traffic (community); OpenRouter's own cookbook uses Jev to auto-approve routine permission prompts, the opposite of FSB's rule | Jev only adds confirmations; the code gate is final |
| Jev writing text, selectors, coordinates, JavaScript or tool arguments, or doing counting, sorting or date math | "One model for everything" | Jev is not trained to generate, and its counting error grows with size (official) | The LLM or caller `values` supply text; code counts and compares |
| Treating DONE, from Jev or the LLM, as success | Simple scoring | A progress probability read low on a real success, and DONE is not evidence (self-reported, community) | Code checks via URL, text, DOM or `verify`; `likely_done` when nothing can be checked |
| Using aliases (`jev-latest`, `~typesafe/jev-latest`) or copied demo thresholds | Convenience | Aliases move without notice; thresholds did not transfer across datasets (official, community) | Pin `typesafe/jev-1.13` or `jev-1.13.0`; set thresholds from FSB shadow data per version |
| Re-asking until an answer clears its threshold | A tempting fix for low confidence | Biases the decision (community production guide) | Escalate to the LLM in autopilot or to the caller as `ambiguous` |
| Parallel per-question calls, or whole-page state | "More context is better" | 529 errors at 100 concurrent requests but none at 16; accuracy falls as irrelevant state grows (official, community); 32k-token ceiling on OpenRouter | One batched request per step with a filtered element table and at most 6,000 characters of text |
| Renaming, removing or merging tools, or new tools for `expect` or fast mode | A cleaner surface | Breaks INV-01 and callers' learned habits | Additive optional parameters and description edits only |
| Relying on server `instructions` for rules a call's correctness depends on | Removes duplication | Claude Desktop and claude.ai drop them, Cursor is unverified, Claude Code truncates at 2 KB | Keep each tool's essentials in its description; teach recovery in typed errors |
| Jev-judged natural-language `expect` ("cart shows 2 items") | Easier for callers to write | A Noul is a veto, not proof, and counting is a documented weakness | Code-evaluated predicates only in v1.0.0 |
| `outputSchema`, or structured-only results, on existing tools | "Typed outcomes" | Cursor delivers structured-only results empty; Claude Code prefers structured content when both are present, so any divergence changes behavior (community, staff-confirmed) | Keep JSON text; if `structuredContent` is ever added, mirror the text exactly |
| The official TypeSafe JS SDK inside the service worker | Less code | Targets Node 20 and gates browser use behind `dangerouslyAllowBrowser` (official); broke its API in its first week | A small `fetch` client |
| `requiresUserInteraction` on common action tools | "Tighten confirmations" | Prompts on every call even in bypass modes and cannot distinguish one call from another (official), so every click slows down | Per-call `needs_confirmation`; decide separately whether `use_payment_method` warrants the flag |
| Fast mode on by default, or a changed default for `run_task` | Maximizes the speed win | No evidence of a success gain and documented failure modes; surprises existing callers | Opt-in toggle for autopilot and an explicit `mode` parameter for MCP |
| Public benchmark claims (WebArena, WebVoyager) this milestone | Marketing | Deferred in PROJECT.md; small-n numbers invite over-claiming | Publish FSB's own before/after results with method and n |

## Behavior specs for FSB's versions

These sketches give the requirements author concrete defaults; parameter names and numbers are proposals to settle in planning, and every threshold is a shadow-mode starting point, not a shipping value.

### Autopilot fast mode (opt-in)

Each step observes the element table, up to 6,000 characters of visible text and the last 10 actions with their observed effect (taken from `change_report`: navigated, page changed, no visible change). It then sends one request with the operation Choice (`CLICK`, `TYPE_TEXT`, `SELECT`, `PRESS_ENTER` only when a focused field holds text, `SCROLL_DOWN`/`SCROLL_UP`, `WAIT`, `DONE`, `BLOCKED`), one target Choice per offered operation with `none_of_the_above`, and the goal-reached and stuck Nouls. Code acts only when the operation's confidence and the chosen target's probability clear per-operation cuts scaled to reversibility: scrolling and waiting get the lowest bar, opening menus or tabs next, link clicks moderate, and submit-like clicks or Enter the highest bar plus the deterministic gate. Execution goes through the same tool executor as the LLM path, with strict readiness. Three consecutive steps with no visible change mark the run stuck, which triggers one LLM iteration; a second stall ends the run as BLOCKED with a reason. A `TYPE_TEXT` whose helper returns `{"text": null}` escalates to the LLM, and login fields always route to `fill_credential`. Starting cuts from the evidence: never act below about 0.5 confidence; allow about 0.3 on reversible operations only when the next step verifies them (self-reported, Mahmoud); read Nouls through a 0.3–0.7 review band (official cookbook); treat anything within 0.05 of a cut as a tie and escalate (community).

### `run_task` bounded fast mode (MCP)

Proposed additive parameters: `mode: "fast"` (absent means today's autopilot), `verify` (code predicates, same vocabulary as `expect`), `values` (field purpose to caller-supplied text), `max_steps` (default about 15, cap about 40) and `max_seconds` (default about 60, cap about 180). Proposed `status` values:

- `done`: every `verify` predicate passed in code.
- `likely_done`: Jev's goal Noul cleared its cut, but no `verify` was supplied or checkable.
- `ambiguous`: confidence fell below the floor or the answer was `none_of_the_above`; returns the top candidates (index, label, probability) and the question left unsettled.
- `needs_input`: text is required but no value was supplied and FSB's own LLM is not allowed or configured.
- `needs_confirmation`: the code gate or a Jev risk signal flagged the next action; returns the action, target label, site and any visible amount or recipient, and does not execute it.
- `blocked`: bot wall, error page, restricted tab or the stuck rule.
- `budget_exhausted`: the step or time cap was hit.
- `unavailable`: Jev is not configured, rate-limited or behind an open circuit breaker; the caller should continue with manual tools.

Every result carries a compact step trace (operation, target label, outcome, milliseconds), a `timing` block (wall, Jev, browser, LLM), the final URL and the verification details. After `needs_confirmation`, the caller confirms with the user and performs the final action itself with the manual tool, which matches the confirmation rule callers already follow.

### `expect` on action tools

Proposed code-evaluated predicates: `url_includes`, `title_includes`, `text_visible`, `text_gone`, `selector_visible`, `selector_gone`, `value_equals` (selector and value) and `dialog_opened`, plus `timeout_ms` (default about 2,000, cap about 10,000). Evaluation starts right after the existing stability wait, returns immediately when already met, and otherwise polls until met or timed out. The response gains `expect_result: {met, checks: [{kind, expected, observed, met}], waited_ms}`; `success` keeps meaning that the action ran, and `met: false` is not an error. Use substring or glob matching rather than caller-supplied regular expressions, and never echo the value of a password field; report only whether it matched.

### What stays in a tool description and what moves

A description keeps four things: a first sentence that says what the tool does in searchable words (Claude Code's tool search and Cursor's file lookup both read it); when to use it instead of its nearest sibling; any non-obvious parameter meaning and the return shape in a clause; and any rule whose violation causes harm the error response cannot undo, such as never passing secrets. Everything else moves. The multi-agent sentence goes to server instructions and the skill, because the typed errors it describes already carry `recoveryHint`s at the moment of failure. The `change_report` suffix becomes "Returns change_report." with field details in the skill. Visual-session and `tab_id` parameter text shrinks to one short clause each and drops internal file paths such as `mcp/src/tools/visual-session.ts`, which callers cannot use. Long how-to prose, such as `execute_js` patterns, moves to the existing `tool-reference` prompt and skill references. Milestone labels like "v0.9.62" leave descriptions entirely. The target is at least a 50% cut in tool-list characters with no description over 2,048 characters, measured before and after on both the MCP wire and the autopilot request.

### Annotation mapping (if INV-01 allows)

Mark `readOnlyHint: true` on tools that only read: `read_page`, `get_text`, `get_attribute`, `get_dom_snapshot`, `get_page_snapshot`, `list_tabs`, `read_sheet`, `get_site_guide`, the session and log readers, `search_memory`, `get_memory_stats`, `get_task_status`, `get_trigger_status`, `list_triggers` and `search_capabilities`. Leave unannotated the tools that change task or trigger state (`complete_task`, `partial_task`, `fail_task`, `trigger`, `stop_trigger`, `run_task`, `stop_task`, `replay_session`). Decide explicitly on `list_credentials` and `list_payment_methods`: they are read-only, but leaving them unannotated keeps clients prompting before vault metadata is listed. Set `destructiveHint: false` only for scrolling, hovering, focusing, opening and switching tabs and waiting; leave the destructive default on clicks, typing, key presses, `execute_js`, drags, uploads, vault fills, `invoke_capability`, closing tabs and navigation, since navigating can discard unsaved input. Set `openWorldHint: false` only on tools that read FSB's local data.

### Confidence thresholds and escalation UX

Keep every threshold in one reviewed constants file keyed by question, operation, decision backend and pinned model version. Prefer the chosen option's probability where it and the `confidence` field disagree, since `confidence` depends only on the top probability and the option count (community). In autopilot, escalation is silent: the LLM takes the step and the overlay shows a "Fast" or "Thinking" state; the user is prompted only for sensitive actions. Over MCP, escalation is typed (`ambiguous`, `needs_input`, `needs_confirmation`) and carries enough context for the caller to finish in one more call. Never re-roll a low-confidence answer, log every escalation, and watch the escalation rate: a rise suggests inputs or questions degraded, a fall suggests a bug bypassing the gate (community).

### Benchmark and measurement

Record at the MCP server boundary, per call: received, sent to the extension, answered by the extension, responded; the caller gap is the time from one response to the next request on the same connection. The suite should hold roughly 20–30 tasks: read-and-verify tasks like the recorded UAT and Jira sessions, click-heavy forms and filters, and booking-style multi-page flows, each with code-checked success, using local fixtures where live sites are unstable. Arms: autopilot today versus autopilot fast; Claude Code and Cursor on manual tools before and after the description, `expect` and annotation changes; `run_task` fast; and a stub arm. Report median and 90th-percentile wall time per completed task, success rate with n, cost (LLM plus Jev from `usage.cost`), tool-list and per-turn tokens, calls and caller turns per task, the FSB versus caller time split, the escalation rate and the share of steps Jev decided.

## Feature Dependencies

```
Per-call timing split ──┐
get_session_detail fix ─┼──> Benchmark suite (baseline arm captured first) ──> every speed claim
                        │
Jev decision provider ──> Fallback + availability ──> any Jev seam
State hygiene ──> Element table ──> Fan-out request ──> Validate/re-check/act ──> Autopilot fast mode
Decision log ──> Shadow mode + calibration ──> thresholds used by both fast modes
Autopilot fast-mode executor ──> run_task bounded fast mode (same executor, MCP entry)
Deterministic sensitive-action gate ──> Jev risk signals (tighten-only) ──> run_task needs_confirmation
wrapWithChangeReport / change_report ──> expect ──> run_task `verify` (shared predicate vocabulary)
Shorter descriptions ──> server instructions / annotations / alwaysLoad (layered on after)

Jev risk signals ──conflicts──> any mode where Jev can remove a confirmation
alwaysLoad ──conflicts──> long descriptions (pays their full context cost on every session)
Jev-judged expect ──conflicts──> "code outranks the model" verification rule
```

### Dependency notes

- **The benchmark needs timing and session lookup first**, and its baseline arm must run before descriptions, `expect` or Jev change anything; otherwise there is no "before".
- **Both fast modes need calibrated thresholds**, which need the decision log and a period of shadow mode on FSB's own tasks against the pinned version.
- **The `run_task` fast mode is the autopilot fast-mode executor behind an MCP entry point**, so it cannot ship before the executor; the MCP phase adds only parameters, typed outcomes and budgets.
- **Jev risk signals need the deterministic gate** because "tighten only" presumes something to tighten; without it Jev would be the sole gate.
- **`expect` and `verify` should share one predicate evaluator** so MCP callers learn one vocabulary and fast mode's `done` uses the same code path.
- **Instructions, annotations and `alwaysLoad` come after the description cut**, because they are meant to point at short descriptions and `alwaysLoad` pays each loaded description's full cost.

## MVP Definition

### Launch with v1.0.0

- [ ] Per-call timing split and the `get_session_detail` journal fallback — the measurement floor.
- [ ] Benchmark suite with the baseline captured first — no speed claim without it.
- [ ] Shorter, deduplicated descriptions with no description over 2 KB — the stated tool-list target, and it trims every autopilot iteration.
- [ ] `expect` on action tools — the cheapest caller-turn reduction, with no Jev dependency.
- [ ] Deterministic sensitive-action gate — prerequisite for every Jev safety claim.
- [ ] Jev decision provider (opt-in) with fallback and state hygiene.
- [ ] Decision log and shadow mode, then autopilot fast mode behind the opt-in toggle.
- [ ] `run_task` bounded fast mode with typed outcomes, `verify`, and the updated description.
- [ ] Jev risk signals, tighten only.
- [ ] Release: extension 1.0.0, MCP 0.12.0, docs.

### Add after validation (v1.0.x)

- [ ] Annotations and server instructions — once the INV-01 ruling allows tool-list metadata; low cost, client-specific wins.
- [ ] `alwaysLoad` on core tools — once short descriptions make the context cost small.
- [ ] Caller-supplied `values` — once fast-mode telemetry shows how often `needs_input` fires.
- [ ] Automated caller-side benchmark driver — once the manual suite has stabilized.
- [ ] Faster LLM steps inside fast mode — once timing shows the LLM steps dominate.

### Future consideration (v1.1+)

- [ ] Jev pre-ranking for the normal LLM path — needs shadow data and candidate batching.
- [ ] Elicitation-based confirmation — needs broader client support and a policy for hook auto-answers.
- [ ] Zero-model replay of verified fast paths — builds on existing signed replay.
- [ ] A local or self-hosted decision backend — thresholds would need recalibration per backend.
- [ ] Page-exposed WebMCP tools as Jev options — the one setting where DOM-only Jev's 25/49 became 49/49 (independent).

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Per-call timing split + session lookup fix | HIGH | LOW–MEDIUM | P1 |
| Benchmark suite (baseline first) | HIGH | HIGH | P1 |
| Shorter, deduplicated descriptions | HIGH | MEDIUM | P1 |
| `expect` on action tools | HIGH | MEDIUM | P1 |
| Deterministic sensitive-action gate | HIGH | MEDIUM–HIGH | P1 |
| Jev provider + fallback + hygiene | HIGH | MEDIUM | P1 |
| Decision log + shadow mode | HIGH | MEDIUM | P1 |
| Autopilot fast mode (opt-in) | HIGH | HIGH | P1 |
| `run_task` bounded fast mode + description | HIGH | HIGH | P1 |
| Jev risk signals (tighten only) | MEDIUM | MEDIUM | P1 |
| Release discipline | MEDIUM | LOW | P1 |
| Annotations, server instructions | MEDIUM | LOW | P2 |
| `alwaysLoad` on core tools | MEDIUM | LOW | P2 |
| Caller-supplied `values` | MEDIUM | MEDIUM | P2 |
| Timing trace in fast-mode results | MEDIUM | LOW | P2 |
| Automated caller-side benchmark driver | MEDIUM | MEDIUM | P2 |
| Tool-list size budget in CI | MEDIUM | LOW | P2 |
| Instrument versioning + drift refusal | MEDIUM | LOW–MEDIUM | P2 |
| Fast-mode visibility | MEDIUM | LOW–MEDIUM | P2 |
| Faster LLM steps inside fast mode | MEDIUM | MEDIUM | P2 |
| Jev pre-ranking for the LLM path | LOW–MEDIUM | MEDIUM | P3 |
| Elicitation for confirmations | LOW–MEDIUM | MEDIUM | P3 |
| Zero-model replay of fast paths | MEDIUM | MEDIUM | P3 |

**Priority key:** P1 = must have for v1.0.0; P2 = add when possible; P3 = future.

## Competitor Feature Analysis

| Feature | jev-ultrafast / Jev for Chrome | Jev MCP executors (jev-ultrafast-mcp, Ying-Kai-Liao, forvela) | Playwright MCP | FSB v1.0.0 approach |
|---|---|---|---|---|
| Who picks the next action | Jev, from a code-built element table | Jev server-side, escalating to the caller | The calling LLM, from an accessibility snapshot | Jev when confident; FSB's LLM (autopilot) or the caller (MCP) otherwise |
| Who writes text | A small LLM | The caller supplies values, or a small LLM | The calling LLM | FSB's LLM in autopilot; caller `values` or FSB's LLM in `run_task` fast |
| Outcome check | External, or goal/stuck Nouls veto DONE | Code assertions outrank the model | Separate `browser_verify_*` tools, one turn each | `expect` inside each action call; `verify` inside `run_task` fast |
| Typed stop states | DONE / BLOCKED | done, ambiguous, likely_done, blocked, needs_confirmation | Not applicable | done, likely_done, ambiguous, needs_input, needs_confirmation, blocked, budget_exhausted, unavailable |
| Safety gate | Freshness and occlusion checks; model never emits selectors | Domain lists, keyword interception, `needs_confirmation` | Client approval prompts | Deterministic gate first; Jev can only add confirmations |
| Speed evidence | 7.1 s Google Flights, 3 matched pairs (self-reported) | 3.3 s three-step form; 1.5× faster under Claude (self-reported) | Baseline arm in others' comparisons | FSB's own before/after suite, at least 5 runs per arm |

## Sources

**Official documentation and specifications**
- TypeSafe Jev docs, limits, confidence and failure modes, as consolidated in `.planning/research/JEV-REFERENCE.md` (citations inside).
- OpenRouter Jev hub: model ID `typesafe/jev-1.13`, `POST /api/v1/systemone`, 32k-token context covering state plus questions, `usage.cost` — https://openrouter.ai/docs/guides/community/jev (fetched 2026-09-28).
- MCP tools specification 2026-07-28 (annotations, untrusted-hint rule, `outputSchema`, `structuredContent`, `input_required`) — https://modelcontextprotocol.io/specification/2026-07-28/server/tools.
- Claude Code MCP docs (tool search default, 2 KB truncation, `alwaysLoad`, `requiresUserInteraction`, output limits, elicitation) — https://code.claude.com/docs/en/mcp-servers.
- Cursor MCP docs and help (elicitation, approvals, Auto-review) — https://cursor.com/docs/mcp, https://cursor.com/help/customization/mcp.
- Playwright MCP assertion and snapshot docs — https://playwright.dev/mcp/tools/assertions, https://playwright.dev/mcp/snapshots.
- Stagehand agent reference — https://docs.stagehand.dev/v3/references/agent.
- Anthropic, "Writing effective tools for AI agents" — https://www.anthropic.com/engineering/writing-tools-for-agents.

**Source code read**
- FSB: `mcp/src/server.ts`, `mcp/src/tools/{autopilot,manual,read-only,observability,schema-bridge}.ts`, `mcp/src/agent-providers/claude-stream.ts`, `extension/ai/{tool-definitions,tool-use-adapter,permission-context,engine-config,ai-integration}.js`, `extension/ws/mcp-tool-dispatcher.js`, `extension/utils/{action-verification,automation-logger,mcp-lattice-journal,mcp-session-recorder,setup}.js`, `extension/content/{dom-analysis,actions}.js`; installed `@modelcontextprotocol/sdk` 1.29.0 type definitions.
- VS Code MCP server metadata handling — https://github.com/microsoft/vscode/blob/234229df/src/vs/workbench/contrib/mcp/common/mcpServer.ts.
- Claude Code client snapshot (annotation mapping; third-party mirror, MEDIUM) — https://github.com/zackautocracy/claude-code/blob/4b9d30f7/src/services/mcp/client.ts.

**Measured locally (2026-09-28)**
- Registry: 57 tools; 34.6k description and 32.9k parameter-description characters; repeated blocks as listed under "What this means for FSB"; `execute_js` at 2,187 characters on the wire; 19 registry tools flagged `_readOnly`.

**Independent third-party evidence**
- WindTunnel (25/49 DOM-only vs 49/49 WebMCP) — https://github.com/nekuda-ai/WindTunnel.
- dejevu (LLM-only loop faster than jev-ultrafast's published run) — https://github.com/idovmamane/dejevu.
- Bear Huddleston approval assay (1.24× speed, truncated-policy failure) — https://bearhuddleston.dev/reports/jev-approvals-live-sandbox/.

**Self-reported builds**
- jev-ultrafast (README, performance.md, snapshot.js, questions.py) — https://github.com/browser-use/jev-ultrafast.
- Jev for Chrome — https://github.com/chy4pro/jev-for-chrome.
- jev-ultrafast-mcp — https://github.com/jiawei686/jev-ultrafast-mcp (README fetched 2026-09-28).
- MahmoudAdelbghany/jev-browser — https://github.com/MahmoudAdelbghany/jev-browser/blob/HEAD/RESULTS.md.
- forvela/jev-agent-browser — https://github.com/forvela/jev-agent-browser.
- Kinde Jev Gatehouse — https://github.com/kinde-starter-kits/jev-agent-authorization.
- Ying-Kai-Liao/jev-browser, via jevwiki builds page — https://jevwiki.ai/wiki/ideas/builds-browser-and-interface.md.

**Vendor and community**
- Cursor, "Dynamic context discovery" (46.9% token A/B) — https://cursor.com/blog/dynamic-context-discovery.
- Browser Use, "Speed Matters" (KV-cache ordering, screenshot cost, output-token cost) — https://browser-use.com/posts/speed-matters.
- Claude Code issues on instructions, annotations and structured content: #23808, #87452, #83886, #9962; claude-ai-mcp#131.
- Cursor forum on structured-only results being dropped — https://forum.cursor.com/t/mcp-tool-results-containing-only-structuredcontent-are-silently-dropped/167346.
- jevwiki community and mixed-tier pages (confidence failure reports, production operations, head-to-head agents), via `research_notes/Jev by TypeSafe AI/`.
- LOW-confidence blogs used only for leads, not claims: mcpblog.dev on annotations, baeseokjae.github.io on Cursor annotations.

---
*Feature research for: v1.0.0 Jev Fast Mode (decision-model-accelerated browser automation and MCP speedups)*
*Researched: 2026-09-28*
