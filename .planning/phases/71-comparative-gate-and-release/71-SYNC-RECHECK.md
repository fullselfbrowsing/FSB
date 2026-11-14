# Phase 71 Sync Re-check (71-01 Task 1)

**Recorded:** 2026-10-18, before any Phase 71 source edit (D-02, D-09).
**$P71_START:** `3493c34ad99efec9df7d340811a58e019c0f55d1` (the `head` field of `71-SWEEP-BASELINE.json`).
**Rule:** the real code wins. Each quoted interface is compared with the executed code and marked MATCH, RENAMED, CHANGED or MISSING. Drift changes the later Phase 71 plans, never an upstream test.

Set `$P71_START` in a later command with:

```
P71_START=$(node -p "require('./.planning/phases/71-comparative-gate-and-release/71-SWEEP-BASELINE.json').head")
```

## Preconditions

- **SUMMARY coverage.** Every PLAN of the upstream phases has its SUMMARY: 66.1 (8/8), 67 (13/13), 68 (12/12), 69 (8/8), 70 (8/8). No upstream phase has an unexecuted PLAN.
- **Clean tree.** `git status --porcelain -- extension mcp scripts tests package.json showcase skills README.md CHANGELOG.md` printed nothing.
- **Pin.** `git cat-file -e 8a058bdf0d17c1e3e79ec3104cc1996326b4c402^{commit}` succeeded.
- **Sibling sessions.** ListAgents unavailable (no such tool in this executor). Instead, `git log -5 --format='%h %ad %s' -- showcase/angular/src/locale` printed:
  ```
  207d3df1 Sat Oct 17 07:16:01 2026 -0500 docs(68-10): disclose opt-in Jev fast mode and its Limited Use terms on the privacy page
  989d94fe Sat Oct 17 07:02:13 2026 -0500 docs(68-10): archive the September 29 privacy policy before the fast-mode update
  367316b8 Wed Oct 14 13:20:35 2026 -0500 Show full support answers when expanded and drop the personal footer credit.
  fe59ed99 Wed Oct 14 13:12:28 2026 -0500 Publish localized marketing metadata that crawlers and search engines can trust.
  13716bd8 Wed Oct 14 12:07:06 2026 -0500 Credit DB-IP for the place data shown on the stats globe.
  ```
  No locale commit is newer than the Phase 68 privacy page, and the locale files have no uncommitted changes.
- **Ports.** 7225 is held by the user's own `npx fsb-mcp` hub (pid 7109, left running); 7226 is free. The sweep baseline records `port7225Held: true`.

## Sweep baseline

`node scripts/bench/sweep-tests.mjs --files scripts/bench/run-bench.mjs scripts/bench/fixture-server.mjs scripts/bench/lib/mcp-client.mjs scripts/sync-product-version.mjs extension/ui/onboarding.js --out .planning/phases/71-comparative-gate-and-release/71-SWEEP-BASELINE.json`

- 23 referencing tests selected, 23 passed. `failures: []`. Exit 0.
- Node v24 (the local default), per-test limit 180000 ms.
- The three crawler files were unchanged afterwards (`git status --short showcase/angular/public` printed nothing).

## Interface table

