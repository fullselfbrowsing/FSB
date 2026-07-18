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
const PHASE62_DIR = '.planning/phases/62-ci-drift-smoke-gate-doctor-extensions';
const PHASE62_VALIDATION_PATH = `${PHASE62_DIR}/62-VALIDATION.md`;
const PHASE62_UAT_PATH = `${PHASE62_DIR}/62-HUMAN-UAT.md`;
const PRE_PHASE62_ROOT_TEST_HASH = 'cc320c1dfb3fefb292ebb8edc789993ec5fcd42a2b2ec2a057a37d4c49281808';
const PHASE63_DIR = '.planning/phases/63-native-messaging-host';
const PHASE63_UAT_PATH = `${PHASE63_DIR}/63-HUMAN-UAT.md`;

const PHASE61_NEW_TEST_COMMANDS = Object.freeze([
  'node tests/delegation-routing.test.js',
  'node tests/delegation-consent.test.js',
  'node tests/delegation-event-store.test.js',
  'node tests/delegation-controller.test.js',
  'node tests/delegation-sidepanel-ui.test.js',
  'node tests/delegation-phase-contract.test.js',
]);

const PHASE62_NEW_TEST_COMMANDS = Object.freeze([
  'node tests/mcp-adapter-compatibility.test.js',
  'node tests/mcp-agent-drift-smoke.test.js',
  'node tests/agent-protocol-drift-diagnostics.test.js',
]);

const PHASE63_NEW_TEST_COMMANDS = Object.freeze([
  'node tests/mcp-native-host-packaging.test.js --section workflow-and-pack',
  'node tests/mcp-native-host-protocol.test.js',
  'node tests/mcp-native-host-daemon.test.js',
  'node tests/mcp-native-host-install.test.js',
  'node tests/native-host-background-wake.test.js',
]);

