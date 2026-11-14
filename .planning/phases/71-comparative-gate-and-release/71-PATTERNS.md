# Phase 71: Comparative Gate and Release - Pattern Map

**Mapped:** 2026-10-15
**Files analyzed:** 41 new or modified files (the docs and locale sites are grouped in one row set)
**Analogs found:** 38 / 41
**Trees read:** the planning worktree `the repository root` at `e1e6439c`, and read-only the main tree at `ae39c486` for the 66.1/69 files that exist only there.
- **Byte-identical in both trees:** `scripts/bench/**`, `scripts/sync-product-version.mjs`, `tests/version-sync.test.js` and `tests/bench-report.test.mjs`.
- **Differs between the trees:** `tests/mcp-version-parity.test.js`. The main tree adds `mcp:get-settings` and `mcp:set-setting` at `:370-371`.
- **Main tree only:** `scripts/mcp/**`, `tests/helpers/mcp-in-process.mjs` and `tests/mcp-tools-list-shape-freeze.test.js`.

Line numbers below are from those trees. The sync re-check (D-02) must re-grep every anchor before execution.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/bench/lib/runs.mjs` (M) | model + validator | transform | itself: `buildSchedule` `:132-164`, `toCommittedRow` `:437-468`, `validateCommittedRow` `:509-590` | exact (self-extension) |
| `scripts/bench/lib/stats.mjs` (M) | utility | transform | itself: `wilson` `:52-56`, `aaNoiseFloor` `:79-90` | exact |
| `scripts/bench/report.mjs` (M) | service (report) | batch / file-I/O | itself: `summarizeArm` `:233-287`, `buildSummary` `:340-377` | exact |
| `scripts/bench/run-bench.mjs` (M) | controller (CLI) | request-response + event-driven | itself: `resolveOptions` `:249-355`, `createRunExecutor` `:663-825`, `collectIdentity` `:943-1022`, `runPreflight` `:1062-1109` | exact |
| `scripts/bench/lib/mcp-client.mjs` (M, optional `writeSetting`) | service (MCP client) | request-response | itself: `callToolJson` `:192-197`, `openTab` `:204-206` | exact |
| `scripts/bench/fixture-server.mjs` (M) | utility | transform | itself: `newRunToken` `:415-419`, `TOKEN_PATTERN` `:50` | exact |
| `scripts/bench/gate/release-gate-v1.0.0.json` (N) | config (frozen spec) | static | `scripts/bench/tasks/core.lock.json` (style); 67-02 `targets.json` (`67-02-PLAN.md:68-69`, planned) | role-match |
| `scripts/bench/gate/lib/gate.mjs` (N) | validator + loader | transform | `runs.mjs` `checkKeys`/`walkStrings`/`validateCommittedRow` `:472-590`; 67-02 `validateTargets`/`loadTargets` (planned) | exact |
| `scripts/bench/gate/lib/evaluate.mjs` (N) | service (pure) | transform | `stats.mjs` (pure header `:1-15`), `report.mjs` `aaFloorFor` `:143-167` + `summarizeArm` `:233-287` | role-match |
| `scripts/bench/gate/lib/synthetic.mjs` (N) | utility (fixture generator) | batch | `tests/bench-stats.test.mjs` `syntheticTasks` `:18-33`; `tests/bench-report.test.mjs` `baselineRows` `:895-918`, `rawRecord` `:169-205` | exact |
| `scripts/bench/gate/simulate-power.mjs` (N) | CLI | batch | `scripts/bench/report.mjs` CLI `:565-595` | role-match |
| `scripts/bench/gate/evaluate-gate.mjs` (N) | controller (CLI) | file-I/O + request-response (git, spawn) | `run-bench.mjs` `main(argv, overrides)` `:1234-1256` + `defaultDeps` `:451-486`; `report.mjs` `loadCampaign` `:101-139`; `scripts/bench/sweep-tests.mjs` (spawning suites) | exact |
| `scripts/bench/gate/decisions/core-gate-71.json` + `.report.md` | output artifact | file-I/O | written at V4 only; Phase 71 commits no file here | n/a |
| `scripts/release/lib/release-diff.mjs` (N) | utility (pure classifier) | transform | `sync-product-version.mjs` `allTargets` `:61-65`, `--print-targets` `:650-652` | partial |
| `scripts/release/check-release-diff.mjs` (N) | CLI | file-I/O (git archive) | main tree `scripts/mcp/tools-list-baseline.mjs` `runChecked` `:89-97`, `buildPinTools` `:101-125`, `main` `:172-230` | exact |
| `scripts/mcp/count-tool-tokens.mjs` (N) | CLI | request-response (HTTP) | main tree `scripts/mcp/tools-list-baseline.mjs` (imports `:25-43`, CLI `:45-70`, `:232-240`); `run-bench.mjs` `main(argv, overrides)` for the injected `fetch` | role-match |
| `scripts/sync-product-version.mjs` (M) | utility (release setter) | file-I/O | itself: `setMcpReadmeSurfaces` `:271-316`, `collectParityErrors` `:549-553` | exact |
| `tests/bench-conditions.test.mjs` (N) | test | — | `tests/bench-report.test.mjs` `buildSchedule` tests `:97-131`, `liveDeps` `:431-476`, executor harness `:596-668` | exact |
| `tests/bench-runs-v2.test.mjs` (N) | test | — | `tests/bench-report.test.mjs` `rawRecord` `:169-205`, row tests `:207-260` | exact |
| `tests/fixtures/jev-measurement-real-shape.json` (N) | test fixture | static | `tests/fixtures/bench/run-task-provider-error.json` (loaded at `bench-report.test.mjs:41`); shape from `68-09-PLAN.md:63` | role-match |
| `tests/bench-f5-token.test.mjs` (N), or extend `tests/bench-fixture-server.test.mjs` `:93-95` | test | — | `tests/bench-drivers.test.mjs` `createRequire` `:12,49`; `bench-fixture-server.test.mjs` `withServer` `:25-32` | role-match |
| `tests/bench-stats.test.mjs` (M) | test | — | itself: `wilson` test `:79-86` | exact |
| `tests/bench-report.test.mjs` (M) | test (pins) | — | itself: `:76-91`, `:1050-1063`, `:1118-1123` | exact |
| `tests/bench-gate.test.mjs` (N) | test (hash pin + validator) | — | `tests/bench-corpus.test.mjs` core.lock test `:178-195` | exact |
| `tests/bench-gate-evaluate.test.mjs` (N) | test | — | `tests/bench-stats.test.mjs` (synthetic known-answer `:88-115`) | role-match |
| `tests/bench-gate-cli.test.mjs` (N) | test (injected git/spawn) | — | `tests/bench-report.test.mjs` `liveDeps`/`spy`/`capture` `:417-476`, `:59-68` | exact |
| `tests/bench-gate-power.test.mjs` (N) | test (seeded sim) | — | `tests/bench-stats.test.mjs` determinism test `:116-130` | role-match |
| `tests/release-version-rehearsal.test.js` (N) | test (temp-root integration) | file-I/O | `tests/version-sync.test.js` `:40-95`, `:114-134`, `:156-245` | exact |
| `tests/helpers/release-doc-parity.js` (N) | test helper | — | rules extracted from `tests/mcp-version-parity.test.js:291-314` | exact (extraction) |
| `tests/version-sync.test.js` (M) | test | — | itself | exact |
| `tests/mcp-version-parity.test.js` (M) | test (pins) | — | itself (main tree `:298`, `:323-334`, `:362-385`) | exact |
| `tests/fixtures/mcp-release-delta-0.12.0.json` (N) | test fixture | static | main tree `tests/fixtures/mcp-tools-list-8a058bdf.json` (meta + list) | role-match |
| `tests/mcp-release-compat.test.js` (N) | test (contract, in-process) | — | main tree `tests/mcp-tools-list-shape-freeze.test.js` (whole file) | exact |
| `tests/release-diff.test.mjs` (N) | test | — | `tests/bench-stats.test.mjs` (pure-function node:test style) | role-match |
| `tests/mcp-count-tool-tokens.test.mjs` (N) | test (fake fetch) | — | `tests/bench-report.test.mjs` `capture` `:59-68` + `liveDeps` injection | role-match |
| `package.json` `test` + `tests/delegation-phase-contract.test.js` (M) | config | — | main tree `REFINEMENT_ROOT_TEST_COMMANDS` `:129-170`; enforcement `:2386-2405` | exact |
| Docs: `README.md` `:82,:280`; `mcp/README.md` `:484` tables; `extension/ui/onboarding.js` `:205,:227,:275`; showcase components; `llms*.source.md`; 7 xlf files; `same-source-allowlist.json` `:1617-1620`; `skills/fsb/references/tool-decision-tree.md` (M) | static copy | — | the current sites themselves (see Docs section) | exact |
| `.planning/phases/71-.../71-VALIDATION.md` (N) | doc | — | `69-VALIDATION.md:190-200`; `68-VALIDATION.md:16,160` | exact |

---

## Pattern Assignments

### `scripts/bench/lib/runs.mjs` (model + validator, transform)

**Analog:** itself. It is the only producer and validator of committed rows.

**The frozen v1 key list stays byte-identical** (`:33-39`). It is pinned at `tests/bench-report.test.mjs:76-81`:
```js
export const RUN_ROW_SCHEMA_VERSION = 1;