| Item | Quoted interface (plan:line) | Real code (file:line) | Status |
|------|------------------------------|-----------------------|--------|
| S1 settings tool | 66.1 `settings` tool; args `key`, `value` with booleans and numbers coerced to strings (toWireString); WRITE_FIELDS `['key','value','previous','changed','coupled']`; READ_ONE_FIELDS `['key','value','type','writable','range','values']`; SETTING_UNAVAILABLE "did not confirm" after a sent write; SETTING_UNSUPPORTED from older extensions (71-01-PLAN.md:85; 66.1-03-PLAN.md:186-194) | mcp/src/tools/settings.ts: name `'settings'` :164; args :166-170 (`value: z.preprocess(toWireString, z.string())`); toWireString :48-52 (boolean and finite number to String, everything else unchanged); READ_ONE_FIELDS :30 (`type` present); WRITE_FIELDS :33; `writeSent` set only when a value is sent :208, and a bridge throw after it gives `unavailable('unconfirmed')` = SETTING_UNAVAILABLE "The FSB extension did not confirm the settings change" :70-72, :222; SETTING_UNSUPPORTED on `Unknown MCP message type: mcp:(get-settings\|set-setting)` :15, :90-102 | MATCH |
| S2 fsbJevFastModeEnabled | 68-01: `FsbSettingsSchema.get('fsbJevFastModeEnabled')` is `{key, type:'boolean', cls:'writable', default:false}`, stored as a real boolean (68-01-PLAN.md:29,179) | extension/config/config.js:436 entry; `FsbSettingsSchema.get('fsbJevFastModeEnabled')` returns exactly `{"key":"fsbJevFastModeEnabled","type":"boolean","cls":"writable","default":false}`. parseValue maps `'true'`/`'false'` to `true`/`false` :767-770; planWrite writes `patch[entry.key] = value` (the boolean) :906-920. So `settings {key:'fsbJevFastModeEnabled', value:'true'}` stores a real `true`, and the strict read in scripts/bench/lib/cdp.mjs:377-395 (`data[key] === true`) works | MATCH |
| S3 fsbJevCaptureArmed | 68-08: internal key `fsbJevCaptureArmed`, not a settings key, written only by `export-capture.mjs --arm on\|off` over CDP (68-08-PLAN.md:23,85,147) | Exact key `fsbJevCaptureArmed`. `FsbSettingsSchema.get('fsbJevCaptureArmed')` is null and `keys()` does not hold it. Written only by scripts/bench/shadow/export-capture.mjs:85-86 (`set({fsbJevCaptureArmed:true})` / `remove('fsbJevCaptureArmed')`), read by extension/background.js:4130-4135 (strict `=== true`) | MATCH |
| S4 jevMeasurement | 68-09: `{v:1, attempts:[{command, iteration, decisionSource, jevCalled, servedModel, instrumentVersion, calibrationStatus, latencyMs, toolMs, usage:{inputTokens, source}, cost:{usd, source}, fallback, outcome, stepOutcome, escalationReason, op}], commands:[{command, fastSteps, jevCalls, jevMs, usd:{provider, estimate}, escalations:{<reason>:n}}]}`; attempts capped at 100; projected by `projectJevMeasurement` (71-01-PLAN.md:88; 71-02-PLAN.md:88) | **Attempt keys as implemented** (projection extension/ws/mcp-tool-dispatcher.js:2727-2753, producer extension/ai/jev-fast-path.js:986-1024): `iteration, command, decisionSource, jevCalled, servedModel, instrumentVersion, calibrationStatus, latencyMs, usage:{inputTokens, source}, cost:{usd, source}, fallback, outcome, escalationReason, op, stepOutcome`. **There is no `toolMs`** (68-09-PLAN.md:63 never had it; the 71-01 and 71-02 quotes added it). **Command keys** (:2755-2772): `command, fastSteps, jevCalls, jevMs, usd:{provider, estimate}, escalations`. **Cap:** `constants.MEASUREMENT_ATTEMPTS_MAX = 100` (jev-fast-path.js:61), applied to attempts :968-977 and to commands :1047-1049; the projection keeps the last 100 of each (:2774-2783). Projection, persistence order and existence rule: see the S4 notes below | CHANGED |
| S5 acted attempt and calibration | 68-04: acted attempt = `fallback === null && op !== null && stepOutcome !== null`; CALIBRATION_STATUSES `['calibrated','uncalibrated','snapshot_changed']` (68-04-PLAN.md:150; 67-01-PLAN.md:87) | The three field names exist on every attempt (S4 list). `fallback` is null unless a decide or local build failed (jev-fast-path.js:1001, :1016-1021); `op` and `stepOutcome` are closed codes or null (:1004-1005). `require('./extension/ai/jev-state.js').CONTRACT.CALIBRATION_STATUSES` = `["calibrated","uncalibrated","snapshot_changed"]` | MATCH |
| S6 FALLBACK_REASONS and scrubber rule 7 | 67-01: 19 ordered FALLBACK_REASONS; scrubber rule 7 highEntropy (32+ chars of `[A-Za-z0-9+/=_-]` with upper, lower and digit, and a 16+ segment mixing letters and digits after splitting on `[-_/+=]`) (67-01-PLAN.md:82,151) | `CONTRACT.FALLBACK_REASONS` has 19 names (list under Derived values); the extension CONTRACT deep-equals showcase/server/src/jev/contract.js CONTRACT (checked with `assert.deepEqual` on 2026-10-18). Rule 7 as implemented: extension/ai/jev-state.js:207-214 (`replaceHighEntropy`) and :248-252 (`/[A-Za-z0-9+/=_-]{32,}/g`), exactly the quoted rule. `matchesSecret(s)` = `scrubText(s) !== s` (:287-289). `buildRequest` returns `sensitive_goal` when `matchesSecret(input.goal)` (:780), before the URL is parsed | MATCH |
| S7 terminal reason | Pitfall 10: confirm get_session_detail exposes `session.outcomeDetails.reason`, or name the real field (71-RESEARCH.md Pitfall 10) | applyTerminalOutcome sets `sess.outcomeDetails.reason` (extension/ai/agent-loop.js:1544-1563); finalizeSession saves it (:1662-1666); normalizePersistedOutcomeFields persists `outcomeDetails.reason` with defaults `blocked` (partial), `error` (failure), `stopped` (stopped), `completed` (extension/utils/automation-logger.js:95-171). get_session_detail returns it through `sanitizeSessionMetadata` (generic sanitizer, depth 4; `reason` is not a sensitive key) (extension/ws/mcp-tool-dispatcher.js:2300-2306, :2329-2334). The field is `session.outcomeDetails.reason` for autopilot and run_task sessions. END_LABELS under Derived values | MATCH |
| S8 Phase 70 (D-09 items 1-5) | 70 D-04, D-17, D-18, D-21, D-22; 70-05 FAST_MODE_* lists; 70-07 bench mirror and `runTask.fastMode`; D-09 item 3 expects typed words in `status` (71-CONTEXT.md D-09; 70-CONTEXT.md; 70-05-PLAN.md:75-79; 70-07-PLAN.md:124-134) | Items 1, 2, 4, 5 hold; item 3 differs as expected (70-VALIDATION F11). Details in the S8 notes below | CHANGED |
| S9 Phase 69 | `EXPECT_TOOL_NAMES_VERBATIM` 29 names; `EXPECT_REQUIRED` true after 69-06; four suites registered once each (69-06-PLAN.md:151) | tests/helpers/mcp-in-process.mjs:22 has 29 names; `listCurrentTools` :71. tests/mcp-tools-list-shape-freeze.test.js:30 `const EXPECT_REQUIRED = true;`. scripts.test registers each exactly once: `node tests/mcp-settings-tool-contract.test.js` (index 307), `node tests/mcp-tools-list-baseline.test.js` (308), `node tests/mcp-tools-list-shape-freeze.test.js` (309), `node tests/mcp-expect-wire.test.js` (314) | MATCH |
| S10 test chain | The bench `node --test tests/bench-export-history.test.mjs ...` command in scripts.test and the identical string in REFINEMENT_ROOT_TEST_COMMANDS (tests/delegation-phase-contract.test.js:129-170) | scripts.test has 346 commands; the bench command is index 303 and appears once; the identical string is at tests/delegation-phase-contract.test.js:160 inside `REFINEMENT_ROOT_TEST_COMMANDS` (:129). Note: Phase 70's `node --test tests/bench-fast-mode-record.test.mjs` is a separate command (index 345; delegation-phase-contract.test.js:202), not part of the bench command | MATCH |
| S11 docs inventory | D-27 sites plus Pitfall 11 (about :102, home :68, agents .ts :294, support .ts :41 and :61, llms sources :3/:32/:7, "7 xlf catalogs: 7 hits each, 10 in German") (71-RESEARCH.md Pitfall 11) | Full inventory under Derived values. Pitfall 11 omits extension/ui/onboarding.js:882, the agents hero sentence (agents-page.component.html:15, unit `agents.hero.subtitle`), home :276 and :327, agents .html :92 and :122, llms-full.source.md:43 and the generated public/llms*.txt. Each of the 7 xlf catalogs holds **11** tool-count units (11 occurrences in the sources; 11 in the targets of each of the 6 locale files), not "7 hits each, 10 in German" | CHANGED |

