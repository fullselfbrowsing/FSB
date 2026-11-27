# Stack Research

**Domain:** Adding a hosted "System One" decision model (Jev) to an MV3 browser-automation extension, plus speed measurement and a leaner MCP tool surface (v1.0.0 Jev Fast Mode)
**Researched:** 2026-09-28
**Confidence:** HIGH overall. Registry versions, SDK source, OpenRouter route behavior, MCP SDK APIs, and client behaviors (Claude Code, VS Code, Cursor) were verified against the npm registry, the published `@typesafe-ai/sdk@0.6.0` tarball, official docs, and a live in-process `tools/list` probe of FSB's current build. Timeout and limiter numbers are MEDIUM (starting values to tune). OpenRouter snapshot pinning and data retention on the Jev route are LOW (undocumented).

> **Path note:** No current `STACK.md` existed at this path; earlier milestones' files are archived with version suffixes (for example `STACK-v0.9.91-MCP-CLIENTS.md`).

> **Scope guard:** The existing validated stack is not re-researched: the MV3 extension (classic `importScripts` service worker), `universal-provider.js` chat providers, `agent-loop.js` + `hook-pipeline.js`, `fsb-mcp-server` 0.11.0 on `@modelcontextprotocol/sdk` 1.29.0, the WebSocket bridge, the journal-v2 session recorder, `sync-product-version.mjs`, and the plain-Node test suite. Everything below covers only what the new features need.

> **Tooling note:** Context7 is not available in this environment. Library claims were verified from the npm registry, the unpacked package source, and official vendor docs instead, which are equally authoritative for these packages.

---

## Headline Recommendation

1. **Add zero new runtime dependencies to the extension or to `mcp/`.** Jev gets a roughly 200-line, `importScripts`-compatible `fetch` client in the service worker. One wire format (`POST {base}/v1/systemone`) serves both routes: OpenRouter (default, reusing `openrouterApiKey`) and TypeSafe direct. The official `@typesafe-ai/sdk` technically works in a service worker (verified below), but it would need a new vendored IIFE build step, and every default it ships with (10 s per attempt, 2 retries, `jev-latest`) is wrong for a fast path.
2. **Keep `@modelcontextprotocol/sdk` pinned at exactly 1.29.0 for the whole milestone.** It already provides `registerTool` with `annotations` and `_meta`, server `instructions`, and `InMemoryTransport` + `Client` for an in-process `tools/list` budget gate. Changing the SDK mid-milestone would confound the before/after benchmark that is the milestone's deliverable. Do not adopt SDK v2 or the 2026-07-28 stateless protocol.
3. **Build measurement from platform clocks, the existing journal, and plain Node 24 scripts.** The only optional new dev tool is Puppeteer 25.12.0 for an unattended benchmark tier, and it should be deferred.
4. **The biggest MCP wins are wire-additive metadata, not new tools:** `readOnlyHint` annotations, server `instructions` (at most 2 KB), a small always-loaded hot set for Claude Code, and cutting the 14.3k-character `change_report` suffix that is repeated on 33 tools.

---

## Verified Jev Access Facts (what the client must encode)

| Fact | OpenRouter System One route (default) | TypeSafe direct (optional) | Confidence |
|---|---|---|---|
| Endpoint | `POST https://openrouter.ai/api/v1/systemone` (base `https://openrouter.ai/api`; the SDK appends `/v1/systemone`) | `POST https://api.typesafe.ai/v1/systemone` | HIGH (official docs) |
| Auth | `Authorization: Bearer <OpenRouter key>`; no TypeSafe account needed | `Authorization: Bearer <TypeSafe key>`; **new signups paused since 2026-09-22** | HIGH |
| Request model ID | `typesafe/jev-1.13`. Bare `jev-1.13` is mapped to it; `jev-latest` maps to `~typesafe/jev-latest` | `jev-1.13.0` (full three-part ID; the community saw `jev-1.13` return HTTP 400 on the direct API) | HIGH / MEDIUM |
| Served model in response | Dated snapshot, e.g. `typesafe/jev-1.13-20260917`. "Sending `typesafe/jev-1.13` resolves to the current 1.13 release", so the snapshot can advance under the same request ID | `jev-1.13.0` | HIGH |
| Extra response fields | `id` (e.g. `gen-dec-…`), `provider: "TypeSafe"`, `usage.cost` in USD | `x-typesafe-request-id` header | HIGH |
| Price | $0.042 per 1M input tokens; output $0 | same | HIGH |
| Context | 32,000 tokens for state **plus** questions | 64k per request; 32k for state plus the longest question | HIGH |
| Observed performance (OpenRouter page, 2026-09-28) | p50 latency 0.21 s; 3-day availability 99.90%; single provider (TypeSafe), so no failover | "about 100 ms" server time; no SLA | MEDIUM (point-in-time) |
| Rate limits | Paid models have "no platform-level request cap". A 429 can still come from the upstream provider (`error.metadata.provider_code`), with `Retry-After` only when every provider sent a hint. Success responses carry no `X-RateLimit-*` headers | 1,200 req/min and 250k tokens/s, "adjusting dynamically" | HIGH (docs) |
| Credit errors | 402 with `error.metadata.limit_source`: `openrouter_credits`, `openrouter_key_limit`, or `openrouter_in_flight_budget` (transient, honor `Retry-After`) | n/a | HIGH |
| Error body shape | `{ "error": { "code", "message", "metadata" } }` | `{ "detail": … }`; documented 401/422/429/529, plus community-observed 400 (`max_tokens_exceeded`, unknown model) and 403 (no header) | HIGH / MEDIUM |
| Free key check | `GET https://openrouter.ai/api/v1/key` returns `limit_remaining`, usage, `is_free_tier`. It costs nothing and validates the key | none (`GET /v1/models` lists aliases only) | HIGH |
| Other surface | `POST /api/alpha/decisions`: **alpha**, different schema. Do not use | n/a | HIGH |
| Dated-snapshot pinning | Requesting `typesafe/jev-1.13-20260917` directly is **undocumented**. Test once; do not depend on it | n/a | LOW |
| Data retention on this route | Not verified from OpenRouter's model page; TypeSafe says Jev is not trained on customer requests, and ZDR is enterprise-only on direct | ZDR enterprise-only | LOW, verify before writing the settings disclosure |

