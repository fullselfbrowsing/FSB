P68_START=ba745cfef0ef2aefa47c2fa53ab0a1f7accb1896

# Phase 68: Sync re-check at P68_START (D-24)

**Recorded:** 2026-10-17, plan 68-01 Task 1, before any Phase 68 source edit.
**Tree:** branch Jev at `ba745cfe`. Since the post-67 sync point `c7a7d66f`, only `.planning/` files changed (`git diff --name-only c7a7d66f ba745cfe` lists nothing outside `.planning/`), so every code anchor the plans quote at `c7a7d66f` holds at P68_START.
**Upstream finished:** `66.1-08-SUMMARY.md`, `67-13-SUMMARY.md` and `69-08-SUMMARY.md` exist; `git status --porcelain -- extension tests package.json scripts showcase mcp` was empty.
**Guard:** `tests/jev-fast-upstream-contract.test.js` (registered in the root chain and `REFINEMENT_ROOT_TEST_COMMANDS`) asserts the names and behaviour below and fails loudly on drift.

Later Phase 68 plans read this file first. The "Drift substitutions" section at the end is authoritative over any quoted name in the plans.

## Interface re-check

| Interface | Quoted at | Real location (file:line) | Status |
| --- | --- | --- | --- |
| `FsbSettingsSchema` production entries, last `serverHashKey` with no trailing comma | config.js ~:392-433 | `extension/config/config.js:395` (`var PRODUCTION_ENTRIES = [`), :396 first entry `providerKind`, :433 `{ key: 'serverHashKey', type: 'string', cls: 'secret', default: '' }`, :434 `];` | MATCH |
| `FsbSettingsSchema` export (`global.FsbSettingsSchema`, `module.exports.FsbSettingsSchema`) | config.js :978-979 | `extension/config/config.js:978-979`; `module.exports = { Config, config };` at :327, so the effective export is `{Config, config, FsbSettingsSchema}` (verified: `Object.keys(require('./extension/config/config.js'))` = `Config, config, FsbSettingsSchema`) | MATCH |
| `FsbSettingsSchema` counts | 35 / 24 writable / 11 read-only | measured: `keys().length` 35, writable 24, `readOnlyKeys().length` 11, `keys()[34]` = `serverHashKey` | MATCH |
| `FsbSettingsSchema` instance keys | entries, keys(), get, isWritable, readOnlyKeys(), effectiveDefault, projectValue, projectAll, describe, parseValue, planWrite, CODES, KEY_PATTERN, VALUE_MAX_LENGTH, PROVIDERS, MODEL_LIST_CAP, HOSTED_PROVIDERS, PROVIDER_API_KEY, safeKeyLabel, originOnly, knownModelIds, discoveredIdsFromCache, formatAllowed, create | measured `Object.keys(FsbSettingsSchema)` in exactly that order; instance built at `config.js:944-960` | MATCH |
| `Config.defaults` anchors | config.js :16, :45, :46 | `config.js:16` `this.defaults = {`, :45 `animatedActionHighlights: true,`, :46 `showSidepanelProgress: false,` | MATCH |
| `init-config.js` `defaultConfig` | :4, :31 | `extension/config/init-config.js:4` `const defaultConfig = {`, :31 `animatedActionHighlights: true,` | MATCH |
| tests/settings-schema.test.js `EXPECTED_ENTRIES`, `EXPECTED_KEYS` | :68-104, :105 | `tests/settings-schema.test.js:68` (`const EXPECTED_ENTRIES = [`), :103 the serverHashKey entry, :104 `];`, :105 `EXPECTED_KEYS` derived | MATCH |
| `extractSaveSettingsKeys`, `EXCLUDED_FROM_SCHEMA`, `KNOWN_DEFAULT_DIVERGENCES` | :1238, :1258, :1331, :1410-1411 | `tests/settings-schema.test.js:1238`, :1258, :1331; the exact-keys assertion at :1410-1411 (`['showSidepanelProgress', 'serverUrl']`) | MATCH |
| `FSBSettingsSync` IIFE | options.js tail from ~:9353 | `extension/ui/options.js:9353` (doc comment), :9370 `(function (global) {`, :9961 close | MATCH |
| `keyForElementId(id)` | ~:9445 | `options.js:9445-9449` (alias map `ELEMENT_KEY_ALIASES` :9381-9389, else the id itself when it is a schema key) | MATCH |
| `hasFieldRefresher` / `noteStorageChanges(changes, area)` | ~:9483-9485 | `options.js:9483-9485` / :9487-9511 (`apply[key]` only when untouched, writable and `hasFieldRefresher`, :9508) | MATCH |
| `filterForSave` | quoted | `options.js:9513-9522` | MATCH |
| `FIELD_REFRESHERS` and the `fsbChangeReportsEnabled` refresher | ~:9668, ~:9734 | `options.js:9668` `const FIELD_REFRESHERS = Object.freeze({`, :9734 `fsbChangeReportsEnabled: (value, deps) => setControlChecked(deps, 'fsbChangeReportsEnabled', value !== false),` | MATCH |
| `setControlChecked` (no event dispatch) | quoted | `options.js:9656-9659` (sets `el.checked` only, ignores a missing element) | MATCH |
| `applyToForm(apply, deps)` | ~:9842 | `options.js:9842-9875` (skips keys without a refresher at :9856) | MATCH |
| `noteTouched`, `noteSelfWrite`, `noteSaved`, `reset`, `inspect`, `willWriteProviderGroup`, `reconcile`, `attach` | quoted | `options.js:9451`, :9464, :9537, :9543, :9555, :9528, :9897, :9929 | MATCH |
| `global.FSBSettingsSync` / `module.exports.FSBSettingsSync` | ~:9960 / ~:9975 | `options.js:9960` / :9975 | MATCH |
| options.js `fsbChangeReportsEnabled` sites | :45, :327, :1004-1008, :2047-2049, :2338/:2384 | `options.js:45`, :327, :1004-1005 (listener), :2047-2048 (load, `?? true`), :2338 `const settings = {`, :2384 `fsbChangeReportsEnabled: elements.fsbChangeReportsEnabled?.checked ?? true,` | MATCH |
| tests/settings-panel-sync.test.js `buildRegistry()` and parity section | :142, :157, :1076 | `tests/settings-panel-sync.test.js:142`, :157 (`'fsbChangeReportsEnabled'` in the checkbox list), :1076 `section('Parity: every writable schema key refreshes in place')` | MATCH |
| Settings route read-all count | tests/mcp-settings-route.test.js:338-339 | `:338` `=== 35`, `:339` readOnly 11; recorder summaries `:1528`, `:1594`, `:1633`, `:1658` use `PRODUCTION_SCHEMA.keys().length` | MATCH |
| Settings tool contract read-all count | tests/mcp-settings-tool-contract.test.js:1064-1065, :1068 | `:1064-1065` (`productionKeys.length === 35`, "35 today"), `:1068` readOnly 11 | MATCH |
| `fsbFixtureFastMode` is test-only | 66.1-07 | `tests/mcp-settings-route.test.js:829-850` only; no occurrence under `extension/` | MATCH |
| `CONTRACT` (deep-equal to `showcase/server/src/jev/contract.js`) | jev-state.js :43-160 | `extension/ai/jev-state.js:43-67` (`FALLBACK_REASONS`), :69, :71-160 (`CONTRACT`); parity in `tests/jev-contract-parity.test.js` | MATCH |
| `CONTRACT.FALLBACK_REASONS` (19, order) | interfaces block | measured, identical list and order (:43-67, :84) | MATCH |
| `CONTRACT.NON_TRANSIENT_REASONS` (6) | interfaces block | `jev-state.js:91`, identical | MATCH |
| `CONTRACT.OPERATIONS` (8), `RESERVED_OPTION_KEY`, `ELEMENT_ID_PATTERN` | interfaces block | `jev-state.js:78`, :80, :82 | MATCH |
| `CONTRACT.CALIBRATION_STATUSES`, `NOUL_DIRECTION`, `KEYS.element` | interfaces block | `jev-state.js:113`, :119, :146 | MATCH |
| `GATEWAY_FALLBACK_REASONS`, `CLIENT_ONLY_FALLBACK_REASONS`, `CAPS`, `BUDGETS`, `KEYS` | interfaces block | `jev-state.js:85-88` (17 gateway reasons; client-only `['network_error','aborted']`), :124-136, :139, :141-156 | MATCH |
| `FsbJevState` module shape (`module.exports = api`) | 67-06 | `jev-state.js:941-959` (`root.FsbJevState = api; module.exports = api`); `require` returns the api, which has no `FsbJevState` property | MATCH |
| `FsbJevState.buildRequest(input, {byteBudget})` | :763-939 | `jev-state.js:763-939`; reads only documented keys (:768-807); `isSensitiveElement` :690-703; empty ops / role drop :804-806; non-boolean `changed` :843; zero-element target :442 (via `validateRequest` at :918); irreducible budget :912 | MATCH |
| `validateGatewayResponse`, `validateRequest`, `toOriginPath`, `scrubText`, `matchesSecret`, `filterInjection`, `utf8ByteLength`, `codePointLength` | 67-06 | `jev-state.js:600`, :453, :672, api :941-957 | MATCH |
| `FsbJevPolicy.accept(result, kind)` and reasons | 67-07 | `extension/ai/jev-policy.js:124-163` (`acceptUnguarded`), :189 `accept`; reasons `malformed`, `not_ok`, `not_calibrated`, `kind_absent`, `threshold_null`, `below_threshold`, `catch_all`; Noul effects `veto_completion` / `flag_stuck` / `flag_risk` (:39-49, :162) | MATCH |
| `FsbJevPolicy` exports (frozen api) | 67-07 | `jev-policy.js:428-439`: `LEVELS, LEVEL_NAMES, CONSTANTS, accept, normalizeGate, combineGates, mergeConfirmation, toBeforeToolResult`; `Object.isFrozen` true | MATCH |
| `FsbJevClient` exports | 67-08 | `extension/ai/jev-client.js:453-462`: `ENDPOINT` (:73), `DEFAULT_TIMEOUT_MS` 2500 (:75), `COOLDOWN_MS` 60000 (:77), `MAX_SPEND_COOLDOWN_MS` 3600000 (:79), `createJevClient` (:262), `decide` | MATCH |
| `createJevClient({endpoint, fetchImpl, now, getHashKey, setTimeoutImpl, clearTimeoutImpl})` -> `{decide, resetCooldown}` | 67-08 | `jev-client.js:262-448`; timers resolved when `decide` runs (:380-381) | MATCH |
| `decide(request, {signal, timeoutMs})`: never rejects; local answers; body first, status only when no exact body | 67-08, 67 WR-04 | `jev-client.js:317-445`; local checks :337-357 (`isSanitizedRequest` :158-167, 48 KB :347, aborted :353, cool-down :356); body first :425-432; status mapping :178-186 (404 -> `invalid_request`) | MATCH |
| 67-03 shipped profile and completion polarity | `uncalibrated-v1`; completion `p <= threshold` | `showcase/server/src/jev/profiles/uncalibrated.json:3`; `showcase/server/src/jev/calibration.js:269` (`veto_when_low ? p <= threshold : p >= threshold`) | MATCH |
| records.mjs (67-10) | interfaces block | `scripts/bench/shadow/lib/records.mjs:46-51` (`RECORD_SCHEMA_VERSION` 1, `PROVENANCES`, `SHADOW_RECORDS_ROOT`, `CORE_LOCK_PATH`, `RECORD_ID_PATTERN`, `NOTE_MAX_CHARS` 300), :188 `validateRecord`, :227 `loadRecords`, :264 `readCoreLock`, :275 `checkLockReferences(records, lock = readCoreLock())` (lock object or its tasks array); 25-record assertion `tests/jev-shadow-records.test.mjs:612` | MATCH |
| Boundary suite (67-11) layout | interfaces block | see item e | MATCH |
| `REFINEMENT_ROOT_TEST_COMMANDS` last entry | interfaces block | see item b | MATCH |
| Lattice importScripts pins 337 / 333 | :636-637, :685-686 | see item a | MATCH |
| `scripts/bench/sweep-tests.mjs` usage and exit codes | `--files <paths> [--baseline <json>] [--out <json>]`; 1 = failures, 2 = usage | `scripts/bench/sweep-tests.mjs:31-46` (also `--per-test-timeout-ms`) | MATCH |