### S4 notes

- **Projection.** `projectJevMeasurement` (extension/ws/mcp-tool-dispatcher.js:2774) is called from `sanitizeSessionDetail` (:2367-2369) whenever the stored session has a plain-object `jevMeasurement`, and `delete sanitized.jevMeasurement` (:2363) removes the generic copy first. The call does not depend on `session.mode` or `fastMode.source`. So it projects for autopilot sessions and for `source:'mcp'` run_task sessions alike.
- **Round-trip suite (68-09).** `node tests/jev-fast-measurement.test.js` (scripts.test index 339). Its section "measurement parity round trip: real producers -> real logger -> real get_session_detail" (:958) and the assertion "the loop's jevMeasurement reaches get_session_detail unchanged" (:1174) send the block through the real projection.
- **Persistence order (Pitfall 9).** Same save. `_saveSessionUnlocked` (extension/utils/automation-logger.js:1023) writes `iterationTiming`, `measurementSummary` and `jevMeasurement` from the same in-memory session object into one record (:1101-1105 update mode; :1112 and :1164-1166 new mode), then makes a single `chrome.storage.local.set(nextStorage)` (:1227). Every `saveSession` call site is a terminal save (agent-loop.js:1487 through finalizeSession :1662-1666, before the completion broadcast that settles run_task; background.js stop, timeout, iteration-cap and error paths). There is no mid-run save that could write `measurementSummary` without the block. So when `measurement.recorded === true` is read (`recorded: !!summary`, dispatcher :2805), `jevMeasurement` is present if any Jev attempt happened. **Exposure rule case (3) stays `'no_block'`**, and no S4 persistence substitution is needed.
- **Existence rule as implemented.** `session.jevMeasurement` is created only by `ensureMeasurement` (jev-fast-path.js:958-966), called by `appendAttempt` (:968-977) and the command-totals writer (:1040-1049). A session with no Jev attempt has no `jevMeasurement` key. `cloneJevMeasurementForPersistence` returns `undefined` for a non-object (automation-logger.js:319-320), so no key is persisted either (68-05-PLAN.md:115, "no attempt -> no session.jevMeasurement key").
- **Zero summary as implemented.** `summarizeFastMode` (jev-fast-path.js:2671-2716) on a session with no `jevMeasurement` returns `{attempts:0, calls:0, fast_steps:0, jev_ms:null, calibration:null, latched:<latch or null>, exhausted:<budget latch or null>, escalations:{}}`. `latched` and `exhausted` read the session and command latches, not `jevMeasurement`, so they can be non-null with 0 attempts (for example `switch_off`). Counts are known values, so 0 is real (70 D-18).

