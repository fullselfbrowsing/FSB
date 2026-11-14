# Project Research Summary

**Project:** FSB v1.0.0 — Jev Fast Mode
**Domain:** Brownfield speed milestone: add TypeSafe's System One decision model (Jev) as an opt-in fast path inside FSB's existing MV3 autopilot loop, plus a leaner MCP tool surface and same-call verification, without new runtime dependencies
**Researched:** 2026-09-28
**Confidence:** HIGH for FSB seams, MCP client behavior, and Jev access facts. MEDIUM for Jev whole-agent success and copied thresholds. LOW for any claim that Jev raises task success.

> Supersedes the v0.9.91 research (archived as `*-v0.9.91-MCP-CLIENTS.md`). Jev API facts live in `JEV-REFERENCE.md`; this file cites it instead of repeating it.

## Executive Summary

This is a brownfield acceleration milestone, not a new agent. All four research dimensions converge on the same shape: **measure first, ship Jev-free MCP wins next, then add Jev as a decision source inside the existing loop**. Zero new runtime dependencies. Jev is a thin `fetch` client in the service worker (`POST {base}/v1/systemone`), never a ninth chat provider, never a key store in `mcp/`, and never a second executor. Fast-mode steps run through today's tool loop, hooks, journal, overlay, stuck detection, and INV-04 `setTimeout` iterator. MCP changes stay additive: shorter descriptions, one optional `expect` on action tools, and optional bounds on the existing `run_task`. The extension ships as 1.0.0; MCP goes 0.11.0 → 0.12.0.

The speed problem is not FSB's click mechanics. Median MCP wall time per call is 9.5 s with Claude and 4.6 s with Cursor; FSB itself spends about 0.3–1 s. Caller turns are 85–90% of MCP time. Autopilot has no recorded sessions, so its baseline must be captured before anything else lands. Realistic targets: autopilot about 1.5–2× on mixed tasks; MCP about 1.3–1.6× on UAT/Jira-style sessions and 2–3× on click-heavy flows; tool-list tokens cut by more than half. Per-decision Jev speed (~100–210 ms) is real. Whole-agent success is not: community A/Bs mostly cut cost, and the one sizeable third-party DOM benchmark scored Jev 25/49.

Two facts lock the build order. First, shorter descriptions change the autopilot prompt as well as the MCP wire (INV-02: one registry), so both baselines must be frozen before Phase 67. Second, TypeSafe signups have been paused since 2026-09-22 and Jev has no SLA, so the description diet and `expect` must deliver MCP value even if Jev is unavailable.

**Hard rules that survive every phase:**

- Jev can only add confirmations, never remove them. Code classifies; Jev may tighten.
- Page text is untrusted. Jev never writes text, selectors, coordinates, or JavaScript.
- DONE is never evidence. Code checks (URL, text, DOM, `verify`) outrank any model.
- Pin `typesafe/jev-1.13` (OpenRouter) or `jev-1.13.0` (direct). Never `jev-latest`. Log `servedModel`; treat a snapshot change as "thresholds unvalidated".
- INV-01: names, required fields, and response shapes stay; descriptions may shrink; only additive optional parameters.
- INV-03: Jev stays out of `PROVIDER_CONFIGS` and `API_PROVIDER_IDS`.
- INV-04: no second iterator. One decision site inside `runAgentIteration`.

## Key Findings

### Recommended Stack

Add **zero** new runtime dependencies to the extension or `mcp/`. Keep `@modelcontextprotocol/sdk` at **exactly 1.29.0** for the whole milestone so the before/after benchmark is not confounded by an SDK bump. Measurement is platform clocks plus the existing journal plus plain Node 24 scripts.

**Core technologies:**