**Consequence for the client:** bind `{route, baseUrl, apiKey, requestModel}` as one record, log `servedModel` on every decision, and treat any change in `servedModel` as "thresholds unvalidated" (fall back to shadow or LLM-only until re-tuned). Size the state against OpenRouter's stricter 32k total, not direct's 64k/32k split.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|---|---|---|---|
| Jev via OpenRouter System One API | `typesafe/jev-1.13` (served `…-20260917` as of 2026-09-28) | Default decision backend for autopilot fast mode, done/stuck vetoes, and optional `expect` checks | Uses a key FSB users already store (`openrouterApiKey`); needs no signup; identical wire to TypeSafe direct; returns `usage.cost` and the served snapshot per call |
| Jev via TypeSafe direct | `jev-1.13.0` | Optional backend for users with existing TypeSafe accounts | Exact version pin and the larger 64k budget; same client code, different base URL |
| In-house thin client `extension/ai/jev-client.js` | new classic script | `POST /v1/systemone` from the MV3 service worker, with timeout, validation, error normalization, cost/latency capture, circuit breaker, and in-flight cap | Matches FSB's no-build, `importScripts` service worker (like `cost-tracker.js`: `var`/`function` plus a `module.exports` guard for Node tests) and mirrors `UniversalProvider.fetchWithTimeout` / `handleRateLimit` idioms. It avoids a vendored SDK bundle whose defaults would all need overriding |
| Chrome platform built-ins: `fetch`, `AbortController`, `AbortSignal.timeout`, `performance.now()`, `Date.now()` | Chrome ≥ 116 (existing `minimum_chrome_version`) | Network calls, cancellation, and per-call timing | Zero cost. `AbortSignal.any()` (Baseline, works in workers) can merge a session-stop signal with a timeout, but the existing `fetchWithTimeout` pattern works equally well |
| `@modelcontextprotocol/sdk` | **1.29.0 exact (unchanged)**; latest v1 is 1.30.1 (2026-09-23) | `registerTool({annotations, _meta})`, `McpServer` `instructions`, `InMemoryTransport` + `Client` for the budget gate | Every needed MCP capability is already in the pinned, bundled version (verified in its `.d.ts`). Only `registerTool` accepts `_meta`; the `server.tool()` overloads are deprecated and take annotations but not `_meta` |
| Node.js built-ins (`fetch`, `performance`, `node:http`, `node:child_process`, `node:crypto`) | Node 24 (root `engines >=24`; local 24.14.1) | Budget gate, timing analyzer, benchmark runner, fixture server, statistics | Fits the existing suite of plain `node tests/*.js` scripts and `scripts/*.mjs`; no framework is needed |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| *(none new required)* | n/a | n/a | Every new capability ships with built-ins and already-installed packages |
| `zod` (existing, `mcp/`) | 3.25.76 | New optional params (`expect` on action tools, `mode`/budget on `run_task`) | Use `.optional()` only. Keep the MCP package's zod v3 even though the root has zod 4 as a devDependency; the two must not mix across `mcp/src` |
| `@modelcontextprotocol/sdk/client/index.js` + `/inMemory.js` (existing, via `mcp/node_modules`) | 1.29.0 | Budget gate and benchmark runner client | Public export subpaths resolve from `mcp/` (verified). Root tests already import `mcp/node_modules/ws` by path, so follow that precedent rather than adding the SDK to the root `package.json` |
| `puppeteer` (**optional, deferred**) | 25.12.0 (2026-09-23; Node ≥ 22.12) | Unattended benchmark tier: fresh profile plus the unpacked extension | Only if someone needs unattended runs. Use `enableExtensions: [path]` or `browser.installExtension(path)`, with the bundled Chrome for Testing. Never a runtime dependency |

### Development Tools (new scripts, no new dependencies)