### S8 notes

- **Item 1 (switch read at each start): MATCH.** A run_task start reads `fsbJevFastModeEnabled` from storage when the session is created (extension/background.js:14213-14218, then `fsbFastModeSessionField(storedSettings.fsbJevFastModeEnabled, source)` :14248). For `source:'mcp'` this gives `{enabled:true, stored:true, source:'mcp', budgetProfile:'run_task'}` (:4015-4023). A follow-up command recomputes it (`fsbRecomputeFastModeForFollowUp`, :4158-4176). A change between runs takes effect at the next run_task.
- **Item 2 (jevMeasurement for `source:'mcp'`): MATCH** (S4 notes, Projection).
- **Item 3 (typed words in `status`): CHANGED.** `status` keeps its values. The handleComplete settle (extension/ws/mcp-bridge-client.js:2934-2939) is `status: message.outcome || message.result?.status || (message.partial ? 'partial' : 'completed')`, the same expression as the pin. The typed outcome is the additive `fast_mode` block, appended last only when the session had `fastMode` at start (:2775-2805). Phase 70 code:
  - extension/ai/jev-fast-path.js: `FAST_MODE_OUTCOMES` = `['done','ambiguous','blocked','needs_confirmation']` (:2540); `FAST_MODE_BLOCK_KEYS` = `['outcome','reason','uncertain_unobserved','human_gate','budget_profile','jev']` (:2551); `FAST_MODE_SUMMARY_KEYS` = `['attempts','calls','fast_steps','jev_ms','calibration','latched','exhausted','escalations']` (:2552-2553). All three match the 70-05 lists, so no rename substitution is needed for 71-02.
  - scripts/bench/lib/fast-mode.mjs exports exactly `FAST_MODE_BLOCK_KEYS`, `FAST_MODE_SUMMARY_KEYS`, `FAST_MODE_OUTCOMES` (all `Object.isFrozen`) and `projectFastMode` (:20, :24, :28, :123). `projectFastMode(null)` returns `{outcome:'other', reason:null, uncertain_unobserved:null, human_gate:null, budget_profile:null, jev:null}`; it never throws.
  - runAutopilotArm: `if (json && isPlainObject(json.fast_mode)) runTask.fastMode = projectFastMode(json.fast_mode);` (scripts/bench/run-bench.mjs:580). The raw record copies `runTask` verbatim.
  - The record suite command in scripts.test: `node --test tests/bench-fast-mode-record.test.mjs` (index 345).
  - Classifier rule: `classifyRunTaskOutcome` (jev-fast-path.js:2626-2648) returns `done` only when `terminal === 'success'` **and** a run evidence record exists (else `ambiguous/evidence_unavailable`). `terminalOf` gives `'success'` only for `kind === 'complete'` with `message.outcome === 'success'` (:2580-2586). The same message makes the settle's `status` `message.outcome`, that is **`'success'`**, which is in the S12 success words. So "a typed done implies a success status word" holds in code: a typed `done` always has `status:'success'`.