- Thin `extension/ai/jev-client.js` — classic `importScripts` script with a `module.exports` guard. One wire: `POST {base}/v1/systemone`. Default route reuses `openrouterApiKey` and model `typesafe/jev-1.13`. Optional TypeSafe direct uses `typesafeApiKey` (must join `SecureConfig.sensitiveKeys`) and `jev-1.13.0`. Timeout ~2 s, at most one retry on 429/529/5xx with `Retry-After` ≤ 1 s, circuit breaker after ~3 consecutive failures, in-flight cap ~4, never retry 400/401/422.
- Chrome built-ins: `fetch`, `AbortController`, `performance.now()`, `Date.now()`. No CSP or host-permission change (`<all_urls>` already covers both hosts).
- `@modelcontextprotocol/sdk` 1.29.0 — already has `registerTool({annotations, _meta})`, server `instructions`, and `InMemoryTransport` + `Client` for an in-process `tools/list` budget gate. Do not adopt SDK v2 (removes `initialize`, breaks v0.9.91 identity capture).
- Existing `zod` 3.25.76 in `mcp/` for optional `expect` / `run_task` params. Do not mix the root's zod 4.
- New scripts, no packages: `scripts/verify-mcp-tool-budget.mjs`, `scripts/bench/mcp-timing-report.mjs`, `scripts/bench/run-bench.mjs`, fixture server, stats helper, calibration report.

**Explicit rejections:** `@typesafe-ai/sdk` (wrong defaults: 10 s, 2 retries, `jev-latest`; needs a new IIFE vendor step; throws in side panel without `dangerouslyAllowBrowser`); any Jev client or key in `mcp/`; `jev-latest` / `~typesafe/jev-latest`; community Jev MCP servers or a new `jev_decide` tool (0 calls in 150 when offered as a tool); LangChain / Vercel AI SDK / OpenJev / in-browser ONNX; MCP SDK v2; OpenTelemetry / `pino` / `tinybench`; Puppeteer as a required dependency (optional deferred Tier 4 only); flat `expect_*` params.

**Verified Jev access (2026-09-28):** OpenRouter p50 0.21 s, $0.042 / 1M input, output free, 32k tokens for state plus questions. Direct TypeSafe: ~100 ms server time, 1,200 req/min, new signups paused. Served snapshot today is `typesafe/jev-1.13-20260917` and can advance under the same request ID.

### Expected Features

Comparable Jev browser agents copy jev-ultrafast: a numbered table of visible controls, one batched request per step (operation Choice + per-operation target Choice + done/stuck Nouls), a small LLM only for typed text, and code that rejects anything not offered. The builds that actually save caller time run the loop server-side and return a typed outcome (`done` / `ambiguous` / `needs_confirmation`) with code-checked `verify` that outranks the model. Playwright MCP spends three caller turns on action + wait + assert; FSB's `expect` folds the check into the same call.

**Must have (table stakes):**

- Per-call timing split (FSB vs queue vs caller gap) for MCP and autopilot
- `get_session_detail` journal fallback (list works; detail does not — the benchmark depends on this)
- Repeatable before/after benchmark; success judged by URL/text/DOM, never DONE; baseline captured before any speed change
- Jev decision provider, opt-in, OpenRouter default, clean fallback (a task never fails because Jev failed)
- State hygiene: no password/hidden/file/vault values; page text marked untrusted; ≤ ~24k of OpenRouter's 32k
- Per-step element table from `getFilteredElements` + `refMap` (index, role, full name, value, state, heading, href); ≤ ~200 options per target head
- One batched Jev request per step; validate, re-check freshness, then act through the existing tool executor
- LLM keeps plan, typed text, reading, and anything below threshold
- DONE veto + a separate Jev step/time budget; 3 no-change steps → stuck
- Decision log + shadow mode before any threshold goes live
- Shorter, deduplicated descriptions (names and schemas unchanged); no description over 2,048 chars
- `expect` on action tools, code-evaluated in the same call after the existing stability wait
- Bounded `run_task` fast mode with typed outcomes; absent params = today's behavior
- Deterministic sensitive-action gate first; Jev risk signals can only add confirmations
- Release: `CHANGELOG.md` `## v1.0.0` then `version:set:extension -- 1.0.0`; MCP 0.12.0

**Should have (after validation / P2):**