No row is MISSING, so the phase proceeds.

## a. importScripts pins (tests/lattice-provider-bridge-smoke.test.js)

- Token count N = **337**: `tests/lattice-provider-bridge-smoke.test.js:637` (`passAssertEqual(importScriptsCount, 337, ...)`, regex `/importScripts/g`); ledger comment ends at :635 ("Phase 67 adds three inert Jev decision modules ... -> 337").
- Call-site count M = **333**: `tests/lattice-provider-bridge-smoke.test.js:686` (`passAssertEqual(importScriptsCallSites, 333, ...)`, regex `/importScripts\(/g`); ledger comment at :684 ("Phase 67's three Jev modules are call sites 331..333").
- Measured in `extension/background.js` at P68_START: 337 tokens and 333 call sites. Plan 68-06 sets N+1 = 338 and M+1 = 334 and extends both ledgers.

## b. Last `REFINEMENT_ROOT_TEST_COMMANDS` entry at P68_START

`'node --test tests/jev-shadow-score.test.mjs tests/jev-shadow-select.test.mjs tests/jev-shadow-records.test.mjs tests/jev-shadow-harness.test.mjs'` (`tests/delegation-phase-contract.test.js:188`; the array opens at :129). The 68-01 Task 1 commit appends `'node tests/jev-fast-upstream-contract.test.js'` after it, which is then the last entry; each later Phase 68 suite appends after whatever is last.