- **Item 4 (no new tool, no new required argument on run_task): MATCH.** `git diff 8a058bdf -- mcp/src/tools/autopilot.ts` changes only description sources (`mcpToolDescription`, `mcpParamDescription`); run_task's schema is still `{ task: z.string() }`. The only new MCP tool since the pin is 66.1's `settings`.
- **Item 5 (`sensitive_goal` for MCP goals): not depended on (D-07).** Note for 71-01 Task 2: the Phase 70 goal normaliser (`normaliseGoal`, jev-fast-path.js:413-434) strips a leading `Open <url>.` sentence only when the URL path survives the scrubber (`pathSurvivesScrub`). A base64url run token fails that check, so the URL stays in the goal and the goal is `sensitive_goal`. The F5 fix is needed either way.

## Derived values

Later plans copy these verbatim and never re-derive them.

### Exposure rule (S4)

For a v2 row, `jev` comes from (1) `raw.jevMeasurement` when it is a plain object (jev.source 'measurement'); else (2) the non-null `jev` summary of the projected `raw.runTask.fastMode` (jev.source 'summary'; acted = fast_steps > 0, so a summary with 0 attempts is not acted); else (3) on a counted autopilot row (infraError null) with condition 'on', whose switch was written and read back before t0, whose session detail was actually read (its `flags` do not include `session_detail_missing`), and which has no fast_mode block: zero Jev attempts (jev.source 'no_block'; acted false, counts 0); else (4) not recorded (jev.source null, acted null): 'off' rows without a block, rows with no confirmed switch (condition null, host arms, infra rows), 'on' rows whose fast_mode block carries `jev: null`, and 'on' rows with no block whose session detail was never read (flag `session_detail_missing`, for example a timed-out run whose detail fetch also failed; a missing jevMeasurement then proves nothing). Only case (4) is unknown exposure; a run with no Jev attempt is never flagged jev_measurement_missing and never takes the gate's unknownExposure reading.

S4 found the persistence order to be "same save", so case (3) stays `'no_block'` (no substitution). Code facts this rule relies on: `sessionDetailFlags` (scripts/bench/lib/runs.mjs:254-257) flags an autopilot run with no session object `session_detail_missing`; `classifyAutopilot` (:224-238) still counts a timed-out run with no session (only a timed-out run *with* a session that lacks `measurement.recorded` becomes `provider_error`, :232-235); run-bench.mjs builds the flag set at :758 and writes it to the raw record's `flags` at :821; the autopilot detail retry waits for `measurement.recorded === true` (:585).

### Acted attempt (S5)

An acted attempt is one with `fallback === null && op !== null && stepOutcome !== null`.

### CALIBRATION_STATUSES (S5)

`["calibrated","uncalibrated","snapshot_changed"]`

### FALLBACK_REASONS (S6, 19, in contract order)