- Accurate `readOnlyHint` annotations from an explicit table (not `_readOnly`, which includes `complete_task`)
- Server `instructions` ≤ 2 KB (Claude Code loads only names + instructions at session start)
- `anthropic/alwaysLoad` on 5–8 core tools, measured first
- Caller-supplied `values` for fast mode; timing trace in every fast-mode result
- Tool-list size budget in CI; instrument versioning + model-drift refusal
- Fast-mode visibility (overlay "Fast", session "Jev decided N of M")

**Defer (v1.1+):**

- Jev pre-ranking for the normal LLM path
- Elicitation-based confirmation
- Zero-model replay of verified fast paths
- Local / self-hosted decision backends
- Page-exposed WebMCP tools as Jev options (the setting where 25/49 became 49/49)
- Public WebArena / WebVoyager claims
- Puppeteer unattended benchmark tier
- Faster inner LLM (small model for `TYPE_TEXT`) until timing proves those steps dominate

**Anti-features (hard NO):**

- An "ask Jev" MCP tool, or Jev as a selectable chat provider
- Jev removing or auto-approving confirmations
- Jev writing text, selectors, coordinates, JavaScript, or doing counting/sorting/date math
- Treating DONE as success; re-asking until a threshold clears
- Aliases (`jev-latest`) or copied demo thresholds
- Renaming, removing, or merging tools; new tools for `expect` or fast mode
- Jev-judged natural-language `expect`
- Fast mode on by default, or a changed `run_task` default
- `@typesafe-ai/sdk` in the service worker
- A second autopilot loop or synthetic assistant tool calls in the provider transcript (Gemini 3 400s on unsigned `functionCall`s)

### Architecture Approach

Jev is a decision source, not an executor. One call site in `runAgentIteration`, placed before the LLM request, either returns a Jev-chosen tool call that flows through the existing tool loop or declines so the LLM runs as today. Jev steps are logged on the session and flushed to the LLM as one user-role summary — never injected as synthetic assistant tool calls. Safety hooks register on the existing `beforeToolExecution` / `afterIteration` events and can only tighten. Timing is stamped at three boundaries (MCP server entry, extension ingress, dispatch completion) and stored in stores that already exist; it is **not** appended to every MCP response.

**Major components (new + modified):**

1. **`extension/ai/jev-client.js`** (NEW) — route/key/model binding, timeout, validation (offered keys, Σp ≈ 1, choice = argmax), OpenRouter/TypeSafe error normalization, breaker, limiter. All `setTimeout`s live here, never in `agent-loop.js`.
2. **`extension/ai/jev-fast-path.js`** (NEW) — redacted state builder, versioned instrument, thresholds keyed by backend + pinned model, `nextStep` / `recordStepResult` / `flushSummary`, shadow log. Lazy `globalThis.FsbJevFastPath`.
3. **`extension/ai/hooks/jev-hooks.js`** + **`timing-hook.js`** (NEW) — done-veto, tighten-only risk, stuck hint, per-iteration timing. Each handler bounds its own wait (`HookPipeline.emit` has no timeout).
4. **`extension/utils/expect-evaluator.js`** (NEW) — shared code predicates for MCP `expect`, `run_task` `verify`, and fast-mode done. Isolated-world `executeScript`; no new content-script file.
5. **`extension/ui/jev-settings.js`** + Providers card (NEW/MOD) — enable, key source, pin display, autopilot opt-in, shadow toggle, Test Jev, data-retention disclosure. Separate file, like `voice-input-settings.js`.
6. **`agent-loop.js`** (MOD) — one decision site; additive hook context (`args`, `origin`); Jev steps skip the LLM request but use the same tool loop; transcript summary on next LLM turn.
7. **Journal + dispatcher** (MOD) — `get_session_detail` journal branch (mirrors the UI lookup at `background.js:12513-12531`); additive `timing` metadata; `INTERNAL_PAYLOAD_KEYS` extended so sidecars do not leak into replay manifests.
8. **`wrapWithChangeReport`** (MOD) — `expect` evaluated after the existing stability wait; `success` still means the action ran; `expect_result` is additive.
9. **`run_task`** (MOD) — optional `mode` / `verify` / bounds threaded through five hops (`autopilot.ts` → bridge → `handleStartAutomationRoute` → `handleStartAutomation` → `sessionData.fastMode`). MCP escalation returns typed outcomes; it does not consult the extension's LLM unless the caller already configured one.
10. **Descriptions** (MOD) — edited only in `tool-definitions.js`, `mcp/src/tools/manual.ts`, and non-registry tool files. `mcp/ai/tool-definitions.cjs` is a build copy. Re-baseline `EXPECTED_NON_TRIGGER_REGISTRY_HASH` (or split into a shape hash + budget gate) in the same commit.
11. **Release last** — `sync-product-version.mjs` rewrites `options.js` and `sidepanel.js`, which earlier phases also edit.

