'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PHASE_DIR = '.planning/phases/61-delegation-ux-sw-eviction-persistence';
const UAT_PATH = `${PHASE_DIR}/61-HUMAN-UAT.md`;
const VALIDATION_PATH = `${PHASE_DIR}/61-VALIDATION.md`;
const PRE_PHASE61_ROOT_TEST_HASH = '1f02d3f54f3136054ccb26f10dbff97e1c30ed7118cae72e0f0dfc758577f683';

const PHASE61_NEW_TEST_COMMANDS = Object.freeze([
  'node tests/delegation-routing.test.js',
  'node tests/delegation-consent.test.js',
  'node tests/delegation-event-store.test.js',
  'node tests/delegation-controller.test.js',
  'node tests/delegation-sidepanel-ui.test.js',
  'node tests/delegation-phase-contract.test.js',
]);

const EXPECTED_TASKS = Object.freeze([
  ['61-01-01', 'node tests/delegation-routing.test.js && node tests/provider-parity.test.js'],
  ['61-01-02', 'node tests/delegation-consent.test.js'],
  ['61-01-03', 'node tests/delegation-consent.test.js && node tests/delegation-routing.test.js'],
  ['61-02-01', 'node tests/delegation-event-store.test.js'],
  ['61-02-02', 'node tests/delegation-event-store.test.js && node tests/delegation-controller.test.js'],
  ['61-02-03', 'node tests/delegation-controller.test.js'],
  ['61-03-01', 'node tests/mcp-bridge-client-lifecycle.test.js'],
  ['61-03-02', 'npm --prefix mcp run build && node tests/mcp-bridge-client-lifecycle.test.js && node tests/agent-grace.test.js && node tests/mcp-reverse-channel-contract.test.js'],
  ['61-03-03', 'node tests/mcp-version-parity.test.js && node tests/agent-grace.test.js'],
  ['61-04-01', 'npm --prefix mcp run build && node tests/agent-scope.test.js && node tests/agent-registry.test.js && node tests/agent-bridge-routes.test.js'],
  ['61-04-02', 'node tests/agent-registry.test.js'],
  ['61-04-03', 'node tests/agent-registry.test.js && node tests/agent-bridge-routes.test.js && node tests/open-tab-background-default.test.js'],
  ['61-05-01', 'npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-reverse-channel-contract.test.js'],
  ['61-05-02', 'npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js'],
  ['61-05-03', 'npm --prefix mcp run build && node tests/mcp-agent-orphan-recovery.test.js && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-reverse-channel-contract.test.js'],
  ['61-06-01', 'node tests/delegation-routing.test.js && node tests/delegation-controller.test.js && node tests/provider-parity.test.js && node tests/mcp-bridge-background-dispatch.test.js && node tests/providers-panel-logic.test.js'],
  ['61-06-02', 'node tests/delegation-controller.test.js && node tests/agent-registry.test.js && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-bridge-background-dispatch.test.js'],
  ['61-06-03', 'node tests/delegation-controller.test.js && node tests/mcp-bridge-client-lifecycle.test.js && node tests/mcp-agent-orphan-recovery.test.js && node tests/mcp-bridge-background-dispatch.test.js'],
  ['61-07-01', 'node tests/delegation-sidepanel-ui.test.js && node tests/sidepanel-tab-aware-smoke.test.js && node tests/owner-chip.test.js'],
  ['61-07-02', 'node tests/delegation-sidepanel-ui.test.js && node tests/sidepanel-tab-aware-smoke.test.js && node tests/owner-chip.test.js'],
  ['61-07-03', 'node tests/delegation-sidepanel-ui.test.js && node tests/delegation-controller.test.js'],
  ['61-08-01', 'node tests/delegation-phase-contract.test.js'],
  ['61-08-02', 'node tests/delegation-phase-contract.test.js && node tests/mcp-version-parity.test.js && node tests/provider-parity.test.js && node tests/agent-provider-forbidden-flags.test.js'],
]);

let passed = 0;
let failed = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS:', message);
  } else {
    failed += 1;
    console.error('  FAIL:', message);
  }
}