`["disabled","not_configured","invalid_request","payload_too_large","sensitive_goal","busy","spend_cap_reached","timeout","rate_limited","upstream_overloaded","auth_error","upstream_billing","unavailable_model","upstream_rejected","upstream_error","invalid_response","network_error","aborted","server_error"]`

Source: `require('./extension/ai/jev-state.js').CONTRACT.FALLBACK_REASONS`; deep-equals the server contract.

### END_LABELS (S7, sorted, plus `other`)

`["auth_required","blocked","complete_task","completed","cost_limit_exceeded","credentials_failed","credentials_missing","end_turn","error","fail_task","iteration_limit_exceeded","manual_approval","meta_cognitive_loop_break","safety","service_worker_restart","session_not_found","session_not_running","stopped","stuck_action_repetition","stuck_dom_hash","stuck_no_goal_progress","tab_closed","time_limit_exceeded","user_skipped_login","user_stopped","other"]` (26 labels)

Where each comes from:
- **Defaults:** `completed`, `blocked`, `error`, `stopped` (createTerminalOutcome, agent-loop.js:1525-1529; normalizePersistedOutcomeFields, automation-logger.js:144-153).
- **Literals in createTerminalOutcome calls:** `end_turn` (:2165), `complete_task` (:2521), `fail_task` (:2659), `meta_cognitive_loop_break` (:2973), `error` (:3197, :3210, :3240), `safety`.
- **mapSafetyReasonToConstant** (:1697-1710): `iteration_limit_exceeded`, `cost_limit_exceeded`, `time_limit_exceeded`, `safety`.
- **Stuck reasons** (extension/ai/turn-result.js:53-57): `stuck_action_repetition`, `stuck_no_goal_progress`, `stuck_dom_hash`.
- **partial_task reason enum** (extension/ai/tool-definitions.js:1201-1215; auth reasons agent-loop.js:810-817): `blocked`, `auth_required`, `credentials_missing`, `user_skipped_login`, `credentials_failed`, `manual_approval`.
- **Stop reasons:** `user_stopped` (background.js:14788), `tab_closed` (:5656-5662), `service_worker_restart` (:5273-5279).
- **Guard broadcasts:** `session_not_found`, `session_not_running` (agent-loop.js:1735, :1777). These are broadcast for a missing or idle session and are never persisted. They are kept because Phase 70's `FAST_MODE_REASONS.blocked` (jev-fast-path.js:2545-2548) lists them too.
- Any other value (for example free text that breaks the partial_task enum) maps to `other`.

Cross-check: every Phase 70 `FAST_MODE_REASONS.blocked` and `.done` reason is in this list. `payment_not_approved` and `site_consent_required` are run-evidence human gates (jev-fast-path.js:2541, :2567), not terminal reasons, so they are not END_LABELS.

### S12 success-claim words

- **The run_task `status` expression** in the handleComplete settle is the same at the pin and on the current tree:
  - pin: `git show 8a058bdf0d17c1e3e79ec3104cc1996326b4c402:extension/ws/mcp-bridge-client.js`, :2881-2887, `status: message.outcome || message.result?.status || (message.partial ? 'partial' : 'completed')`;
  - current: extension/ws/mcp-bridge-client.js:2934-2939, the same expression, plus a third settle argument `{ kind: 'complete', message }`.
- `message.outcome` comes from createTerminalOutcome's `['success','partial','stopped','error']` at both builds (pin agent-loop.js:1500-1502 and :1577; current :1518-1520 and :1595). `automationError` goes to handleError, which gives `status:'error'`. A completion message without `outcome` (legacy loop paths) and without `partial` gives `'completed'`.
- **Autopilot success statuses, both builds:** `['completed','success']`. A claimed success is `claimed.status` in this list and `claimed.isError !== true`.
- **Claude driver:** `claimed.completeTask === true` (`status` is always null for host arms).
- **Candidate typed claim (D-09 item-3 substitution):** `fastMode.outcome === 'done'`, which always comes with `status:'success'` (S8 notes, item 3).

### S13 MCPMessageType at the pin and now

Exact command (zsh: write the full sha, never `$P:mcp/...`, because `:m` is read as a modifier):

```
git show 8a058bdf0d17c1e3e79ec3104cc1996326b4c402:mcp/src/types.ts | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=s.replace(/\/\/[^\n]*/g,'').match(/export type MCPMessageType\s*=([\s\S]*?);/);const a=[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);console.log(a.length, JSON.stringify(a))})"
```