Live `tools/list` probe (2026-09-28): **72 tools** (planning docs said 73), 54,482 description chars, 33,961 param chars, 121,402 JSON bytes, 0 annotations. About half the text is four repeated blocks: `change_report` suffix (14.3k), visual-session fields (13.4k), `tab_id` (10.0k), multi-agent sentence (7.9k). Claude Code already truncates `execute_js` at 2 KB and, with tool search on, loads only names + instructions at session start.

### Critical Pitfalls

1. **Counting caller think time and 60 s idle tails as FSB time** — `closeIdleRun` stamps `endTime` on a 60 s alarm. Metric is wall time per *completed* task, decomposed into FSB / queue / caller gap. Flag `idle_timeout` rows. Phase 66.
2. **A benchmark that cannot show the effect** — freeze SDK, LLM IDs, fixtures, and Jev snapshot; ≥5 alternating runs per arm; stub arm; pre-registered criteria; success by code checks. Phase 66 is the exit gate for later speed phases.
3. **Secrets in Jev state** — today's snapshot may already leak input values (confirm with a fixture). Dedicated allowlist builder; password/hidden/file/`cc-*`/`one-time-code` never serialized. Phase 67/69.
4. **Silent model drift** — aliases move; OpenRouter's dated snapshot can advance under `typesafe/jev-1.13`. Log `servedModel`; refuse to act on an unexpected model until re-calibrated. Phase 69/70.
5. **Treating confidence as accuracy and copying thresholds** — community cuts ran 0.77–0.95 and did not transfer. Shadow on FSB's own tasks against the pinned version. Never re-roll. Phase 70.
6. **Handing Jev the LLM's menu (the 25-of-49 problem)** — Jev picks only from a code-built, currently-possible table; `none_of_the_above` on every target head; stale-ref re-check. Phase 70/71.
7. **A second executor that bypasses the loop** — breaks INV-02/04, ownership, overlay, journal, replay. One decision site. Phase 71.
8. **Jev loosening safety** — code gate first; Jev OR-combined only to add a confirmation; Jev down ⇒ code gate alone. Phase 69 API, 70 adversarial, 71/72 enforcement.
9. **Injection through page text and element labels in criteria** — mark untrusted; never put live labels into question criteria; adversarial suite before enable. Phase 70/71/72.
10. **Description diet deletes contract text and trips hash locks** — keep first-sentence search terms, sibling-when-to-use, harm-if-wrong rules; move the rest to instructions/skill/`recoveryHint`. Re-baseline hashes in the same commit. Amend INV-01 wording: descriptions may change. Phase 67.
11. **Optimising tokens hosts already defer** — Claude Code and Cursor no longer load full descriptions up front. Judge Phase 67 by wall time and caller error rate, not character count alone. Phase 66 measures host tool-loading mode.
12. **`expect` that silently checks nothing** — code predicates only; `success` ≠ `met`; no caller regex; no password echo. Phase 68.
13. **`run_task` fast mode nobody calls** — description must invite it for short checkable sub-goals; typed `unavailable` when Jev is down; absent params = today. Phase 72.
14. **Version bump preconditions** — CHANGELOG entry first; MCP then extension; privacy XLIFF + Chrome Web Store disclosure once Jev sends page text. Phase 73.
15. **Tripwires, archived-planning readers, stale `mcp/build`** — confirm the full suite is green on the milestone start commit before Phase 66. Every extension-touching commit updates paired pins.

