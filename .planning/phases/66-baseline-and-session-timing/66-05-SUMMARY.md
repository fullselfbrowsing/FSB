---
phase: 66-baseline-and-session-timing
plan: 05
subsystem: testing
tags: [benchmark, task-schema, fixture-server, evidence, ndjson, claude-code, cursor-agent, argv-parity, node-test]

# Dependency graph
requires:
  - phase: 66-baseline-and-session-timing (plan 02)
    provides: "scripts/bench/lib/outcome.mjs (stripRunPrefix, evaluateOutcome) and identity.mjs (canonicalJson, sha256Hex); bench test conventions"
provides:
  - "scripts/bench/lib/tasks.mjs: exact-key task schema (validateTask), loadTasks, fixtureSha256, corpusLock, renderInstruction, BENCH_TASKS_ROOT/BENCH_FIXTURES_ROOT"
  - "scripts/bench/fixture-server.mjs: startFixtureServer (127.0.0.1 only, per-run request log, secret-gated evidence endpoint) plus a direct-run CLI"
  - "scripts/bench/lib/host-stream.mjs: NDJSON accumulator, Claude/Cursor stream summaries with honest labels, buildClaudeArgv (claude-profile.ts parity plus --model), buildCursorArgv, FSB agent policy reader/serializer"
  - "A sample task set (1 core, 1 live) and a self-contained sample page under tests/fixtures/bench/tasks-sample/, for these tests and the 66-08 dry run"
  - "Synthetic Claude result, usage-cap and Cursor stream fixtures, and an error-text classification table, under tests/fixtures/bench/"
affects: [66-07, 66-08, 66-09, 66-10, 66-11, benchmark corpus, benchmark runner, live baseline campaign]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exact-key validation that collects every error, with one specific message per broken rule and no cascades"
    - "Two-step containment for any fixture path: lexical startsWith(root + sep), then realpath against the real root"
    - "Byte-level NDJSON splitting on the LF byte, so a UTF-8 character split across chunks survives"
    - "Source-text parity tests that tokenize claude-profile.ts instead of importing mcp/build"
    - "Safety refusals that can bind a port are tested through a pure options resolver, never through listen"

key-files:
  created:
    - scripts/bench/lib/tasks.mjs
    - scripts/bench/fixture-server.mjs
    - scripts/bench/lib/host-stream.mjs
    - tests/bench-tasks.test.mjs
    - tests/bench-fixture-server.test.mjs
    - tests/bench-claude-stream.test.mjs
    - tests/fixtures/bench/tasks-sample/tasks/core/core-sample-save.json
    - tests/fixtures/bench/tasks-sample/tasks/live/live-sample-read.json
    - tests/fixtures/bench/tasks-sample/fixtures/sample/index.html
    - tests/fixtures/bench/claude-stream-result.jsonl
    - tests/fixtures/bench/cursor-stream-result.jsonl
    - tests/fixtures/bench/claude-stream-usage-cap.jsonl
    - tests/fixtures/bench/claude-error-text-cases.json
  modified: []

key-decisions:
  - "Fixture paths (startPath and fixtureFiles) must be plain segments of letters, digits, '.', '_' or '-', which also rules out '%2e%2e', backslashes and whitespace"
  - "The fixture server refuses any Host header other than 127.0.0.1:<port> or localhost:<port> (DNS rebinding) and any unknown option, including a host"
  - "The evidence secret is compared as equal-length SHA-256 digests with timingSafeEqual, and is non-enumerable on the server handle"
  - "A structured api_error_status is classified as 'status <code>', so 429 is rate_limit and 401/403 is auth; a refused rate limit turns an 'other' error into usage_limit"
  - "A model value may not start with '-', and agentsJson must be exactly the serializeFsbAgents output"
  - "Loaded tasks are deep-frozen so a task cannot drift from its recorded fixtureSha256"
  - "TDD tasks were committed as RED test plus GREEN feat pairs (as in 66-01 and 66-02); the GREEN commits carry the plan's messages"