| Tool | Purpose | Notes |
|---|---|---|
| `scripts/verify-mcp-tool-budget.mjs` | CI gate on the **real** `tools/list` payload: tool count (computed, not hardcoded), per-tool description length, total description and param-description characters, total JSON bytes, 100% annotation coverage, and `readOnlyHint` consistency with `TaskQueue`'s read-only set | Prototyped during this research. `createRuntime({ bridge: fake })` + `InMemoryTransport.createLinkedPair()` + `client.listTools()` runs in about 350 ms, opens no port, and needs no new dependency. Run it after `npm --prefix mcp run build` inside `npm test` (same pattern as `test:grok-build`) |
| `scripts/bench/mcp-timing-report.mjs` | Offline analyzer of exported journal sessions: per-call wall time, FSB execution time, MCP queue wait, and agent think time, grouped by client | Reproduces the 9.5 s (Claude) / 4.6 s (Cursor) baseline from the 40 recorded sessions, then produces the "after" numbers the same way |
| `scripts/bench/run-bench.mjs` | Live, opt-in runner: spawns the built `fsb-mcp-server` over stdio via the SDK `Client`, runs `run_task` in standard vs fast mode over a task list, judges success with deterministic URL/text checks (never the agent's DONE), and records wall time, cost and decision sources to JSON | Keep it out of `npm test` and `ci` because it costs money and needs a live Chrome. Record the FSB version, MCP SDK, LLM model ID, Jev `servedModel` and fixture hash in every result file |
| `scripts/bench/fixture-server.mjs` + `scripts/bench/fixtures/*.html` | Deterministic local task pages (forms, lists, a search/results flow, a Jira-like board, a mock checkout) on `127.0.0.1` | Removes live-site variance. Add a small opt-in live-site set separately |
| `scripts/bench/lib/stats.mjs` | Median, p90, IQR, seeded bootstrap 95% CI of the median ratio, Wilson interval for success rate, cost per completed task | About 60 lines. Task wall times are heavy-tailed, so compare medians with bootstrap CIs rather than means |
| `scripts/bench/jev-calibration-report.mjs` | Shadow-mode analysis: bucket Jev answers by `confidence`/`noul` per question and per `servedModel` against the LLM's actual choice and the verified outcome, then suggest thresholds | Input comes from existing session exports (`mcp-session-export-port.js` / automation logs); no new storage |

---

## Installation

```bash
# Required scope for v1.0.0: nothing to install.

# Optional, deferred: unattended benchmark tier only (downloads Chrome for Testing).
npm install -D puppeteer@25.12.0
```

---

## Decision: Official `@typesafe-ai/sdk` vs Thin `fetch` Client

**Verified facts from the published 0.6.0 tarball** (npm `time.modified` 2026-09-15T18:17Z, `engines.node >=20`, no runtime dependencies, ESM + CJS only, 209 KB unpacked):

- The browser guard is `typeof g.window !== "undefined" && typeof g.window.document !== "undefined" && typeof g.navigator !== "undefined"`, checked in the constructor. **An MV3 service worker has no `window`, so the guard does not trip there. It does throw in the side panel and options page** unless `dangerouslyAllowBrowser: true` is passed.
- Environment reads are guarded (`typeof process === "undefined"` returns undefined), and it calls `globalThis.fetch`, so nothing else in it breaks in a service worker.
- Defaults: 10,000 ms per attempt with no total budget; `maxRetries: 2`; backoff 500 ms doubling to 5,000 ms with 25% jitter; retries on 408, 429 and 5xx; `defaultModel: "jev-latest"`; `baseURL: "https://api.typesafe.ai"`.
- It adds `User-Agent`, `X-TypeSafe-SDK`, `X-TypeSafe-Runtime` and `X-TypeSafe-Retry-Count` headers. At `debug` level it logs request and response bodies unredacted.
- `client.models.list()` rejects OpenRouter's response shape (documented by OpenRouter).

**Decision: use a thin client in the extension; do not add the SDK anywhere.**

- Using the SDK would need a new esbuild IIFE vendoring step (like `build:cfworker`), a vendored `extension/lib/*.min.js`, and a pin test, all for a dependency at 0.x that shipped a breaking `Score.criteria` change in its first week.
- Every default would have to be overridden. A fast-path decision that takes 10 s, retries twice, or silently follows `jev-latest` has already lost to the LLM step it was meant to replace.
- The side-panel/options guard means a future UI-side call would need `dangerouslyAllowBrowser`, a red flag in review. Keeping all Jev traffic in the service worker is the right boundary anyway.
- For Node-side calibration and benchmark scripts, import FSB's own client through its `module.exports` guard so there is one code path to test.
- **Keep Jev out of `mcp/` entirely.** The MCP server never holds a Jev key. `run_task` fast mode and `expect` checks execute in the extension, where keys already live.

**Client contract sketch** (FSB idiom; illustrative, not final code):

```js
var JEV_BACKENDS = {
  openrouter: { baseUrl: 'https://openrouter.ai/api', requestModel: 'typesafe/jev-1.13', keyField: 'openrouterApiKey' },
  typesafe:   { baseUrl: 'https://api.typesafe.ai',   requestModel: 'jev-1.13.0',        keyField: 'typesafeApiKey' }
};

async function jevSystemOne(backend, apiKey, state, questions, options) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, options.timeoutMs);
  var started = performance.now();
  try {
    var res = await fetch(backend.baseUrl + '/v1/systemone', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: backend.requestModel, state: state, questions: questions }),
      signal: controller.signal
    });
    var body = await res.json().catch(function () { return null; });
    var latencyMs = Math.round(performance.now() - started);
    if (!res.ok) return { ok: false, error: normalizeJevError(res.status, body, res.headers), latencyMs: latencyMs };
    return {
      ok: true, answers: body.answers, servedModel: body.model, usage: body.usage,
      requestId: body.id || res.headers.get('x-typesafe-request-id'), latencyMs: latencyMs
    };
  } catch (_err) {
    return { ok: false, error: { kind: controller.signal.aborted ? 'timeout' : 'network' },
      latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}
```

**Client rules** (starting values, MEDIUM; tune in the benchmark):

| Concern | Rule |
|---|---|
| Timeout | About 2,000 ms per attempt; total at most about 3,000 ms including one retry. Community data: warm round trip about 290 ms, cold connection about 1.2 s; OpenRouter p50 is 0.21 s |
| Retries | At most one, only for 429/529/5xx and only when `Retry-After` is 1 s or less. Never retry 400 `max_tokens_exceeded`; shrink the state instead. Never re-ask a low-confidence answer to "clear" a gate; escalate to the LLM |
| Auth failures | 401/403: mark the backend unavailable for the session and surface it in Providers. 402 (OpenRouter credits or in-flight budget): fall back to the LLM and show "OpenRouter credits" status |
| Circuit breaker | After about 3 consecutive failures or timeouts, disable the fast path for about 60 s and use the LLM loop. Jev unavailability must never block a task |
| Concurrency | In-flight cap around 4 per extension, and one batched request per step (all questions in one call). The default agent cap of 8 at jev-ultrafast's pace would approach TypeSafe's documented 1,200 RPM. Hand-roll the limiter (about 30 lines); `p-limit`/`bottleneck` are ESM-first and don't fit `importScripts` |
| Response validation | Every asked key present; `choice` is one of the offered options; Σ probabilities within 0.02 of 1; `choice` equals the argmax. Reject otherwise (jev-ultrafast's checks). Look answers up by key, never by position |
| Size | Estimate tokens conservatively (JSON state about 2.35 chars/token per community data) and stay under about 24k of OpenRouter's 32k. Choice options at most 254 plus `none_of_the_above` |
| Warm-up | Optionally call `GET https://openrouter.ai/api/v1/key` (free) when fast mode starts, to validate the key and warm the HTTP/2 connection (MEDIUM: benefit unmeasured) |
| Cost | OpenRouter: record `usage.cost` directly. Direct: `input_tokens × 0.042 / 1e6`. **Never pass Jev usage through `estimateCost()`**: unknown models fall back to `grok-4-1-fast-reasoning` pricing ($0.20 / $0.50 per M) and would bill Jev's free output tokens. Add explicit zero-output Jev entries to `MODEL_PRICING` in `cost-tracker.js` and to the analytics pricing table for display parity |
| Logging | Log sizes, hashes, latency, `servedModel` and status. Never log the `state` body; route diagnostics through `redactForLog` |

**Keys and settings:**

- Reuse `openrouterApiKey` from `config.js`. A new `typesafeApiKey` **must** be added to `SecureConfig.sensitiveKeys`.
- Note: `openrouterApiKey` is **not** in `sensitiveKeys` today, while xAI/OpenAI/Anthropic/Gemini/custom keys are (verified). One key now powering two providers makes this worth fixing in the provider phase, with a migration and paired test updates.

**State redaction:**

- Build Jev state only through a dedicated allowlist builder in the service worker.
- The existing PhantomStream `shouldMaskInput` masks only `type=password` (or everything), which is not sufficient here.
- Exclude password, hidden and file inputs; `autocomplete` values `cc-*`, `one-time-code`, `current-password` and `new-password`; names matching secret-like patterns; and any field the vault targets.
- Send `hasValue` rather than raw values for anything sensitive. Add a fixture test asserting that no such value ever appears in a serialized state.

**Manifest and CSP: no change needed.**

- `host_permissions: ["<all_urls>"]` already covers `openrouter.ai` and `api.typesafe.ai`, and extension-origin requests to granted hosts skip CORS.
- FSB defines no `content_security_policy`, and the MV3 default (`script-src 'self'; object-src 'self';`, which also applies to the background worker) has no `connect-src` restriction.
- Jev returns JSON data, not code, so remote-code policy is not implicated.

---

## Per-Call Timing (cheap, no libraries)

| Layer | Where | What to record | Notes |
|---|---|---|---|
| MCP server | `mcp/src/agent-bridge.ts` `buildAgentPayload()` / `sendBridgeAttempt()` | Sidecars `mcpReceivedAt` (handler entry) and `bridgeSentAt` (after `TaskQueue` wait), both `Date.now()`, next to the existing `recordingCallId` / `recordingRunId` | No persistence on the MCP side. The same machine clock makes cross-process `Date.now()` deltas valid. **Add both keys to the frozen `INTERNAL_PAYLOAD_KEYS` in `mcp-lattice-journal.js`**, or they leak into request artifacts and signed replay manifests |
| Extension dispatcher | `extension/ws/mcp-tool-dispatcher.js` route entry and exit | `extReceivedAt`, `execStartAt`, `execEndAt`, `extRespondedAt`; `performance.now()` spans for execution and stability wait | Persist as an additive `timing` object in the journal `tool.call` event metadata (journal `SCHEMA_VERSION` is 2; additive optional fields; update `tests/mcp-lattice-journal.test.js` pins) |
| Derived (analyzer) | `scripts/bench/mcp-timing-report.mjs` | Agent think time = `mcpReceivedAt[n] − extRespondedAt[n−1]`; MCP queue wait = `bridgeSentAt − mcpReceivedAt`; FSB time = `extRespondedAt − extReceivedAt` | Directly tests the "85–90% of MCP time is the calling agent" claim |
| Autopilot | An observability-band hook in `hook-pipeline.js` (`beforeIteration` / `afterApiResponse` / `beforeToolExecution` / `afterToolExecution` / `afterIteration`) | `llmMs` (the loop already computes `durationMs` per API call), `jevMs`, `toolMs`, `iterationMs`, `decisionSource` (`jev` / `llm` / `jev→llm fallback`), `servedModel`, Jev cost | Persist to session logs and export through the existing session export port. `run_task` heartbeats already carry `elapsed_ms`, `ai_cycles` and `step` |
| Session-detail gap | `handleGetSessionMessageRoute` | n/a | It checks only `automationLogger.loadSession` and in-flight sessions, and never the journal's `getSessionDetail()`. That is a code fix, not a stack addition |

Use `performance.now()` deltas, not `performance.mark()`/`measure()`: marks accumulate in the worker's timeline buffer, and none of that structure is needed.

---

## Benchmark and Measurement Tooling

| Tier | Runs in | Content | Why this shape |
|---|---|---|---|
| 0: deterministic | `npm test` / CI | Tool-budget gate; Jev client contract tests against recorded OpenRouter and direct response/error fixtures with a mocked `fetch` (the `setFetch`/`restoreFetch` pattern in `tests/model-discovery.test.js`); state-redaction tripwire; timing-field contract tests; stats helper unit tests | Free, fast, no network; keeps the source-pin culture intact |
| 1: offline analysis | manual `npm run bench:report` | Analyzer over exported journal sessions (the before baseline and after comparisons) | Real client behavior at zero incremental cost |
| 2: live autopilot | manual `npm run bench:run` | SDK `Client` over stdio drives `run_task` standard vs fast on fixture pages plus a small live set; at least 10 runs per arm per task; medians with bootstrap CIs, success with Wilson CIs, cost per **completed** task | Measures autopilot fast mode end to end through the real bridge and extension |
| 3: external agents | manual | The same tasks in Claude Code and Cursor, then the Tier 1 analyzer. Headless `claude -p` via FSB's pinned adapter profiles is possible but costs a subscription or API spend per run | The agent's turns dominate MCP time; only a real agent measures them honestly |
| 4: unattended (deferred) | optional | Puppeteer 25.12.0 with Chrome for Testing | Branded Chrome 137+ ignores `--load-extension`; Chrome for Testing and Chromium still honor it. Puppeteer's `enableExtensions` / `installExtension` handle MV3 and expose the service-worker target. Since Chrome 149 (stable 2026-06-02), CDP `Extensions.loadUnpacked` works over the normal WebSocket (MEDIUM, per Selenium's ADR). Seeding provider keys into a fresh profile is a secrets-handling problem to solve first |

**Stable-harness rule:** freeze the MCP SDK, LLM model IDs, fixture pages and Jev snapshot across before/after runs, and stamp them into each result file. Otherwise the comparison measures drift, not Jev.

---

## MCP Tool Descriptions, Instructions, and Annotations

**Live baseline (in-process `tools/list` probe of the current build, 2026-09-28):**

| Metric | Value |
|---|---|
| Tools on the wire | **72** (planning docs say 73; the gate should count rather than hardcode) |
| Tool descriptions | 54,482 chars in total; median 783 |
| Longest descriptions | `execute_js` 2,187, `back` 1,934, `upload_file` 1,681, `click` 1,639, `select_option` 1,435 |
| Parameter descriptions | 33,961 chars |
| `tools/list` JSON | 121,402 bytes (about 30k tokens at 4 chars/token) |
| Annotations | 0 of 72 tools |
| `change_report` suffix | 434 chars appended to **33 tools**, 14,322 chars in total (about 26% of all description text), from `CHANGE_REPORT_DESCRIPTION_SUFFIX` in `manual.ts` |

**Client behaviors that set the targets (all verified in official docs):**

| Client | Behavior | Implication for FSB |
|---|---|---|
| Claude Code | Truncates each tool description and the server instructions **at 2 KB**. Tool search is on by default: only tool names and server `instructions` load at session start, and schemas are fetched through `ToolSearch` on demand. `readOnlyHint` "controls whether the tool can be called in parallel with other read-only tools". Per-tool `_meta: {"anthropic/alwaysLoad": true}` loads that tool upfront (v2.1.121+) | `execute_js` is truncated today. Add a short `instructions` string (at most 2 KB) naming the hot-path tools and shared contracts. Consider `alwaysLoad` on a hot set of about 10 tools (`navigate`, `read_page`, `get_dom_snapshot`, `click`, `type_text`, `press_enter`, `scroll`, `list_tabs`, `run_task`) to skip `ToolSearch` round-trips, and measure it in Tier 3 |
| VS Code (Copilot agent) | "VS Code doesn't ask for confirmation to run read-only tools" (`readOnlyHint`) | Removes human-wait dialogs on every read |
| Cursor | Dynamic context discovery: tool descriptions are synced to files, the agent sees names and looks tools up when needed (46.9% fewer tokens in Cursor's A/B test) | Shorter descriptions make each lookup cheaper; names and first sentences carry the weight |

**What the milestone needs (no new dependencies):**

1. **Budget gate** (`scripts/verify-mcp-tool-budget.mjs`, above). Suggested starting budgets, to ratchet down:
   - `tools/list` JSON of at most 60,000 bytes (at least 50% cut)
   - total descriptions of at most 24,000 chars
   - each description at most 700 chars, and hard-fail above 2,048 (Claude Code truncation)
   - total parameter descriptions of at most 15,000 chars
   - 100% of tools annotated
2. **Where to cut:**
   - Shared registry descriptions in `extension/ai/tool-definitions.js`. These are also the autopilot LLM's tool list (INV-02), so benchmark autopilot too.
   - Inline strings in `mcp/src/tools/*.ts`, including `run_task` (946 chars).
   - The `change_report` suffix: replace it with one short clause and move the contract into server `instructions`.
   - The `TOOL_REMOVED` stubs (`start_visual_session` 462 chars, `end_visual_session` 507 chars) can shrink to one line. Removing the stubs would remove tools, so keep them.
3. **Hash re-baseline is expected:** `EXPECTED_NON_TRIGGER_REGISTRY_HASH` hashes whole registry entries, descriptions and schemas included, so shortening text or adding `expect` moves it. It is pinned in at least `tests/tool-definitions-parity.test.js` and `tests/capability-mcp-surface.test.js`; grep the constant before the phase. Recommendation: split it into a **shape hash** (names, param names/types/required/enums) that may change only through allowlisted additive optional params, plus the description budget gate. That keeps INV-01's intent without freezing prose.
4. **Structured `expect` needs schema-bridge work:**
   - `jsonSchemaToZod()` maps any non-primitive type to `z.any()`, so an object-typed `expect` would reach clients as an untyped schema.
   - Either add a small `object` branch (`z.object(shape).strict().optional()` over primitive fields only), injected once through a shared helper like `withVisualSessionFields()`, and verify all seven autopilot provider formatters handle nested params (INV-03).
   - Or keep `expect` a single string.
   - Do not add several flat `expect_*` params to 33 tools; that re-bloats the surface this milestone is trimming.
5. **Annotations and `_meta`:**
   - Migrate the registry-driven loops (`manual.ts`, `read-only.ts`, `triggers.ts`) and the inline registrations to `server.registerTool(name, { description, inputSchema, annotations, _meta }, cb)`. It is the non-deprecated API and the only one that carries `_meta`.
   - Derive `readOnlyHint` from the same set `TaskQueue` uses to bypass the mutation queue. Export it from `queue.ts` so the annotation and the concurrency behavior cannot drift.
   - Set `readOnlyHint: false` explicitly for `complete_task`, `partial_task` and `fail_task`: registry-read-only, but they change session state and are deliberately serialized.
   - `capture_screenshot` can be `readOnlyHint: true`; the queue still serializes it for the exclusive CDP resource.
   - Keep `destructiveHint` at its default (true) on generic action tools (`click`, `type_text`, `press_enter`, `execute_js`, `fill_credential`, `use_payment_method`, `invoke_capability`), because a click can buy or delete. Set it false only for clearly non-destructive tools (scrolls, `hover`, `focus`, tab listing and switching).
   - Set `openWorldHint: false` only for local observability and memory tools.
   - Annotations are client UX hints. FSB's own confirmation rules stay server-side, and Jev can only tighten them.
   - **Update `tests/mcp-smoke-harness.js` in the same commit:** its fake server implements only `tool(name, description, schema, handler)` and will break on `registerTool` or the 5-argument overload.
6. **`run_task` fast mode:** add an optional `mode` enum plus an optional bound (steps or seconds) in zod on the existing tool, inside the existing 600 s safety net. Extra heartbeat fields (for example Jev decision counts) go under the existing `params._meta` progress slot. No new tool.
7. **Release tooling already exists:** `npm run version:set:extension -- 1.0.0` refuses to run until `## v1.0.0` heads `CHANGELOG.md`; `npm run version:set:mcp -- 0.12.0` needs its own `mcp/CHANGELOG.md` entry and updates `mcp/package.json`, the lockfile, `server.json`, `src/version.ts` and README surfaces.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| Thin `fetch` client in the service worker | `@typesafe-ai/sdk@0.6.0` vendored as an esbuild IIFE | Only if FSB later moves to a bundled, typed codebase and the SDK reaches 1.x with stable defaults. Even then, pin it exactly and override the timeout, retry and model |
| OpenRouter `/api/v1/systemone` | OpenRouter Decisions API `/api/alpha/decisions` | If OpenRouter deprecates the System One path. Today it is alpha with a different schema, and it would split the client from the direct route |
| OpenRouter plus direct as the only routes | Vercel AI Gateway, Cloudflare Workers AI, Opper | Only for users whose billing lives there. Vercel and Cloudflare expose no versioned ID (thresholds can't be pinned), and Vercel's AI SDK/HTTP paths rename `noul` to `boolean` |
| MCP SDK 1.29.0 pinned | 1.30.1 (4 MiB HTTP body limit, bounded JSON-RPC batches, stdio buffer limit) | As a separate hardening change after the milestone's before/after measurements are captured |
| MCP SDK v1 line | `@modelcontextprotocol/server`/`client` 2.1.0 with the 2026-07-28 stateless protocol | A future dedicated migration milestone. The new protocol removes the `initialize` handshake that FSB's `clientInfo` identity capture depends on |
| Plain Node benchmark scripts | Puppeteer 25.12.0 unattended tier | When unattended, repeatable fresh-profile runs are required and a safe key-seeding path exists |
| Hand-written stats helper | `simple-statistics` (devDependency) | If the benchmark grows into broad statistical analysis; median, bootstrap and Wilson do not justify a dependency |
| Characters and bytes as budget metrics | A tokenizer library (`gpt-tokenizer` 4.0.0, tiktoken) | Never for the gate. Client tokenizers differ (Claude's is proprietary), and bytes are deterministic and client-neutral |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| `@typesafe-ai/sdk` in `extension/` | Needs a new IIFE build and vendored artifact; wrong defaults (10 s per attempt, 2 retries, `jev-latest`); unredacted debug body logging; throws in side-panel/options contexts; 0.x churn | `extension/ai/jev-client.js` thin client |
| Any Jev client or key in `mcp/` | Creates a second secret store and config path in a Node process; the MCP server is a bridge | Jev runs in the extension; MCP passes only `mode`/`expect` |
| `jev-latest` / `~typesafe/jev-latest` in production | Aliases move silently, and thresholds tuned on one version don't transfer | `typesafe/jev-1.13` (OpenRouter) or `jev-1.13.0` (direct), and log `servedModel` |
| Community Jev MCP servers (`@jkudish/jev-mcp`, `jevkit`, `jev-use`, `jev-agent-toolkit-mcp`) or a new `jev_decide` MCP tool | Offered as a tool, a coding agent called Jev 0 times in 150; they are also days-old, single-maintainer packages. The milestone says no new tools | Call Jev from FSB code at fixed seams |
| LangChain / Pydantic AI / Vercel AI SDK Jev integrations | Server-side Node/Python frameworks, alpha versions, irrelevant to an MV3 worker | The thin client |
| Open-weight replicas (OpenJev, Kev) or in-browser encoders (Laya ONNX, 278–422 MB) | Thresholds don't transfer; licensing varies (OpenJev is CC BY-NC); in-extension WebAssembly needs a `'wasm-unsafe-eval'` CSP change | Hosted Jev behind the route abstraction; revisit later per backend |
| MCP SDK v2 / protocol 2026-07-28 / Tasks extension for `run_task` | Stateless redesign that removes `initialize` (breaks identity capture); large migration; confounds benchmarks | Stay on 1.29.0; keep `run_task` progress heartbeats |
| OpenTelemetry, `prom-client`, `pino`, `performance.mark` buffers | Heavy dependencies in a bundled MCP package and a no-build extension; FSB needs a dozen timestamps, not a telemetry pipeline | `Date.now()` / `performance.now()` into the existing journal and session logs |
| `tinybench`, `mitata`, Benchmark.js | Micro-benchmark tools for nanosecond-to-millisecond operations; FSB measures multi-second tasks with network and LLM variance | Task-level runner plus bootstrap statistics |
| Playwright for the extension benchmark | Its extension support is Chromium persistent-context only; Puppeteer is where Chrome's team contributed the new extension-loading APIs | Puppeteer 25.12.0 if an unattended tier is ever needed |
| `p-limit` / `bottleneck` in the service worker | ESM/Node-oriented; the need is about 30 lines | In-house in-flight cap and circuit breaker |
| Manifest changes (new host permissions, CSP key, extra permissions) | Not needed; `<all_urls>` and the default CSP already allow the calls | Existing manifest |
| Flat `expect_*` params on every action tool | Re-bloats the tool surface being trimmed | One `expect` param (object with a closed primitive field set, or a string) |

---

## Stack Patterns by Variant

**If the user has an OpenRouter key (the default path):**
- Route `openrouter`, model `typesafe/jev-1.13`, cost from `usage.cost`, key check via `GET /api/v1/key`.
- Because it's the zero-signup path and FSB already stores the key.

**If the user has only a direct TypeSafe key:**
- Route `typesafe`, model `jev-1.13.0`, cost computed from `input_tokens`; the key is stored encrypted as `typesafeApiKey`.
- Because new TypeSafe signups are closed, this serves existing account holders only.

**If neither key exists, or Jev fails at runtime (401/402/429 storm, timeouts):**
- Fast mode shows as unavailable (or the circuit breaker opens); autopilot and MCP run exactly as in 0.11.0.
- Because Jev has no SLA and must be an accelerator, never a dependency.

**If the MCP client is Claude Code:**
- Rely on `readOnlyHint` (parallel reads), server `instructions` (at most 2 KB, loaded every session), an optional `anthropic/alwaysLoad` hot set, and every description under 2 KB.
- Because tool search defers FSB's schemas and each first use can cost a `ToolSearch` turn.

**If the MCP client is VS Code or Cursor:**
- `readOnlyHint` removes VS Code confirmation dialogs. Short, front-loaded descriptions make Cursor's on-demand tool lookups cheaper.

**If unattended benchmarking becomes a requirement:**
- Puppeteer 25.12.0 plus Chrome for Testing, `enableExtensions`, and service-worker targets for setup.
- Because branded Chrome 137+ ignores `--load-extension`.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|---|---|---|
| Extension `minimum_chrome_version` 116 | `fetch`, `AbortController`, `AbortSignal.timeout`, `performance.now()` in MV3 service workers | `AbortSignal.any()` is Baseline and works in workers; the existing `fetchWithTimeout` pattern is equally fine |
| `@modelcontextprotocol/sdk` 1.29.0 | zod 3.25.76 (`mcp/`), Node ≥ 18.20 (`mcp` engines) | `registerTool` supports `annotations` and `_meta`; `McpServer` options support `instructions`; `InMemoryTransport` and `Client` are public subpaths |
| `@modelcontextprotocol/sdk` 1.30.1 | Same API surface | Hardening only (HTTP body limit, batch bound, stdio buffer limit); defer until after the milestone's measurements |
| `@modelcontextprotocol/server`/`client` 2.1.0 | MCP protocol 2026-07-28 | Stateless; removes `initialize`. Incompatible with FSB's identity capture without a migration; out of scope |
| `@typesafe-ai/sdk` 0.6.0 | Node ≥ 20; MV3 service worker (guard does not trip) | Throws in side panel/options without `dangerouslyAllowBrowser`; not recommended anyway |
| `puppeteer` 25.12.0 | Node ≥ 22.12 (root is ≥ 24); bundled Chrome for Testing | Branded Chrome 137+ ignores `--load-extension`; use `enableExtensions` / `installExtension` |
| OpenRouter `typesafe/jev-1.13` | Served snapshot `typesafe/jev-1.13-20260917` (as of 2026-09-28) | The snapshot can advance under the same ID, so re-validate thresholds when `servedModel` changes |
| TypeSafe `jev-1.13.0` | Direct API only | `jev-1.13` (two-part) was rejected by the direct API in community tests |

---

## Integration Points (file map)

| File | Change | Why |
|---|---|---|
| `extension/ai/jev-client.js` (new) | Thin client, backends, validation, breaker, limiter; `globalThis` export plus a `module.exports` guard | One code path for the service worker and Node tests |
| `extension/background.js` | `importScripts('ai/jev-client.js')` near `ai/tool-definitions.js` / `ai/ai-integration.js` | Classic service-worker loading |
| `extension/config/config.js`, `init-config.js`, `secure-config.js` | `jevEnabled`, `jevRoute`, `typesafeApiKey` (in `sensitiveKeys`), fast-mode flags, per-`servedModel` thresholds; decide on `openrouterApiKey` encryption | Settings and key hygiene |
| `extension/ai/cost-tracker.js`, `extension/utils/analytics.js` | Jev pricing entries (input 0.042, output 0); prefer `usage.cost` | Avoid the grok-pricing fallback |
| `extension/ai/hook-pipeline.js`, `extension/ai/agent-loop.js` | Timing hook; fast-mode path; done/stuck veto seams | Autopilot speed and measurement |
| `extension/utils/mcp-lattice-journal.js` | Additive `timing` metadata; extend `INTERNAL_PAYLOAD_KEYS` | Per-call timing without replay leakage |
| `extension/ws/mcp-tool-dispatcher.js` | Timing stamps; journal fallback in `handleGetSessionMessageRoute`; `expect` evaluation | Session-detail fix and same-call outcome checks |
| `mcp/src/agent-bridge.ts` | `mcpReceivedAt` / `bridgeSentAt` sidecars | Agent-think-time and queue-wait attribution |
| `mcp/src/tools/*.ts`, `mcp/src/server.ts`, `mcp/src/queue.ts` | `registerTool` with annotations and `_meta`; shortened text; `instructions`; exported read-only set; optional `run_task` params | MCP speedups with additive wire changes |
| `mcp/src/tools/schema-bridge.ts` | `object` branch only if `expect` is structured | Keep typed schemas on the wire |
| `tests/mcp-smoke-harness.js`, hash-pinning tests, `tests/mcp-lattice-journal.test.js` | Support `registerTool`; deliberate hash re-baseline or shape/description split; timing pins | Source-pin tripwires must move in the same commit |
| `scripts/verify-mcp-tool-budget.mjs`, `scripts/bench/*` (new) | Gate, analyzer, runner, fixtures, stats, calibration report | Measurement deliverables |
| `showcase/angular/src/app/pages/privacy/privacy-page.component.html` plus the five translated XLIFFs | The sentence "Hosted API calls are made only to the provider you select (…)" becomes false once Jev calls OpenRouter/TypeSafe alongside another chat provider | Privacy accuracy; changing `@@privacy.section.external.li.1` trips the six-locale i18n drift gate, so plan translations. Update the Chrome Web Store data disclosure too |

---

## Open Questions (flag for phase research)

- Does OpenRouter accept a dated snapshot (`typesafe/jev-1.13-20260917`) as the request model? This is undocumented; one test call answers it.
- What are the data-retention terms on OpenRouter's Jev route? They are needed for the Providers disclosure and the privacy page.
- Does `anthropic/alwaysLoad` on a hot set actually reduce Claude Code wall time for FSB tasks, given the upfront context it adds? Measure it in Tier 3 before shipping.
- Should `expect` be a structured object (schema-bridge work plus seven-provider formatter tests) or a single string? This is a planning decision.
- Is the gap between 72 tools on the wire and the "73" in planning docs a doc miscount or a conditionally registered tool? Reconcile during the description phase.

---

## Sources

- npm registry, `npm view @typesafe-ai/sdk` and `npm pack @typesafe-ai/sdk@0.6.0`, source `dist/index.mjs` read directly: browser guard, env reads, defaults, headers. HIGH
- https://openrouter.ai/docs/guides/community/jev: routes, 32k context, pricing, Decisions API vs System One API. HIGH
- https://openrouter.ai/docs/guides/community/typesafe-sdk: base URL, model mapping, `id`/`provider`/`usage.cost`, dated snapshot, `models.list()` incompatibility. HIGH
- https://openrouter.ai/docs/guides/community/jev-tutorial: "resolves to the current 1.13 release"; pin `typesafe/jev-1.13`. HIGH
- https://openrouter.ai/typesafe/jev-1.13: price, 32K context, released 2026-09-18, p50 0.21 s, 99.90% availability (point in time). MEDIUM
- https://openrouter.ai/docs/api/reference/limits: `GET /api/v1/key`, 402 `limit_source`, 429 `provider_code`, no platform cap on paid models, `Retry-After`. HIGH
- `research_notes/Jev by TypeSafe AI/core_model_and_api.md` and `sdks_access_integrations.md`, `.planning/research/JEV-REFERENCE.md`: direct API limits, errors, versioning, community latency and billing probes. HIGH (official) / MEDIUM (community)
- npm registry `@modelcontextprotocol/sdk` (1.30.1 latest, 2026-09-23) and https://github.com/modelcontextprotocol/typescript-sdk/releases (1.30.x notes; v2 2.1.0 packages). HIGH
- Installed `mcp/node_modules/@modelcontextprotocol/sdk@1.29.0` `.d.ts`: `registerTool` config with `annotations`/`_meta`, deprecated `tool()` overloads, `ServerOptions.instructions`, public `inMemory.js`/`client/index.js` subpaths. HIGH
- https://modelcontextprotocol.io/specification/2026-07-28/changelog and https://blog.modelcontextprotocol.io/posts/2026-07-28/: stateless protocol, no `initialize`, `ttlMs`/`cacheScope`, Tasks extension. HIGH
- https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/: `ToolAnnotations` fields and defaults. HIGH
- https://code.claude.com/docs/en/agent-sdk/custom-tools: `readOnlyHint` controls parallel calls. HIGH
- https://code.claude.com/docs/en/mcp: tool search default, 2 KB truncation of descriptions and instructions, `alwaysLoad` and `_meta["anthropic/alwaysLoad"]`. HIGH
- https://github.com/greynewell/mcp-serialization-repro and anthropics/claude-code#14353: serialization without `readOnlyHint`; the model may still emit one call per turn. MEDIUM
- https://code.visualstudio.com/api/extension-guides/ai/mcp: no confirmation for `readOnlyHint` tools. HIGH
- https://cursor.com/blog/dynamic-context-discovery: MCP tool descriptions synced to files and looked up on demand; 46.9% token reduction. HIGH
- https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy: default extension CSP (applies to the background worker; no `connect-src`; WebAssembly disabled by default). HIGH
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY and https://developer.chrome.com/blog/extension-news-june-2025: `--load-extension` removed in branded Chrome 137; Chrome for Testing and Chromium unaffected. HIGH
- https://pptr.dev/guides/chrome-extensions and npm `puppeteer` 25.12.0: `enableExtensions`, `installExtension`, MV3 service-worker targets. HIGH
- https://github.com/SeleniumHQ/selenium/pull/17817: Chrome 149 CDP extension install without pipe flags. MEDIUM
- https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static: Baseline, available in workers. HIGH
- FSB code (graphify-oriented, then read directly): `extension/manifest.json`, `extension/background.js` `importScripts` list, `extension/ai/universal-provider.js`, `extension/ai/cost-tracker.js`, `extension/config/secure-config.js`, `extension/utils/mcp-lattice-journal.js`, `extension/ws/mcp-tool-dispatcher.js`, `mcp/src/agent-bridge.ts`, `mcp/src/queue.ts`, `mcp/src/runtime.ts`, `mcp/src/server.ts`, `mcp/src/tools/{schema-bridge,manual,observability,autopilot}.ts`, `tests/mcp-smoke-harness.js`, `tests/capability-mcp-surface.test.js`, `tests/tool-definitions-parity.test.js`, `scripts/sync-product-version.mjs`, privacy page template. HIGH
- Live probe: in-process `tools/list` against `mcp/build` (built 2026-09-28 02:06, newer than sources): 72 tools, 54,482 / 33,961 chars, 121,402 bytes, 0 annotations, 33 × 434-char suffix. HIGH

---
*Stack research for: v1.0.0 Jev Fast Mode (Jev decision provider, speed measurement, lean MCP surface)*
*Researched: 2026-09-28*