## Implications for Roadmap

Phases continue from 66. PITFALLS drafted a 7-phase map (Jev earlier, diet later). ARCHITECTURE's 8-phase map is the one to use: it captures both baselines before any prompt change, ships Jev-free MCP value while Jev access is fragile, and keeps the version bump last.

### Phase 66 — Measurement floor
**Rationale:** No speed claim without a frozen "before". No recorded autopilot sessions exist. Description edits change autopilot prompts (INV-02).
**Delivers:** `get_session_detail` journal branch; per-call timing (server sidecar, ingress stamp, journal metadata, autopilot timing hook); `scripts/bench/` runner + timing report + fixtures; `tools/list` budget script (count, do not hardcode 72/73). Capture MCP and autopilot baselines.
**Uses:** existing journal, `Date.now()` / `performance.now()`, SDK `InMemoryTransport`.
**Research flag:** LOW. Confirm suite green on start commit first (Pitfall 22).

### Phase 67 — MCP surface diet
**Rationale:** Jev-free. Most of the tool-list token target. Claude Code already truncates at 2 KB. Dedup the four repeated blocks.
**Delivers:** shorter registry / param / suffix / inline descriptions; optional server `instructions` ≤ 2 KB; budget gate in CI; hash re-baseline or shape-hash split. Re-run autopilot benchmark.
**Uses:** `tool-definitions.js`, `manual.ts`, pinned SDK `instructions`.
**Research flag:** LOW–MEDIUM — whether annotations/`alwaysLoad` are in or P2 (needs an INV-01 metadata ruling). Judge by wall time and caller errors, not chars alone.

### Phase 68 — `expect` on action tools
**Rationale:** Jev-free. Cheapest caller-turn reduction (action + verify in one call). Shared evaluator later used by `verify` and fast-mode done.
**Delivers:** `withExpectField()`, `expect-evaluator.js`, evaluation inside `wrapWithChangeReport`, additive `expect_result`. Closed predicates: `url_includes`, `title_includes`, `text_visible`, `text_gone`, `selector_visible`, `selector_gone`, `value_equals`, `dialog_opened`.
**Uses:** existing stability wait.
**Research flag:** MEDIUM — structured object (schema-bridge `object` branch + seven-provider formatter check) vs a single string.

### Phase 69 — Jev client and Decision provider UI
**Rationale:** No behavior change. Can run in parallel with 67–68. Puts fallback, pinning, privacy, and the tighten-only API in place before any live path.
**Delivers:** `jev-client.js`; OpenRouter default + TypeSafe option; Test Jev; circuit breaker; cost-tracker Jev pricing (never `estimateCost()`); `openrouterApiKey` into `sensitiveKeys`; Providers disclosure that page text leaves the machine.
**Uses:** existing `fetchWithTimeout` / `handleRateLimit` idioms.
**Research flag:** LOW. One spike: does OpenRouter accept a dated snapshot ID? Data-retention terms on the OpenRouter Jev route.

### Phase 70 — Shadow mode and calibration
**Rationale:** Thresholds must come from FSB's own labels on a pinned `servedModel`. Shipping live cuts copied from jev-ultrafast is Pitfall 10.
**Delivers:** `jev-fast-path.js` state builder + instrument; `includeRefTable` snapshot; decision log; done-veto and stuck hooks in shadow; calibration report; adversarial injection suite.
**Uses:** Phase 66 logs, Phase 69 client.
**Research flag:** MEDIUM — confirm whether today's agent snapshot already includes input values (Pitfall 5) before the builder lands.