export const RUN_ROW_KEYS = Object.freeze([
  'schemaVersion', 'campaignId', 'runId', 'attempts', 'set', 'taskId', 'taskVersion', 'category', 'fixtureSha256',
  'arm', 'round', 'order', 'startedAt', 'wallMs', 'wallFromInitMs', 'pass', 'timedOut', 'checks', 'infraError',
  'claimed', 'fsb', 'host', 'cost', 'provider', 'flags',
]);
```
Add `RUN_ROW_KEYS_V2 = Object.freeze([...RUN_ROW_KEYS, 'condition', 'jev', 'safety', 'endLabel'])`. Add the new nested key lists to the existing `NESTED_KEYS` freeze pattern (`:83-97`):
```js
const NESTED_KEYS = Object.freeze({
  checks: Object.freeze(['kind', 'pass']),
  claimed: Object.freeze(['status', 'partialOutcome', 'isError', 'subtype', 'completeTask']),
  ...
  cost: Object.freeze(['usd', 'source', 'label']),
  provider: Object.freeze(['requestedModel', 'servedModels', 'servedModelMatch']),
});
```

**Infra code vocabulary** (`:41-46`). Append `condition_not_applied` to both lists. This moves the sorted pin at `bench-report.test.mjs:82-86` in the same commit:
```js
export const INFRA_CODES = Object.freeze([
  'agent_cap', 'agent_auth', 'provider_error', 'fsb_agent_cap', 'host_api_error', 'claude_no_init',
  'host_no_result', 'extension_not_connected', 'hub_lost', 'spawn_failed', 'mcp_session_not_found_no_calls',
]);
export const PAUSING_INFRA_CODES = Object.freeze(['agent_cap', 'agent_auth', 'provider_error']);
```

**The schedule loop to extend** (`:148-162`). Keep the `conditions`-absent path byte-identical (RESEARCH Pattern 1):
```js
for (let round = 1; round <= rounds; round += 1) {
  const rnd = mulberry32(seed + round);
  const perm = [...sorted];
  for (let i = perm.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const armOrder = round % 2 === 1 ? arms : [...arms].reverse();
  for (const taskId of perm) {
    for (const arm of armOrder) {
      order += 1;
      schedule.push({ campaignId, runId: `${campaignId}-r${round}-${taskId}-${arm}`, round, order, taskId, arm });
    }
  }
}
```
Validate `conditions` with the guard style already used for `arms` (`:141-143`):
```js
if (!Array.isArray(arms) || arms.length === 0 || new Set(arms).size !== arms.length || !arms.every((arm) => ARMS.includes(arm))) {
  throw new TypeError(`arms must be distinct values from ${ARMS.join(', ')}`);
}
```

**Block builder pattern for `jev` and `safety`.** Copy `costBlock`/`providerBlock` (`:367-406`):
- each builder returns a fully keyed object of nulls when the source is absent;
- numbers go through `num()`/`count()` (`:269-275`);
- strings go through `safeString(value, max)` (`:262-267`), which strips control characters and drops `://`.
```js
function providerBlock(arm, measurement) {
  if (arm !== 'autopilot' || !isPlainObject(measurement) || measurement.kind !== 'autopilot') {
    return { requestedModel: null, servedModels: [], servedModelMatch: null };
  }
  return {
    requestedModel: safeString(measurement.requestedModel, 128),
    servedModels: servedModelsOf(measurement),
    servedModelMatch: servedModelMatch(measurement),
  };
}
```
Cost source labels follow `AUTOPILOT_COST_LABELS` (`:60-66`). `jev.usd` keeps `{provider, estimate}` separate and is never summed with `cost.usd` (D-10).

**Safety must be computed before `detail` is dropped** (`:419-425`):
```js
function checksBlock(outcome) {
  const checks = isPlainObject(outcome) && Array.isArray(outcome.checks) ? outcome.checks.slice(0, MAX_CHECKS) : [];
  return checks.map((check) => ({
    kind: isPlainObject(check) ? safeString(check.kind, 40) : null,
    pass: isPlainObject(check) && check.pass === true,
  }));
}
```
`toCommittedRow(raw)` (`:437-468`) reads `raw.outcome.checks[].detail` (`{matched, expected}` from `outcome.mjs` `checkRequest`, `:96-114`) and `raw.evidence.requests` (the raw shape is at `bench-report.test.mjs:188,196-197`). It writes the v2 row. Keep picking named fields only: the producer never spreads raw input into a row.

**Validator: dispatch on `schemaVersion`** (`:509-514`; `checkKeys` `:472-480`; `walkStrings` `:482-495`):
```js
export function validateCommittedRow(row) {
  const errors = [];
  if (!checkKeys(row, RUN_ROW_KEYS, '', errors)) return { ok: false, errors };
  walkStrings(row, '', errors);
  expectType(row.schemaVersion === RUN_ROW_SCHEMA_VERSION, 'schemaVersion', errors);
```
- Branch before `checkKeys`: `schemaVersion === 2` uses `RUN_ROW_KEYS_V2` plus nested `checkKeys` for `jev`, `safety`, `jev.usd`, `calibrationStatuses` and `fallbacks`.
- Every other value keeps today's v1 path unchanged.
- Errors name rules and paths, never values (`:505-508`).
- `isNullableNumber`/`isNullableString`/`isNullableBool` (`:501-503`) cover the new fields.

---

### `scripts/bench/lib/stats.mjs` (utility, transform)

**Analog:** itself. Append `newcombeDifference` after line 57 (`// --- end Pattern 9 ---`). Never edit `:19-57`.

**Built on `wilson`** (`:52-56`):
```js
export function wilson(successes, n, z = 1.959963984540054) {
  if (!n) return [NaN, NaN]; const p = successes / n; const d = 1 + z * z / n;
  const c = p + z * z / (2 * n); const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
```

**Post-Pattern-9 helper style.** Follow `summarize` (`:59-74`): a JSDoc-style comment and `null` (never 0 or NaN) for "no data". RESEARCH Code Examples gives the body and four test vectors.

---

### `scripts/bench/report.mjs` (service, batch / file-I/O)

**Analog:** itself. The change is grouping only. **No ratio code may appear here.** `tests/bench-report.test.mjs:1122` scans the source with `//` comments stripped (block comments are NOT stripped):
```js
assert.equal(/geoMeanMedianRatio\(|cross-arm|autopilot.*\/.*claude.*ratio/i.test(source.replace(/\/\/.*$/gm, '')), false, 'no cross-arm speed ratio');
```

**Grouping to change** (`:350-355`). Key by `arm` for v1 rows and by `arm/condition` for v2 rows with a non-null condition:
```js
const arms = {};
for (const arm of ARM_ORDER) {
  const armRows = setRows.filter((row) => row.arm === arm);
  if (armRows.length) arms[arm] = summarizeArm(armRows, { iterations, seed });
}
sets[set] = { runs: setRows.length, arms };
```
- Existing pins read `summary.sets.core.arms.autopilot` and `.claude` (`bench-report.test.mjs:947,955,969,988,995`), so v1 keys must not change.
- `summarizeArm` (`:233-287`) and `aaFloorFor` (`:143-167`) are reused per group as they are.

**Method-note pin.** `bench-report.test.mjs:1053-1059` requires `/not compared with each other/` in `## Method`. The new method notes (survivorship, the F5 token difference from the baseline, ITT) are added to `METHOD_NOTES` (`:50-59`) without removing that sentence.

**The infra vocabulary is emitted** at `:368-372` (`vocabulary: [...INFRA_CODES]`). It picks up `condition_not_applied` automatically.

**The `loadCampaign` contract** (`:101-139`) is reused by the evaluator CLI. It throws on any invalid row and names line numbers and rule codes, never values.

---

### `scripts/bench/run-bench.mjs` (controller CLI, request-response)

**Analog:** itself.

**Flag registration** (`:158-163`). Add `'--conditions'` and `'--gate'` to `VALUE_FLAGS`, and add their lines to `USAGE` (`:120-156`):
```js
const VALUE_FLAGS = new Set([
  '--set', '--tasks', '--rounds', '--arms', '--seed', '--claude-model', '--claude-tool-search', '--cursor-model',
  '--chrome-profile', '--expect-extension-id', '--chrome-launch-record', '--campaign-id', '--resume',
  '--tasks-root', '--fixtures-root', '--cooldown-ms',
]);
```

**Option validation** follows `--arms` (`:261-264`). It collects `issue(code, detail)` and never throws, so a refusal comes before any side effect (`:245-248`):
```js
const arms = raw['--arms'] === undefined ? ['autopilot', 'claude'] : parseList(raw['--arms']);
if (arms.length === 0 || new Set(arms).size !== arms.length || !arms.every((arm) => ARMS.includes(arm))) {
  errors.push(issue('arms_invalid', `--arms must list distinct arms from ${ARMS.join(', ')}`));
}
```

**Schedule call site** (`:1281`). Pass `conditions` here, and only when the option is set:
```js
schedule = buildSchedule({ campaignId, taskIds: tasks.map((task) => task.id), rounds: options.rounds, arms: options.arms, seed: options.seed });
```

**Pre-t0 apply and readback.** It goes in `createRunExecutor` before `armFn` (`:687-695`). The arm sets t0 inside `runTaskTimed`.
- **Mismatch.** Return a record with `infraError: 'condition_not_applied'` and `wallMs: null`, and do not call the arm.
- **Arm-failure shape to copy:**
```js
let result = null;
let armError = null;
const armFn = arms[entry.arm];
try {
  if (typeof armFn !== 'function') throw new Error(`no driver for arm ${entry.arm}`);
  result = await armFn({ entry, task, attempt, instruction, startUrl, token, signal, rawStreamPath });
} catch (error) {
  armError = error || new Error('arm failed');
}
```
- **Injected readback.** Copy the preflight use of the injected `deps.readExtensionStorageFlag` (`:1089-1097`). `null` means unverifiable:
```js
let telemetryOptOut = null;
if (cdpPort && extensionId) {
  try {
    telemetryOptOut = await deps.readExtensionStorageFlag(cdpPort, extensionId, TELEMETRY_KEY);
  } catch {
    telemetryOptOut = null;
  }
}
```
- **The readback function itself** (`scripts/bench/lib/cdp.mjs:371-396`) is strict-true: it returns `true` only for a stored `true`, `false` when the value is false or absent, and `null` when unreachable.

**Raw record** (`:780-822`). Add `condition: entry.condition ?? null` and `jevMeasurement` (from `sessionDetail.session.jevMeasurement`). Keep the "Session ids and the 66-06 measurement blocks only; never the detail" rule (`:806-809`).

**Session-detail wait** (`:582-584`). Extend the predicate for `condition === 'on'` (RESEARCH Pitfall 9):
```js
const sessionDetail = await deps.getSessionDetailWithRetry(client, timed.sessionId, {
  until: (detail) => !!(detail && detail.session && detail.session.measurement && detail.session.measurement.recorded === true),
});
```

**Identity and resume binding.**
- Add `identity.gate = {path, sha256}` in `collectIdentity` (`:958-999`; the git block is at `:967`). Hash with `sha256Hex` from `lib/identity.mjs:75-77`.
- Add `gate` and `conditions` to `stableIdentity` (`:1025-1041`), so `identityMismatches` (`:1043-1047`) refuses a resume that switches either one.
- Keep the schedule tuple shape `{ rounds, arms, seed }` and append `conditions` only when it is present. The 66-11 V1 identity has no such fields.

**Dependency injection** (`:451-486`). Add `writeSetting` (or `callToolJson`) to `defaultDeps()`, so tests replace it through `main(argv, overrides)` (`:1234-1235`).

**Exit codes** (`:100`). Copy them verbatim: `EXIT = { OK: 0, ERROR: 1, REFUSED: 2, PAUSED: 75, SIGINT: 130, SIGTERM: 143 }`. `condition_not_applied` pauses through `pauseDecision` (`runs.mjs:173-178`) once it is in `PAUSING_INFRA_CODES`.

---

### `scripts/bench/lib/mcp-client.mjs` (optional `writeSetting` wrapper)

**Analog:** `openTab` (`:204-206`) over `callToolJson` (`:192-197`):
```js
export async function callToolJson(client, name, args, opts) {
  const result = await client.callTool({ name, arguments: args || {} }, undefined, opts);
  const first = result && Array.isArray(result.content) ? result.content[0] : null;
  const text = first && typeof first.text === 'string' ? first.text : null;
  return { isError: !!(result && result.isError === true), json: tryParseJson(text), text };
}
export function openTab(client, url) {
  return callToolJson(client, 'open_tab', { url, active: true }, { timeout: 30000 });
}
```
- **The call:** `callToolJson(client, 'settings', { key: 'fsbJevFastModeEnabled', value: 'true'|'false' }, { timeout: SHORT_TOOL_TIMEOUT_MS })`.
- **The settings contract** (main tree `mcp/src/tools/settings.ts:31-33,45-51,67-80`):
  - write fields are `key, value, previous, changed, coupled`;
  - booleans are coerced to strings;
  - `SETTING_UNAVAILABLE` "did not confirm" means the outcome is unknown, so the CDP readback decides.

---

### `scripts/bench/fixture-server.mjs` (utility, transform)

**Analog:** itself (`:415-419`). The token pattern is at `:50`: `TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/`.
```js
newRunToken() {
  const token = randomBytes(16).toString('base64url');
  logFor(token);
  return token;
},
```
Replace the body with 24 `randomInt(26)` lowercase letters (RESEARCH "F5 token"), and import `randomInt` from `node:crypto`. The existing pin `bench-fixture-server.test.mjs:93-95` (`assert.match(token, /^[A-Za-z0-9_-]{8,64}$/)`, two tokens differ) keeps passing.

---

### `scripts/bench/gate/release-gate-v1.0.0.json` (config, frozen spec)

**Style analog:** `scripts/bench/tasks/core.lock.json`: `schemaVersion` + `note` + data, pretty JSON with a trailing newline and no timestamp.
```json
{
  "schemaVersion": 1,
  "note": "Core benchmark set frozen through Phase 71 (D-15). Changing any core task or fixture requires a version bump and a deliberately regenerated lock.",
  "tasks": [ ... ]
}
```
**Spec analog:** 67-02 `targets.json` (`67-02-PLAN.md:68-69`). An exact-key file committed before the live block, with `note` prose recording the method. Suggested top-level keys come from RESEARCH Pattern 4. `corpusLockSha256` is `sha256Hex` of the raw `core.lock.json` bytes.

---

### `scripts/bench/gate/lib/gate.mjs` (validator + loader, transform)

**Analog:** `runs.mjs` `checkKeys` / `walkStrings` / `expectType` (`:472-503`). Copy them locally or export them from `runs.mjs`. Do not re-implement them with different semantics.
```js
function checkKeys(value, keys, where, errors) {
  if (!isPlainObject(value)) {
    errors.push(`type:${where}`);
    return false;
  }
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`extra_key:${where ? `${where}.` : ''}${key}`);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`missing_key:${where ? `${where}.` : ''}${key}`);
  return true;
}
```
- **API shape.** Mirror 67-02's `validateTargets(obj) -> {ok, errors}` and `loadTargets(file)`: `loadGate(file)` reads raw bytes once, returns `{gate, sha256: sha256Hex(bytes)}`, then validates.
- **The decision-file validator** lives here too. It applies the same `walkStrings` (`MAX_STRING = 200`, no `://`), with a bounded exception for the claim sentences.

---

### `scripts/bench/gate/lib/evaluate.mjs` (pure service, transform)

**Analogs:**
- **Header contract.** Copy `stats.mjs:1-15` (pure and seeded; no clock, environment or filesystem):
```js
/**
 * Phase 66 benchmark statistics (D-16).
 *
 * Pure and seeded: the same input and seed always give the same result, and
 * nothing here reads the clock, the environment or the filesystem.
```
- **Imports.** Use `geoMeanMedianRatio`, `aaNoiseFloor`, `wilson` and `newcombeDifference` from `../../lib/stats.mjs`, the same way `report.mjs:35` imports them. The two-level path follows 67-02 `score.mjs` (`from '../../lib/stats.mjs'`, `67-02-PLAN.md:113`).
- **Building `{id, a, b}` task lists from rows.** Copy the per-task filtering in `report.mjs` `summarizeArm` `:238-254` and `aaFloorFor` `:146-149`:
```js
const tasks = taskIds.map((id) => ({
  id,
  runs: completed.filter((row) => row.taskId === id && finite(row.wallMs) !== null).map((row) => ({ round: row.round, wallMs: row.wallMs })),
}));
```
- **"n/a with a reason, never a number".** Copy the status object of `aaFloorFor` `:145`, `:151-154` (`{ status: 'n/a', reason }`). Verdicts use the same discriminated shape (`pass|fail|inconclusive|not_exercised` plus `reason`).
- **Counting helper.** Copy `countBy` (`report.mjs:74-81`), which uses sorted keys and skips non-strings.

---

### `scripts/bench/gate/lib/synthetic.mjs` (fixture generator, batch)

**Analogs:**
- **Seeded synthetic tasks** (`tests/bench-stats.test.mjs:18-33`):
```js
function syntheticTasks({ seed, factor, noise, taskCount = 12, runs = 10 }) {
  const rnd = mulberry32(seed);
  const jitter = () => 1 + noise * (2 * rnd() - 1);
  ...
}
```
- **Row-level ABBA campaign builder** (`tests/bench-report.test.mjs:895-918`, `baselineRows`). It walks rounds, alternates arm order and injects failures and infra codes at chosen cells. The generator must emit rows that pass `validateCommittedRow`, schema 1 for the baseline and schema 2 for candidates.
- **Raw-record shape** for producer round trips: `rawRecord` (`bench-report.test.mjs:169-205`), with `outcome.checks[].detail` and `evidence.requests`.
- **Randomness.** Use only `mulberry32` from `stats.mjs`; never `Math.random`.

---

### `scripts/bench/gate/simulate-power.mjs` (CLI, batch)

**Analog:** the `report.mjs` CLI tail (`:565-595`): a `USAGE` constant, `runCli(argv)` returning an exit code, and an `invokedPath === import.meta.url` guard.
```js
const invokedPath = (() => {
  try {
    return process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
  } catch {
    return null;
  }
})();
if (invokedPath === import.meta.url) {
  process.exitCode = runCli(process.argv.slice(2));
}
```
Export the simulation core so `tests/bench-gate-power.test.mjs` imports it with small seeded sizes.

---

### `scripts/bench/gate/evaluate-gate.mjs` (controller CLI; git and spawn injected)

**Analog:** `run-bench.mjs` `main(argv, overrides)` (`:1230-1256`):
```js
/**
 * CLI entry. Returns the exit code; never calls process.exit itself.
 * overrides replace any dependency (tests inject fakes; nothing live then).
 */
export async function main(argv = process.argv.slice(2), overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  const out = (text) => deps.stdout(`${text}\n`);
  const err = (text) => deps.stderr(`${text}\n`);
  const refuse = (heading, issues) => {
    err(`run-bench: ${heading}:`);
    for (const item of issues) err(`  - ${item.code}${item.detail ? `: ${item.detail}` : ''}`);
    return EXIT.REFUSED;
  };
```
- **Git.**
  - Use `deps.git(args)` for `git log -1 --format=%aI%n%cI -- <gate>` and `git diff --quiet <sha> -- <code paths>`.
  - The default implementation copies `runGit` from `scripts/bench/lib/identity.mjs:91-100` (`spawnSync('git', args, { env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}, shell: false })`).
  - `gitIdentity` (`identity.mjs:108-123`) supplies the measured-SHA and dirty checks.
- **`--verify-suites`.** Use `deps.spawn`. The default spawns the gate-listed suites the way `scripts/bench/sweep-tests.mjs` runs tests (bounded, stdin `/dev/null`).
- **Campaign loading.** Import `loadCampaign` from `../report.mjs` (`:101-139`).
- **Output files.** Write the decision file and `core-gate-71.report.md` beside it (Pitfall 13: not `report.md` inside the campaign dir). Use `writeJsonAtomic` (`run-bench.mjs:490-499`).

---

### `scripts/release/check-release-diff.mjs` + `scripts/release/lib/release-diff.mjs` (CLI + pure classifier)

**CLI analog:** main tree `scripts/mcp/tools-list-baseline.mjs`.
- **Header.** Copy `:1-23`, including "This script needs git history, so it is NOT part of `npm test`".
- **`SetupError` and exit codes.** `0` ok, `1` drift, `2` usage or setup.
- **`runChecked`** (`:89-97`):
```js
function runChecked(command, args, options, label) {
  const result = spawnSync(command, args, { shell: false, ...options });
  if (result.error || result.signal || result.status !== 0) {
    const stderr = result.stderr ? Buffer.from(result.stderr).toString('utf8').trim() : '';
    const reason = result.error ? result.error.message : (result.signal || `exit ${result.status}`);
    throw new SetupError(`${label} failed (${reason})${stderr ? `:\n${stderr}` : ''}`);
  }
  return result;
}
```
- **Exporting the measured tree** (`:104-111`). Drop the `mcp` path argument to get the whole tree:
```js
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-p69-pin-'));
try {
  const archive = runChecked('git', ['archive', '--format=tar', PIN_COMMIT, 'mcp'], {
    cwd: REPO_ROOT, env: gitEnv(), maxBuffer: MAX_ARCHIVE_BYTES,
  }, 'git archive').stdout;
  runChecked('tar', ['-x', '-C', tmp], { input: archive }, 'tar -x');
  ...
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
```
- **Setter targets for the classifier.** Run `node scripts/sync-product-version.mjs --print-targets` (`sync-product-version.mjs:650-652`; the list is `allTargets` `:61-65`) with `FSB_VERSION_SYNC_ROOT=<tmp>` (`:8-11`).
- **Testing.** The pure `classifyPath(path, {setterTargets, step})` lives in `lib/release-diff.mjs` and is the only part a registered test imports.

---

### `scripts/mcp/count-tool-tokens.mjs` (CLI, HTTP request-response)

**Analog:** main tree `scripts/mcp/tools-list-baseline.mjs`.
- **Imports.** Copy the import block (`:25-43`, from `./lib/tools-list.mjs`).
- **Argument parsing.** Copy `parseArgs` (`:58-70`), which throws on unknown arguments.
- **Entrypoint.** Copy the guard at `:232-240`.
- **Tool lists.** `readBaselineFixture()` (`tools-list.mjs:188-190`) gives the 8a058bdf list; `listCurrentTools()` (`tests/helpers/mcp-in-process.mjs:71-74`) gives the build list. For a script, use `listToolsFromRuntimeModule` (`tools-list.mjs:91-99`) plus the staleness guard pattern (`mcp-in-process.mjs:51-67`).
- **Canonicalization.** Run `canonicalJson` (re-exported at `tools-list.mjs:18-20`) to drop `undefined` keys before building `{name, description, input_schema}`.
- **Fetch injection.** Copy run-bench's `main(argv, overrides)` with `deps.fetch` defaulting to global `fetch` (Node 20 has it).
- **The API key.** Read it only from `process.env.ANTHROPIC_API_KEY`, and never write it or the headers to stdout or stderr (house rule `run-bench.mjs:38-40`).

---

### `scripts/sync-product-version.mjs` (release setter, file-I/O)

**Analog:** itself. Two sites must read one declared map (RESEARCH Pattern 9 / Pitfall 4).

**The template** (`:291-296`):
```js
changed.push(replaceExactly(
  'mcp/README.md',
  /^Compatibility for this release: .*$/gmu,
  `Compatibility for this release: MCP ${mcpVersion} requires extension ${extensionVersion} or newer for the \`mcp:task-status\` route used by \`complete_task\`, \`partial_task\`, and \`fail_task\`. Existing \`0.10.0\` tool routes remain additive and unchanged.`,
  'MCP README compatibility pair',
));
```
The bullet at `:279-284` carries the same `${extensionVersion}` defect.

**The check** (`:549-553`):
```js
contains(
  'mcp/README.md',
  `MCP ${mcpVersion} requires extension ${extensionVersion} or newer`,
  'MCP README compatibility pair',
);
```
**Map placement.** Put a frozen `MCP_EXTENSION_COMPAT` next to the other frozen lists (`:16-72`). Match their `Object.freeze` style and throw the setter's `Error` on an unknown version, so it reaches the `version-sync:` prefix (`:690-693`).

---

### `tests/bench-conditions.test.mjs` (test)

**Analog:** `tests/bench-report.test.mjs`.
- **Imports** (`:9-32`): `node:test`, `node:assert/strict`, and named imports from `runs.mjs` and `run-bench.mjs`.
- **Schedule assertions.** Copy the style at `:97-131`:
```js
const schedule = buildSchedule({ campaignId: 'core-20260930-abc1234', taskIds: TWELVE, rounds: 10, arms: ['autopilot', 'claude'], seed: 66 });
assert.equal(schedule.length, 240);
...
for (const entry of schedule) {
  assert.equal(entry.runId, `core-20260930-abc1234-r${entry.round}-${entry.taskId}-${entry.arm}`);
```
  Add `deepEqual(buildSchedule(v1Args), <committed v1 fixture>)` and an assertion that no `condition` key exists when `conditions` is absent.
- **Injected deps.** Use `spy` (`:417-423`), which throws when an unexpected dependency is called; `capture` (`:59-68`); and `liveDeps(overrides)` (`:431-476`), which already fakes `readExtensionStorageFlag`. Extend the overrides with `writeSetting`.
- **Executor harness.** Copy the harness at `:596-668` (`createRunExecutor` with fake `arms`, `collectEvidence`, `fixtureServer`) to assert that the arm is never called on readback mismatch.

### `tests/bench-runs-v2.test.mjs` (test)

**Analog:** `tests/bench-report.test.mjs`.
- **Raw-record builder.** Copy `rawRecord(overrides)` (`:169-205`). Add `condition` and `jevMeasurement` from `tests/fixtures/jev-measurement-real-shape.json` (the shape is at `68-09-PLAN.md:63`).
- **Leak tests.** Copy the sentinel strings (`BODY_SENTINEL_91`, `MARKER_SENTINEL_92`, `PAGE_TEXT_SENTINEL_93` at `:196-200`) and the "copies no evidence" test at `:207-229`, and assert the v2 row leaks none of them.
- **Rejection tests.** Copy the validator rejection test at `:257+`.

### `tests/bench-gate.test.mjs` (hash pin + validator)

**Analog:** `tests/bench-corpus.test.mjs:178-195`. It reads the raw text, checks exact keys at each level, and checks deterministic bytes:
```js
const text = fs.readFileSync(LOCK_FILE, 'utf8');
const lock = JSON.parse(text);
assert.deepEqual(Object.keys(lock).sort(), ['note', 'schemaVersion', 'tasks']);
...
assert.equal(text, `${JSON.stringify({ schemaVersion: 1, note: lock.note, tasks: expected }, null, 2)}\n`);
```
Add `assert.equal(sha256Hex(fs.readFileSync(GATE_FILE)), '<pinned>')`. Changing the gate means changing the pin in the same commit.

### `tests/bench-gate-evaluate.test.mjs`, `tests/bench-gate-power.test.mjs`

**Analog:** `tests/bench-stats.test.mjs`.
- **Known-answer verdicts.** Copy `:88-115` (a known effect is recovered; a CI straddling 1 is inconclusive).
- **Determinism.** Copy `:116-130` (same seed gives deep-equal results).
- **Fixtures.** One synthetic-campaign recipe per D-19 branch, from `synthetic.mjs`.

### `tests/bench-gate-cli.test.mjs` (injected git and spawn)

**Analog:** `tests/bench-report.test.mjs` `:489-518`:
```js
const deps = liveDeps({ readExtensionStorageFlag: async () => flag });
try {
  const code = await main([...], deps);
  assert.equal(code, 2);
  assert.match(deps.out.text(), /telemetry_not_opted_out/);
```
Inject a fake `git` that returns author and committer dates, the diff status and the sha. No registered test runs real git (67-VALIDATION:27).

### `tests/bench-f5-token.test.mjs` (or an extension of `bench-fixture-server.test.mjs`)

**Analogs:**
- **Loading the extension CJS.** `tests/bench-drivers.test.mjs:12,49` (`createRequire`). Load `extension/ai/jev-state.js`. It exports through `module.exports` (`67-06-PLAN.md:58`), and `buildRequest(input) -> {ok:false, reason:'sensitive_goal'}` (`67-06-PLAN.md:72`).
- **Rendering goals.** Use `renderInstruction(task, startUrl)` (`scripts/bench/lib/tasks.mjs:461-471`) and `loadTasks` from `tasks.mjs`.
- **Real token and URL.** Get them from `startFixtureServer` with `withServer` (`bench-fixture-server.test.mjs:25-32`). Bind port 0 and never 7225.

### `tests/release-version-rehearsal.test.js` (temp-root integration)

**Analog:** `tests/version-sync.test.js`.
- **Setter runner** (`:40-46`), which sets `FSB_VERSION_SYNC_ROOT`:
```js
function run(args, root = repositoryRoot) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FSB_VERSION_SYNC_ROOT: root },
  });
}
```
- **Fixture changelog writers** (`:70-95`). The rehearsal variants write "align at `1.0.0`" / "stays at `0.11.2`" and the step-B "MCP-only update … advances to `0.12.0`" paragraph.
- **Temp root.** `--print-targets` copy into `mkdtemp` (`:124-134`), cleaned in `finally` (`:350-352`).
- **Refusal assertion style** (`:156-158`): `assertIncludes(unprepared.stderr, \`author the ${v} entry at the top of CHANGELOG.md\`)`.
- **Parity phrases.** Take them from `tests/helpers/release-doc-parity.js`, extracted from `tests/mcp-version-parity.test.js:291-314` (rule texts: `MCP ${v} requires extension ${ext} or newer`, `align at`, `advances to`/`stays at`).

### `tests/mcp-release-compat.test.js` (contract, in-process)

**Analog:** main tree `tests/mcp-tools-list-shape-freeze.test.js` (whole file).
- **Plain `check()` script.** Copy `:37-43` and the result line and exit code at `:164-169`.
- **Helper loading.** Use the async ESM import `await import(pathToFileURL(HELPER_PATH).href)` (`:33,67`).
- **Name sets.** Copy the baseline and current name sets that exclude `settings` (`:76-94`).
- **Per-tool projection.** Diff with `projectShape` (`:96-131`).
- **The `MCPMessageType` delta.** Reuse `extractMcpMessageTypes` (main tree `tests/mcp-version-parity.test.js:183-188`) and the additive list at `:363-371`. The baseline list is embedded in the delta manifest; it is never read from git at test time.
- **Registration check.** Use the chain-membership pattern from `delegation-phase-contract.test.js:2388-2392` (`packageJson.scripts.test.split(' && ')`) to assert that the companion suites are in the chain.

---

## Shared Patterns

### Exact-key validation with error codes that name paths, not values
**Source:** `scripts/bench/lib/runs.mjs:472-503` (`checkKeys`, `walkStrings`, `expectType`)
**Apply to:** v2 rows, the gate file, the decision file, the delta manifest, `synthetic.mjs` output checks.
Rules: `extra_key:<path>`, `missing_key:<path>`, `type:<path>`, `string_too_long`, `url_in_string`. No string longer than 200 characters, and no `://`.

### Null, never zero, for missing data; labelled costs, never summed across payers
**Source:**
- `stats.mjs:59-64` (`summarize` gives `null` when empty);
- `runs.mjs:269-283` (`num`/`count`/`bool`);
- `runs.mjs:60-66` (`AUTOPILOT_COST_LABELS`);
- `report.mjs:169-188` (`costFor` with a `label` and `sources`).

**Apply to:** the `jev` block, evaluator outputs, and report columns (LLM cost and Jev cost kept side by side).

### Pure core and thin I/O shell
**Source:** `stats.mjs:1-15` (pure header); `run-bench.mjs` `defaultDeps` `:451-486` + `main(argv, overrides)` `:1234-1235`
**Apply to:** `evaluate.mjs`, `gate.mjs`, `synthetic.mjs` and `release-diff.mjs` are pure. `evaluate-gate.mjs`, `check-release-diff.mjs`, `count-tool-tokens.mjs` and `simulate-power.mjs` take injected `git`, `spawn`, `fetch`, `stdout` and `stderr`.

### CLI entrypoint guard and exit codes
**Source:** `report.mjs:586-595`; `run-bench.mjs:100`, `:1437-1452`; main tree `tools-list-baseline.mjs:232-240`
**Apply to:** every new `.mjs` CLI. Exit codes are `0` ok, `1` invalid or drift, `2` usage or refusal, `75` paused (runner only). The CLI never calls `process.exit` inside `main`.

### Committed-artifact hygiene
**Source:** `report.mjs:550` (`.replace(/:\/\//g, ': //')` on the markdown); `runs.mjs:262-267` (`safeString`)
**Apply to:** gate report markdown, decision file, claim sentences. The test at `bench-report.test.mjs:1062-1063` (`includes('://') === false`, no `NaN|null%|Infinity|undefined`) is the model for the gate report test.

### Test registration (same commit)
**Source:**
- main tree `package.json` `test`: the bench ESM command is at index 303 of 314 and is no longer last;
- `tests/delegation-phase-contract.test.js:129-170` (`REFINEMENT_ROOT_TEST_COMMANDS`; the bench string is at `:160`);
- enforcement at `:2386-2405`.

**Apply to:** every new suite.
- New `.mjs` suites can be appended to the bench `node --test …` string. If so, edit the identical string in both `package.json` and `REFINEMENT_ROOT_TEST_COMMANDS`.
- New `.js` plain scripts are appended at the end of the chain and the list.
- `PRE_PHASE6x` hashes are never touched.

### The validation deferral table
**Source:** `69-VALIDATION.md:190-200` (`| Behavior | Requirement | Validation Block | Why Manual | Test Instructions |`); policy blurb `68-VALIDATION.md:16`
**Apply to:** `71-VALIDATION.md` Manual-Only rows M-71-01…M-71-11 (plus M-71-01b and M-71-11b), with explicit "none" rows for V2 and V5.

---

## Docs and copy (D-27): sites and pins

These are copy edits, not code analogs. The table lists each site with its pin.

| Site (main tree) | Current text | Pinned by |
|---|---|---|
| `README.md:82`, `:280` + category table | "69 registered MCP tools" | `tests/mcp-version-parity.test.js:327-334` (`'69 registered MCP tools'`, `'## Tools (69 Total)'`, 9 rows totalling 69) |
| `mcp/README.md:484` | `## Tools (69 Total)` | same |
| `extension/ui/onboarding.js:205,227,275` | "68 MCP tools" / "68 tools" | `liveToolCountSources` (`mcp-version-parity.test.js:266-281`); four onboarding suites read the file (`onboarding-first-run` ×4, `onboarding-lmstudio`, `onboarding-agent-provider-clicks`, `mcp-client-identity-integration`). Grep them for the edited lines before changing them. RESEARCH OQ2 resolution: wording that names no number. |
| `showcase/angular/src/app/pages/home/home-page.component.html:68,276` | "68 tools" | xlf extraction diff (CI `ci.yml:168-172`) |
| `agents-page.component.html:92,122`; `agents-page.component.ts:294,296` | "68 tools", "68 MCP …" | xlf + `same-source-allowlist.json:1617-1620` (`agents.power.card.tools.stat` sha256 pair) |
| `support-page.component.ts:41,61` | "68 MCP tools", "68 granular tools" | xlf |
| `about-page.component.html:102` | "68-tool MCP catalog" | xlf |
| `showcase/angular/scripts/llms.source.md:3,32`; `llms-full.source.md:7,43` | "68-tool MCP surface", "(68 tools)" | regenerated `public/llms*.txt` through `build-crawler-files.mjs`; restore after `npm test` unless regenerated on purpose |
| `showcase/angular/src/locale/messages*.xlf` (7 files) | digits in `<target>` | `verify-translation-drift.mjs`, `verify-translation-quality.mjs`, extraction diff; memory notes on line pins and `sync-xliff-targets` resets |
| `skills/fsb/references/tool-decision-tree.md` | no `settings`/`expect` rows today | none found; add gate-independent wording only |

Stale-count bans to keep: `mcp-version-parity.test.js:323-326` (no "66-tool" claims). Extend them to 68 and 69. Where practical, compare the documented count to `listCurrentTools().length`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/bench/gate/lib/evaluate.mjs` (verdict and claims logic) | service | transform | No existing code produces pass/fail release verdicts or typed-provenance claim sentences. Use RESEARCH Patterns 5-6 for the logic; `report.mjs`/`stats.mjs` analogs cover only the I/O and statistics plumbing. |
| `scripts/mcp/count-tool-tokens.mjs` (HTTP call) | CLI | request-response | No repo script calls an external HTTP API with an injected fetch. Use the request shape in RESEARCH "count_tokens request" and run-bench's `overrides` injection. |
| `scripts/release/lib/release-diff.mjs` (`classifyPath`) | utility | transform | No existing path classifier. The closest data source is `sync-product-version.mjs --print-targets`, and the allowlist is literal from D-24. |

Upstream interfaces quoted from **plans** (not code) and to be re-verified at the sync re-check:
- `FsbJevState.buildRequest` (`67-06-PLAN.md:72`);
- the `jevMeasurement` v1 shape (`68-09-PLAN.md:63`);
- `fsbJevCaptureArmed` (`68-08-PLAN.md:85`);
- `scripts/bench/shadow/targets.json` + `validateTargets` (`67-02-PLAN.md:68-69`). The `scripts/bench/shadow/` directory does not exist in either tree yet.

## Metadata

**Analog search scope:**
- `scripts/bench/**` and `scripts/sync-product-version.mjs` in the planning worktree;
- `scripts/mcp/**`, `tests/helpers/**`, `mcp/src/tools/settings.ts`, `package.json`, `tests/delegation-phase-contract.test.js` and `tests/mcp-version-parity.test.js` in the main tree (read-only);
- `tests/bench-*.test.mjs`, `tests/version-sync.test.js`, and the showcase pages, scripts and locale;
- `.planning/phases/{67,68,69}-*` plans and VALIDATION files.

**Files scanned:** about 40 (11 read in full, the rest by targeted range).
**Pattern extraction date:** 2026-10-15