patterns-established:
  - "Plan 66-07 writes scripts/bench/tasks/{core,live}/<id>.json and scripts/bench/fixtures/** against validateTask; loadTasks reports every bad file in one Error"
  - "Plan 66-08 mints one token per run with newRunToken(), reads evidence in process with evidence(token), then clear(token)"
  - "Plan 66-08 records identity from corpusLock(tasks, root) and summary.init.toolLoading/toolSearchEnv/model, and pauses on errorKind usage_limit/rate_limit (agent_cap) or auth (agent_auth)"

requirements-completed: [MEAS-03]

# Metrics
duration: 43min
completed: 2026-09-30
---

# Phase 66 Plan 05: Benchmark Task Schema, Fixture Server and Host-Stream Parsers Summary

**Exact-key task schema with fixture hashing, a loopback-only fixture server whose evidence endpoint answers only to a runner-held secret, and Claude Code and Cursor stream summaries with honest cost labels and an argv proven identical to the pinned v0.9.91 task-mode profile.**

This plan delivers only part of MEAS-03: the pure core the corpus (66-07) and the runner (66-08) build on. The corpus, runner, live smoke and baseline land in later plans. REQUIREMENTS.md, STATE.md and ROADMAP.md were not touched; the orchestrator owns them.

## Performance