function equal(actual, expected, message) {
  check(JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function exactOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return '';
  const endIndex = source.indexOf(end, startIndex + start.length);
  return endIndex < 0 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const bodyStart = source.indexOf('{', start);
  if (bodyStart < 0) return '';
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
}

function hasEvidence(relativePath, pattern) {
  return exists(relativePath) && pattern.test(read(relativePath));
}

function checkEvidence(label, rows) {
  for (const [relativePath, pattern] of rows) {
    check(hasEvidence(relativePath, pattern), `${label} has evidence in ${relativePath}: ${pattern}`);
  }
}

function decodeXml(value) {
  return value.replace(/&amp;/g, '&').trim();
}

// The live ledger is a hard prerequisite. No other contract assertion runs if
// it is absent, so the test cannot become the mechanism that silently invents it.
if (!exists(UAT_PATH)) {
  console.error(`  FAIL: ${UAT_PATH} must exist before the Phase 61 contract gate runs`);
  process.exit(1);
}

const uat = read(UAT_PATH);
const validation = read(VALIDATION_PATH);
const context = read(`${PHASE_DIR}/61-CONTEXT.md`);
const research = read(`${PHASE_DIR}/61-RESEARCH.md`);
const patterns = read(`${PHASE_DIR}/61-PATTERNS.md`);
const uiSpec = read(`${PHASE_DIR}/61-UI-SPEC.md`);
const roadmap = read('.planning/ROADMAP.md');
const requirements = read('.planning/REQUIREMENTS.md');
const packageJson = JSON.parse(read('package.json'));

console.log('\n--- honest milestone-end UAT prerequisite ---');

check(/^status: human_needed$/m.test(uat), 'UAT frontmatter remains human_needed');
check(/^deferred_until: milestone-end$/m.test(uat), 'UAT is deferred only to the milestone-end group');
check(/^results_recorded: false$/m.test(uat), 'UAT records no live result');
check(/^live_checks: 8$/m.test(uat), 'UAT declares the exact eight comprehensive live scenarios');
check(exactOccurrences(uat, '## Milestone-end group:') === 1, 'all Phase 61 live checks belong to one milestone-end group');
check(!/^status:\s*(?:passed|green|complete)$/im.test(uat), 'no UAT status fabricates a completed live result');
check(!/^Result:\s*\S/im.test(uat), 'no UAT result field contains fabricated evidence');

const uatMatches = Array.from(uat.matchAll(/^### \[ \] (UAT61-\d{2}) — ([^\n]+)$/gm));
equal(uatMatches.map((match) => match[1]), [
  'UAT61-01', 'UAT61-02', 'UAT61-03', 'UAT61-04',
  'UAT61-05', 'UAT61-06', 'UAT61-07', 'UAT61-08',
], 'live scenario ids are exact and unique');

for (let index = 0; index < uatMatches.length; index += 1) {
  const start = uatMatches[index].index;
  const end = index + 1 < uatMatches.length ? uatMatches[index + 1].index : uat.indexOf('\n## Gate policy', start);
  const block = uat.slice(start, end < 0 ? undefined : end);
  const id = uatMatches[index][1];
  for (const requiredLabel of [
    'Status: `human_needed` — pending',
    'Prerequisites:',
    'Safe benign fixture:',
    'Steps:',
    'Expected result:',
    'Evidence location:',
    'References:',
  ]) {
    check(block.includes(requiredLabel), `${id} contains ${requiredLabel}`);
  }
  check(/^Evidence:\s*\n\s*\nReferences:/m.test(block), `${id} keeps its evidence placeholder empty`);
  check(/^\d+\. /m.test(block), `${id} contains exact ordered steps`);
}

for (const liveCase of [
  'Consent, trust restoration, keyboard, and focus',
  'Light/dark, narrow/wide, and reduced-motion presentation',
  'Active-owned Take Control visibility and focus handoff',
  'Authenticated Claude stream, feed, and honest summary',
  'Real service-worker eviction and exact feed recovery',
  'Forty-five-minute endurance and session-storage inspection',
  'Real POSIX hold, resume, expiry, and Stop settlement',
  'Daemon crash/restart versus ordinary disconnect classification',
]) {
  check(uat.includes(liveCase), `required live case is preserved: ${liveCase}`);
}

console.log('\n--- exact 23-task validation and plan mechanics ---');

const validationRows = validation.split('\n')
  .filter((line) => /^\| 61-\d{2}-\d{2} \|/.test(line))
  .map((line) => {
    const columns = line.split('|').map((column) => column.trim());
    const commandCell = columns[8] || '';
    return {
      id: columns[1],
      plan: columns[2],
      wave: columns[3],
      requirements: columns[4],
      threats: columns[5],
      command: commandCell.startsWith('`') && commandCell.endsWith('`')
        ? commandCell.slice(1, -1) : commandCell,
      fileStatus: columns[9],
      status: columns[10],
    };
  });

equal(validationRows.map((row) => [row.id, row.command]), EXPECTED_TASKS,
  'validation enumerates exactly all 23 task ids and focused commands');
check(new Set(validationRows.map((row) => row.id)).size === 23, 'validation task ids contain no duplicate');
check(validationRows.slice(0, 21).every((row) => row.status === '✅ green'),
  'the 21 shipped implementation rows cite green command evidence');
check(validationRows.slice(21).every((row) => /pending|green/.test(row.status)),
  'Plan 08 rows remain honest while their own commands execute');

const manualCommandPatterns = [
  /claude --version/i,
  /Chrome DevTools/i,
  /45[- ]minute/i,
  /SIGSTOP|SIGCONT|taskkill/i,
  /crash.*serve|restart.*serve/i,
  /unpacked extension/i,
];
for (const row of validationRows) {
  for (const pattern of manualCommandPatterns) {
    check(!pattern.test(row.command), `${row.id} does not misclassify live work as automated: ${pattern}`);
  }
}

const planSources = [];
const planCommands = [];
const expectedTaskCounts = [3, 3, 3, 3, 3, 3, 3, 2];
const expectedWaves = [1, 1, 1, 2, 2, 3, 4, 5];
for (let planNumber = 1; planNumber <= 8; planNumber += 1) {
  const plan = String(planNumber).padStart(2, '0');
  const relativePath = `${PHASE_DIR}/61-${plan}-PLAN.md`;
  const source = read(relativePath);
  planSources.push(source);
  const taskCount = (source.match(/<task type="auto">/g) || []).length;
  const commands = Array.from(source.matchAll(/<automated>([^<]+)<\/automated>/g), (match) => decodeXml(match[1]));
  const fileBlock = (source.match(/files_modified:\n([\s\S]*?)\nautonomous:/) || [null, ''])[1];
  const files = Array.from(fileBlock.matchAll(/^  - (.+)$/gm), (match) => match[1].trim());
  const wave = Number((source.match(/^wave: (\d+)$/m) || [null, NaN])[1]);
  check(taskCount === expectedTaskCounts[planNumber - 1], `Plan ${plan} has its exact two-to-three auto tasks`);
  check(commands.length === taskCount, `Plan ${plan} gives every task exactly one focused automated command`);
  check(files.length >= 5 && files.length <= 8, `Plan ${plan} owns five-to-eight files (${files.length})`);
  check(wave === expectedWaves[planNumber - 1], `Plan ${plan} remains in dependency wave ${wave}`);
  planCommands.push(...commands);
}
equal(planCommands, EXPECTED_TASKS.map((row) => row[1]),
  'plan task commands and validation commands are byte-equal and ordered');

const criticalFileOwners = Object.freeze({
  'extension/background.js': ['06'],
  'extension/ws/mcp-bridge-client.js': ['03'],
  'extension/utils/agent-registry.js': ['04'],
  'mcp/src/agent-providers/spawn-supervisor.ts': ['05'],
  'extension/ui/sidepanel.html': ['07'],
  'extension/ui/sidepanel.js': ['07'],
  'extension/ui/sidepanel.css': ['07'],
  'package.json': ['08'],
  'extension/utils/delegation-controller.js': ['02', '06'],
});
for (const [file, expectedOwners] of Object.entries(criticalFileOwners)) {
  const owners = planSources.flatMap((source, index) => {
    const fileBlock = (source.match(/files_modified:\n([\s\S]*?)\nautonomous:/) || [null, ''])[1];
    return fileBlock.includes(`- ${file}`) ? [String(index + 1).padStart(2, '0')] : [];
  });
  equal(owners, expectedOwners, `${file} keeps its single-owner or declared sequential-owner rule`);
}
check(planSources[5].includes('  - "61-02"'), 'Plan 06 depends on controller owner Plan 02 before extending it');
check(planSources[6].includes('  - "61-06"'), 'Plan 07 UI follows the stable controller/background integration');
check(planSources[7].includes('  - "61-07"'), 'Plan 08 evidence gate follows the complete UI integration');

console.log('\n--- serial root-chain inclusion and prior-gate preservation ---');

const rootCommands = packageJson.scripts.test.split(' && ');
for (const command of PHASE61_NEW_TEST_COMMANDS) {
  check(rootCommands.filter((candidate) => candidate === command).length === 1,
    `${command} appears exactly once in the serial root chain`);
}
const prePhase61Commands = rootCommands.filter((command) => !PHASE61_NEW_TEST_COMMANDS.includes(command));
check(digest(prePhase61Commands.join(' && ')) === PRE_PHASE61_ROOT_TEST_HASH,
  'removing the six new Phase 61 gates reproduces the exact prior serial chain');
check(rootCommands.indexOf('node tests/phase60-full-tests-harness.test.js')
  < rootCommands.indexOf('node tests/delegation-routing.test.js'),
'the fail-safe workspace harness runs before Phase 61 focused gates');
check(rootCommands.indexOf('node tests/delegation-phase-contract.test.js')
  < rootCommands.indexOf('npm --prefix mcp run build'),
'the artifact contract runs before the existing compiled MCP gate');

console.log('\n--- roadmap goal, requirements, decisions, and threats ---');

const phaseRoadmap = between(roadmap,
  '### Phase 61: Delegation UX & SW-Eviction Persistence',
  '### Phase 62: CI Drift-Smoke Gate & Doctor Extensions');
for (const token of [
  'first-class delegation surface',
  'first-use consent gate',
  'live per-tool-call streaming feed',
  'Take control',
  'kill switch',
  'post-run usage summary',
  'chrome.storage.session',
  'every 20 s',
  'Agent offline',
  'never re-adopts',
]) {
  check(phaseRoadmap.includes(token), `roadmap Phase 61 goal/success contract retains ${token}`);
}
check((phaseRoadmap.match(/^  \d+\. /gm) || []).length === 6, 'roadmap retains exactly six observable success criteria');

const requirementIds = Array.from(requirements.matchAll(/^- \[x\] \*\*((?:UX|LIFE)-\d{2})\*\*:/gm),
  (match) => match[1]);
equal(requirementIds, [
  'UX-01', 'UX-02', 'UX-03', 'UX-04', 'UX-05', 'UX-06',
  'LIFE-01', 'LIFE-02', 'LIFE-03', 'LIFE-04',
], 'all ten Phase 61 requirements are present and complete');

const requirementEvidence = Object.freeze({
  'UX-01': [['extension/ai/engine-config.js', /delegated:\s*\{/], ['tests/delegation-routing.test.js', /exactly the fifth named execution mode/]],
  'UX-02': [['extension/ui/delegation-feed.js', /renderEntry/], ['tests/delegation-sidepanel-ui.test.js', /hostile metadata remains inert text/]],
  'UX-03': [['extension/utils/delegation-consent.js', /consumeChallenge/], ['tests/delegation-consent.test.js', /serialized concurrent consume/]],
  'UX-04': [['extension/utils/delegation-controller.js', /releasedTabCount/], ['tests/delegation-controller.test.js', /duplicate stop coalesce/]],
  'UX-05': [['extension/utils/agent-registry.js', /holdLease/], ['tests/delegation-controller.test.js', /seal every owned tab|seals every owned tab/]],
  'UX-06': [['extension/ui/delegation-feed.js', /Included in your subscription/], ['tests/delegation-event-store.test.js', /toolCalls/]],
  'LIFE-01': [['extension/utils/delegation-event-store.js', /appendBeforeFanout/], ['tests/delegation-event-store.test.js', /append returns only after the durable write resolves/]],
  'LIFE-02': [['extension/ws/mcp-bridge-client.js', /retainDelegationHeartbeat/], ['tests/mcp-bridge-client-lifecycle.test.js', /three consecutive/]],
  'LIFE-03': [['extension/utils/delegation-preflight.js', /agent_offline/], ['tests/delegation-sidepanel-ui.test.js', /Agent offline/]],
  'LIFE-04': [['mcp/src/agent-providers/runtime-files.ts', /daemon_restart_lost_run/], ['tests/delegation-controller.test.js', /disconnected reconciliation sends no status request/]],
});
for (const id of requirementIds) checkEvidence(id, requirementEvidence[id]);

const decisionIds = Array.from(context.matchAll(/\*\*D-(\d{2}):\*\*/g), (match) => `D-${match[1]}`);
equal(decisionIds, Array.from({ length: 28 }, (_, index) => `D-${String(index + 1).padStart(2, '0')}`),
  'context enumerates every decision D-01 through D-28 exactly once');

const decisionEvidence = Object.freeze({
  'D-01': [['extension/utils/delegation-preflight.js', /providerKind/]],
  'D-02': [['extension/ai/engine-config.js', /eventSilenceMs/]],
  'D-03': [['tests/mcp-bridge-background-dispatch.test.js', /agent provider branch precedes/]],
  'D-04': [['extension/utils/delegation-consent.js', /consumeChallenge/]],
  'D-05': [['tests/delegation-sidepanel-ui.test.js', /It cannot edit files, run shell commands, or fetch arbitrary URLs/]],
  'D-06': [['extension/utils/delegation-controller.js', /Background-owned delegation lifecycle authority/]],
  'D-07': [['extension/utils/delegation-event-store.js', /write-before-fanout/]],
  'D-08': [['extension/utils/delegation-event-store.js', /MAX_ENTRY_BYTES = 4 \* 1024/]],
  'D-09': [['extension/ws/mcp-bridge-client.js', /eventTail/]],
  'D-10': [['extension/utils/delegation-event-store.js', /INIT_KEYS.*TOOL_KEYS.*RETRY_KEYS/s]],
  'D-11': [['tests/delegation-sidepanel-ui.test.js', /hydrated history never reaches the live announcer/]],
  'D-12': [['tests/open-tab-background-default.test.js', /background/]],
  'D-13': [['mcp/src/agent-scope.ts', /FSB_DELEGATION_ID/]],
  'D-14': [['mcp/src/agent-providers/spawn-supervisor.ts', /SIGSTOP/]],
  'D-15': [['extension/utils/agent-registry.js', /_holdLeases/]],
  'D-16': [['tests/delegation-controller.test.js', /releasedTabCount/]],
  'D-17': [['extension/utils/agent-registry.js', /releaseDelegation/]],
  'D-18': [['extension/ui/delegation-feed.js', /billingKind === 'subscription'/]],
  'D-19': [['extension/ui/sidepanel.css', /var\(--fsb-surface-elevated\)/]],
  'D-20': [['extension/ws/mcp-bridge-client.js', /DELEGATION_HEARTBEAT_INTERVAL_MS = 20000/]],
  'D-21': [['extension/manifest.json', /"minimum_chrome_version": "116"/]],
  'D-22': [['extension/ui/sidepanel.js', /Copy doctor command/]],
  'D-23': [['mcp/src/agent-providers/runtime-files.ts', /recoveryRequired/]],
  'D-24': [['tests/delegation-controller.test.js', /without replay|no replay/i]],
  'D-25': [['.planning/phases/61-delegation-ux-sw-eviction-persistence/61-HUMAN-UAT.md', /service-worker eviction/]],
  'D-26': [['tests/mcp-version-parity.test.js', /Phase 61 Chrome 116 and no-native boundary/]],
  'D-27': [['.planning/phases/61-delegation-ux-sw-eviction-persistence/61-VALIDATION.md', /After every task commit/]],
  'D-28': [[UAT_PATH, /Every case above remains `human_needed` and pending/]],
});
for (const id of decisionIds) checkEvidence(id, decisionEvidence[id]);

const threatIds = Array.from(research.matchAll(/^\| (T61-\d{2}) /gm), (match) => match[1]);
equal(threatIds, Array.from({ length: 14 }, (_, index) => `T61-${String(index + 1).padStart(2, '0')}`),
  'research enumerates every threat T61-01 through T61-14 exactly once');

const threatEvidence = Object.freeze({
  'T61-01': [['tests/delegation-consent.test.js', /challenge_not_found/]],
  'T61-02': [['tests/delegation-routing.test.js', /unsupported_provider/]],
  'T61-03': [['tests/delegation-event-store.test.js', /append returns only after the durable write resolves/]],
  'T61-04': [['tests/delegation-event-store.test.js', /secretCanary/]],
  'T61-05': [['tests/agent-scope.test.js', /FSB_DELEGATION_ID/]],
  'T61-06': [['tests/agent-registry.test.js', /releaseDelegation/]],
  'T61-07': [['tests/mcp-spawn-supervisor.test.js', /SIGSTOP/]],
  'T61-08': [['tests/delegation-controller.test.js', /duplicate stop coalesce/]],
  'T61-09': [['tests/mcp-agent-orphan-recovery.test.js', /daemon_restart_lost_run/]],
  'T61-10': [['tests/mcp-bridge-client-lifecycle.test.js', /three consecutive/]],
  'T61-11': [['tests/delegation-sidepanel-ui.test.js', /no held state before authority replies/]],
  'T61-12': [['tests/mcp-version-parity.test.js', /\['nativeMessaging', 'downloads'\]/]],
  'T61-13': [['tests/delegation-controller.test.js', /forced module reload hydrates/]],
  'T61-14': [['tests/delegation-sidepanel-ui.test.js', /hostile metadata remains inert text/]],
});
for (const id of threatIds) checkEvidence(id, threatEvidence[id]);

console.log('\n--- closed schemas, architecture links, patterns, and pitfalls ---');

const closedSchemaEvidence = Object.freeze({
  'preflight exact provider namespace': [['extension/utils/delegation-preflight.js', /API_PROVIDER_IDS = Object\.freeze/]],
  'one-use challenge record': [['extension/utils/delegation-consent.js', /RECORD_KEYS = Object\.freeze/]],
  'ledger entry/envelope': [['extension/utils/delegation-event-store.js', /ENTRY_KEYS = \[/], ['extension/utils/delegation-event-store.js', /ENVELOPE_KEYS = \[/]],
  'typed init client profile model session allowed tools': [['extension/utils/delegation-event-store.js', /INIT_KEYS = \['allowedTools', 'client', 'model', 'profileVersion', 'sessionId'\]/]],
  'typed tool status': [['extension/utils/delegation-event-store.js', /VALID_TOOL_STATUSES = Object\.freeze/]],
  'typed retry': [['extension/utils/delegation-event-store.js', /VALID_RETRY_CLASSES = Object\.freeze/]],
  'closed terminal mapping': [['extension/utils/delegation-event-store.js', /VALID_TERMINAL_CODES = Object\.freeze/]],
  'controller snapshot': [['extension/utils/delegation-controller.js', /SNAPSHOT_VERSION = 1/]],
  'heartbeat nonce': [['extension/ws/mcp-bridge-client.js', /nonce/], ['mcp/src/bridge.ts', /mcp:pong/]],
  'registration sidecar': [['mcp/src/agent-scope.ts', /delegationId\?: string/]],
  'sealed hold lease': [['extension/utils/agent-registry.js', /_holdLeases = new Map/]],
  'strict supervisor lifecycle': [['mcp/src/agent-providers/spawn-supervisor.ts', /STATUS_PAYLOAD_KEYS = Object\.freeze\(\[\]\)/]],
  'restart disposition': [['mcp/src/agent-providers/runtime-files.ts', /RECOVERY_DISPOSITION_KEYS = Object\.freeze/]],
  'text-only feed snapshot': [['extension/ui/delegation-feed.js', /_hasExactKeys\(snapshot/], ['extension/ui/delegation-feed.js', /createTextNode/]],
});
for (const [label, rows] of Object.entries(closedSchemaEvidence)) checkEvidence(label, rows);

const architectureLinks = Object.freeze({
  'config to preflight': [['extension/config/config.js', /providerKind/], ['extension/utils/delegation-preflight.js', /agentProviderId/]],
  'background to controller': [['extension/background.js', /FsbDelegationController/]],
  'controller to persisted store': [['extension/utils/delegation-controller.js', /appendBeforeFanout/]],
  'bridge to exact daemon pong': [['extension/ws/mcp-bridge-client.js', /mcp:ping/], ['mcp/src/bridge.ts', /mcp:pong/]],
  'AgentScope to registration dispatcher': [['mcp/src/agent-scope.ts', /FSB_DELEGATION_ID/], ['extension/ws/mcp-tool-dispatcher.js', /bindRegisteredAgent/]],
  'controller to exact registry cleanup': [['extension/utils/delegation-controller.js', /releaseDelegation/], ['extension/utils/agent-registry.js', /releaseDelegation/]],
  'serve routes to one supervisor': [['mcp/src/agent-providers/serve-delegation.ts', /supervisor\.handle/], ['mcp/src/agent-providers/spawn-supervisor.ts', /delegate\.status/]],
  'recovery journal to generation status': [['mcp/src/agent-providers/runtime-files.ts', /restartLosses/], ['mcp/src/agent-providers/spawn-supervisor.ts', /restartLosses/]],
  'Providers clear to background authority': [['extension/ui/options.js', /FSB_DELEGATION_CLEAR_TRUST/], ['extension/background.js', /FSB_DELEGATION_CLEAR_TRUST/]],
  'side panel to controller snapshots': [['extension/ui/sidepanel.js', /FSB_DELEGATION_SNAPSHOT/]],
  'canonical ledger to text-only feed': [['extension/utils/delegation-event-store.js', /ENTRY_KEYS/], ['extension/ui/delegation-feed.js', /textContent/]],
});
for (const [label, rows] of Object.entries(architectureLinks)) checkEvidence(label, rows);

const researchPitfalls = [
  'Returning an immediate start acknowledgement',
  'Treating panel `confirmed: true` as consent',
  'Updating in-memory feed before storage resolves',
  'Ordinary `releaseTab` cannot model human hold',
  'Resuming the OS process before ownership restoration',
  'Releasing all current-agent tabs without a delegation mapping',
  'A socket close is not daemon restart proof',
  'One ping timer per panel/delegation',
  '`unlimitedStorage` does not remove',
  'Rehydrating chat history as a feed',
  'UI copy such as “restart daemon”',
  'Adding Phase 62/63 compatibility-matrix or native wake behavior',
];
for (const pitfall of researchPitfalls) check(research.includes(pitfall), `research pitfall remains explicit: ${pitfall}`);
check((between(research, '## Planning Traps', '## Official References').match(/^\d+\. /gm) || []).length === 12,
  'research retains exactly twelve planning traps');

const concretePatterns = [
  'Classic-script global modules',
  'Background import order is a dependency graph',
  'Pending correlation lifecycle',
  'Exact strict supervisor parsers',
  'AgentScope additive registration payload',
  'Registration stamping',
  'Registry lock, hydrate, and deadline recovery',
  'Storage envelope validation',
  'Redaction and DOM safety',
  'Existing open-tab policy',
  'Side-panel state and accessibility',
  'Same-context service-worker dispatch',
  'Test harness selection',
];
for (const pattern of concretePatterns) check(patterns.includes(pattern), `pattern map retains ${pattern}`);
check((between(patterns, '## Concrete Existing Patterns', '## Shared Patterns').match(/^### \d+\./gm) || []).length === 13,
  'pattern map retains exactly thirteen concrete implementation patterns');

console.log('\n--- UI state, copy, focus, accessibility, and responsive evidence ---');

for (const state of [
  'Ready/API provider', 'Agent ready, consent required', 'Agent trusted, preflight ready',
  'Starting', 'Running in background', 'Driven tab active', 'Human control held',
  'Stopping', 'Completed/failed/stopped', 'Offline before start',
  'Three missed heartbeats', 'Daemon restart lost run',
]) {
  check(uiSpec.includes(`| ${state} |`), `UI state matrix retains ${state}`);
}

for (const copy of [
  'Let {CLI} control this browser?',
  '{CLI} may drive FSB browser tools for this task.',
  'It cannot edit files, run shell commands, or fetch arbitrary URLs.',
  'Allow & start {CLI}',
  'Back to message',
  'Trust {CLI} for future runs',
  'Take control',
  'Resume with agent',
  'Stop agent',
  'Stopping agent…',
  'Agent offline',
  'Copy doctor command',
  'Open provider setup',
  'Agent connection lost',
  'Agent run ended after daemon restart',
  'Included in your subscription',
  'Show tool-call breakdown',
  'Not reported',
]) {
  check(uiSpec.includes(copy), `approved UI copy remains exact: ${copy}`);
}

for (const focusOrA11y of [
  'Consent activation moves focus to the consent heading',
  'Declining returns focus to the unchanged composer',
  'moves focus to `Resume with agent`',
  'aria-busy="true"',
  'role="alert"',
  'aria-live="polite"',
  'semantic `<article>`',
  'native `<details>/<summary>`',
]) {
  check(uiSpec.includes(focusOrA11y), `UI focus/a11y contract retains ${focusOrA11y}`);
}

const sidepanelCss = read('extension/ui/sidepanel.css');
check(/@media \(max-width: 350px\)/.test(sidepanelCss), 'implemented UI has the narrow breakpoint');
check(/@media \(min-width: 500px\)/.test(sidepanelCss), 'implemented UI has the wide breakpoint');
check(/\[data-theme="dark"\] \.delegation/.test(sidepanelCss), 'implemented UI uses its existing dark-theme mapping');
check(/@media \(prefers-reduced-motion: reduce\)/.test(sidepanelCss), 'implemented UI has reduced-motion handling');
check(/var\(--fsb-(?:surface|primary|success|warning|danger)/.test(sidepanelCss), 'implemented UI reuses FSB semantic tokens');

console.log('\n--- forbidden delegation authority and presentation patterns ---');

const manifest = JSON.parse(read('extension/manifest.json'));
check(!manifest.permissions.includes('nativeMessaging'), 'extension manifest still has no nativeMessaging permission');
const extensionAuthorityScope = [
  'extension/utils/delegation-preflight.js',
  'extension/utils/delegation-consent.js',
  'extension/utils/delegation-event-store.js',
  'extension/utils/delegation-controller.js',
  'extension/ui/delegation-feed.js',
  'extension/ui/sidepanel.js',
  'extension/ui/options.js',
  'extension/ws/mcp-bridge-client.js',
].map(read).join('\n');
for (const pattern of [
  /chrome\.runtime\.(?:connectNative|sendNativeMessage)\s*\(/,
  /\brequire\(['"]child_process['"]\)/,
  /\b(?:execFile|execSync|spawn|spawnSync|fork)\s*\(/,
  /\b(?:shell|terminal):\/\//i,
]) {
  check(!pattern.test(extensionAuthorityScope), `extension delegation has no native/shell/process authority matching ${pattern}`);
}

const startFunction = extractFunction(read('extension/background.js'), 'fsbDelegationStartCommand');
check(startFunction.includes("fsbDelegationHasExactKeys(request, ['challengeId', 'task', 'type'])"),
  'start accepts only challenge id, task, and type');
check(!/confirmed|consent\s*:|trusted\s*:/.test(startFunction),
  'caller confirmation/trust booleans cannot authorize start');
check(!/fallback/i.test(read('extension/utils/delegation-preflight.js')),
  'provider preflight has no agent-to-API fallback');

const eventStoreSource = read('extension/utils/delegation-event-store.js');
const feedSource = read('extension/ui/delegation-feed.js');
check(!/raw(?:Claude|Provider|Event)|providerPayload/.test(eventStoreSource + feedSource),
  'raw provider/Claude payloads are neither persisted nor rendered');
check(!/innerHTML|insertAdjacentHTML|outerHTML/.test(feedSource),
  'delegation feed has no unsafe HTML sink');
check(/textContent/.test(feedSource) && /createTextNode/.test(feedSource),
  'delegation feed uses text-only DOM sinks');
check(!/JSON\.parse\([^\n]*(?:title|detail)|switch\s*\([^\n]*(?:title|detail)/.test(feedSource),
  'presentation title/detail fields are never parsed as authority data');
check(/VALID_TERMINAL_CODES = Object\.freeze/.test(eventStoreSource)
  && /VALID_TERMINAL_CODES = Object\.freeze/.test(feedSource),
'terminal codes are closed in both persistence and presentation');

const bridgeSource = read('extension/ws/mcp-bridge-client.js');
check(/eventTail/.test(bridgeSource) && /pending\.eventTail|eventTail =/.test(bridgeSource),
  'observer failure/order state remains per pending correlation');
check(!/chrome\.tabs\.query\(\s*\{\s*active\s*:\s*true/.test(read('extension/utils/agent-registry.js')),
  'registry never derives delegation authority from the active tab');
check(/sealHoldLease/.test(read('extension/utils/agent-registry.js'))
  && /mappedTabIds|tabIds/.test(read('extension/utils/agent-registry.js')),
'hold leases represent the complete mapped tab set, not one active tab');
check(/bindRegisteredAgent/.test(read('extension/ws/mcp-tool-dispatcher.js'))
  && /rollback|releaseAgent/.test(read('extension/ws/mcp-tool-dispatcher.js')),
'unauthorized delegation registration is gated and rolled back');

check(/Automated\/source verification remains blocking now/.test(validation),
  'validation explicitly keeps deterministic failures blocking');
check(/All manual checks remain `human_needed`/.test(validation),
  'validation links all manual-only checks to the milestone-end policy');
check(validation.includes('61-HUMAN-UAT.md') || uat.includes('single v0.9.91 milestone-end execution'),
  'validation/UAT artifacts form one explicit milestone-end live ledger');

console.log(`\n=== Phase 61 contract results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
