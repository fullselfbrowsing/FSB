---
phase: 66
slug: baseline-and-session-timing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-29
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `66-RESEARCH.md` → `## Validation Architecture`. Task IDs match the final plans, 66-01..66-11.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain Node test scripts (`node tests/<file>.test.js`, custom assert/check helpers), plus `node:test` for some suites (e.g. `node --test tests/mcp-lattice-journal.test.js`). New bench suites use `.test.mjs` with `node --test`. |
| **Config file** | none. The root `package.json` `test` script is a ~298-command `&&` chain, and `pretest` runs `mcp-session-recorder-journal`, `mcp-lattice-journal` and `mcp-session-export-port`. |
| **Quick run command** | the `<automated>` command of the task (per-suite `node …` runs) |
| **Full suite command** | `npm test` with loopback port 7225 free (`lsof -nP -iTCP:7225 -sTCP:LISTEN` returns nothing) |
| **CI** | Node 20: `npm run validate:extension && npm test` (`.github/workflows/ci.yml`) |
| **Estimated runtime** | quick: < 30 s per suite. Full chain: several minutes. |

---

## Sampling Rate

- **After every task commit:** run the task's `<automated>` command.
  - Whenever `extension/ai/agent-loop.js`, `extension/background.js` or `extension/ws/mcp-tool-dispatcher.js` changes, also run the pin suites listed in 66-04 Task 2 (`mcp-philosophy-parity-smoke`, `lattice-survivability-smoke`, `agent-loop-iterator-guard`, `lattice-step-emitter-smoke`, `lattice-provider-bridge-smoke`, and the others).
- **After every plan wave:** run `npm run test:mcp-journal && npm test` with port 7225 free.
  - A red `EADDRINUSE` means the chain stopped early and the later suites never ran. It is not a pass.
- **Before `/gsd-verify-work` (66-09 Task 2):**
  - the full `npm test` is green against the start-commit baseline from 66-02 Task 1
  - `npm run validate:extension` is green
  - the ten `tests/bench-*.test.mjs` suites have passed once under Node 20, using the official nodejs.org tarball rather than `npx node@20`