Line comments are stripped first because one of them (`'agent:release' // ... handler only; server caller ...`) contains a `;`.

- **Pin (45):** `["mcp:start-automation","mcp:stop-automation","mcp:get-status","mcp:get-task-snapshot","mcp:trigger","mcp:stop-trigger","mcp:get-trigger-status","mcp:list-triggers","mcp:start-visual-session","mcp:end-visual-session","mcp:task-status","mcp:execute-action","mcp:go-back","mcp:get-dom","mcp:get-tabs","mcp:get-site-guides","mcp:get-page-snapshot","mcp:get-memory","mcp:get-config","mcp:read-page","mcp:capture-screenshot","mcp:list-sessions","mcp:get-session","mcp:get-session-replay","mcp:replay-session","mcp:get-logs","mcp:search-memory","mcp:create-agent","mcp:list-agents","mcp:run-agent","mcp:stop-agent","mcp:delete-agent","mcp:toggle-agent","mcp:get-agent-stats","mcp:get-agent-history","mcp:list-credentials","mcp:fill-credential","mcp:list-payments","mcp:use-payment-method","mcp:capabilities-search","mcp:capabilities-invoke","agent:register","agent:release","agent:status","system:client-inventory"]`
- **Current mcp/src/types.ts (47):** the pin list followed by `"mcp:get-settings","mcp:set-setting"`. The current command is the same node script with `cat mcp/src/types.ts |` in place of the `git show`.
- **Difference:** added exactly `mcp:get-settings`, `mcp:set-setting` (appended at the end); none removed; the pin list is an exact prefix of the current list.

### S14 tighten-only and escalation suites (verify at the measured SHA)

Each command is copied exactly as it appears in package.json scripts.test:
- **67 (tighten-only):** `node tests/jev-policy-tighten-only.test.js`
- **68 (escalate once, no duplicated side effect, same permission hook):** `node tests/jev-fast-path.test.js` and `node tests/jev-fast-loop.test.js`
- **70 (run_task fallback parity, "run_task no second dispatch", typed outcome never `done` from a Jev answer):** `node tests/jev-fast-path.test.js`, `node tests/jev-fast-loop.test.js` and `node tests/jev-run-task-outcome.test.js`

### S15 built tools/list length

`npm --prefix mcp run build` (exit 0), then `node --input-type=module -e "const m=await import('./tests/helpers/mcp-in-process.mjs');console.log((await m.listCurrentTools()).length)"` printed **73**. Afterwards `git status --short mcp/build` printed nothing (the six force-tracked files rebuilt byte-identical).

### S16 fixture evidence

`evidence(token)` returns a deep copy of `{requests, dropped}` (scripts/bench/fixture-server.mjs:245-250; an unknown run gives `{requests: [], dropped: 0}`). The default `maxRequestsPerRun` is 2000 (`DEFAULTS`, :58). A run keeps its first maxRequestsPerRun entries and counts the rest in `dropped` (:225-226).

### S11 docs inventory (tool-count claims of 68 or 69)

Command: `grep -rnE "\b6[89]\b" README.md mcp/README.md extension/ui/onboarding.js showcase/angular/src/app showcase/angular/scripts/*.source.md showcase/angular/public/llms*.txt skills/fsb`, filtered to tool-count claims. Version strings such as `v0.9.69`, CSS values, SVG paths and coordinates are not claims.