const PHASE62_EXPECTED_TASKS = Object.freeze([
  ['62-01-01', 'npm --prefix mcp run build && node tests/mcp-adapter-compatibility.test.js'],
  ['62-01-02', 'npm --prefix mcp run build && node tests/mcp-claude-code-adapter.test.js && node tests/mcp-adapter-compatibility.test.js'],
  ['62-01-03', 'npm --prefix mcp run build && node tests/mcp-agent-drift-smoke.test.js && node tests/mcp-agent-stream-fixture.test.js'],
  ['62-02-01', 'npm --prefix mcp run build && node tests/mcp-diagnostics-status.test.js && node tests/mcp-bridge-auth.test.js'],
  ['62-02-02', 'npm --prefix mcp run build && node tests/mcp-diagnostics-status.test.js && node tests/mcp-version-parity.test.js'],
  ['62-03-01', 'npm --prefix mcp run build && node tests/mcp-reverse-channel-contract.test.js && node tests/mcp-bridge-topology.test.js'],
  ['62-03-02', 'node tests/mcp-agent-providers-storage.test.js && node tests/mcp-bridge-background-dispatch.test.js'],
  ['62-03-03', 'node tests/mcp-bridge-client-lifecycle.test.js && node tests/mcp-bridge-background-dispatch.test.js && node tests/mcp-agent-providers-storage.test.js'],
  ['62-04-01', 'npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-reverse-channel-contract.test.js'],
  ['62-04-02', 'node tests/agent-protocol-drift-diagnostics.test.js && node tests/redact-for-log.test.js && node tests/diagnostics-ring-buffer.test.js'],
  ['62-04-03', 'node tests/agent-protocol-drift-diagnostics.test.js && node tests/mcp-bridge-background-dispatch.test.js && npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js'],
  ['62-05-01', 'node tests/providers-panel-logic.test.js'],
  ['62-05-02', 'node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js'],
  ['62-05-03', 'node tests/providers-panel-ui.test.js'],
  ['62-06-01', `node -e "const p=require('./package.json');const s=p.scripts&&p.scripts.test||'';for(const x of ['node tests/mcp-adapter-compatibility.test.js','node tests/mcp-agent-drift-smoke.test.js','node tests/agent-protocol-drift-diagnostics.test.js'])if(s.split(x).length-1!==1)process.exit(1)"`],
  ['62-06-02', 'node tests/delegation-phase-contract.test.js && node tests/mcp-adapter-compatibility.test.js && node tests/mcp-reverse-channel-contract.test.js && node tests/providers-panel-logic.test.js'],
  ['62-06-03', 'node tests/delegation-phase-contract.test.js'],
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

function extractFrozenTrueKeys(source, name) {
  const start = source.indexOf(`${name} = Object.freeze({`);
  if (start < 0) return [];
  const end = source.indexOf('\n  });', start);
  if (end < 0) return [];
  return Array.from(
    source.slice(start, end).matchAll(/^\s+(?:'([^']+)'|([A-Za-z][A-Za-z0-9_-]*)):\s*true,?$/gm),
    (match) => match[1] || match[2],
  );
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

function runPhase63UatLedgerContract() {
  console.log('\n--- Phase 63 milestone-end human UAT ledger ---');

  check(exists(PHASE63_UAT_PATH), 'Phase 63 human UAT ledger exists');
  if (!exists(PHASE63_UAT_PATH)) return;

  const phase63Uat = read(PHASE63_UAT_PATH);
  check(/^phase: 63$/m.test(phase63Uat)
    && /^status: human_needed$/m.test(phase63Uat)
    && /^deferred_until: milestone-end$/m.test(phase63Uat)
    && /^deferred_by: user$/m.test(phase63Uat)
    && /^results_recorded: false$/m.test(phase63Uat)
    && /^live_checks: 8$/m.test(phase63Uat),
  'Phase 63 ledger frontmatter remains an unexecuted eight-check milestone-end queue');
  check(phase63Uat.includes('single v0.9.91 milestone-end sweep')
    && phase63Uat.includes('none is live UAT')
    && phase63Uat.includes('none may check off a heading or populate a result or evidence field'),
  'the ledger explicitly preserves the user-directed single v0.9.91 deferral');
  for (const nonLiveEvidence of [
    'Source inspection',
    'synthetic DOM tests',
    'mocked native framing',
    'platform-adapter tests',
    'packed-artifact checks',
  ]) {
    check(phase63Uat.includes(nonLiveEvidence),
      `ledger refuses to treat ${nonLiveEvidence} as live UAT`);
  }

  const headings = Array.from(
    phase63Uat.matchAll(/^### \[([^\]]*)\] (UAT63-\d{2})\b[^\n]*$/gm),
    (match) => ({ marker: match[1], id: match[2] }),
  );
  equal(headings, Array.from({ length: 8 }, (_, index) => ({
    marker: ' ',
    id: `UAT63-${String(index + 1).padStart(2, '0')}`,
  })), 'Phase 63 ledger contains exactly eight ordered unchecked UAT ids');

  const blocks = phase63Uat.split(/^### \[ \] /m).slice(1);
  check(blocks.length === 8, 'each Phase 63 UAT heading owns exactly one scenario block');
  for (const block of blocks) {
    const id = (block.match(/^(UAT63-\d{2})\b/) || [null, 'unknown'])[1];
    check(exactOccurrences(block, 'status: human_needed') === 1,
      `${id} remains status: human_needed`);
    check(exactOccurrences(block, 'result: pending') === 1,
      `${id} remains result: pending`);
    check(/^evidence:[ \t]*\n[ \t]*\nreferences:/m.test(block),
      `${id} keeps its evidence field empty`);
    check(/^prerequisites:\s+\S+/m.test(block)
      && /^steps:\s*$/m.test(block)
      && /^expected:\s+\S+/m.test(block),
    `${id} retains prerequisites, steps, and an expected result`);
  }
  check(exactOccurrences(phase63Uat, 'status: human_needed') === 9
    && exactOccurrences(phase63Uat, 'result: pending') === 8
    && exactOccurrences(phase63Uat, 'evidence:') === 8,
  'ledger field counts are exact, including its human-needed frontmatter');
  check(!/^### \[[^ ]\] UAT63-/m.test(phase63Uat)
    && !/^status:\s*(?:complete|green)\b/im.test(phase63Uat)
    && !/^result:\s*(?!pending\s*$)\S+/im.test(phase63Uat)
    && !/^evidence:[ \t]+\S+/m.test(phase63Uat)
    && !/^evidence:[ \t]*\n(?![ \t]*\nreferences:)/m.test(phase63Uat),
  'ledger contains no checked marker, completed field, nonpending result, or populated evidence');

  const scenarioTokens = [
    ['UAT63-01', ['macOS published-id', 'silent boot probe', 'daemon already running', 'text and JSON doctor', 'uninstall']],
    ['UAT63-02', ['macOS unpacked explicit id', 'known explicit extension id', 'allowlist mismatch', 'refused']],
    ['UAT63-03', ['Linux Google Chrome', 'user-scope native host', 'offline delegation', 'already running', 'exact-owned cleanup']],
    ['UAT63-04', ['Windows x64', 'HKCU 64-bit-view shadow', '32-bit view', 'packaged `.exe`', 'never use HKLM']],
    ['UAT63-05', ['Windows arm64', 'packaged arm64', 'parent-window', 'inherited native streams', 'exit propagation']],
    ['UAT63-06', ['Published and unpacked Chrome', 'host missing', 'malformed reply', 'timeout', 'wrong-product', 'ready', 'unpaired', 'never replay']],
    ['UAT63-07', ['light and dark themes', '`<=350px`', 'browser zoom', 'forced-colors', 'reduced motion']],
    ['UAT63-08', ['Keyboard focus', 'screen reader', 'shared live region', 'causal order', 'cold hydration remains silent']],
  ];
  for (let index = 0; index < scenarioTokens.length; index += 1) {
    const [id, tokens] = scenarioTokens[index];
    const block = blocks[index] || '';
    for (const token of tokens) {
      check(block.toLowerCase().includes(token.toLowerCase()),
        `${id} retains genuine scenario coverage: ${token}`);
    }
  }

  const phase63Plans = fs.readdirSync(path.join(ROOT, PHASE63_DIR))
    .filter((name) => /^63-\d{2}-PLAN\.md$/.test(name))
    .map((name) => read(`${PHASE63_DIR}/${name}`));
  check(phase63Plans.length === 12
    && phase63Plans.every((plan) => !/<task\s+type=["']checkpoint/.test(plan)),
  'all twelve Phase 63 plans remain free of blocking checkpoints');
}

const sectionArgs = process.argv.slice(2);
if (sectionArgs.length > 0) {
  if (sectionArgs.length !== 2
      || sectionArgs[0] !== '--section'
      || sectionArgs[1] !== 'phase63-uat-ledger') {
    console.error('Usage: node tests/delegation-phase-contract.test.js [--section phase63-uat-ledger]');
    process.exit(2);
  }
  runPhase63UatLedgerContract();
  console.log(`\n=== Phase 63 UAT ledger results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runPhase63UatLedgerContract();

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
const prePhase61Commands = rootCommands.filter((command) => (
  !PHASE61_NEW_TEST_COMMANDS.includes(command)
  && !PHASE62_NEW_TEST_COMMANDS.includes(command)
  && !PHASE63_NEW_TEST_COMMANDS.includes(command)
));
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
  'D-26': [['tests/mcp-version-parity.test.js', /Phase 61 Chrome 116 and Phase 63 native permission boundary/]],
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
  'T61-12': [['tests/mcp-version-parity.test.js', /nativeMessaging permission appears exactly once/]],
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

const auditedEventStoreSource = read('extension/utils/delegation-event-store.js');
const auditedFeedSource = read('extension/ui/delegation-feed.js');
const auditedControllerSource = read('extension/utils/delegation-controller.js');
const auditedRegistrySource = read('extension/utils/agent-registry.js');
const auditedBridgeSource = read('extension/ws/mcp-bridge-client.js');

for (const constant of [
  'MAX_ENTRIES_PER_DELEGATION = 2000',
  'MAX_ENTRY_BYTES = 4 * 1024',
  'MAX_AGGREGATE_BYTES = 6 * 1024 * 1024',
  'MAX_PRESENTATION_CHARS = 256',
  'MAX_ID_CHARS = 128',
  'MAX_TOOL_NAME_CHARS = 128',
  'MAX_ALLOWED_TOOL_CHARS = 96',
  'MAX_ALLOWED_TOOLS = 16',
  'MAX_TOOL_COUNT_ROWS = 128',
]) {
  check(auditedEventStoreSource.includes(constant), `delegation ledger retains exact bound ${constant}`);
}
for (const [source, constant] of [
  [auditedControllerSource, 'WALL_CLOCK_TIMEOUT_MS = 45 * 60 * 1000'],
  [auditedControllerSource, 'EVENT_SILENCE_TIMEOUT_MS = 120 * 1000'],
  [auditedControllerSource, 'HOLD_LEASE_MS = 5 * 60 * 1000'],
  [auditedRegistrySource, 'FSB_HOLD_LEASE_MS = 5 * 60 * 1000'],
  [auditedBridgeSource, 'DELEGATION_HEARTBEAT_INTERVAL_MS = 20000'],
  [auditedBridgeSource, 'DELEGATION_HEARTBEAT_MISS_LIMIT = 3'],
]) {
  check(source.includes(constant), `delegation lifecycle retains exact constant ${constant}`);
}

const terminalCodes = [
  'completed', 'stopped', 'cancelled', 'start_rejected', 'wall_clock_timeout',
  'event_silence_timeout', 'delegation_persistence_failed', 'delegation_quota_exceeded',
  'delegation_ledger_corrupt', 'route_lost', 'agent_offline', 'agent_unpaired',
  'unsupported_provider', 'hold_expired', 'resume_ownership_lost',
  'daemon_restart_lost_run', 'agent_protocol_drift', 'tree_unsettled', 'agent_failed',
  'unknown_failure',
];
equal(extractFrozenTrueKeys(auditedEventStoreSource, 'VALID_TERMINAL_CODES'), terminalCodes,
  'persistence retains the exact closed terminal-code set');
equal(extractFrozenTrueKeys(auditedFeedSource, 'VALID_TERMINAL_CODES'), terminalCodes,
  'presentation retains the exact same closed terminal-code set');
equal(extractFrozenTrueKeys(auditedControllerSource, 'VALID_TERMINAL_CODES'), terminalCodes,
  'controller retains the exact same closed terminal-code set');

check(/var expectedInit = entry\.kind === 'init';[\s\S]*var expectedTool = entry\.kind === 'tool-call';[\s\S]*var expectedRetry = entry\.kind === 'retry';[\s\S]*var expectedMetrics = entry\.kind === 'result';/.test(auditedEventStoreSource),
  'ledger derives every typed payload slot only from the closed kind');
check(/\(entry\.init !== null\) !== expectedInit[\s\S]*\(entry\.tool !== null\) !== expectedTool[\s\S]*\(entry\.retry !== null\) !== expectedRetry[\s\S]*\(entry\.metrics !== null\) !== expectedMetrics/.test(auditedEventStoreSource),
  'ledger rejects every kind/payload exclusivity mismatch');
check(/_hasExactKeys\(value, INIT_KEYS\)/.test(auditedEventStoreSource)
  && /_hasExactKeys\(value\.client, CLIENT_KEYS\)/.test(auditedEventStoreSource)
  && /\['profileVersion', 'model', 'sessionId'\]/.test(auditedEventStoreSource)
  && /allowedTools\.length > MAX_ALLOWED_TOOLS/.test(auditedEventStoreSource),
'init client/profile/model/session/allowed-tools fields receive dedicated closed validation');
check(/_hasExactKeys\(value, TOOL_KEYS\)[\s\S]*_hasOwn\(VALID_TOOL_STATUSES, value\.status\)/.test(auditedEventStoreSource),
  'tool-call payload and status receive dedicated closed validation');
check(/_hasExactKeys\(value, RETRY_KEYS\)[\s\S]*_hasOwn\(VALID_RETRY_CLASSES, value\.class\)/.test(auditedEventStoreSource),
  'retry payload and class receive dedicated closed validation');

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
check(
  manifest.permissions.filter((permission) => permission === 'nativeMessaging').length === 1,
  'Phase 63 adds exactly one nativeMessaging permission',
);
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

const backgroundSource = read('extension/background.js');
const sidepanelSource = read('extension/ui/sidepanel.js');
const optionsSource = read('extension/ui/options.js');
const setTrustFunction = extractFunction(backgroundSource, 'fsbDelegationSetTrustCommand');
const clearTrustFunction = extractFunction(backgroundSource, 'fsbDelegationClearTrustCommand');
const sidepanelTrustFunction = extractFunction(sidepanelSource, '_allowDelegationFromConsent');
const optionsClearTrustFunction = extractFunction(optionsSource, 'clearDelegationTrust');
check(setTrustFunction.includes("fsbDelegationHasExactKeys(request, ['challengeId', 'providerId', 'trusted', 'type'])")
  && setTrustFunction.indexOf('fsbDelegationPreflightResult')
    < setTrustFunction.indexOf('writeTrustFromChallenge')
  && setTrustFunction.includes('trusted: true'),
'trust enable requires the exact true, provider-bound challenge after authoritative preflight');
check(!/chrome\.storage|localStorage|setTrusted\s*\(/.test(setTrustFunction),
  'trust enable cannot bypass the challenge-bound consent primitive');
check(sidepanelTrustFunction.includes("type: 'FSB_DELEGATION_SET_TRUST'")
  && sidepanelTrustFunction.indexOf('await _sendDelegationCommand')
    < sidepanelTrustFunction.indexOf('await _beginDelegationStart(null)')
  && !/FSB_DELEGATION_START[\s\S]{0,180}(?:trusted|consent)/.test(sidepanelTrustFunction),
'checked trust waits for separate background authority before a boolean-free start');
check(startFunction.indexOf('issueChallenge') < startFunction.indexOf('consumeChallenge')
  && startFunction.indexOf('consumeChallenge') < startFunction.indexOf("sendExtRequest(\n      'delegate.start'"),
'trusted and untrusted starts consume one exact task-bound challenge before transport');
check(clearTrustFunction.includes("fsbDelegationHasExactKeys(request, ['providerId', 'type'])")
  && clearTrustFunction.includes('FsbDelegationConsent.clearTrusted')
  && !/(?:issueChallenge|consumeChallenge|writeTrustFromChallenge|controller|delegate\.start)/.test(clearTrustFunction),
'background clear is the canonical Providers-only authority-reducing path');
check(/chrome\.runtime\.sendMessage\(\{\s*type: 'FSB_DELEGATION_CLEAR_TRUST',\s*providerId: 'claude-code'\s*\}\)/.test(optionsClearTrustFunction)
  && !/chrome\.storage|localStorage|saveSettings|markUnsavedChanges/.test(optionsClearTrustFunction),
'Providers clears trust through one runtime command with no direct storage mutation');
check(/clear does not consume the fresh challenge required after trust is removed/.test(read('tests/delegation-consent.test.js'))
  && /untrusted consent mints a background challenge/.test(read('tests/mcp-bridge-background-dispatch.test.js')),
'cleared trust deterministically restores fresh consent on the next run');

const eventStoreSource = read('extension/utils/delegation-event-store.js');
const feedSource = read('extension/ui/delegation-feed.js');
check(!/raw(?:Claude|Provider|Event)|providerPayload/.test(eventStoreSource + feedSource),
  'raw provider/Claude payloads are neither persisted nor rendered');
check(!/innerHTML|insertAdjacentHTML|outerHTML/.test(feedSource),
  'delegation feed has no unsafe HTML sink');
check(/textContent/.test(feedSource) && /createTextNode/.test(feedSource),
  'delegation feed uses text-only DOM sinks');
check(!/JSON\.parse\([^\n]*(?:title|detail)|switch\s*\([^\n]*(?:title|detail)/.test(eventStoreSource + feedSource),
  'presentation title/detail fields are never parsed as authority data');
check(/VALID_TERMINAL_CODES = Object\.freeze/.test(eventStoreSource)
  && /VALID_TERMINAL_CODES = Object\.freeze/.test(feedSource),
'terminal codes are closed in both persistence and presentation');

const bridgeSource = read('extension/ws/mcp-bridge-client.js');
check(/eventTail/.test(bridgeSource) && /pending\.eventTail|eventTail =/.test(bridgeSource),
  'observer failure/order state remains per pending correlation');
check(/eventTail: Promise\.resolve\(\),\s*observerError: null/.test(bridgeSource)
  && !/this\.(?:_)?eventTail|this\.(?:_)?observerError/.test(bridgeSource),
'event ordering and observer failure have no global cross-correlation state');
check(!/chrome\.tabs\.query\(\s*\{\s*active\s*:\s*true/.test(read('extension/utils/agent-registry.js')),
  'registry never derives delegation authority from the active tab');
const takeControlFunction = extractFunction(auditedControllerSource, 'takeControl');
const sealHoldLeaseFunction = between(
  auditedRegistrySource,
  'AgentRegistry.prototype.sealHoldLease = function(input) {',
  'function canonicalLiveTabIds(value) {',
);
check(takeControlFunction.indexOf('getDelegationOwnedTabs') < takeControlFunction.indexOf('sealHoldLease')
  && /completeOwnedSet/.test(takeControlFunction)
  && /activeOwned/.test(takeControlFunction)
  && /ownedTabs: ownedTabs/.test(takeControlFunction)
  && !/ownedTabs:\s*\[\s*(?:activeTab|\{\s*tabId:\s*activeTabId)/.test(takeControlFunction),
'controller seals the complete verified ownership set rather than one active tab');
check(/canonicalOwnedTabs\(input\.ownedTabs\)/.test(sealHoldLeaseFunction)
  && /canonicalOwnedTabs\(self\.getDelegationOwnedTabs/.test(sealHoldLeaseFunction)
  && /sameOwnedTabs\(supplied, current\)/.test(sealHoldLeaseFunction)
  && /supplied\.forEach/.test(sealHoldLeaseFunction),
'registry atomically compares and leases every exact owned tab/token');

for (const functionName of [
  '_takeDelegationControl', '_resumeDelegationControl', '_stopDelegation',
]) {
  const lifecycleFunction = extractFunction(sidepanelSource, functionName);
  check(lifecycleFunction.includes('_renderDelegationSnapshot(response.snapshot')
    && !/(?:snapshot|_delegationUiState\.snapshot)\.state\s*=(?!=)|state:\s*['"](?:held|stopped)['"]/.test(lifecycleFunction),
  `${functionName} renders only the authoritative response snapshot without optimistic held/stopped state`);
}
const runtimeUpdateFunction = extractFunction(sidepanelSource, '_handleDelegationRuntimeUpdate');
check(/pendingTake[\s\S]*state === 'holding'[\s\S]*pendingResume[\s\S]*state === 'resuming'/.test(runtimeUpdateFunction),
  'pending Take Control/Resume suppress intermediate optimistic presentation');
const wakeReconcileFunction = extractFunction(backgroundSource, 'fsbReconcileDelegationSnapshots');
check(/controller\.reconcile/.test(wakeReconcileFunction)
  && !/delegate\.start|runAgentLoop|spawn|replay|adopt/i.test(wakeReconcileFunction),
'worker wake observes controller status without replaying or adopting execution');

const dispatcherSource = read('extension/ws/mcp-tool-dispatcher.js');
const registerFunction = between(
  dispatcherSource,
  'async function handleAgentRegisterRoute({ payload, client, bindRegisteredAgent, authorizeDelegation } = {}) {',
  'async function handleAgentReleaseRoute({ payload } = {}) {',
);
check(registerFunction.includes('resolveDelegationRegistrationGate')
  && registerFunction.includes('await gate({ delegationId, agentId })')
  && registerFunction.includes('rollbackDelegatedAgentRegistration')
  && registerFunction.indexOf('if (!binding || binding.ok !== true)')
    < registerFunction.indexOf('stampConnectionId'),
'delegation registration is authorized and rejection is rolled back before any connection stamping');
check(/expectedRegistration/.test(auditedControllerSource)
  && /delegation_binding_rejected/.test(auditedControllerSource)
  && !/bindDelegation[\s\S]{0,180}expectedRegistration\s*=\s*true/.test(auditedControllerSource),
'controller rejects unknown/stale pre-registration instead of creating delegation authority');

check(/Automated\/source verification remains blocking now/.test(validation),
  'validation explicitly keeps deterministic failures blocking');
check(/All manual checks remain `human_needed`/.test(validation),
  'validation links all manual-only checks to the milestone-end policy');
check(validation.includes('61-HUMAN-UAT.md') || uat.includes('single v0.9.91 milestone-end execution'),
  'validation/UAT artifacts form one explicit milestone-end live ledger');

console.log('\n--- Phase 62 exact task, requirement, and ownership map ---');

const phase62Validation = read(PHASE62_VALIDATION_PATH);
const phase62Context = read(`${PHASE62_DIR}/62-CONTEXT.md`);
const phase62Research = read(`${PHASE62_DIR}/62-RESEARCH.md`);
const phase62UiSpec = read(`${PHASE62_DIR}/62-UI-SPEC.md`);
const phase62PlanSources = [];
const phase62PlanCommands = [];
const phase62TaskCounts = [3, 2, 3, 3, 3, 3];
const phase62Waves = [1, 2, 2, 3, 3, 4];
for (let planNumber = 1; planNumber <= 6; planNumber += 1) {
  const plan = String(planNumber).padStart(2, '0');
  const source = read(`${PHASE62_DIR}/62-${plan}-PLAN.md`);
  phase62PlanSources.push(source);
  const taskIds = Array.from(source.matchAll(/<name>(62-\d{2}-\d{2}):/g), (match) => match[1]);
  const commands = Array.from(source.matchAll(/<automated>([^<]+)<\/automated>/g),
    (match) => decodeXml(match[1]));
  const wave = Number((source.match(/^wave: (\d+)$/m) || [null, NaN])[1]);
  check(taskIds.length === phase62TaskCounts[planNumber - 1],
    `Phase 62 Plan ${plan} owns its exact task count`);
  check(commands.length === taskIds.length,
    `Phase 62 Plan ${plan} gives every task one focused automated command`);
  check(wave === phase62Waves[planNumber - 1],
    `Phase 62 Plan ${plan} remains in dependency wave ${wave}`);
  phase62PlanCommands.push(...commands);
}

const phase62ValidationRows = phase62Validation.split('\n')
  .filter((line) => /^\| 62-\d{2}-\d{2} \|/.test(line))
  .map((line) => {
    const columns = line.split('|').map((column) => column.trim());
    const command = Array.from(line.matchAll(/`([^`]+)`/g), (match) => match[1])
      .find((value) => /^(?:node|npm)\b/.test(value)) || '';
    return {
      id: columns[1],
      plan: columns[2],
      wave: columns[3],
      requirements: columns[4],
      threats: columns[5],
      behavior: columns[6],
      command,
    };
  });
equal(phase62ValidationRows.map((row) => [row.id, row.command]), PHASE62_EXPECTED_TASKS,
  'Phase 62 validation maps exactly all 17 task ids to their focused commands');
equal(phase62PlanCommands, PHASE62_EXPECTED_TASKS.map((row) => row[1]),
  'Phase 62 plan commands and validation commands are byte-equal and ordered');
check(new Set(phase62ValidationRows.map((row) => row.id)).size === 17,
  'Phase 62 task ids are unique');
check(phase62ValidationRows.every((row) => row.requirements.includes('DRIFT-')
  && row.threats.includes('T62-') && row.behavior.length >= 40),
'every Phase 62 task has explicit requirement, threat, and secure-behavior ownership');

const phase62CriticalOwners = Object.freeze({
  'mcp/src/agent-providers/compatibility.ts': ['01', '03'],
  '.github/workflows/ci.yml': ['01'],
  'mcp/src/diagnostics.ts': ['02'],
  'mcp/src/index.ts': ['02'],
  'mcp/src/agent-providers/serve-delegation.ts': ['03'],
  'extension/utils/mcp-agent-providers.js': ['03'],
  'extension/utils/agent-protocol-drift-diagnostics.js': ['04'],
  'mcp/src/agent-providers/spawn-supervisor.ts': ['04'],
  'extension/ui/providers-panel.js': ['05'],
  'extension/ui/options.js': ['05'],
  'package.json': ['06'],
  'tests/delegation-phase-contract.test.js': ['06'],
});
for (const [file, expectedOwners] of Object.entries(phase62CriticalOwners)) {
  const owners = phase62PlanSources.flatMap((source, index) => {
    const fileBlock = (source.match(/files_modified:\n([\s\S]*?)\nautonomous:/) || [null, ''])[1];
    return fileBlock.includes(`- ${file}`) ? [String(index + 1).padStart(2, '0')] : [];
  });
  equal(owners, expectedOwners, `${file} keeps its declared Phase 62 owner sequence`);
}
const phase62UatOwners = phase62PlanSources.flatMap((source, index) => {
  const fileBlock = (source.match(/files_modified:\n([\s\S]*?)\nautonomous:/) || [null, ''])[1];
  return fileBlock.split('\n').some((line) => line.trim() === '- .planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-HUMAN-UAT.md')
    ? [String(index + 1).padStart(2, '0')] : [];
});
equal(phase62UatOwners, ['06'],
  'Plan 06, not the Providers implementation plan, exclusively owns final UAT closure');

const phase62RequirementIds = Array.from(
  requirements.matchAll(/^- \[[ x]\] \*\*(DRIFT-\d{2})\*\*:/gm),
  (match) => match[1],
);
equal(phase62RequirementIds, ['DRIFT-01', 'DRIFT-02', 'DRIFT-03', 'DRIFT-04'],
  'all four Phase 62 requirements remain explicit and uniquely mapped');
const phase62ThreatIds = Array.from(
  phase62Validation.matchAll(/^\| (T62-\d{2}) \|/gm),
  (match) => match[1],
);
equal(phase62ThreatIds, Array.from({ length: 8 }, (_, index) => `T62-${String(index + 1).padStart(2, '0')}`),
  'validation enumerates every threat T62-01 through T62-08 exactly once');

const phase62RequirementEvidence = Object.freeze({
  'DRIFT-01': [['tests/mcp-agent-drift-smoke.test.js', /registry\.ids\(\)/], ['.github/workflows/ci.yml', /Phase 62 adapter drift smoke/]],
  'DRIFT-02': [['mcp/src/diagnostics.ts', /adapterDiagnostics/], ['mcp/src/index.ts', /Adapter compatibility/]],
  'DRIFT-03': [['extension/utils/agent-protocol-drift-diagnostics.js', /REPORT_WINDOW_MS = 10000/], ['mcp/src/agent-providers/spawn-supervisor.ts', /agent_protocol_drift/]],
  'DRIFT-04': [['mcp/src/agent-providers/compatibility.ts', /ADAPTER_COMPATIBILITY_MATRIX/], ['extension/ui/providers-panel.js', /COMPATIBILITY_SUPPORTED_MODEL/]],
});
for (const id of phase62RequirementIds) checkEvidence(id, phase62RequirementEvidence[id]);

const phase62ThreatEvidence = Object.freeze({
  'T62-01': [['mcp/src/agent-providers/compatibility.ts', /parseAdapterCompatibilityMatrix/]],
  'T62-02': [['tests/mcp-agent-drift-smoke.test.js', /assertRosterBijection/]],
  'T62-03': [['tests/mcp-diagnostics-status.test.js', /sharedSecretPresent/]],
  'T62-04': [['tests/mcp-version-parity.test.js', /doctor text and JSON modes consume the same collected snapshot/]],
  'T62-05': [['mcp/src/agent-providers/serve-delegation.ts', /adapter\.compatibility/]],
  'T62-06': [['tests/providers-panel-ui.test.js', /compatibility.*observational|observational.*compatibility/i]],
  'T62-07': [['extension/utils/agent-protocol-drift-diagnostics.js', /REQUIRED_KEYS = Object\.freeze\(\['adapterId', 'expected', 'observed'\]\)/]],
  'T62-08': [['extension/background.js', /FSB_AGENT_PROTOCOL_DRIFT_SEEN_LIMIT = 512/]],
});
for (const id of phase62ThreatIds) checkEvidence(id, phase62ThreatEvidence[id]);

console.log('\n--- Phase 62 canonical matrix, fixture, CI, and root gate ---');

const compatibilitySource = read('mcp/src/agent-providers/compatibility.ts');
const compatibilityStatusesBlock = between(
  compatibilitySource,
  'export const COMPATIBILITY_STATUSES',
  'export const COMPATIBILITY_REASONS',
);
const compatibilityReasonsBlock = between(
  compatibilitySource,
  'export const COMPATIBILITY_REASONS',
  'const MATRIX_KEYS',
);
equal(Array.from(compatibilityStatusesBlock.matchAll(/'([^']+)'/g), (match) => match[1]),
  ['supported', 'degraded', 'unsupported'],
  'canonical compatibility statuses are the exact closed three-value set');
equal(Array.from(compatibilityReasonsBlock.matchAll(/'([^']+)'/g), (match) => match[1]), [
  'within_tested_range', 'newer_than_tested_range', 'evidence_stale',
  'binary_not_found', 'version_missing', 'version_malformed', 'below_minimum',
  'wrong_major', 'adapter_unshipped', 'matrix_invalid',
], 'canonical compatibility reasons are the exact closed ten-value set');

const rawCompatibilityMatrix = between(
  compatibilitySource,
  'const RAW_ADAPTER_COMPATIBILITY_MATRIX',
  'const parsedMatrix',
);
equal(Array.from(rawCompatibilityMatrix.matchAll(/adapterId:\s*'([^']+)'/g), (match) => match[1]),
  ['claude-code'], 'Phase 62 ships exactly one Claude Code matrix row');
for (const exactMatrixToken of [
  'schemaVersion: 1',
  "profileVersion: '2.1.177'",
  "minimumVersion: '2.1.177'",
  "testedThroughVersion: '2.1.177'",
  'supportedMajor: 2',
  "fixtureManifest: 'tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json'",
  "requiredInitFields: ['type', 'subtype', 'session_id', 'tools', 'mcp_servers']",
  "requiredResultFields: ['type', 'subtype', 'session_id', 'is_error']",
]) {
  check(rawCompatibilityMatrix.includes(exactMatrixToken),
    `canonical Claude row retains ${exactMatrixToken}`);
}
check(/compareVersions\(version, minimum\) < 0[\s\S]*'below_minimum'[\s\S]*compareVersions\(version, testedThrough\) > 0[\s\S]*'degraded'[\s\S]*'newer_than_tested_range'[\s\S]*'supported'[\s\S]*'within_tested_range'/.test(compatibilitySource),
  'canonical classifier keeps inclusive tested bounds and same-major newer degradation');

const fixtureManifest = JSON.parse(read(
  'tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json',
));
equal({
  schemaVersion: fixtureManifest.schemaVersion,
  fixture: fixtureManifest.fixture,
  profileVersion: fixtureManifest.profileVersion,
  provenance: fixtureManifest.provenance,
  liveCapturePending: fixtureManifest.liveCapturePending,
  recordedProvenanceStatus: fixtureManifest.recordedProvenanceStatus,
  sanitized: fixtureManifest.sanitized,
}, {
  schemaVersion: 1,
  fixture: 'contract-stream.jsonl',
  profileVersion: '2.1.177',
  provenance: 'schema-derived-contract',
  liveCapturePending: true,
  recordedProvenanceStatus: 'human_needed',
  sanitized: true,
}, 'fixture provenance remains schema-derived, sanitized, and pending genuine capture');
equal(fixtureManifest.expectedSequence, [
  'init', 'assistant', 'tool_use', 'assistant_delta',
  'user', 'tool_result', 'retry', 'result',
], 'fixture and matrix retain the exact normalized sequence');

const driftSmokeSource = read('tests/mcp-agent-drift-smoke.test.js');
for (const productionHarnessToken of [
  'createProductionAdapterRegistry',
  'registry.ids()',
  'registry.require(adapterId)',
  'adapter.parseEvents',
  'assertRosterBijection',
  'assertRequiredFields',
  'EXPECTED_PROVIDER_NATIVE_SEQUENCES',
]) {
  check(driftSmokeSource.includes(productionHarnessToken),
    `drift smoke uses production-registry/parser evidence: ${productionHarnessToken}`);
}
check(!/child_process|execFile|spawnSync|fetch\s*\(|new WebSocket|claude\s+--/.test(driftSmokeSource),
  'offline drift smoke invokes no live binary, process, network, browser, or account path');

const ciSource = read('.github/workflows/ci.yml');
check(exactOccurrences(ciSource, 'name: Phase 62 adapter drift smoke') === 1,
  'CI contains exactly one named Phase 62 drift step');
check(exactOccurrences(ciSource, 'run: node tests/mcp-agent-drift-smoke.test.js') === 1,
  'CI invokes the exact direct generalized drift harness once');
for (const command of PHASE62_NEW_TEST_COMMANDS) {
  check(rootCommands.filter((candidate) => candidate === command).length === 1,
    `${command} appears exactly once in the serial root chain`);
}
const prePhase62Commands = rootCommands.filter((command) => (
  !PHASE62_NEW_TEST_COMMANDS.includes(command)
  && !PHASE63_NEW_TEST_COMMANDS.includes(command)
));
check(digest(prePhase62Commands.join(' && ')) === PRE_PHASE62_ROOT_TEST_HASH,
  'removing the three Phase 62 gates reproduces the exact prior serial chain');
check(rootCommands.filter((command) => command === 'npm --prefix mcp run build').length === 1,
  'root tests retain one MCP build boundary');
check(rootCommands.indexOf('npm --prefix mcp run build')
  < rootCommands.indexOf('node tests/mcp-adapter-compatibility.test.js')
  && rootCommands.indexOf('npm --prefix mcp run build')
    < rootCommands.indexOf('node tests/mcp-agent-drift-smoke.test.js'),
'MCP compatibility and parser drift gates remain after the existing build boundary');
check(rootCommands.indexOf('node tests/mcp-bridge-background-dispatch.test.js')
  < rootCommands.indexOf('node tests/agent-protocol-drift-diagnostics.test.js'),
'extension drift diagnostics stays beside the background diagnostics contract');
check(!packageJson.scripts.test.includes('scripts/run-phase60-full-tests.mjs'),
  'the guarded full-suite runner is not nested into the root test chain');

console.log('\n--- Phase 63 focused, root, CI, and authority boundaries ---');

const phase63FocusedSource = read('scripts/run-phase63-focused-tests.mjs');
const mcpPackageJson = JSON.parse(read('mcp/package.json'));
for (const command of PHASE63_NEW_TEST_COMMANDS) {
  check(rootCommands.filter((candidate) => candidate === command).length === 1,
    `${command} appears exactly once in the serial root chain`);
}
const phase63RootIndexes = PHASE63_NEW_TEST_COMMANDS.map((command) => rootCommands.indexOf(command));
const phase63BuildIndex = rootCommands.indexOf('npm --prefix mcp run build');
const firstDependentMcpIndex = rootCommands.indexOf('node tests/mcp-bridge-client-lifecycle.test.js');
check(phase63BuildIndex >= 0
  && phase63RootIndexes.every((index) => index > phase63BuildIndex && index < firstDependentMcpIndex)
  && phase63RootIndexes.every((index, position) => position === 0 || index > phase63RootIndexes[position - 1]),
'all five Phase 63 root gates occupy one ordered slot after build and before dependent seams');
check(exactOccurrences(ciSource, 'name: Phase 63 native-host contract (sole Linux root invocation)') === 1
  && exactOccurrences(ciSource, 'run: npm test') === 1
  && !ciSource.includes('run: node scripts/run-phase63-focused-tests.mjs'),
'CI source-pins the sole Linux root invocation without a duplicate focused run');
for (const retainedCiToken of [
  'native-host-windows:',
  'runtime-payload:',
  'mcp/native-host/bin/win32-x64/fsb-native-host.exe',
  'mcp/native-host/bin/win32-arm64/fsb-native-host.exe',
  'node tests/mcp-native-host-packaging.test.js --section workflow-and-pack',
]) {
  check(ciSource.includes(retainedCiToken), `CI retains required Phase 63 artifact gate: ${retainedCiToken}`);
}

check(exactOccurrences(mcpPackageJson.scripts.prebuild,
  'verify-native-host-boundary.mjs --source') === 1
  && exactOccurrences(mcpPackageJson.scripts.build,
    'verify-native-host-boundary.mjs --compiled') === 1,
'the one MCP build owns exactly one source and one compiled native-host boundary pass');
check(!packageJson.scripts.test.includes('verify-native-host-boundary.mjs')
  && !phase63FocusedSource.includes("['node', 'scripts/verify-native-host-boundary.mjs'")
  && !phase63FocusedSource.includes("['node', 'scripts/verify-native-host-boundary.mjs', '--all'")
  && !PHASE63_NEW_TEST_COMMANDS.some((command) => /(?:--all|verify-native-host-boundary)/.test(command)),
'root and focused chains add no default or all-mode native-host boundary invocation');
check(exactOccurrences(phase63FocusedSource, "innerWrapperPath,\n    '--commands-json'") === 1
  && !phase63FocusedSource.includes('npm --prefix mcp run build &&'),
'focused runner delegates one closed command sequence to the preserving MCP builder');
for (const orderedFocusedSeam of [
  "['node', 'tests/native-host-background-wake.test.js']",
  "['node', 'tests/mcp-bridge-background-dispatch.test.js']",
  "['node', 'tests/mcp-diagnostics-status.test.js']",
  "['node', 'tests/mcp-install-platforms.test.js']",
  "['node', 'tests/delegation-sidepanel-ui.test.js']",
  "['node', 'tests/mcp-bridge-topology.test.js']",
  "['node', 'tests/mcp-version-parity.test.js']",
  "['node', 'tests/delegation-phase-contract.test.js']",
]) {
  check(phase63FocusedSource.includes(orderedFocusedSeam),
    `focused runner retains required seam: ${orderedFocusedSeam}`);
}

const phase63RequirementIds = Array.from(
  requirements.matchAll(/^- \[x\] \*\*(NATIVE-\d{2})\*\*:/gm),
  (match) => match[1],
);
equal(phase63RequirementIds, ['NATIVE-01', 'NATIVE-02', 'NATIVE-03', 'NATIVE-04'],
  'all four Phase 63 native requirements remain present and complete');

const nativeBoundarySource = read('scripts/verify-native-host-boundary.mjs');
const nativeEntrySource = read('mcp/src/native-host/entry.ts');
const nativePlatformSource = read('mcp/src/native-host/platform.ts');
const nativeDaemonSource = read('mcp/src/native-host/daemon.ts');
const nativeInstallSource = read('mcp/src/native-host-install/index.ts');
const nativeWakeSource = read('extension/utils/native-host-wake.js');
const backgroundSource63 = read('extension/background.js');
const sidepanelSource63 = read('extension/ui/sidepanel.js');
const bridgeSource63 = read('extension/ws/mcp-bridge-client.js');

for (const boundaryToken of [
  "'constants.ts'",
  "'daemon.ts'",
  "'entry.ts'",
  "'index.ts'",
  "'platform.ts'",
  "'protocol.ts'",
  "'runtime-layout.ts'",
  'agent-provider authority',
  'task or prompt authority',
  'bridge authentication authority',
  'historical native IPC authority',
  'exact serve argv tuple is not uniquely pinned',
]) {
  check(nativeBoundarySource.includes(boundaryToken),
    `native authority boundary retains ${boundaryToken}`);
}
check(exactOccurrences(nativePlatformSource, "from 'node:child_process'") === 1
  && exactOccurrences(nativePlatformSource, 'spawnChild(command, [...argv], options)') === 1
  && !/\b(?:exec|execSync|execFile|execFileSync|fork|spawnSync)\s*\(/.test(nativePlatformSource),
'platform owns one injected child-process edge and no alternate process authority');
check(nativeDaemonSource.includes("runtime.absoluteStableBuildIndex,\n    'serve',\n    '--host',\n    '127.0.0.1',\n    '--port',\n    '7226'")
  && nativeDaemonSource.includes('shell: false')
  && !/process\.kill|\.kill\s*\(|SIGTERM|SIGKILL/.test(nativeDaemonSource),
'daemon retains the exact shell-free serve tuple and no process-kill authority');
for (const forbiddenHostAuthority of [
  /agent-providers|spawn-supervisor/,
  /delegate\.start|delegation-task/,
  /bridge-auth|session-secret/,
  /native-host-install|diagnostics/,
]) {
  check(!forbiddenHostAuthority.test(nativeEntrySource),
    `one-shot host entry excludes authority matching ${forbiddenHostAuthority}`);
}
check(/installNativeHost[\s\S]*uninstallNativeHost/.test(nativeInstallSource)
  && /registration[\s\S]*runtime|runtime[\s\S]*registration/.test(nativeInstallSource),
'native installer source owns both exact registration and runtime lifecycle paths');

check(backgroundSource63.includes("importScripts('utils/native-host-wake.js')")
  && backgroundSource63.includes("authority.result.code !== 'agent_offline'")
  && backgroundSource63.includes('return (await fsbDelegationPreflightResult()).result'),
'background alone invokes offline wake and then reruns the established authoritative preflight');
check(nativeWakeSource.includes('runtime.connectNative(NATIVE_HOST_NAME)')
  && nativeWakeSource.includes('runtime.sendNativeMessage(')
  && nativeWakeSource.includes("action: 'wake'")
  && !/delegate|task|provider|pair|sessionSecret|agent/i.test(nativeWakeSource),
'native wake helper exposes lifecycle-only native authority');
for (const browserAuthorityPattern of [
  /chrome\.runtime\.(?:connectNative|sendNativeMessage)\s*\(/,
  /\bNATIVE_HOST_NAME\b/,
  /\bnativeMessaging\b/,
]) {
  check(!browserAuthorityPattern.test(sidepanelSource63)
    && !browserAuthorityPattern.test(bridgeSource63),
  `side panel and bridge retain no native authority matching ${browserAuthorityPattern}`);
}
for (const channelCommand of [
  'node tests/mcp-reverse-channel-contract.test.js',
  'node tests/mcp-bridge-auth.test.js',
  'node tests/mcp-bridge-topology.test.js',
]) {
  check(rootCommands.filter((candidate) => candidate === channelCommand).length === 1,
    `Phase 59 channel gate remains exact in root tests: ${channelCommand}`);
}
check(read('mcp/src/bridge.ts').includes('state.allowedExtensionOrigin === metadata.browserOrigin')
  && read('mcp/src/bridge.ts').includes('state.sessionId === metadata.sessionId')
  && read('mcp/src/bridge-auth.ts').includes('timingSafeEqual(expected, candidate)'),
'Phase 59 Origin, session, and credential gates remain mechanically present');

console.log('\n--- Phase 62 doctor, authenticated projection, and durable freshness ---');

const diagnosticsSource = read('mcp/src/diagnostics.ts');
const indexSource = read('mcp/src/index.ts');
const doctorRowType = (diagnosticsSource.match(
  /export type AdapterDoctorRow = Readonly<\{([\s\S]*?)\}>;/,
) || [null, ''])[1];
equal(Array.from(doctorRowType.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]+):/gm), (match) => match[1]), [
  'adapterId', 'displayLabel', 'binaryPath', 'detectedVersion',
  'compatibilityStatus', 'compatibilityReason', 'authState', 'profileVersion',
], 'local doctor adapter rows retain their exact eight fields');
const bridgeAuthType = (diagnosticsSource.match(
  /export type BridgeAuthDoctorMetadata = Readonly<\{([\s\S]*?)\}>;/,
) || [null, ''])[1];
equal(Array.from(bridgeAuthType.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]+):/gm), (match) => match[1]), [
  'sharedSecretPresent', 'secretRotatedAt', 'secretRotationAgeMs',
], 'doctor bridge-auth projection retains exactly three safe metadata fields');

const doctorCollectorSource = between(
  diagnosticsSource,
  'async function collectAdapterDoctorRows',
  'function projectBridgeAuthMetadata',
);
for (const doctorToken of [
  'registryIds = denseStringArray(idsMethod.call(registry))',
  'const adapter = requireMethod.call(registry, adapterId)',
  'detection = await detectMethod.call(adapter)',
  'classifyAdapterCompatibility',
  "authState: 'unknown'",
]) {
  check(doctorCollectorSource.includes(doctorToken),
    `doctor collection remains local and canonical: ${doctorToken}`);
}
check(!/process\.env|providerConfig|browser|chrome\.|\.connect\s*\(|\.start\s*\(/.test(doctorCollectorSource),
  'doctor adapter collection has no account inference, browser, or start authority');
const runDoctorSource = extractFunction(indexSource, 'runDoctor');
check(exactOccurrences(runDoctorSource, 'collectBridgeDiagnostics(') === 1
  && runDoctorSource.includes('JSON.stringify(diagnostics, null, 2)')
  && runDoctorSource.includes('formatDoctor(diagnostics)'),
'doctor text and JSON modes project one collected snapshot');
check(runDoctorSource.includes("diagnostics.diagnosticLayer === 'healthy' ? 0 : 1"),
  'doctor preserves historical healthy/unhealthy exit semantics');
check(indexSource.includes("lines.push('  Auth: Not reported')"),
  'human doctor keeps Claude auth exactly Not reported');
const doctorDiagnosticsTest = read('tests/mcp-diagnostics-status.test.js');
check(doctorDiagnosticsTest.includes('function makeOfflineBridge()')
  && doctorDiagnosticsTest.includes('offlineSnapshot = await diagnostics.collectBridgeDiagnostics(')
  && doctorDiagnosticsTest.includes("offline bridge keeps historical diagnostic-layer precedence")
  && doctorDiagnosticsTest.includes('injected clock controls the deterministic snapshot timestamp'),
  'doctor offline behavior remains deterministically covered');

const serveDelegationSource = read('mcp/src/agent-providers/serve-delegation.ts');
const compatibilityRouteSource = between(
  serveDelegationSource,
  'const handleExtRequest: ExtRequestHandler',
  'const bridge = dependencies.createBridge',
);
check(compatibilityRouteSource.includes("request.method === 'adapter.compatibility'")
  && compatibilityRouteSource.includes('isExactEmptyPayload(request.payload)')
  && compatibilityRouteSource.includes('collectCompatibilitySnapshot')
  && compatibilityRouteSource.indexOf("request.method === 'adapter.compatibility'")
    < compatibilityRouteSource.indexOf('return supervisor.handleExtRequest'),
'adapter.compatibility is a separate exact-empty-payload read before lifecycle authority');
const extensionBridgeSource = read('extension/ws/mcp-bridge-client.js');
const compatibilityRequestSource = between(
  extensionBridgeSource,
  '  requestAdapterCompatibility() {',
  '  _handleExtFrame(msg) {',
);
check(compatibilityRequestSource.includes("this._pairingStatus !== 'paired'")
  && compatibilityRequestSource.includes("sendExtRequest('adapter.compatibility', {}, { timeout: ADAPTER_COMPATIBILITY_REQUEST_TIMEOUT_MS })"),
'extension requests compatibility only over the paired authenticated route with exact {}');
check(extensionBridgeSource.includes('const ADAPTER_COMPATIBILITY_REQUEST_TIMEOUT_MS = 5000;'),
  'compatibility requests retain the bounded five-second timeout');
for (const forbiddenProjectionField of [
  'sessionSecret', 'sessionId', 'fingerprint', 'protocolToken', 'task', 'prompt',
  'binaryPath', 'realPath', 'providerOutput', 'environment',
]) {
  check(!compatibilityRouteSource.includes(forbiddenProjectionField),
    `daemon compatibility projection excludes ${forbiddenProjectionField}`);
}

const providerStorageSource = read('extension/utils/mcp-agent-providers.js');
check(providerStorageSource.includes("var FSB_AGENT_COMPATIBILITY_MAX_AGE_MS = 15 * 60 * 1000;")
  && providerStorageSource.includes("var FSB_COMPATIBILITY_SNAPSHOT_KEYS = ['schemaVersion', 'checkedAt', 'adapters'];")
  && providerStorageSource.includes("var FSB_COMPATIBILITY_ROW_KEYS = ['adapterId', 'displayLabel', 'status', 'reason'];"),
'browser storage pins the exact safe schema and fifteen-minute freshness interval');
const replaceCompatibilitySource = extractFunction(providerStorageSource, 'replaceCompatibility');
check(replaceCompatibilitySource.includes('parseCompatibilitySnapshot(snapshot)')
  && replaceCompatibilitySource.includes('enqueueMutation')
  && replaceCompatibilitySource.indexOf('var envelope = await read()')
    < replaceCompatibilitySource.indexOf('return await write(envelope)'),
'compatibility replacement exact-validates and serializes one durable envelope write');
const projectedCompatibilitySource = extractFunction(providerStorageSource, 'projectedCompatibility');
check(projectedCompatibilitySource.includes('now - snapshot.checkedAt >= FSB_AGENT_COMPATIBILITY_MAX_AGE_MS')
  && projectedCompatibilitySource.includes("compatibilityProjection('degraded', 'evidence_stale'")
  && projectedCompatibilitySource.includes("compatibilityProjection('unsupported', 'matrix_invalid'"),
'freshness is a one-way supported-to-degraded downgrade and invalid evidence fails closed');
const providerStorageTests = read('tests/mcp-agent-providers-storage.test.js');
for (const durableEvidence of [
  'a mutation preserves both sibling maps and unknown envelope keys',
  'the new supported view is not observable before durable storage accepts it',
  'write rejection preserves the last durable compatibility evidence',
  'a rejected newly-supported write cannot leak support through the merged view',
]) {
  check(providerStorageTests.includes(durableEvidence),
    `durable compatibility contract retains: ${durableEvidence}`);
}
const backgroundSource62 = read('extension/background.js');
const backgroundCompatibilitySource = between(
  backgroundSource62,
  'let fsbMcpCompatibilityRefreshPromise = null;',
  'function armMcpBridge(reason)',
);
const backgroundCompatibilityRefreshSource = extractFunction(
  backgroundSource62,
  'fsbRefreshMcpCompatibility',
);
const backgroundCompatibilityCacheSource = extractFunction(
  backgroundSource62,
  'fsbReadCachedMcpClients',
);
const backgroundCompatibilityStaleSource = extractFunction(
  backgroundSource62,
  'fsbReadStaleMcpClientFallback',
);
check(backgroundCompatibilityRefreshSource.indexOf('requestAdapterCompatibility()') >= 0
  && backgroundCompatibilityRefreshSource.indexOf('requestAdapterCompatibility()')
    < backgroundCompatibilityRefreshSource.indexOf('validateCompatibilitySnapshot(response)')
  && backgroundCompatibilityRefreshSource.indexOf('validateCompatibilitySnapshot(response)')
    < backgroundCompatibilityRefreshSource.indexOf('await providers.replaceCompatibility(validated)')
  && backgroundCompatibilityRefreshSource.indexOf('await providers.replaceCompatibility(validated)')
    < backgroundCompatibilityRefreshSource.indexOf('await fsbReadMergedMcpClients(providers)'),
'background validates, durably writes, then fans out compatibility');
check(backgroundCompatibilityRefreshSource.includes('if (fsbMcpCompatibilityRefreshPromise) return fsbMcpCompatibilityRefreshPromise')
  && backgroundCompatibilityRefreshSource.includes("refreshOutcome: 'refreshed'")
  && backgroundCompatibilityRefreshSource.includes('compatibilityExpiresAt: fsbReadMcpCompatibilityExpiryAt(providers, clients)')
  && backgroundCompatibilityRefreshSource.includes('return await fsbReadStaleMcpClientFallback(providers)')
  && backgroundCompatibilityCacheSource.includes('refreshOutcome,')
  && backgroundCompatibilityCacheSource.includes("compatibilityExpiresAt: refreshOutcome === 'stale'")
  && !backgroundCompatibilityCacheSource.includes('requestAdapterCompatibility')
  && !backgroundCompatibilityCacheSource.includes('replaceCompatibility')
  && backgroundCompatibilityStaleSource.includes("refreshOutcome: 'stale'")
  && backgroundCompatibilityStaleSource.includes('compatibilityExpiresAt: null')
  && backgroundCompatibilitySource.includes("return cached ? 'stale' : 'unavailable'"),
'cold/manual compatibility refresh coalesces and exposes only refreshed, stale, or unavailable');

console.log('\n--- Phase 62 drift terminal, reporter, and preserved interfaces ---');

const supervisorSource = read('mcp/src/agent-providers/spawn-supervisor.ts');
const driftTerminalSource = between(
  supervisorSource,
  'function diagnosticTerminal',
  'function eventTerminal',
);
check(driftTerminalSource.includes("code === 'agent_protocol_drift'")
  && /return Object\.freeze\(\{\s*adapterId: safeAdapterId,\s*expected,\s*observed,\s*\}\)/m.test(driftTerminalSource),
'daemon drift terminal exposes only adapterId, expected, and observed');
check(supervisorSource.includes("code === 'agent_protocol_drift' ? driftDetail : undefined")
  && supervisorSource.includes("if (code === 'agent_protocol_drift') return 'agent_protocol_drift'"),
'typed drift remains a domain terminal and does not fabricate success');

const driftReporterSource = read('extension/utils/agent-protocol-drift-diagnostics.js');
check(driftReporterSource.includes('var REPORT_WINDOW_MS = 10000;')
  && driftReporterSource.includes("var REQUIRED_KEYS = Object.freeze(['adapterId', 'expected', 'observed']);")
  && driftReporterSource.includes('timestamp - previous < REPORT_WINDOW_MS')
  && driftReporterSource.indexOf('timestamp - previous < REPORT_WINDOW_MS')
    < driftReporterSource.indexOf("sink(\n            'BG'"),
'reporter exact-validates and pre-throttles each adapter before the diagnostics sink');
const backgroundDriftSource = extractFunction(backgroundSource62, 'fsbReportAgentProtocolDriftOnce');
check(backgroundSource62.includes('const FSB_AGENT_PROTOCOL_DRIFT_SEEN_LIMIT = 512;')
  && backgroundDriftSource.includes('fsbAgentProtocolDriftSeenDelegationIds.has(delegationId)')
  && backgroundDriftSource.indexOf('validate.call') < backgroundDriftSource.indexOf('.add(delegationId)')
  && backgroundDriftSource.indexOf('.add(delegationId)') < backgroundDriftSource.indexOf('report.call'),
'background reports each validated authoritative drift final once through a bounded FIFO');

const adapterSource = read('mcp/src/agent-providers/adapter.ts');
const adapterInterface = (adapterSource.match(/export interface AgentProviderAdapter \{([\s\S]*?)\n\}/) || [null, ''])[1];
equal(Array.from(adapterInterface.matchAll(/^\s{2}([A-Za-z]+)\(/gm), (match) => match[1]),
  ['detect', 'buildSpawn', 'parseEvents', 'kill', 'caps'],
  'the Phase 60 adapter interface remains exactly five methods');
const extProtocolSource = read('mcp/src/ext-protocol.ts');
const extErrorBlock = between(extProtocolSource, 'export const EXT_ERROR_CODES', 'export const EXT_FRAME_LIMITS');
equal(Array.from(extErrorBlock.matchAll(/'([^']+)'/g), (match) => match[1]), [
  'agent_provider_offline', 'bridge_topology_changed', 'ext_unauthorized',
  'invalid_ext_request', 'ext_request_timeout',
], 'the actual Phase 59 reverse-channel transport union remains its exact five production codes');
check(!extErrorBlock.includes('agent_protocol_drift'),
  'agent protocol drift does not expand the transport-error union');

const providersSource = read('extension/ui/providers-panel.js');
const apiProviderBlock = between(providersSource, 'var API_PROVIDER_IDS', 'var AGENT_PROVIDER_IDS');
const agentProviderBlock = between(providersSource, 'var AGENT_PROVIDER_IDS', 'var COMPATIBILITY_UNSUPPORTED_REASONS');
equal(Array.from(apiProviderBlock.matchAll(/'([^']+)'/g), (match) => match[1]),
  ['xai', 'gemini', 'openai', 'anthropic', 'openrouter', 'lmstudio', 'custom'],
  'Providers retains the exact seven API-provider order');
equal(Array.from(agentProviderBlock.matchAll(/'([^']+)'/g), (match) => match[1]),
  ['claude-code', 'opencode', 'codex'],
  'Providers retains the exact three agent-provider order');
const providerParitySource = read('tests/provider-parity.test.js');
check(providerParitySource.includes("const PROVIDER_KEYS = ['xai', 'openai', 'anthropic', 'gemini', 'openrouter', 'lmstudio', 'custom'];")
  && providerParitySource.includes("!PROVIDER_KEYS.includes('claude-code')"),
'legacy API provider parity remains explicit and excludes agent ids');

console.log('\n--- Phase 62 Providers UI and negative authority guards ---');

for (const modelContract of [
  ["label: 'Supported'", "icon: 'fa-circle-check'", "className: 'compatibility-badge--supported'"],
  ["label: 'Degraded'", "icon: 'fa-triangle-exclamation'", "className: 'compatibility-badge--degraded'"],
  ["label: 'Unsupported'", "icon: 'fa-circle-xmark'", "className: 'compatibility-badge--unsupported'"],
]) {
  check(modelContract.every((token) => providersSource.includes(token)),
    `Providers retains the closed compatibility display model ${modelContract[0]}`);
}
check(providersSource.includes("var AGENT_AUTH_NOT_REPORTED = 'Not reported';"),
  'Claude account/auth UI remains exactly Not reported');
const controlPanelSource = read('extension/ui/control_panel.html');
check(exactOccurrences(controlPanelSource, 'data-provider-compatibility-group=') === 3
  && exactOccurrences(controlPanelSource, 'data-provider-compatibility-description=') === 3,
'exactly the three agent rows receive compatibility groups and descriptions');
check(!/data-provider-kind="api"[\s\S]{0,700}data-provider-compatibility-group=/.test(controlPanelSource),
  'API provider rows receive no compatibility group');
check(exactOccurrences(controlPanelSource, 'id="providerEvidenceAnnouncement"') === 1
  && /id="providerEvidenceAnnouncement"[^>]*role="status"[^>]*aria-live="polite"/.test(controlPanelSource),
'Providers retains one shared polite live region rather than per-row announcements');

const optionsSource62 = read('extension/ui/options.js');
const compatibilityRendererSource = [
  extractFunction(optionsSource62, 'getProviderCompatibilityModel'),
  extractFunction(optionsSource62, 'setProviderCompatibilityClass'),
  extractFunction(optionsSource62, 'setProviderCompatibilityIcon'),
  extractFunction(optionsSource62, 'renderProviderCompatibility'),
].join('\n');
check(!/(?:saveSettings|markUnsavedChanges|modelProvider\s*=|agentProviderId\s*=|recommendation\s*=|chrome\.storage|focus\s*\()/.test(compatibilityRendererSource),
  'compatibility renderer cannot mutate selection, recommendation, form state, focus, or storage');
check(/textContent/.test(compatibilityRendererSource) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(compatibilityRendererSource),
  'compatibility renderer uses text-only DOM updates');
const compatibilityMappingSource = extractFunction(providersSource, 'getCompatibilityDisplayModel');
check(!/semver|parseVersion|compareVersion|2\.1\.177/.test(compatibilityMappingSource),
  'UI mapping contains no semantic-version parser, comparator, or CLI version constant');

const optionsCss = read('extension/ui/options.css');
for (const cssContract of [
  '.compatibility-badge--supported',
  '.compatibility-badge--degraded',
  '.compatibility-badge--unsupported',
  '@media (min-width: 900px)',
  '@media (min-width: 641px) and (max-width: 899px)',
  '@media (max-width: 640px)',
  '@media (forced-colors: active)',
  '@media (prefers-reduced-motion: reduce)',
  'var(--success-color)',
  'var(--warning-color)',
  'var(--error-color)',
  'var(--fsb-focus-ring)',
]) {
  check(optionsCss.includes(cssContract), `Providers CSS retains ${cssContract}`);
}

const extensionManifest = JSON.parse(read('extension/manifest.json'));
check(
  extensionManifest.permissions.filter((permission) => permission === 'nativeMessaging').length === 1,
  'Phase 63 retains exactly one nativeMessaging permission while Phase 62 Providers remains native-free',
);
const compatibilityUiScope = [providersSource, optionsSource62, controlPanelSource, optionsCss].join('\n');
for (const forbiddenUiPattern of [
  /adapter\.compatibility/,
  /requestAdapterCompatibility/,
  /sendExtRequest\s*\(/,
  /\b(?:execFile|execSync|spawn|spawnSync|fork)\s*\(/,
  /chrome\.runtime\.(?:connectNative|sendNativeMessage)\s*\(/,
  /\bnativeMessaging\b/,
  /\b(?:binaryPath|realPath|sessionSecret|protocolToken|providerOutput)\b/,
]) {
  check(!forbiddenUiPattern.test(compatibilityUiScope),
    `Providers UI has no direct compatibility/process/private authority matching ${forbiddenUiPattern}`);
}
check(!exists('mcp/src/agent-providers/opencode.ts')
  && !exists('mcp/src/agent-providers/codex.ts'),
'Phase 62 ships no OpenCode or Codex adapter implementation');

const compatibilityBrowserProjection = [
  projectedCompatibilitySource,
  replaceCompatibilitySource,
  backgroundCompatibilitySource,
].join('\n');
for (const forbiddenBrowserField of [
  'sessionSecret', 'sessionId', 'fingerprint', 'protocolToken', 'binaryPath',
  'realPath', 'rawJsonl', 'providerOutput', 'prompt', 'task', 'environment',
]) {
  check(!compatibilityBrowserProjection.includes(forbiddenBrowserField),
    `browser compatibility projection excludes ${forbiddenBrowserField}`);
}

console.log('\n--- Phase 62 pending evidence integrity before ledger creation ---');

const phase62Plan06 = phase62PlanSources[5];
for (const pendingLedgerToken of [
  '### [ ] UAT62-*',
  'status: human_needed',
  'result: pending',
  'evidence:',
  'deferred to one milestone-end sweep',
]) {
  check(phase62Plan06.includes(pendingLedgerToken),
    `final plan retains pending UAT contract: ${pendingLedgerToken}`);
}
check(!phase62PlanSources.join('\n').includes('liveCapturePending: false')
  && !JSON.stringify(fixtureManifest).includes('genuine-live-capture'),
'no plan or fixture promotes schema-derived evidence to a genuine live pass');
check(fixtureManifest.milestoneEndTask.includes('keep liveCapturePending true'),
  'genuine Claude stream comparison remains pending until milestone-end human review');
check(Array.from(uat.matchAll(/^### \[([^\]]*)\] UAT61-/gm)).every((match) => match[1] === ' '),
  'all existing Phase 61 UAT headings remain unchecked while Phase 62 closes');
check(phase62Context.includes('single milestone-end UAT sweep')
  && phase62Research.includes('liveCapturePending: true')
  && phase62UiSpec.includes('must not be marked passed'),
'context, research, and UI contract all preserve the milestone-end human-evidence boundary');

console.log('\n--- Phase 62 milestone-end human UAT ledger ---');

check(exists(PHASE62_UAT_PATH), 'Phase 62 human UAT ledger exists');
const phase62Uat = read(PHASE62_UAT_PATH);
check(/^phase: 62$/m.test(phase62Uat)
  && /^status: human_needed$/m.test(phase62Uat)
  && /^deferred_until: milestone-end$/m.test(phase62Uat)
  && /^results_recorded: false$/m.test(phase62Uat)
  && /^live_checks: 3$/m.test(phase62Uat),
  'Phase 62 ledger frontmatter remains an unexecuted three-check milestone-end queue');
check(phase62Uat.includes('All three scenarios are deferred to one milestone-end sweep.')
  && phase62Uat.includes('Automated, source, and DOM evidence cannot check off any heading'),
  'the ledger prominently preserves the user-directed single milestone-end deferral');

const phase62UatHeadings = Array.from(
  phase62Uat.matchAll(/^### \[([^\]]*)\] (UAT62-\d{2})\b[^\n]*$/gm),
  (match) => ({ marker: match[1], id: match[2] }),
);
equal(phase62UatHeadings, [
  { marker: ' ', id: 'UAT62-01' },
  { marker: ' ', id: 'UAT62-02' },
  { marker: ' ', id: 'UAT62-03' },
], 'Phase 62 ledger contains exactly three ordered unchecked UAT ids');

const phase62UatBlocks = phase62Uat.split(/^### \[ \] /m).slice(1);
check(phase62UatBlocks.length === 3, 'each Phase 62 UAT heading owns exactly one scenario block');
for (const block of phase62UatBlocks) {
  const id = (block.match(/^(UAT62-\d{2})\b/) || [null, 'unknown'])[1];
  check(exactOccurrences(block, 'status: human_needed') === 1,
    `${id} remains status: human_needed`);
  check(exactOccurrences(block, 'result: pending') === 1,
    `${id} remains result: pending`);
  check(/^evidence:[ \t]*\n[ \t]*\nreferences:/m.test(block),
    `${id} keeps its evidence field empty`);
}
check(exactOccurrences(phase62Uat, 'status: human_needed') === 4
  && exactOccurrences(phase62Uat, 'result: pending') === 3
  && exactOccurrences(phase62Uat, 'evidence:') === 3,
  'ledger field counts are exact, including its human-needed frontmatter');
check(!/^### \[[^ ]\] UAT62-/m.test(phase62Uat)
  && !/^status:\s*(?:complete|green)\b/im.test(phase62Uat)
  && !/^result:\s*(?!pending\s*$)\S+/im.test(phase62Uat)
  && !/\b(?:pass|passed|approved|screenshots?)\b/i.test(phase62Uat),
  'ledger contains no checked marker, completed field, or fabricated evidence claim');

const [uat6201 = '', uat6202 = '', uat6203 = ''] = phase62UatBlocks;
for (const token of [
  'installed Claude Code',
  'doctor text and JSON',
  'bridge and browser offline and online',
  'Supported',
  'newer',
  'Degraded',
  'Unsupported',
  'no secret, private auth, provider-native payload, prompt, or task data',
  'one genuine sanitized Claude JSONL stream',
  '`system/init`',
  '`result`',
  '`type`',
  '`subtype`',
  '`session_id`',
  '`tools`',
  '`mcp_servers`',
  '`is_error`',
  'provider-native sequence',
  'normalized sequence',
  '`schema-derived-contract`',
  '`liveCapturePending: true`',
]) {
  check(uat6201.includes(token), `UAT62-01 retains genuine-stream/doctor coverage: ${token}`);
}
for (const token of [
  'Supported, Degraded, and Unsupported',
  'light and dark themes',
  'desktop',
  'compact',
  '641–899 px',
  'at most 640 px',
  'selected-agent details',
  'wrapping',
  'dividers',
  'horizontal overflow',
  'API rows',
]) {
  check(uat6202.includes(token), `UAT62-02 retains rendered layout coverage: ${token}`);
}
for (const token of [
  'keyboard',
  'native radio group',
  'screen reader names and descriptions',
  'focus retention',
  'one shared live region',
  'success and failure',
  'forced-colors',
  'reduced-motion',
  'fresh, stale, corrupt, absent, and failed evidence',
  'selection, form, or recommendation state',
]) {
  check(uat6203.includes(token), `UAT62-03 retains accessibility/refresh coverage: ${token}`);
}
check(uat6201.includes('pending until a human reviews the comparison during the milestone-end sweep')
  && fixtureManifest.provenance === 'schema-derived-contract'
  && fixtureManifest.liveCapturePending === true,
  'genuine capture comparison and schema-derived fixture provenance remain pending');

console.log(`\n=== Phase 61-63 contract results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