### Phase 71 — Autopilot fast mode (opt-in)
**Rationale:** The autopilot payoff. Needs calibrated thresholds and the shared evaluator. Stays inside `runAgentIteration`.
**Delivers:** decision site; LLM-turn vs fast-step accounting; transcript summary; escalation policy; tighten-only risk hook + side-panel confirmation card; overlay "Fast" state. Separate Jev step/time budget. Strict readiness (no programmatic-click fallback on Jev picks).
**Uses:** existing tool loop, `checkSafetyBreakers`, payment-fill confirmation pattern.
**Research flag:** MEDIUM–HIGH — exact `runAgentIteration` restructure against the 8-`setTimeout` / 4-schedule / `LLM_TURN`/`TOOL_DISPATCH` pins; summary-message wording per provider; confirmation UX.

### Phase 72 — Bounded `run_task` fast mode
**Rationale:** Same executor, MCP entry. Collapsing N clicks into one caller turn is the 1.5× MCP result. Absent params = today's `run_task`.
**Delivers:** additive `mode` / `verify` / bounds; five-hop threading; typed outcomes (`done`, `likely_done`, `ambiguous`, `needs_input`, `needs_confirmation`, `blocked`, `budget_exhausted`, `unavailable`); description invites fast mode for short checkable sub-goals.
**Uses:** Phase 71 executor, Phase 68 evaluator.
**Research flag:** MEDIUM — delegated-provider early return at `background.js:13639-13647`; whether caller `values` slip from P2 into this phase.

### Phase 73 — After-benchmarks and release
**Rationale:** Version setter rewrites files earlier phases edit. CHANGELOG must exist before `version:set:extension -- 1.0.0`.
**Delivers:** after-runs on every arm; `CHANGELOG.md` `## v1.0.0`; MCP `0.12.0` then extension `1.0.0`; skill + MCP README; privacy XLIFF (six locales) + Chrome Web Store disclosure.
**Uses:** `scripts/sync-product-version.mjs`.
**Research flag:** LOW. Publish-order checklist (MCP then extension) and store disclosure.

### Phase Ordering Rationale

- **Measure before mutate.** Baselines in 66, before descriptions or Jev change a single prompt.
- **Jev-free value first.** 67 and 68 deliver the MCP token cut and the verification-turn cut even if Jev is down or signups stay closed.
- **Client before behavior.** 69 changes no path; 70 records; 71/72 enable.
- **One executor.** 72 reuses 71; it does not grow a second loop.
- **Release last.** The sync script touches `options.js` / `sidepanel.js`.
- **INV-01 discipline.** Names, required fields, and response shapes stay. Descriptions may shrink. Optional params only.
- **Tripwire discipline.** Every extension-touching commit updates paired pins; full suite green from commit 1 of every phase.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm tarball of `@typesafe-ai/sdk@0.6.0` read directly; OpenRouter/TypeSafe docs fetched 2026-09-28; live in-process `tools/list` of FSB's current build; installed SDK 1.29.0 `.d.ts` verified. Timeout/limiter numbers and OpenRouter snapshot pinning / data retention are MEDIUM–LOW. |
| Features | MEDIUM | MCP client behavior HIGH (official docs + source). Jev integration patterns consistent across builds but nearly all self-reported, small-n. LOW that Jev raises task success. |
| Architecture | HIGH | Every integration seam cited at file:line against HEAD `3cc18052` on branch `Jev`. Fast-path control-flow shape is a design, not a prototype (MEDIUM). |
| Pitfalls | MEDIUM–HIGH | FSB-internal and platform facts HIGH. Jev behaviour evidence MEDIUM–LOW. Snapshot-value leak (Pitfall 5) is unread-runtime, confirm with a fixture. |

**Overall confidence:** HIGH enough to plan. Not high enough to copy anyone else's thresholds or to promise a success-rate gain.

### Gaps to Address