- README.md:82 ("and 69 registered MCP tools for external clients"), README.md:280 ("It exposes 69 registered tools ...")
- mcp/README.md:20 (contents link `#tools-69-total`), mcp/README.md:484 ("## Tools (69 Total)")
- extension/ui/onboarding.js:205 (`<b>68 MCP tools</b>`), :227 ("68 tools, no API key ..."), :275 (`<b>68 tools</b>, zero manual JSON.`), :882 (`{ k: 'Tools', v: '68 available' }`)
- showcase/angular/src/app/pages/home/home-page.component.html:68 (`home.features.card.mcpIntegration.desc`), :276 (`home.engine.mcp.meta`), :327 (`home.engine.mcp.fact.tools`)
- showcase/angular/src/app/pages/agents/agents-page.component.html:15 (`agents.hero.subtitle`), :92 (`agents.with.agent.foot`), :122 (`agents.power.card.tools.stat`)
- showcase/angular/src/app/pages/agents/agents-page.component.ts:294 (`agents.schema.software.description`), :296 (`agents.schema.software.feature.tools`)
- showcase/angular/src/app/pages/about/about-page.component.html:102 (`about.actions.subtitle`, "68-tool MCP")
- showcase/angular/src/app/pages/support/support-page.component.ts:41 (`support.schema.faq.mcp.a`), :61 (`support.schema.faq.tools.a`)
- showcase/angular/scripts/llms.source.md:3, :32; showcase/angular/scripts/llms-full.source.md:7, :43 ("### MCP tool surface (68 tools)")
- showcase/angular/public/llms.txt:4, :33; showcase/angular/public/llms-full.txt:8, :44 (generated from the sources)
- skills/fsb: no tool-count claim (only `v0.9.69` version mentions).

**Per-locale xlf counts** (tool-count trans-units; occurrences in `<source>` / in `<target>`):

| Catalog | Units | Source hits | Target hits |
|---------|-------|-------------|-------------|
| messages.xlf | 11 | 11 | 0 (no targets) |
| messages.de.xlf | 11 | 11 | 11 |
| messages.es.xlf | 11 | 11 | 11 |
| messages.ja.xlf | 11 | 11 | 11 |
| messages.ko.xlf | 11 | 11 | 11 |
| messages.zh-CN.xlf | 11 | 11 | 11 |
| messages.zh-TW.xlf | 11 | 11 | 11 |

The 11 unit ids, the same in every catalog: `about.actions.subtitle`, `agents.hero.subtitle`, `agents.with.agent.foot`, `agents.power.card.tools.stat`, `agents.schema.software.description`, `agents.schema.software.feature.tools`, `home.features.card.mcpIntegration.desc`, `home.engine.mcp.meta`, `home.engine.mcp.fact.tools`, `support.schema.faq.mcp.a`, `support.schema.faq.tools.a`.

## Drift substitutions

1. **S8, D-09 item 3** (verbatim): "D-09 item 3 (typed words in `status`) is replaced by: (1) the v2 committed row carries a `fastMode` block {outcome, reason, uncertainUnobserved, humanGate, exhausted, latched}, projected from raw `runTask.fastMode` through scripts/bench/lib/fast-mode.mjs (71-02); (2) a typed `done` on a checker-failed run counts as `claimedSuccessOnFail`, because the gate declares `claimWords.autopilot.candidateTypedOutcome: ['done']` and the evaluator takes the per-run union of the status claim and the typed claim (71-05, 71-06); (3) the gate report renders the M-70-04 typed-outcome agreement table as descriptive output (71-07)."
   The real FAST_MODE_BLOCK_KEYS, FAST_MODE_SUMMARY_KEYS and FAST_MODE_OUTCOMES match 70-05's lists, so there is no further rename substitution for 71-02.
2. **S4, attempt keys.** Wherever a Phase 71 plan quotes the jevMeasurement attempt (71-02-PLAN.md:88 and anything that copies it), use the implemented key list `{iteration, command, decisionSource, jevCalled, servedModel, instrumentVersion, calibrationStatus, latencyMs, usage:{inputTokens, source}, cost:{usd, source}, fallback, outcome, escalationReason, op, stepOutcome}`. **Drop `toolMs`**: no per-attempt tool time exists, so no fixture, producer or report may read or synthesise `attempts[].toolMs`. Real-shape test fixtures build attempts with exactly these keys. The Exposure rule needs no change (persistence order: same save).
3. **S11, inventory.** The docs plans (71-10, 71-11) take their sites from the S11 inventory above, not from Pitfall 11's list. Replace "7 xlf catalogs: 7 hits each, 10 in German" with "7 xlf catalogs, 11 tool-count units each (11 source occurrences per catalog; 11 target occurrences in each of the 6 locale files)". The inventory adds `agents.hero.subtitle` (agents-page.component.html:15), llms-full.source.md:43 and the generated public/llms*.txt lines. 71-10 already lists onboarding.js:882, and 71-11 already covers the hero sentence.
