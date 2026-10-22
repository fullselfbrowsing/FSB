# Phase 67: Hosted Jev Gateway, Policy, and Shadow Mode - Discussion Log (Assumptions Mode, Auto)

> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-10-15
**Phase:** 67-hosted-jev-gateway-policy-and-shadow-mode
**Mode:** assumptions + auto (yolo). There was no user to confirm, so every Likely or Unclear item was auto-resolved to the option that best fits the owner's stated direction.
**HEAD analyzed:** `469907cb` on branch `Jev`
**Areas analyzed:**
1. Gateway placement, credential custody and caller identity
2. Fixed decision schema, abuse limits and the extension client API
3. Redaction, untrusted page text and log hygiene
4. Usage, cost and per-decision accounting
5. Shadow harness, threshold selection and tighten-only safety

## Assumptions Presented

### 1. Gateway placement, credential custody and caller identity
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| The gateway is a new router factory in `showcase/server/src/routes/` mounted at `/api/jev`, with its own parser and error handler and skipped by the global parser; no new service or dependency | Confident | `server.js:131-144`; `global-json-parser.js:5-17`; `PROJECT.md:222`; `tests/server-telemetry-body-cap.test.js:15-48`; `ci.yml:28` |
| The upstream URL, model, price and credential come from server env and the credential from a secret only; there is no default route and config is injected into the factory | Confident (orchestrator auto-resolve) | `github-poller.js:25,357,364-389,958`; `.env.example`; `.gitignore:5`; `JEV-REFERENCE.md:63-76` |
| The upstream URL is validated at boot (`https` only, `http` only for loopback); invalid config disables rather than crashes | Likely | `JEV-REFERENCE.md:83`; PITFALLS Pitfall 6; `fly.toml` single machine |
| The operator switch is an env flag that defaults to disabled; there is no admin HTTP surface | Likely | `middleware/auth.js:5-21`; `routes/auth.js:8-17`; `telemetry-rate-limit.js:47,84-93`; `STATE.md:103` |
| The hash key is optional attribution only: no `authMiddleware` and no `validateHashKey` | Confident (gating); Likely (what to persist) | `routes/auth.js:8-17`; `middleware/auth.js:9-16`; `ws-client.js:1351-1366`; `queries.js:562-567` |
| The extension posts to a fixed FSB origin constant, not the Sync `serverUrl` | Likely | `telemetry-collector.js:60`; `config.js:57` against `ws-client.js:7` |

### 2. Fixed decision schema, abuse limits and the extension client API
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| The server owns the Jev instrument; the extension sends a bounded, exact-key FSB request; client-supplied questions and model are rejected | Likely | JEV-07; `telemetry.js:54-58,89-142,227-234`; PITFALLS Pitfall 15; `JEV-REFERENCE.md:97` |
| Layered limits: a route-local body cap, character budgets, at most 254 elements, a semaphore answering `busy`, one attempt with a timeout and no retries | Likely | `telemetry.js:151-162`; `server.js:301-305`; `github-poller.js:364-389`; `fly.toml [[vm]]`; `JEV-REFERENCE.md:48-61,97` |
| No per-IP, per-key or per-install limits; the route never reads the IP | Unclear | JEV-01; `REQUIREMENTS.md:65`; `tests/server-no-ip-leak.test.js:62-66,99-113` |
| One extension API, `decide()`, never rejects and returns a typed `DecisionResult` with a closed fallback enum and a parity test | Likely | gotcha 6; `scripts/bench/lib/tasks.mjs:34-38,76-78`; `cost-tracker.js:261-264,289-298`; `ARCHITECTURE.md:71` |
| The client is a classic SW script that owns its timers; no `agent-loop.js` call site in Phase 67 | Likely | `66-CONTEXT.md:195`; `tests/mcp-philosophy-parity-smoke.test.js:373-375`; `tests/lattice-provider-bridge-smoke.test.js:635-636` |