## c. Settings-schema count pins (Task 2 bumps exactly these)

Only four test files reference `FsbSettingsSchema` (`grep -rl FsbSettingsSchema tests/`): `tests/settings-schema.test.js`, `tests/settings-panel-sync.test.js`, `tests/mcp-settings-tool-contract.test.js`, `tests/mcp-settings-route.test.js`. Literal pins found:

| File:line | Pin | Task 2 change |
| --- | --- | --- |
| tests/settings-schema.test.js:8 | header comment "the 35-key contract (D-09)" | 35 -> 36 |
| tests/settings-schema.test.js:68-104 | `EXPECTED_ENTRIES` (one object per entry, schema order) | append the new entry after serverHashKey (:103); `EXPECTED_KEYS` (:105) is derived |
| tests/settings-schema.test.js:181 | section title "the 35-key contract (D-09)" | 35 -> 36 |
| tests/settings-schema.test.js:182 | message "keys() lists the 35 contract keys in order" | 35 -> 36 |
| tests/settings-schema.test.js:183 | `schema.keys().length === 35` | 36 |
| tests/settings-schema.test.js:186 | writable `=== 24`, "24 keys are writable" | 25 |
| tests/settings-schema.test.js:187 | `schema.entries.length === 35` | 36 |
| tests/settings-schema.test.js:239 | `schema.keys().length === 35` (tamper attempts) | 36 |
| tests/settings-schema.test.js:242 | `schema.keys().length === 35` (fresh array) | 36 |
| tests/settings-schema.test.js:508 | fixture schema `fixture.keys().length === 36` (production + one fixture key) | 37 (not in the post-67 sync's list; see drift substitutions) |
| tests/settings-schema.test.js:510 | `schema.keys().length === 35` | 36 |
| tests/settings-schema.test.js:554 | `schema.keys().length === 35` | 36 |
| tests/settings-schema.test.js:600 | SW scope `self.FsbSettingsSchema.keys().length` `=== 35` | 36 |
| tests/settings-schema.test.js:1280 | D-09 inventory: `saveSettings writes 31 keys` (`keysFound.length === 31`) | 32, because the new key joins the saveSettings object (not in the post-67 sync's list; see drift substitutions) |
| tests/settings-schema.test.js:115-145 (:151, :728) | `CONFIG_DEFAULTS_SNAPSHOT`, a deep-equal snapshot of `new Config().defaults` | gains `fsbJevFastModeEnabled: false` after `showSidepanelProgress` (D-04 puts the default in Config.defaults; found while executing Task 2, added to this table afterwards) |
| tests/mcp-settings-tool-contract.test.js:1064-1065 | `productionKeys.length === 35`, "35 today" | 36 |
| tests/mcp-settings-route.test.js:338 | `Object.keys(settings).length === 35`, "the 35 schema keys" | 36 |

Unchanged: the read-only count 11 (`settings-schema.test.js:184-185`, `mcp-settings-tool-contract.test.js:1068`, `mcp-settings-route.test.js:339`) and the derived `keyCount` recorder summaries (`mcp-settings-route.test.js:1528`, :1594, :1633, :1658). `tests/settings-panel-sync.test.js` holds no literal count; its `buildRegistry()` id list (:142, checkbox list :154-158) gains the new id. `tests/settings-schema.test.js:1032` ("36 known ids") counts model ids, not schema keys, and is untouched. No `mcp/` file pins a schema count.

## d. How FSBSettingsSync refreshes a plain boolean (RESEARCH A1)

Confirmed: it needs an explicit `FIELD_REFRESHERS` entry.

- `keyForElementId('<id>')` returns the id itself when it is a schema key (`options.js:9445-9449`), so an element id equal to its key needs no alias.
- `noteStorageChanges` puts a key in `apply` only when it is untouched, writable and `hasFieldRefresher(key)` (`options.js:9483-9485`, :9508); `hasFieldRefresher` is true only for the provider group or an own `FIELD_REFRESHERS` key.
- `applyToForm` skips any key without a refresher (`options.js:9856`).
- `filterForSave` protects every pending schema key whether or not it has a refresher (`options.js:9513-9522`).
- Probe at P68_START (scratch script, not committed): options.js loaded under the settings-panel-sync DOM shim with a fixture schema that adds one writable boolean `fsbProbeFlag`: `keyForElementId('fsbProbeFlag')` = `fsbProbeFlag`; `noteStorageChanges({fsbProbeFlag:{newValue:true}, debugMode:{newValue:true}}, 'local').apply` = `{"debugMode":true}` (the probe key is left out); `applyToForm({fsbProbeFlag:true}, deps)` = `[]` and the checkbox stays unchecked; `filterForSave` still drops both pending keys.
- `tests/settings-panel-sync.test.js` "Parity: every writable schema key refreshes in place" (:1076-1096) calls `applyToForm({[key]: undefined}, deps)` for every writable non-provider schema key and requires `[key]` back, so a new writable key with no refresher fails that suite. Task 2 adds `fsbJevFastModeEnabled: (value, deps) => setControlChecked(deps, 'fsbJevFastModeEnabled', value === true),` after the `fsbChangeReportsEnabled` refresher (:9734) and the id to `buildRegistry()`.

## e. Boundary suite structure (tests/jev-extension-boundary.test.js, 512 lines)

- `MODULES` enumerates three `{file, global}` pairs, not a glob: `tests/jev-extension-boundary.test.js:49-53`; `JEV_GLOBALS` :54, `JEV_REL_PATHS` :55.
- `TREE_PATTERNS` over every file under `extension/` (`systemone`, `api.typesafe.ai`, `\bJEV_[A-Z_]+\b`): :58-62, scanned in `treeScan` :181-207.
- `MODULE_PATTERNS` over the enumerated modules (`chrome.storage`, `localStorage`, `/serverUrl/gi`, `importScripts`): :65-70, applied in `moduleScan` :209-233.
- Exact jev-*.js file-set check: `moduleScan` :211-213 (`extension/ai` must hold exactly the enumerated files).
- One-URL scan: `URL_PATTERN` :80; exactly one `<scheme>://` literal across the modules, the endpoint in jev-client.js: :225-232.
- `CALLER_PATTERN` is prefix-based, `/FsbJev[A-Za-z_$]*/g`: :73, scanned over every file outside `JEV_REL_PATHS` in `callerScan` :235-248.
- background.js check: lines matching `/jev/i` must be exactly the three load lines in order, adjacent and directly after `importScripts('ai/model-discovery.js');`: :250-259. At P68_START `extension/background.js:818` is the model-discovery load and :819-821 are the three jev loads; no other background.js line matches `/jev/i`.
- ui/config scan: `UI_WORD_PATTERN` `/\bjev\b/gi` (:76, binaries) and `UI_TEXT_PATTERN` `/jev/gi` (:77, text files, any substring), in `uiConfigScan` :262-282. At P68_START no file under `extension/ui` or `extension/config` contains `jev` in any case.
- `scannerSelfTest` :152-179 (planted probes); vm checks: `inertAlone` :347-365, `inertTrapped` :367-380, `inertTogether` :390-408 (exact three globals), `decideWithoutFetch` :419-487.

Narrowing owners (unchanged from the plans): 68-01 Task 2 (word-bounded ui/config token allowlist for `fsbJevFastModeEnabled`), 68-04 Task 1 (fourth enumerated module), 68-06 Task 1 and 68-08 Task 1 (background.js load line and exact tokens), 68-12 Task 2 (control_panel.html card range).

## f. buildRequest and extra element keys

`FsbJevState.buildRequest` reads only the documented element keys (`id`, `role`, `label`, `ops`, `inputType`, `autocomplete`, `purpose.sensitive`, `hidden`; `jev-state.js:790-807`) and rebuilds each kept element as `{id, role, label, ops}` (:877). Probe: an element carrying `value: 'SECRETVALUE'`, `selector`, `handle` and `purpose: {sensitive:false, danger:true, intent:'submit'}` built ok with `request.elements = [{"id":"e0","role":"button","label":"Go","ops":["click"]}]`, and the serialized result does not contain `SECRETVALUE`. Phase 68 still strips menu entries to the documented keys before calling it (fact recorded only).

Also confirmed: a target question whose every element is dropped (a checkbox with `ops: []` and a password field, `offeredOps: ['scroll']`) returns `{ok:false, reason:'invalid_request'}` (the empty-target fact 68-04 and 68-05 rely on; asserted in the tripwire suite).

## g. F5 probe (RESEARCH A5)

`buildRequest({kinds:['operation','target'], goal:'Open http://127.0.0.1:53211/r/Ab3dEf9hIj2kLm5nOp8qRs/fixtures/checklist/index.html. Tick Alpha.', url:'http://127.0.0.1:53211/x', title:'t', visibleText:'', elements:[{id:'a', role:'button', label:'Go', ops:['click']}], offeredOps:['click']})` returned `{"ok":false,"reason":"sensitive_goal"}`. A5 confirmed: bench goals carrying the run token are `sensitive_goal`.

## h. Function slice hashes at P68_START

Method (later plans must slice the same way to reproduce these): take the first occurrence of `function <name>(` (each name is declared exactly once, none is `async`); find the `)` that closes its parameter list by paren depth; the body's opening brace is the first `{` after that `)`; end at the `}` that closes it by brace depth. Hash the UTF-8 text from `function` through that `}` inclusive with SHA-256. A string-, comment-, template- and regex-aware scanner gives the identical slices for all seven functions.

| Function | File:lines | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `createSessionHooks` | extension/background.js:4561-4592 | 1347 | `10ce1a544f31072f71121b8ee872a4ff6cdd8b07adb1c7a14171b50e4e940780` |
| `buildSystemPrompt` | extension/ai/agent-loop.js:731-768 | 4633 | `f6d32b22c09f2461c51deae48470b87ae00024d7af9bce8908931b60cb94a7e0` |
| `getPublicTools` | extension/ai/agent-loop.js:708-714 | 156 | `fa75f080ceb92723ccac1b2d95ec8ff191d20ac6ee9bc59e5a68c1f2baa49706` |
| `checkSafetyBreakers` | extension/ai/agent-loop.js:257-294 | 1691 | `8a74f88a3894fad05372592f88965d60ad218d023dc3330f320e2fcc1858374a` |
| `detectStuck` | extension/ai/agent-loop.js:309-552 | 11408 | `4f51f466bef4d3036830cc39ba27669086889259958f3ad14ec0ae4af0027aea` |
| `buildMarkdownSnapshot` | extension/content/dom-analysis.js:2537-2726 | 7722 | `820fa063ca1215a99e1bf1617f3b6959ef468d14466d4bcc16d551cd6205dc61` |
| `getMarkdownSnapshot` | not present: no `function getMarkdownSnapshot(` in dom-analysis.js (the name is only a message case label, `extension/content/messaging.js:895`) | - | none (absent) |
| `formatInlineRef` | extension/content/dom-analysis.js:2172-2302 | 5341 | `4c7dae4c52a820cb3092c6b65e58a35cda7345b9d992ca5afd3973478565f8e1` |

That is seven hashes plus the recorded absence of the eighth name.

## i. Drift substitutions

No upstream interface was renamed, changed or missing. These corrections to the plans' quoted facts apply to every later Phase 68 plan:

1. **`getMarkdownSnapshot` is not a function.** dom-analysis.js declares no `function getMarkdownSnapshot(`; only a `case 'getMarkdownSnapshot':` exists in messaging.js:895. Plans 68-02 (byte-identity case) and 68-11 (pin audit) take their "(if present)" branch: hash only `buildMarkdownSnapshot` and `formatInlineRef` from dom-analysis.js, and assert that `function getMarkdownSnapshot(` stays absent from dom-analysis.js instead of pinning a hash for it.
2. **Slicing method for item h.** The "first `{` after `function <name>(`" extractor used by tests/ownership-leakage-regression.test.js:19-33 stops at the default-parameter `{}` of `buildMarkdownSnapshot(options = {})` and returns a 43-byte non-body slice. Any slice-hash case (68-02, 68-06, 68-11) must locate the body brace after the parameter list's matching `)`, as described in item h, or its hash will not match.
3. **Two count pins beyond the post-67 sync's list.** Plan 68-01 Task 2 also bumps `tests/settings-schema.test.js:508` (fixture schema `36` -> `37`, production plus one fixture key) and `tests/settings-schema.test.js:1280` (D-09 inventory "saveSettings writes 31 keys" -> 32). Both are count pins that move mechanically with the new key. Task 2 also found a third paired pin, `CONFIG_DEFAULTS_SNAPSHOT` (`tests/settings-schema.test.js:115-145`, asserted at :151 and :728), a deep-equal snapshot of `Config.defaults` that gains `fsbJevFastModeEnabled: false`, because D-04 puts the false default in Config.defaults. No other assertion changes.
4. **P68_START is `ba745cfe`, not `c7a7d66f`.** The two commits in between touch only `.planning/`, so every `c7a7d66f` code anchor in the plans holds. Audits that diff "since P68_START" (for example `git diff --quiet "$P68_START" -- mcp/`) use `ba745cfe`.
5. **Lattice pin lines.** The two assertions are exactly `tests/lattice-provider-bridge-smoke.test.js:637` and `:686`; the plans' ranges `:636-637` and `:685-686` include the comment line before each. Values unchanged (337 / 333).

## Regression-sweep baseline

`node scripts/bench/sweep-tests.mjs --files extension/background.js extension/ai/agent-loop.js extension/content/messaging.js extension/content/dom-analysis.js extension/content/dom-state.js extension/content/actions.js extension/config/config.js extension/config/init-config.js extension/ui/options.js extension/ui/control_panel.html extension/utils/automation-logger.js extension/ws/mcp-tool-dispatcher.js --out .planning/phases/68-autopilot-fast-mode/68-SWEEP-BASELINE.json` ran in the background at `ba745cfe` before any edit (Node v24.14.1; port 7225 held by the user's hub, untouched). Result: 253 of 256 selected tests passed, exit 1 by design. The three baseline failures are pre-existing and outside the root `test` chain: `tests/agent-manager-start-mode.test.js`, `tests/dashboard-analytics-refresh.test.js`, `tests/trigger-cap-settings-ui.test.js`. The crawler files were restored afterwards.