- **Regression sweep (66-03, 66-04, 66-06):** after each task, `scripts/bench/sweep-tests.mjs` runs every test that references an edited file and compares the result with `66-02-SWEEP-BASELINE.json`, so a failure that already existed is not reported as new. The `timeout` command is not installed on this machine, so no check uses it.
- **Max feedback latency:** 60 seconds per task check.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 66-01-01 | 01 | 1 | MEAS-03 (D-20, D-21) | T-66-02 | Raw captures are gitignored under `scripts/bench/.local/`, and the derivation's leak check rejects page content | unit | `node --test tests/bench-export-history.test.mjs && git check-ignore -q scripts/bench/.local/probe.json && node --check scripts/bench/history-export-snippet.js` | ❌ created in task | ⬜ pending |
| 66-01-02 | 01 | 1 | MEAS-03 (D-20) | — | H1: the export file parses as `fsb-history-export` | manual + check | export-file shape check in the plan | — | ⬜ pending |
| 66-01-03 | 01 | 1 | MEAS-03 (D-21) | T-66-02 | Committed `metrics.json` has no URLs, and the raw file stays ignored | unit | metrics/raw count check `&& git check-ignore -q scripts/bench/.local/history-2026-09-16_21/raw.json` | ❌ created in task | ⬜ pending |
| 66-02-01 | 02 | 1 | MEAS-01..03 | — | Installs complete; the start-commit `npm test` baseline is recorded; `scripts/bench/sweep-tests.mjs` and its `66-02-SWEEP-BASELINE.json` exist; no tracked files modified | env | installs + baseline file + `node scripts/bench/sweep-tests.mjs --help` + sweep-baseline check + clean tracked tree (see plan) | ❌ created in task | ⬜ pending |
| 66-02-02 | 02 | 1 | MEAS-03 (D-16) | — | Median/quantile known answers; bootstrap deterministic by seed; A/A reads as inconclusive; a known effect gives a CI that excludes 1 | unit | `node --test tests/bench-stats.test.mjs` | ❌ created in task | ⬜ pending |
| 66-02-03 | 02 | 1 | MEAS-03 (D-17, D-18) | T-66-01, T-66-04 | The evaluator never reads agent claims. Identity is canonical and hides secrets, and preflight refuses the wrong extension or model. | unit | `node --test tests/bench-outcome.test.mjs tests/bench-identity.test.mjs` | ❌ created in task | ⬜ pending |
| 66-03-01 | 03 | 2 | MEAS-01 (D-04, D-18) | T-66-01, T-66-05 | Timing is stamped on `Symbol.for('fsb.mcp.call-timing')` and never serialized. Sheets entries keep timing. `fsb://config` is an allowlist with no secret-like keys. | unit (vm) | `node tests/mcp-bridge-background-dispatch.test.js && node --test tests/spreadsheet-record-redaction.test.js && node tests/mcp-session-recorder.test.js && node tests/mcp-dispatcher-client-label.test.js` | ✅ extend | ⬜ pending |
| 66-03-02 | 03 | 2 | MEAS-01 (D-04) | T-66-05 | The recorder carries validated timing on journal, legacy and task-outcome paths, and the `beginCall` identity is unchanged | unit | `node tests/mcp-session-recorder-journal.test.js && node tests/mcp-session-recorder.test.js && node tests/lattice-replay-background-contract.test.js` | ✅ extend | ⬜ pending |
| 66-03-03 | 03 | 2 | MEAS-01 (D-04, D-09) | — | Journal `metadata.timing` is written only when supplied. Both text exports gain per-call ms through one shared formatter. | unit | `node --test tests/mcp-lattice-journal.test.js tests/mcp-session-export-port.test.js && npm run test:mcp-journal` | ✅ extend | ⬜ pending |
| 66-04-01 | 04 | 2 | MEAS-01 (D-10, D-11) | — | Provider-reported cost is used first. `grok-4.3` has exact price rows. Unknown models are labelled unavailable in the labelled path and are never priced as Grok. | unit | `node tests/cost-tracker.test.js` | ✅ update | ⬜ pending |
| 66-04-02 | 04 | 2 | MEAS-01 (D-02, D-05) | — | Model and tool timing are stamped inline, `durationMs` defaults to null, and INV-04 plus all agent-loop pins still hold | unit + source pins | pin-suite chain in 66-04 Task 2 `<automated>` | ✅ run | ⬜ pending |
| 66-04-03 | 04 | 2 | MEAS-01 (D-05, D-06) | — | `saveSession` keeps the measurement fields, and the autopilot text export gains timing lines | unit | `node tests/automation-logger-mcp-retention.test.js && node tests/lattice-replay-background-contract.test.js && node tests/delegation-sidepanel-tab-follow.test.js && node tests/mcp-session-recorder.test.js` | ✅ extend | ⬜ pending |
| 66-05-01 | 05 | 2 | MEAS-03 (D-15) | T-66-06 | Task JSON is validated before use, and fixture hashing is stable | unit | `node --test tests/bench-tasks.test.mjs` | ❌ created in task | ⬜ pending |
| 66-05-02 | 05 | 2 | MEAS-03 (D-13, D-17) | T-66-04, T-66-06 | The fixture server binds 127.0.0.1 only and guards against path traversal; the evidence endpoint requires the runner secret | unit (local http) | `node --test tests/bench-fixture-server.test.mjs` | ❌ created in task | ⬜ pending |
| 66-05-03 | 05 | 2 | MEAS-03 (D-12, D-14) | — | The Claude and Cursor stream parsers keep argv parity with `claude-profile.ts`, and the agent-streams manifest set is unchanged | unit | `node --test tests/bench-claude-stream.test.mjs && node tests/mcp-agent-drift-smoke.test.js` | ❌ created in task | ⬜ pending |
| 66-06-01 | 06 | 3 | MEAS-01 (D-04) | T-66-05 | Dispatcher message-route and task-outcome paths carry timing | unit (vm) | `node tests/mcp-in-flight-session-lookup.test.js && node tests/mcp-session-recorder.test.js && node tests/mcp-dispatcher-client-label.test.js && node --test tests/spreadsheet-record-redaction.test.js` | ✅ extend | ⬜ pending |
| 66-06-02 | 06 | 3 | MEAS-02 (D-07, D-08) | T-66-03 | Lookup checks the journal first and returns sanitized, paged `actionHistory` with no raw payloads. The journal-absent guard still holds and `session_not_found` is unchanged. | unit (vm) | `node tests/mcp-in-flight-session-lookup.test.js && node tests/mcp-tool-routing-contract.test.js && node --test tests/mcp-lattice-journal.test.js` | ✅ extend | ⬜ pending |
| 66-06-03 | 06 | 3 | MEAS-01 | T-66-03 | The `measurement` block survives the `/token/i` filter, and `durationMs` appears only when finite | unit (vm) | `node tests/mcp-in-flight-session-lookup.test.js && node tests/mcp-session-recorder.test.js && node tests/mcp-dispatcher-client-label.test.js && node tests/mcp-tool-routing-contract.test.js && node --test tests/spreadsheet-record-redaction.test.js` | ✅ extend | ⬜ pending |
| 66-07-01 | 07 | 3 | MEAS-03 (D-15) | — | The six mixed fixture apps and their tasks load | unit | mixed-count loader check (see plan) | ❌ created in task | ⬜ pending |
| 66-07-02 | 07 | 3 | MEAS-03 (D-15) | — | Core has 12 tasks (6 click-heavy); the live set has 2-4 | unit | core/live count loader check (see plan) | ❌ created in task | ⬜ pending |
| 66-07-03 | 07 | 3 | MEAS-03 (D-15, D-17) | T-66-06 | The core corpus is frozen by `core.lock.json`, and the offline evidence self-check passes | unit | `node --test tests/bench-corpus.test.mjs tests/bench-tasks.test.mjs tests/bench-fixture-server.test.mjs` | ❌ created in task | ⬜ pending |
| 66-08-01 | 08 | 3 | MEAS-03 (D-14, D-18) | T-66-01, T-66-01d | The drivers build the child env from an allowlist, dropping `CLAUDECODE`, `CLAUDE_*` and every provider key. They spawn in their own process group, stop tasks on timeout, and never log or store the pairing code during CDP pairing. | unit (fakes) | `node --test tests/bench-drivers.test.mjs` + module-export check (see plan) | ❌ created in task | ⬜ pending |
| 66-08-02 | 08 | 3 | MEAS-03 (D-16, D-20) | T-66-02, T-66-SPEND-PAUSE, T-66-07 | Seeded ABBA schedule produces sanitized run rows; a dry run completes. `agent_cap`, `agent_auth` and `provider_error` (including silent 429 timeouts) pause the run with exit 75, and "500 ms" is not a match. Resume re-runs infra-error runs. `--expect-extension-id` is validated before pairing. The preflight refuses with `telemetry_not_opted_out` unless the opt-out is on. | unit + CLI | `node --test tests/bench-report.test.mjs && node scripts/bench/run-bench.mjs --dry-run …` (see plan) | ❌ created in task | ⬜ pending |
| 66-08-03 | 08 | 3 | MEAS-03 (D-12, D-16) | — | The report shows completion CIs, wall time per completed task, labelled cost, and the A/A noise floor | unit | `node --test tests/bench-report.test.mjs` | ❌ created in task | ⬜ pending |
| 66-09-01 | 09 | 4 | MEAS-03 | — | The ten bench suites are registered once, at the end of the chain and in `REFINEMENT_ROOT_TEST_COMMANDS`, with the historical hashes untouched | contract | `node tests/delegation-phase-contract.test.js && node tests/mcp-client-identity-integration.test.js` + chain check | ✅ run | ⬜ pending |
| 66-09-02 | 09 | 4 | MEAS-01..03 (D-01, D-02) | T-66-05 | The full chain matches the baseline, the timing symbol appears only in the two ingress files, and nothing under `mcp/` changed | integration | `npm run validate:extension` + audits (see plan) | ✅ run | ⬜ pending |
| 66-10-01 | 10 | 5 | MEAS-03 | — | The extension and MCP server build, and the bench Chrome starts with DevTools on its own profile | env | build + DevToolsActivePort + pid check | — | ⬜ pending |
| 66-10-02 | 10 | 5 | MEAS-03 | T-66-01 | H2+H3: the unpacked extension id is valid and is not the Web Store id | manual + check | extension-id check (see plan) | — | ⬜ pending |
| 66-10-03 | 10 | 5 | MEAS-01, MEAS-03 | T-66-01, T-66-01e | Preflight passes, including the telemetry opt-out check. The saved core smoke has 24 distinct runIds (12 tasks × 1 round × 2 arms), plus up to 8 live runs unless declined. Operators can see per-call timing live. | live | `node scripts/bench/run-bench.mjs --preflight --pair-via-cdp …` + smoke checks that count distinct runIds (see plan) | — | ⬜ pending |
| 66-11-01 | 11 | 6 | MEAS-03 | — | H4: the human approves the campaign and its spend | manual | bench-session check (see plan) | — | ⬜ pending |
| 66-11-02 | 11 | 6 | MEAS-03 (D-16, D-21) | T-66-02 | The campaign runs; committed results contain no URLs and raw runs stay ignored | live + check | `node scripts/bench/report.mjs scripts/bench/results/core-baseline-66` + leak and ignore checks | — | ⬜ pending |
| 66-11-03 | 11 | 6 | — | — | H5: the everyday setup is restored | manual | `fsb-mcp-server status --json --timeout 5000` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Threat refs (from `66-RESEARCH.md` → Security Domain; each plan's `<threat_model>` restates the ones it touches):

| Ref | Threat |
|-----|--------|
| T-66-01 | An API key or bridge secret leaks through `fsb://config`, benchmark identity, or CDP pairing |
| T-66-02 | Page content from real sites is committed in baseline files |
| T-66-03 | Raw journal payloads are returned over MCP |
| T-66-04 | An agent tampers with or reads outcome evidence |
| T-66-05 | Timing is spoofed through payload keys |
| T-66-06 | Malformed task JSON is accepted, or a fixture path-traversal read succeeds |
| T-66-01d | The host environment (Claude Code session variables, provider keys) leaks into benchmarked child processes |
| T-66-01e | `pair --reset` output exposes the pairing code |
| T-66-01f | Stray FSB relays take over port 7225 during the campaign |
| T-66-SPEND-PAUSE | Paid runs continue after a usage cap, auth failure or provider error |
| T-66-07 | Benchmark telemetry pollutes the production `/stats` dashboard. Mitigations: a setup-time host block, the H2 opt-out, and a preflight refusal unless `fsbTelemetryOptOut` is true. |

---

## Wave 0 Requirements

There is no separate Wave 0 plan. Each new test suite is created by the TDD task that needs it, and 66-09 registers all ten in the test chain:

| Suite | Created by |
|-------|------------|
| `tests/bench-export-history.test.mjs` | 66-01 |
| `tests/bench-stats.test.mjs` | 66-02 |
| `tests/bench-outcome.test.mjs` | 66-02 |
| `tests/bench-identity.test.mjs` | 66-02 |
| `tests/bench-tasks.test.mjs` | 66-05 |
| `tests/bench-fixture-server.test.mjs` | 66-05 |
| `tests/bench-claude-stream.test.mjs` | 66-05 |
| `tests/bench-corpus.test.mjs` | 66-07 |
| `tests/bench-report.test.mjs` | 66-08 |
| `tests/bench-drivers.test.mjs` | 66-08 |

- [ ] 66-09 registers all ten in the root `test` chain and in `REFINEMENT_ROOT_TEST_COMMANDS`, in one commit.
- [ ] 66-02 Task 1 creates the regression sweep `scripts/bench/sweep-tests.mjs` and its start-commit baseline `66-02-SWEEP-BASELINE.json`. 66-03, 66-04 and 66-06 run the sweep on every file they edit.
- [ ] New fixtures, all under `tests/fixtures/bench/`:

  | Fixture | Plan |
  |---------|------|
  | `claude-stream-usage-cap.jsonl` | 66-05 |
  | `claude-error-text-cases.json` | 66-05 |
  | `run-task-provider-error.json` | 66-08 |
  | `infra-classification-cases.json` | 66-08 |
- [ ] A synthetic Claude stream-json fixture with a realistic `result` event goes under `tests/fixtures/bench/`, not `tests/fixtures/agent-streams/`.
- [ ] An xAI chat-completions response fixture with `usage.cost_in_usd_ticks` and `completion_tokens_details.reasoning_tokens` (66-04).
- [ ] 66-02 Task 1 installs dependencies and records the start-commit `npm test` baseline before any extension edit.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Export the 40 recorded MCP sessions (2026-09-16..21) before they are pruned | MEAS-03 (D-20) | They exist only in the Web Store build's IndexedDB in Chrome Profile 2 | 66-01 Task 2 (H1): run `scripts/bench/history-export-snippet.js` in the Web Store control panel's DevTools console and save the output file |
| Bench profile: load the unpacked extension, free the hub, set xAI `grok-4.3`, choose the Claude model | MEAS-03 | Loading an unpacked extension and entering a key can't be automated | 66-10 Task 2 (H2 + H3) |
| Approve the paid campaign | MEAS-03 | It spends money and uses Claude usage windows | 66-11 Task 1 (H4) |
| Restore the everyday setup | — | Pairing is global and sticky | 66-11 Task 3 (H5) |
| Per-call timing visible to an operator in a live session | MEAS-01 | End-to-end check against the real extension | 66-10 Task 3: call `get_session_detail` (JSON and `format:'text'`) on a bench session |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