### 3. Redaction, untrusted page text and log hygiene
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| The schema is deny-by-default with no value field; the sanitizer drops sensitive elements; the server rejects unknown fields; Phase 68 wires the content side | Likely | PITFALLS Pitfall 5; `dom-analysis.js:2213-2217,3142,369-394`; `REQUIREMENTS.md:74` |
| A shared secret-pattern scrubber replaces matches in text and refuses when the goal matches | Unclear | `redactForLog.js:27`; `network-capture-redactor.js`; PITFALLS Pitfall 5 "How to avoid" item 2 |
| URLs are sent as origin plus path; the query and fragment are dropped | Likely | `network-capture-redactor.js` D-06; `scripts/bench/lib/outcome.mjs:77` |
| No body, upstream-body, credential or `err` logging; a local error handler; tests with an echoing fake upstream and a static scan | Confident | V8 `JSON.parse` messages echo the input; `server.js:300-301`; body-parser `read.js:130-131`; `telemetry.js:432-443`; `server.js:104-113`; `JEV-REFERENCE.md:85` |

### 4. Usage, cost and per-decision accounting
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Usage and cost reuse the Phase 66 source labels; the served model is recorded verbatim; never a 0 or an invented cost | Confident | `cost-tracker.js:261-264,289-298,346,413-441`; `66-CONTEXT.md:65-66,196`; `JEV-REFERENCE.md:40,71` |
| A body-free per-decision SQLite ledger plus a daily aggregate, pruned by the housekeeper; no endpoint | Likely | `schema.js:160-409`; `housekeeper.js`; `server.js:139-144,371-372` |
| A served model that does not match the pin is still returned and recorded but marked `uncalibrated`; prefix match; 400 unknown model becomes `unavailable_model` | Likely | `scripts/bench/lib/identity.mjs:21-22,125`; `JEV-REFERENCE.md:65`; PITFALLS Pitfall 4 |

### 5. Shadow harness, threshold selection and tighten-only safety
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| The shadow harness is Node ESM under `scripts/bench/`, with a new step-level labelled record format, a seed set on the 12 core fixtures and recorded fake answers | Unclear | `tasks.mjs:34-38`; `scripts/bench/tasks/core/*.json`; `66-CONTEXT.md:87,95-98`; `tests/browser-editing-actions.test.mjs:146` |
| Accuracy by bucket, Wilson intervals, coverage; the lowest cut whose precision lower bound meets a predeclared target, else "not a fit"; ties within ±0.05; an `UNCALIBRATED` default | Likely | `stats.mjs:20,52`; `identity.mjs:53-80`; PITFALLS Pitfall 10; `JEV-REFERENCE.md:95-97`; `STATE.md:103` |
| Where calibrated thresholds live is open; every option ships `UNCALIBRATED` | Unclear | success criterion 5; JEV-06 |
| JEV-06 is proven on a pure combinator with exhaustive tables over the real gate outputs | Likely | `capability-router.js:500-545`; `tool-executor.js:540-580`; `permission-hook.js`; `permission-context.js:56-62`; `agent-loop.js:257-294,309,3183`; PITFALLS Pitfall 14; `ARCHITECTURE.md:215-219` |
| A Jev failure on an unflagged step falls back to baseline; a Jev error never creates a confirmation by itself | Unclear | `ARCHITECTURE.md:215-219`; `ROADMAP.md:23`; `PROJECT.md:50`; set against PITFALLS Pitfall 14 "How to avoid" item 1 |

### Extra code checks made during this discussion (beyond the analyzer)
- **Docker image contents.** The `Dockerfile` runtime stage is `node:20-alpine` and copies only `showcase/server/server.js` and `showcase/server/src/`. Server code cannot `require` anything under `extension/` in production, and `showcase/server/scripts/` is not in the image. That forces the scrubber to be hand-mirrored with a parity test (D-19) and keeps every new server file under `src/` (D-03, D-24).
- **Live pins.** `extension/background.js` holds 334 `importScripts` tokens and 330 call sites, the same values the pins at `tests/lattice-provider-bridge-smoke.test.js:636,684` expect. `extension/ai/agent-loop.js` holds 8 `setTimeout` tokens, matching `tests/mcp-philosophy-parity-smoke.test.js:373-374`.
- **Consent gate decisions.** The gate also returns `mutating_required` (`capability-router.js:570`). `detectStuck` returns `{isStuck, shouldForceStop, reasonCode, hint}`. Both feed the JEV-06 tables (D-29).
- **Corpus lock.** The frozen corpus (`scripts/bench/tasks/core.lock.json`) hashes each task's fixtures, and `loadTasks` accepts only the sets `core` and `live`. Shadow records therefore live outside `scripts/bench/tasks/` (D-26).
- **Privacy page.** `privacy-page.component.html:13` says the only data that leaves the machine for FSB is opt-out telemetry, and `:57` says page content is never persisted on an FSB server. This shaped the body-free ledger (D-24) and the deferred disclosure note.
- **Boot without Jev env.** `tests/showcase-route-fallback.test.js:99` spawns `server.js`, so the gateway must boot cleanly with no Jev env (D-05).
- **Existing injection filter.** `extension/ai/ai-integration.js:3593-3620` already has an injection-pattern list (`sanitizePageContent`), which D-21 mirrors.