- **Structured vs string `expect`/`verify`** — decide in Phase 68 planning. Structured needs a schema-bridge `object` branch and a check that nested schemas survive all seven autopilot formatters.
- **OpenRouter dated-snapshot pinning** — one test call answers whether `typesafe/jev-1.13-20260917` is a legal request model.
- **OpenRouter Jev data-retention terms** — required for the Providers disclosure and the privacy page.
- **72 vs 73 tools** — live probe saw 72; planning said 73. Reconcile in Phase 67; the budget gate must count.
- **Does today's agent snapshot already include input values?** — confirm with a fixture before Phase 70's state builder.
- **`alwaysLoad` worth it?** — measure in a Tier 3 Claude Code arm before shipping; it pays full description cost up front.
- **Phase 71 loop restructure** — needs its own phase research against the `agent-loop.js` pins.
- **Delegated-provider early return** — `background.js:13639-13647` vs `run_task` fast mode; decide in Phase 72 planning.
- **INV-01 wording** — amend explicitly: descriptions may change; schemas and response shapes may not, except additive optional fields. Decide whether annotations/`_meta` count as allowed metadata.
- **`openrouterApiKey` not in `sensitiveKeys` today** — worth fixing in Phase 69 now that one key powers two providers.

## Feature Categories for Requirements Definition

1. **Measurement (MEAS)** — per-call timing split, journal session-detail fallback, frozen benchmark suite, host tool-loading mode recorded.
2. **MCP Surface (SURF)** — shorter descriptions, server instructions, budget gate, optional annotations/`alwaysLoad` if INV-01 allows.
3. **Same-call verify (EXPECT)** — optional `expect` on action tools, code predicates, additive `expect_result`, shared evaluator.
4. **Jev Provider (JEV)** — thin client, OpenRouter default, TypeSafe option, pinning, fallback, privacy/redaction, cost, Providers UI.
5. **Calibration (CAL)** — decision log, shadow mode, per-`servedModel` thresholds, adversarial suite, instrument version.
6. **Autopilot Fast (AUTO)** — opt-in decision site inside `runAgentIteration`, element table, batched questions, escalation, tighten-only confirmations, overlay.
7. **MCP Fast Task (TASK)** — additive `run_task` params, typed outcomes, `verify`, description invite, `unavailable` fallback.
8. **Safety (SAFE)** — deterministic sensitive-action gate; Jev may only add confirmations; page text untrusted; DONE never evidence.
9. **Release (REL)** — CHANGELOG + extension 1.0.0 + MCP 0.12.0 + docs + privacy/store disclosure.

## Sources

Detailed sources live in the four research files and `JEV-REFERENCE.md`. Aggregated by tier:

### Primary (HIGH confidence)
- Live in-process `tools/list` of `mcp/build` (2026-09-28): 72 tools, 54,482 / 33,961 chars, 121,402 bytes, 0 annotations
- Installed `@modelcontextprotocol/sdk@1.29.0` type definitions; npm tarball `@typesafe-ai/sdk@0.6.0`
- https://openrouter.ai/docs/guides/community/jev and `/typesafe-sdk`; https://docs.typesafe.ai/models
- MCP tools spec 2026-07-28; Claude Code MCP docs (2 KB truncation, tool search, `alwaysLoad`); VS Code MCP `readOnlyHint`; Cursor dynamic-context blog
- Chrome MV3 SW lifecycle; Chrome Web Store Limited Use updates effective 2026-08-01
- Direct source reads at HEAD `3cc18052` cited at file:line in `ARCHITECTURE.md`
- `.planning/PROJECT.md` v1.0.0 milestone section; `.planning/research/JEV-REFERENCE.md`

### Secondary (MEDIUM confidence)
- OpenRouter model page p50 / availability (point-in-time)
- Claude Code client snapshot for annotation mapping (third-party mirror)
- Community Jev browser builds (jev-ultrafast, Jev for Chrome, jev-ultrafast-mcp, Mahmoud, forvela, Kinde) — self-reported, small-n
- Cursor forum: structured-only results dropped

### Tertiary (LOW confidence / needs phase-time validation)
- Whole-agent success claims; copied confidence thresholds
- OpenRouter dated-snapshot request IDs and Jev-route data retention
- Whether `alwaysLoad` reduces FSB wall time
- Snapshot input-value leak (code-read, not fixture-proven)

---
*Research completed: 2026-09-28*
*Ready for requirements: yes*