- **Duration:** 43 min
- **Started:** 2026-09-30T07:32:44Z
- **Completed:** 2026-09-30T08:15:34Z
- **Tasks:** 3/3
- **Files created:** 13 (exactly the plan's `files_modified`; no existing tracked file changed)

## Accomplishments

- **Task schema (`tasks.mjs`):**
  - `validateTask` checks the exact core and live key sets and every rule in the contract, and collects every error. Each broken rule has one specific message, and dependent checks are skipped so one mistake never cascades into several.
  - With a `fixturesRoot`, each fixture file must resolve inside the root both lexically and after symlinks, and must be a regular file.
  - `loadTasks` reads `<tasksRoot>/<set>/*.json`, also checks the `<id>.json` file name and the directory's set, and throws one Error listing every bad file. It returns tasks sorted by id and deep-frozen.
  - `fixtureSha256` is SHA-256 over `canonicalJson({task, files:[{path, sha256}]})`, with files sorted by path. It depends only on bytes and relative paths, so an identical copy elsewhere hashes the same. A live task hashes its canonical JSON alone.
  - `corpusLock` gives `[{id, version, fixtureSha256}]` sorted by id. `renderInstruction` uses split and join, so `$&`-style patterns in a URL stay literal.
- **Sample set:** `core-sample-save` (click-heavy: type `alpha`, press Save) and `live-sample-read` (public Jira HADOOP-1).
  - The sample page is self-contained and posts to `../../api/sample/save`, which resolves to `/r/<token>/api/sample/save`.
  - Evidence shaped like that page passes the sample task through the real `evaluateOutcome`.
- **Fixture server (`fixture-server.mjs`):** implements the contract exactly:
  - It binds `127.0.0.1` only, logs requests per `/r/<token>/` run, parses JSON, form and text bodies, answers an oversized body with 413, keeps the first `maxRequestsPerRun` entries and counts the rest as `dropped`, and sends `cache-control: no-store` on every response.
  - `evidence(token)` returns a deep copy.
  - The HTTP evidence endpoint returns 403 without the secret, with a wrong secret of the same length, and with a shorter or longer one.
  - The CLI prints `fixture server on http://127.0.0.1:<port> (evidence secret held in memory)` and exits 0 on SIGTERM. The test checks that no 64-hex string is ever printed.
- **Host streams (`host-stream.mjs`):**
  - `buildClaudeArgv` equals the claude-profile.ts task-mode array element for element, followed by `--model <model>`. The parity test tokenizes the TS source and maps its four identifier elements (the binary prefix spread, the MCP config path, the serialized agents and the denied-tools join). An unmapped element fails the test.
  - The denied tools, the agent key set, the serialization key order and the 24/200/40 value bounds are also read from the TS source.
  - The Claude summary reports the tool-loading mode, durations, turns, usage, per-model usage, the cost with its label, FSB tool counts from complete assistant messages only (deduplicated by tool_use id), `rateLimit {events, limited, statuses}` and `errorKind`.
  - The Cursor summary reports durations only, with `tokens: null`, `costUsd: null` and `label: 'unavailable (host does not report)'`.
  - Six sentinels (result text, assistant text, tool input, tool output, a partial delta, and the non-ASCII `µ`) never appear in a summary.

## Interface notes for plans 66-07 and 66-08

- **Summary field locations:**
  - Claude cost figures live under `result`: `result.durationMs`, `result.durationApiMs`, `result.numTurns`, `result.usage {input, output, cacheRead, cacheCreation}`, `result.modelUsage[]`, `result.totalCostUsd`, `result.costLabel` and `result.costBasis`.
  - Top-level Claude fields are `claimedComplete` (result `success` and not an error), `errorKind` and `rateLimit`.
  - Cursor puts `tokens`, `costUsd` and `label` at the top level and durations under `result`.
- **Unmeasured values:** they are `null`, never 0. When no cost number exists, `costLabel` is `unavailable (host does not report)`.
- **NDJSON output:** `splitNdjson(text)` returns `{events, parseErrors, oversizeLines}`. The accumulator's `end()` returns `{events, parseErrors, oversizeLines}` as counts.
- **Additive exports** (beyond the plan's lists):
  - `resolveFixtureServerOptions` (pure; used to test the 7225 refusal without binding)
  - `runTokens()` on the server handle
  - `TASK_SETS`, `CLAUDE_DENIED_TOOLS`, `COST_LABEL_CLIENT_ESTIMATE`, `CLAUDE_ERROR_KINDS` and `NDJSON_MAX_LINE_BYTES`
- **Server behaviors beyond the written contract:**
  - A POST to a fixture page is logged and serves the page, so a native form can post to a result page. Other non-GET methods on pages get 405.
  - A repeated form key becomes an array. A repeated query key keeps its first value, matching `normalizeFinalUrl`.
  - A log entry is added once its body has been read, and `t` is the arrival time.
- **CLI root:** `--root DIR` exists because the default `scripts/bench/fixtures` does not exist until plan 66-07.

## Task Commits

1. **Task 1: Task schema validator, loader, fixture hashing and sample task set**
   - `6bc03933` (test, RED)
   - `b427e7af` (feat, GREEN): `feat(66-05): add benchmark task schema, loader and fixture hashing`
2. **Task 2: Loopback fixture server with per-run request log and a secret-gated evidence endpoint**
   - `359f8c09` (test, RED)
   - `bd4dd117` (feat, GREEN): `feat(66-05): add loopback fixture server with per-run evidence log`
3. **Task 3: Claude Code and Cursor stream parsers, argv builders and agent serialization**
   - `55bd2238` (test, RED)
   - `ee086201` (feat, GREEN): `feat(66-05): add Claude Code and Cursor host-stream parsers with argv parity`

**Plan metadata:** the `docs(66-05)` commit that adds this SUMMARY.

## Files Created/Modified

- `scripts/bench/lib/tasks.mjs`: task schema, loader, fixture hashing, corpus lock and instruction rendering.
- `scripts/bench/fixture-server.mjs`: loopback fixture and evidence server, plus its CLI.
- `scripts/bench/lib/host-stream.mjs`: NDJSON parsing, Claude and Cursor summaries, argv builders and the FSB agent policy.
- `tests/bench-tasks.test.mjs`: 76 node:test cases.
- `tests/bench-fixture-server.test.mjs`: 29 cases.
- `tests/bench-claude-stream.test.mjs`: 46 cases.
- `tests/fixtures/bench/tasks-sample/**`: the sample core task, live task and page.
- `tests/fixtures/bench/{claude-stream-result,cursor-stream-result,claude-stream-usage-cap}.jsonl` and `claude-error-text-cases.json`: synthetic fixtures. Each opens with a `_fixture` line (or key) that says so.

All three test files are unregistered; plan 66-09 adds them to the chain.

## Decisions Made

- **Paths:** `startPath` and fixture paths use plain segments only. This makes the containment rule easy to state and test, and it cannot reject any name a fixture author would reasonably use.
- **Evidence secret:** it is compared as SHA-256 digests with `timingSafeEqual`. The buffers always have equal length, so timing does not reveal the guess's length, and a length mismatch still fails.
- **Port 7225 test:** the refusal is tested only through the pure resolver. The hub listens on `127.0.0.1:7225`. A refusal bug in a test that calls `listen` could otherwise try to bind the user's hub port.
- **Classification input:** error text is read from `result.result`, `result.error` and `result.errors[]`, bounded to 16 KB, and dropped after classification.
- **Tool names:** names are counted only if they match `^[A-Za-z0-9_.:-]{1,64}$`; anything else is counted as `[unrecognized]`. At most 64 distinct names are kept.
- **Rate-limit statuses:** at most 5 distinct statuses are kept, 40 characters each. Reset times, messages and utilization are never copied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Symlink containment in addition to the lexical check**
- **Found during:** Tasks 1 and 2
- **Issue:** A lexical `startsWith(root + sep)` check passes a symlink inside the root that points outside it.
- **Fix:**
  - `validateTask` and `fixtureSha256` realpath each fixture and re-check it against the real root.
  - The server does the same before reading a file.
- **Files modified:** `scripts/bench/lib/tasks.mjs`, `scripts/bench/fixture-server.mjs`, and both tests
- **Verification:** a symlink-escape case is refused in both suites. A mutation that removes the realpath check fails both suites.
- **Committed in:** `6bc03933`/`b427e7af` and `359f8c09`/`bd4dd117`

**2. [Rule 2 - Security] Host header allowlist and strict options on the fixture server**
- **Found during:** Task 2
- **Issue:** A loopback server that accepts any Host header can be reached through DNS rebinding. An unknown `host` option would be silently ignored.
- **Fix:**
  - Any Host other than `127.0.0.1:<port>` or `localhost:<port>` gets 403 and is not logged.
  - Unknown option keys are refused, and port 7225 is refused.
  - The secret is non-enumerable on the handle, so it never appears in `JSON.stringify` or `Object.keys`.
- **Files modified:** `scripts/bench/fixture-server.mjs`, `tests/bench-fixture-server.test.mjs`
- **Verification:** a foreign-Host case returns 403 with an empty log. A mutation that removes the Host check fails the suite.
- **Committed in:** `359f8c09`/`bd4dd117`

**3. [Rule 2 - Security] Tighter path and URL rules in the task schema**
- **Found during:** Task 1
- **Issue:** The written rules (`..`, `//`, `?`, `#`) still let `%2e%2e`, backslashes, whitespace and `.` segments through. They also allowed a repeated fixture path, and a live `startUrl` carrying credentials.
- **Fix:** each case now has its own specific error message:
  - a plain-segment rule for `startPath` and `fixtureFiles`
  - a repeated-path error
  - an explicit `https://` prefix check
  - a credentials check on `startUrl`
- **Files modified:** `scripts/bench/lib/tasks.mjs`, `tests/bench-tasks.test.mjs`
- **Verification:** 41 core and 10 live error cases pin exact error arrays.
- **Committed in:** `6bc03933`/`b427e7af`

**4. [Rule 1 - Bug] A structured `api_error_status` 429 or 401 would have been an `api_error`**
- **Found during:** Task 3
- **Issue:** Read literally, rule 4 sends every `api_error_status` to `api_error`. A structured 429 or 401 would then be counted as a failed run instead of pausing the campaign (agent_cap or agent_auth), which is what W4 exists to prevent.
- **Fix:**
  - The code is classified as the in-memory text `status <code>`, so it goes through the same prefixed rules: 429 gives rate_limit, 401/403 give auth, and 5xx or any other code gives api_error.
  - When an error result is otherwise `other` and the stream shows a refused rate limit, errorKind becomes `usage_limit`.
  - The text rules and their order are unchanged.
- **Files modified:** `scripts/bench/lib/host-stream.mjs`, `tests/bench-claude-stream.test.mjs`
- **Verification:**
  - a structured-status case covers 429, '401', 403, 529, 400, null and undefined, and usage-limit text beats a 429;
  - all 18 error-text table cases pass.
- **Committed in:** `55bd2238`/`ee086201`

**5. [Rule 2 - Security] Argv hardening beyond the plan's model regex**
- **Found during:** Task 3
- **Issue:** `/^[A-Za-z0-9._:\[\]-]{1,80}$/` accepts `--yolo` or `-p` as a model value. `agentsJson` was not checked at all.
- **Fix:**
  - A model may not start with `-`.
  - `agentsJson` must equal the `serializeFsbAgents` output byte for byte. That rules out widened tools or permission mode, extra agents and pretty-printing.
  - A post-condition refuses any argv element equal to a forbidden flag, or starting with that flag followed by `=`.
- **Files modified:** `scripts/bench/lib/host-stream.mjs`, `tests/bench-claude-stream.test.mjs`
- **Verification:**
  - the model, agentsJson and forbidden-flag cases pass;
  - `FORBIDDEN_HOST_FLAGS` is checked to cover every flag in `scripts/verify-agent-provider-flags.mjs`.
- **Committed in:** `55bd2238`/`ee086201`

**6. [Rule 2 - Missing critical functionality] Bounded NDJSON lines**
- **Found during:** Task 3
- **Issue:** An unbounded partial line from a runaway host process could exhaust memory.
- **Fix:**
  - `maxLineBytes` (default 4 MiB) drops an over-long line and counts it in `parseErrors` and `oversizeLines`.
  - Non-object JSON lines count as parse errors, and a leading BOM is stripped.
- **Files modified:** `scripts/bench/lib/host-stream.mjs`, `tests/bench-claude-stream.test.mjs`
- **Verification:** the over-long-line and invalid-line cases pass.
- **Committed in:** `55bd2238`/`ee086201`

### Execution notes (not rule deviations)

- **TDD commit split:** every task is `tdd="true"`, so each has a RED `test(66-05)` commit before its GREEN `feat(66-05)` commit. The GREEN commits use the plan's messages verbatim.
- **Temp dirs:** the plan says `fs.mkdtempSync(os.tmpdir())`. Taken literally, that creates a sibling of the temp directory. The tests use `fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-bench-...-'))` and remove the directory in `finally`.
- **Raw requests:** the traversal cases use `node:http` with raw request targets. The global `fetch` normalizes `..` and `%2e%2e` before sending. Every other case uses the global `fetch`, as the plan says.
- **Extra table cases:** the error-text table has 18 cases, 8 more than the plan lists: `status: 429`, `overloaded`, `out of extra usage`, `HTTP 403`, `not logged in`, bare `429` and bare `401` negatives, and a non-error mentioning a usage limit.
- **Branch checks:** the executor's `worktree-agent-*` branch allow-list was skipped, because the orchestrator directed commits on `Jev`. The cwd-drift sentinel and the protected-branch deny-list ran before every commit.

---

**Total deviations:** 6 auto-fixed (1 Rule 1, 5 Rule 2).
**Impact on plan:** each change tightens a security or evidence boundary the plan's threat register names (T-66-02, T-66-04, T-66-06, T-66-ARGV), or keeps W4's pause behavior correct. The footprint is exactly the plan's 13 files, and none of the changes adds scope.

## Issues Encountered

- **A typo in a verification loop:** a stray `$=0;` made zsh run itself as a command. That child shell waited on stdin until the 600 s tool timeout, and none of the intended suites ran. Both processes were mine (pids 98374 and 98376) and were stopped. No user process was touched, and the hub (pid 42278 on `127.0.0.1:7225`) was never disturbed. The suites were then re-run correctly (below).
- **A mutation probe that survived:** routing `stream_event` into `countToolUses` survived, because partial blocks sit at `event.event.content_block`, not `message.content`, so that mutation changes nothing. A real mutation that counts partial `content_block_start` tool_use blocks is caught.
- **No Node 20 run:** no Node 20 binary exists on this machine, and none was downloaded. A static scan of all six new files found no Node 22+ API (`Object.groupBy`, `Promise.withResolvers`, `crypto.hash`, `fs.globSync`, `process.getBuiltinModule`, global `WebSocket`, `import.meta.dirname`, `toSorted`, Set methods, `fs.cpSync`, and others). Running the bench tests under Node 20 remains part of the phase gate.

## Verification Evidence

- **New suites:** `node --test tests/bench-tasks.test.mjs tests/bench-fixture-server.test.mjs tests/bench-claude-stream.test.mjs` passes 151/151 (76 + 29 + 46).
- **66-02 suites:** `node --test tests/bench-stats.test.mjs tests/bench-outcome.test.mjs tests/bench-identity.test.mjs` still passes 50/50.
- **Drift smoke:** `node tests/mcp-agent-drift-smoke.test.js` PASS. The fixture roster is still `claude-code, grok-build`, and `tests/fixtures/agent-streams` is unchanged.
- **Acceptance checks, all as specified:**
  - `loadTasks` on the sample set returns exactly `core-sample-save`.
  - `grep -c "0.0.0.0"` prints 0.
  - `grep -c "'127.0.0.1'"` prints 1.
  - `grep -c timingSafeEqual` prints 3.
  - The console-secret regex check exits 0.
  - `host-stream.mjs` contains `'--model'`.
  - `git status --porcelain -- mcp/` is empty.
- **Mutation probes:** each mutation was run on the committed modules and then restored byte for byte, and each made its suite fail:
  - tasks: realpath containment removed, `String.replace` instead of split/join, the startPath include check cascading;
  - server: both containment checks removed, realpath containment removed, Host check removed, secret check removed;
  - host-stream: the partial-messages flag dropped, result text copied into the summary, tool_use id deduplication removed, an unprefixed 401 rule, partial tool_use blocks counted.
- **Chain suites that look at git state:** `node tests/phase60-full-tests-harness.test.js`, `phase64-...`, `phase65-...` and `node tests/mcp-native-host-packaging.test.js --section workflow-and-pack` all exit 0. The tree stayed clean afterwards.
- **Leftovers:** no fixture-server process remained after the CLI tests, and no tracked file was rewritten by any run.

## Known Stubs

None. The three modules are complete, and the sample set is intentionally one core and one live task (the 66-08 dry run relies on exactly that). The real corpus is plan 66-07's.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- **Plan 66-07:** writes the corpus under `scripts/bench/tasks/{core,live}/` and `scripts/bench/fixtures/`, and runs `loadTasks({set:'core'})` and `loadTasks({set:'live'})` to validate it. Fixture pages must use relative URLs only and create server-visible effects: fetch or form posts under `../../api/...`, or a POST to a result page.
- **Plan 66-08:**
  - drives the arms with `buildClaudeArgv` (explicit `--claude-model`) and `buildCursorArgv`, sending the task on stdin to Claude and as the final positional argument to Cursor;
  - parses stdout with `createNdjsonAccumulator`, summarizes with `summarizeClaudeStream(events, {toolSearchEnv})` or `summarizeCursorStream`, and collects evidence in process from `startFixtureServer`;
  - pauses on `errorKind` `usage_limit` or `rate_limit` (agent_cap) and on `auth` (agent_auth).
- **Plan 66-09:** registers `tests/bench-{tasks,fixture-server,claude-stream}.test.mjs` in the `test` chain and in `REFINEMENT_ROOT_TEST_COMMANDS`.
- **Plan 66-10 smoke:** confirms the real `rate_limit_event` status strings and whether a result carries `api_error_status` or `costBasis`. The shapes used here are passthrough and labelled synthetic.
- **Blockers:** none.

## Self-Check: PASSED

- All 13 created files and this SUMMARY were found on disk.
- All 6 task commits were found: `6bc03933`, `b427e7af`, `359f8c09`, `bd4dd117`, `55bd2238`, `ee086201`.
- No commit in `0ec2abe7..HEAD` has a Co-Authored-By line.
- `git status --porcelain -- mcp/ tests/fixtures/agent-streams/ extension/ package.json .planning/STATE.md .planning/ROADMAP.md` is empty.