## Corrections Made

None. Auto mode: there was no user, and every Likely or Unclear item was auto-resolved (below).

## Auto-Resolved

1. **Upstream route, model and credential (D-04).**
   - **Chosen:** server env for the URL, pinned model, price and credential; the credential only in a secret (`.env` locally, `fly secrets` in production); no default route; `not_configured` when unset; config read once at boot and injected into the factory.
   - **Reason:** The orchestrator directed this auto-resolution because the owner has not said which account holds the credential, and TypeSafe direct signups are closed. V2 can choose either route without a code change.
2. **URL validation (D-05).**
   - **Chosen:** a hybrid of the analyzer's (a) and (b). The URL is free-form configuration but must exactly match one of the two legitimate endpoints, or be a loopback URL for tests. The model ID is validated per route and aliases are rejected. Invalid config yields `not_configured` and never a crash.
   - **Reason:** This keeps "either route by configuration" while closing the typo and lookalike-domain hole (PITFALLS Pitfall 6; about 670 "jev" domains appeared) and the alias-drift hole (Pitfall 4). A crash would take down the showcase site, which runs on the same single machine.
3. **Operator switch (D-06).**
   - **Chosen:** (a) an env flag that defaults to off, plus an env-tunable global daily USD ceiling that returns `spend_cap_reached` (from the analyzer's limits option (c)).
   - **Reason:** There is no operator-auth surface and anyone can mint a hash key, so any HTTP toggle would need a new secret. A default of off keeps spend at zero until V2 and V3. A fleet-wide spend ceiling is a cost circuit breaker, not a per-user quota, so it is consistent with JEV-01 and with "monitor aggregate cost". Fly's `secrets set` restarts the machine; `--stage` defers the change.
4. **Hash-key persistence (D-07).**
   - **Chosen:** (a)-variant. Persist only a boolean recording whether a well-formed key was present, using a shape check and no database lookup.
   - **Reason:** JEV-01 forbids gating. `validateHashKey` writes on every call. A per-key digest would create a per-install usage trail that nothing in JEV-04 needs, and anyone can mint keys anyway.
5. **Abuse limits (D-08).**
   - **Chosen:** (a) global-only bounds (schema, size, concurrency, the spend ceiling, the operator switch). No per-IP limiter.
   - **Reason:** This is the literal reading of JEV-01 and of success criterion 2 ("without sign-in or usage quotas"), and per-install quotas are explicitly deferred. Keeping the route clear of `req.ip` leaves the IP-leak audit untouched. The downside, that an abuser forces everyone onto baseline fallback, is harmless because the fallback is today's FSB. A per-IP limiter stays deferred, to be added if monitoring shows abuse.
6. **Extension endpoint (D-09).**
   - **Chosen:** (a) the fixed constant `https://full-selfbrowsing.com/api/jev/decide`, with injection for tests and no storage override.
   - **Reason:** This follows the `TELEMETRY_ENDPOINT` precedent. The user-editable `serverUrl` has conflicting defaults and would send page context to arbitrary hosts, and a storage override would become a write surface for the Phase 66.1 settings tool.
7. **Instrument ownership (D-10).**
   - **Chosen:** (a) a server-built, versioned instrument. Client-supplied questions, instructions, criteria or model are rejected.
   - **Reason:** A pass-through would turn FSB's credential into a free open Jev proxy. Only server-built questions guarantee that page text never reaches `instructions` (Pitfall 15). It also fixes the instrument that thresholds and shadow calibration depend on.
8. **Size budget (D-12).**
   - **Chosen:** budget UTF-8 bytes (about 28,000 total upstream text) as the token upper bound, with a fixed shrink order, and a route body cap of about 48 KB.
   - **Reason:** Jev's tokenizer is undisclosed, and a byte-level BPE never yields more tokens than bytes. OpenRouter's long-context trigger is "about 32,000 bytes of text". CJK pages are handled conservatively, with no per-language ratio.
9. **Full concurrency cap (D-13).**
   - **Chosen:** (a) answer `busy` at once. One upstream attempt, no gateway retries, never re-ask.
   - **Reason:** Queueing or retrying turns a sub-second decision into seconds and defeats fast mode. "Never re-roll" comes from the reference, and the caller escalates instead.
10. **Client API and envelope (D-15, D-16).**
    - **Chosen:** `decide()` never rejects. Every gateway response carries a typed body plus a meaningful HTTP status (the analyzer's (b)); the client maps the body first and the status only as a fallback. The enum is locked and closed, with reasons added for findings the analyzer did not cover: `sensitive_goal`, `spend_cap_reached`, `upstream_billing` (402), `upstream_rejected`, `upstream_error`, `aborted`.
    - **Reason:** Phases 68 and 70 need one non-throwing contract (INV-04 stall risk) and a closed enum guarded by a parity test (gotcha 6). Meaningful statuses let edge-level failures with no body still map correctly. The 2026-10-15 research found 402 and the 200-with-error envelope on OpenRouter.
11. **Module loading (D-17).**
    - **Chosen:** (a) load the extension modules inert through `importScripts` now, bumping both pins in the same commit.
    - **Reason:** Phases 68 and 70 then add only call sites. Loading in the real worker scope also proves there are no top-level name collisions early.
12. **Sanitizer split (D-18).**
    - **Chosen:** (a) Phase 67 builds the extension sanitizer and the server validator over a typed element list. Phase 68 builds content-side extraction.
    - **Reason:** The JEV-03 guarantees become testable now without touching the content scripts, which are heavily pinned, before the fast loop exists.
13. **Secret scrubber (D-19).**
    - **Chosen:** (a) scrub text and labels with typed placeholders, and refuse with `sensitive_goal` when the goal matches. High-precision patterns only. Hand-mirrored in the extension and server with a shared fixture corpus and a parity test.
    - **Reason:** This follows PITFALLS Pitfall 5 item 2. High precision keeps order and record numbers that Jev needs. Mirroring is forced by the Docker image contents.
14. **URL handling (D-20).**
    - **Chosen:** (a) origin plus path; drop the query and fragment.
    - **Reason:** This follows the network-capture redactor's D-06 precedent. OAuth codes and reset tokens live in query strings. Bench completion is checked in code, never by Jev reading the URL.
15. **Accounting store (D-24).**
    - **Chosen:** (a) a body-free per-decision SQLite ledger (7-day retention) plus a daily aggregate (365 days) and one allowlisted log line per decision. No read endpoint.
    - **Reason:** JEV-04 asks for "each decision", which aggregates alone cannot answer. A public endpoint would publish FSB's spend, and an admin endpoint needs operator auth. The privacy page promises page content is never persisted.
16. **Served-model mismatch (D-25).**
    - **Chosen:** (a) return and record the response, marked `uncalibrated`, plus a `snapshot_changed` status for an in-family dated-snapshot change. Consumers act only on `calibrated`.
    - **Reason:** A silent snapshot change is exactly the risk V3 exists to manage. Failing hard on every OpenRouter date bump would lose the evidence the operator needs to recalibrate.
17. **Label source (D-26).**
    - **Chosen:** (c) a record format with a `provenance` field from day one, but Phase 67 ships only hand-written seed records on the 12 core fixtures, stored outside the frozen corpus. The harness calls the gateway, never upstream.
    - **Reason:** Recorded LLM labels need V1 and live runs. Going through the gateway means V3 calibrates exactly the instrument production sends. The frozen-corpus lock (Phase 66 D-15) must not change.
18. **Threshold selection (D-27).**
    - **Chosen:** (a) the lowest cut on a predeclared grid whose one-sided Wilson lower bound on at-or-above-cut precision meets a predeclared target, with Bonferroni adjustment over the cuts scanned and a minimum sample count, else "not a fit". Targets differ by question type, with risk recall-first. No Platt or isotonic recalibration.
    - **Reason:** See External Research item 5. Risk is recall-first because a false risk flag only adds a confirmation (tighten-only), while a false accept on operation or target acts on the page.
19. **Threshold location (D-28).**
    - **Chosen:** (a) a server-held, versioned calibration profile keyed by (pinned model, instrument hash), shipped as `UNCALIBRATED`. The response carries `threshold` and `meetsThreshold`, which the extension treats as necessary but never sufficient.
    - **Reason:** The pin and the instrument are both server-side (D-04, D-10), so recalibrating after a snapshot change needs no Web Store release. The server already relays every Jev answer, so the profile adds no new trust. JEV-06 holds because only extension code acts, and a risk answer can only add a confirmation.
20. **Tighten-only proof (D-29).**
    - **Chosen:** (a) a pure combinator plus exhaustive table tests over the real gate outputs, including `mutating_required` and hostile extra fields. Breakers are proven identical under any Jev fields.
    - **Reason:** Phase 68's planner needs a tested tighten-only property to build on. A shadow-only risk hook in Phase 67 would add an `agent-loop` or hook wiring change the phase does not need.
21. **Jev failure behavior (D-30).**
    - **Chosen:** (a) fail to baseline for unflagged steps. A Jev error never removes a confirmation and never creates one by itself in Phase 67. The combinator lets Phase 68 add a stricter code-near-risk predicate.
    - **Reason:** "Jev failure contributes nothing" (`ARCHITECTURE.md`) and the owner's compatibility rule. PITFALLS Pitfall 14's fail-closed rule concerns steps that code already flags, where a confirmation exists independently of Jev. When the fast path's decision request fails, no Jev-chosen action exists, so fail-closed only matters for the Phase 68 risk hook, which that phase decides.
22. **Model pin after the 1.14 release (D-31).**
    - **Chosen:** keep the documented pins `jev-1.13.0` and `typesafe/jev-1.13` (the milestone research choice). V2 may configure 1.14, and V3 must calibrate on whatever V2 deploys. The instrument uses only Choice and Noul.
    - **Reason:** New information on 2026-10-15: `jev-1.14.0` shipped on 2026-10-14; direct `jev-latest` still points to 1.13.0, and OpenRouter now calls 1.13 "still available". Because the pin is configuration, no code change is needed either way, and `unavailable_model` covers a retirement.

## External Research

All sources were fetched on 2026-10-15.

1. **The OpenRouter `/api/v1/systemone` contract.**
   - **Route and response.** The TypeSafe-compatible route is `https://openrouter.ai/api/v1/systemone` with an OpenRouter key as Bearer. It accepts `typesafe/jev-1.13` and bare `jev-1.13` (rewritten to the prefixed form) as well as aliases. The response adds `id`, `provider` and `usage.cost` (USD) to `model`, `answers` and `usage`, and `model` is a dated snapshot such as `typesafe/jev-1.13-20260917`.
   - **Models.** The Jev guide now lists `typesafe/jev-1.14` as current and `typesafe/jev-1.13` as "still available". `~typesafe/jev-latest` tracks the newest release.
   - **Context.** "Context length is 262,144 tokens", but "Requests with more than about 32,000 bytes of text … run in TypeSafe's long-context mode, which TypeSafe says is slower and less accurate."
   - **Errors.** OpenRouter returns `{error:{code:number, message, metadata?}}` with 400, 401, 402 (insufficient credits), 403, 408, 429, 502, 503 and 529. **Non-streaming provider failures can arrive as HTTP 200 carrying an error object.** On 500-class errors OpenRouter replaces the message with a generic string.
   - **Not documented:** Jev-specific rate limits.
   - **Effect:** D-12, D-14, D-16, D-31.
   - Sources: https://openrouter.ai/docs/guides/community/jev, https://openrouter.ai/docs/guides/community/typesafe-sdk, https://openrouter.ai/docs/api/reference/errors-and-debugging
2. **The TypeSafe direct contract.**
   - **Request and response.** `POST /v1/systemone` with `Authorization: Bearer`. The response is `{model, answers, usage:{input_tokens, output_tokens}}` with **no cost field**, so direct-route cost is an `estimate`.
   - **Documented errors:** 400 (request rule broken), 401 (missing or invalid key), 413 (body over 32 MiB), 415 (encoding), 422 (validation), 429 (rate limit) and 529 (overloaded). Retry 429 and 529 with backoff; the gateway does not, because the client escalates instead. The community report of 403 for a missing auth header stays in the mapping as `auth_error`.
   - **Models:** `jev-1.14.0` (released 2026-10-14) and `jev-1.13.0`. `jev-latest` points to `jev-1.13.0` and `jev-preview` to `jev-1.14.0`.
   - **Limits:** 64k tokens per request and 32k per question by default; an opt-in long-context header raises both to 262k but is slower and less accurate, and FSB never sets it.
   - **Price:** $0.042 per million input tokens, output free.
   - **Effect:** D-16, D-23, D-31.
   - Sources: https://docs.typesafe.ai/api, https://docs.typesafe.ai/models
3. **Token budgeting without a tokenizer.**
   - There is no public tokenizer. A community probe found the closest match was Qwen's byte-level BPE (`JEV-REFERENCE.md`). For any byte-level BPE, tokens are at most UTF-8 bytes, so a byte budget is a strict, language-independent upper bound. CJK characters cost 3 bytes each, which over-counts them safely.
   - OpenRouter's own long-context trigger is byte-based (about 32,000 bytes of text), so the byte budget is also the exact unit that avoids the slow mode.
   - The research's "about 2.35 chars per token for JSON state" means real token counts will sit well below the byte budget.
   - **Effect:** D-12.
4. **Data retention.**
   - TypeSafe: "Jev is not trained on customer requests or responses". Zero data retention is available to enterprise customers under the DPA.
   - OpenRouter: "your prompts are not retained unless you specifically opt in to prompt logging". Opting in grants OpenRouter commercial-use rights. OpenRouter stores metadata (timestamps, model, tokens, latency). Per-request ZDR is `provider: {zdr: true}`, and the docs describe it only for inference routing; whether it applies to `/api/v1/systemone` is not stated.
   - Both routes end at TypeSafe, so the route choice changes only whether OpenRouter's no-retention-by-default middle hop is present. Phase 68's disclosure should name FSB's server and TypeSafe AI.
   - **Added to V2:** confirm prompt logging is off on the FSB OpenRouter account.
   - Sources: https://docs.typesafe.ai/models, https://openrouter.ai/docs/guides/features/zdr
5. **Statistics for small calibration sets.**
   - Brown, Cai and DasGupta (2001) recommend the Wilson or Jeffreys interval for small n. Clopper-Pearson is exact but conservative. FSB already has `wilson()` in `scripts/bench/lib/stats.mjs`.
   - **Selection:** use the one-sided Wilson lower bound on cumulative (at-or-above-cut) precision. Choosing the lowest qualifying cut among k grid cuts is a multiple-comparison selection, so apply Bonferroni (z at α/k). Per-bucket intervals are descriptive only. A minimum sample count per cut applies.
   - **Recalibration:** Platt or isotonic needs "a few hundred labeled examples" (`JEV-REFERENCE.md`, Molas), far more than a seed set, so it is deferred.
   - **Effect:** D-27.
   - Source: https://doi.org/10.1214/ss/1009213286
6. **Fly.io operator-switch reaction time.**
   - `fly secrets set` deploys the new secret to the app's machines. `--stage` "Set[s] secrets but skip[s] deployment", and `--detach` returns immediately.
   - With one machine (`min_machines_running = 1`), flipping the env switch costs one machine restart, which briefly interrupts the showcase site. The exact time to effect is measured at V2.
   - **Effect:** D-06.
   - Source: https://docs.fly.io/flyctl/secrets-set
