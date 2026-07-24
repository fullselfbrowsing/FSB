#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_CHILD_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_INJECTED_COMMAND_BYTES = 64 * 1024;
const MAX_COMMANDS = 32;
const MAX_ARGUMENTS = 64;

const scriptPath = fileURLToPath(import.meta.url);
const testRepositoryRoot = process.env.FSB_PHASE65_TEST_REPOSITORY_ROOT;
const repositoryRoot = testRepositoryRoot
  ? resolve(testRepositoryRoot)
  : resolve(dirname(scriptPath), '..');
const productionWrapperPath = resolve(dirname(scriptPath), 'run-mcp-build-preserving-workspace.mjs');
const wrapperPath = process.env.FSB_PHASE65_TEST_WRAPPER_PATH
  ? resolve(process.env.FSB_PHASE65_TEST_WRAPPER_PATH)
  : productionWrapperPath;

const PHASE65_COMMANDS = Object.freeze([
  Object.freeze(['node', 'tests/mcp-codex-adapter.test.js', '--section', 'generic-probe']),
  Object.freeze(['node', 'tests/mcp-codex-adapter.test.js', '--section', 'generic-authority']),
  Object.freeze(['node', 'tests/mcp-codex-adapter.test.js']),
  Object.freeze(['node', 'tests/mcp-agent-orphan-recovery.test.js']),
  Object.freeze(['node', 'tests/mcp-spawn-supervisor.test.js']),
  Object.freeze(['node', 'tests/runtime-contracts.test.js']),
  Object.freeze(['node', 'tests/mcp-agent-stream-fixture.test.js']),
  Object.freeze(['node', 'tests/mcp-agent-drift-smoke.test.js']),
  Object.freeze(['node', 'tests/mcp-agent-provider-contract.test.js']),
  Object.freeze(['node', 'tests/mcp-adapter-compatibility.test.js']),
  Object.freeze(['node', 'tests/mcp-version-parity.test.js']),
  Object.freeze(['node', 'tests/mcp-diagnostics-status.test.js']),
  Object.freeze(['node', 'tests/mcp-client-inventory.test.js']),
  Object.freeze(['node', 'tests/mcp-bridge-topology.test.js']),
  Object.freeze(['node', 'tests/mcp-reverse-channel-contract.test.js']),
  Object.freeze(['node', 'tests/mcp-bridge-background-dispatch.test.js']),
  Object.freeze(['node', 'tests/mcp-agent-providers-storage.test.js']),
  Object.freeze(['node', 'tests/delegation-routing.test.js']),
  Object.freeze(['node', 'tests/delegation-consent.test.js']),
  Object.freeze(['node', 'tests/delegation-controller.test.js']),
  Object.freeze(['node', 'tests/delegation-event-store.test.js']),
  Object.freeze(['node', 'tests/providers-panel-logic.test.js']),
  Object.freeze(['node', 'tests/providers-panel-ui.test.js']),
  Object.freeze(['node', 'tests/delegation-sidepanel-ui.test.js']),
  Object.freeze(['node', 'tests/provider-parity.test.js']),
  Object.freeze(['node', 'tests/agent-protocol-drift-diagnostics.test.js']),
  Object.freeze(['node', 'tests/agent-provider-forbidden-flags.test.js']),
  Object.freeze(['node', 'tests/delegation-phase-contract.test.js', '--section', 'phase65-validation']),
  Object.freeze(['node', 'tests/delegation-phase-contract.test.js', '--section', 'phase65-uat-ledger']),
  Object.freeze(['node', 'scripts/verify-agent-provider-flags.mjs']),
  Object.freeze(['npm', 'run', 'validate:extension']),
  Object.freeze(['npm', 'test']),
]);

const PHASE65_ROOT_COMMANDS = Object.freeze([
  'node tests/phase65-full-tests-harness.test.js',
  'node tests/mcp-codex-adapter.test.js',
]);

const RETAINED_ROOT_COMMANDS = Object.freeze([
  'node tests/phase60-full-tests-harness.test.js',
  'node tests/phase64-full-tests-harness.test.js',
  'node tests/delegation-routing.test.js',
  'node tests/mcp-opencode-adapter.test.js --section adapter',
  'node tests/mcp-agent-drift-smoke.test.js',
  'node tests/mcp-spawn-supervisor.test.js',
  'node tests/mcp-opencode-server-topology.test.js',
  'node tests/mcp-agent-orphan-recovery.test.js',
  'node tests/agent-provider-forbidden-flags.test.js',
  'node tests/delegation-phase-contract.test.js',
  'node tests/providers-panel-logic.test.js',
  'node tests/providers-panel-ui.test.js',
]);

function exactOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function parseInjectedCommands() {
  const source = process.env.FSB_PHASE65_TEST_COMMANDS_JSON;
  if (source === undefined) return PHASE65_COMMANDS;
  if (!testRepositoryRoot) {
    throw new Error('injected Phase 65 commands require an injected repository root');
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_INJECTED_COMMAND_BYTES) {
    throw new Error('injected Phase 65 commands exceed the byte limit');
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('injected Phase 65 commands must be valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_COMMANDS) {
    throw new Error('injected Phase 65 commands must be a bounded non-empty array');
  }
  for (const command of parsed) {
    if (!Array.isArray(command) || command.length < 1 || command.length > MAX_ARGUMENTS) {
      throw new Error('every injected Phase 65 command must be a bounded argv array');
    }
    if (command.some((argument) => (
      typeof argument !== 'string' || argument.length === 0 || argument.includes('\0')
    ))) {
      throw new Error('every injected Phase 65 argument must be a non-empty string');
    }
  }
  return Object.freeze(parsed.map((command) => Object.freeze([...command])));
}

function assertStaticContracts() {
  const packagePath = resolve(repositoryRoot, 'package.json');
  const ciPath = resolve(repositoryRoot, '.github/workflows/ci.yml');
  if (!existsSync(packagePath) || !existsSync(ciPath)) {
    throw new Error('root package and CI workflow are required');
  }
  const rootPackage = JSON.parse(readFileSync(packagePath, 'utf8'));
  const rootTest = String(rootPackage.scripts?.test || '');
  const rootCommands = rootTest.split(' && ');
  for (const command of [...PHASE65_ROOT_COMMANDS, ...RETAINED_ROOT_COMMANDS]) {
    if (rootCommands.filter((candidate) => candidate === command).length !== 1) {
      throw new Error(`root Phase 65 command count is not exact: ${command}`);
    }
  }
  if (rootTest.includes('scripts/run-phase65-full-tests.mjs')) {
    throw new Error('root Phase 65 chain recursively invokes the guarded runner');
  }

  const rootBuildCommand = ['npm', '--prefix', 'mcp', 'run', 'build'].join(' ');
  const buildIndex = rootCommands.indexOf(rootBuildCommand);
  const openCodeIndex = rootCommands.indexOf('node tests/mcp-opencode-adapter.test.js --section adapter');
  const codexIndex = rootCommands.indexOf('node tests/mcp-codex-adapter.test.js');
  const driftIndex = rootCommands.indexOf('node tests/mcp-agent-drift-smoke.test.js');
  const supervisorIndex = rootCommands.indexOf('node tests/mcp-spawn-supervisor.test.js');
  const topologyIndex = rootCommands.indexOf('node tests/mcp-opencode-server-topology.test.js');
  const recoveryIndex = rootCommands.indexOf('node tests/mcp-agent-orphan-recovery.test.js');
  if (
    rootCommands.filter((command) => command === rootBuildCommand).length !== 1
    || !(buildIndex < openCodeIndex && openCodeIndex < codexIndex && codexIndex < driftIndex)
    || !(supervisorIndex < topologyIndex && topologyIndex < recoveryIndex)
  ) {
    throw new Error('root Phase 65 commands are outside their protected dependency order');
  }
  const phase60Harness = rootCommands.indexOf('node tests/phase60-full-tests-harness.test.js');
  const phase64Harness = rootCommands.indexOf('node tests/phase64-full-tests-harness.test.js');
  const phase65Harness = rootCommands.indexOf('node tests/phase65-full-tests-harness.test.js');
  const delegationStart = rootCommands.indexOf('node tests/delegation-routing.test.js');
  if (!(phase60Harness < phase64Harness
      && phase64Harness < phase65Harness
      && phase65Harness < delegationStart)) {
    throw new Error('Phase 65 preservation harness is outside its protected root slot');
  }

  const ciSource = readFileSync(ciPath, 'utf8');
  if (
    exactOccurrences(ciSource, 'name: Phase 65 Codex contract (sole Linux root invocation)') !== 1
    || exactOccurrences(ciSource, 'run: npm test') !== 1
    || ciSource.includes('run: node scripts/run-phase64-full-tests.mjs')
    || ciSource.includes('run: node scripts/run-phase65-full-tests.mjs')
  ) {
    throw new Error('CI does not retain one Phase 65 root invocation');
  }
  if (
    exactOccurrences(ciSource, 'name: Phase 62 adapter drift smoke') !== 1
    || exactOccurrences(ciSource, 'run: node tests/mcp-agent-drift-smoke.test.js') !== 1
  ) {
    throw new Error('CI generalized drift-smoke invocation is not exact');
  }
  const allGreenStart = ciSource.indexOf('  all-green:');
  const allGreen = allGreenStart < 0 ? '' : ciSource.slice(allGreenStart);
  if (!/needs:\s*\[[^\]]*extension[^\]]*mcp-smoke[^\]]*\]/.test(allGreen)) {
    throw new Error('CI all-green no longer depends on root and drift-smoke jobs');
  }
}

let activeChild = null;
let receivedSignal = null;
let outputLimitExceeded = false;

function onSignal(signal) {
  if (receivedSignal) return;
  receivedSignal = signal;
  if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
    try {
      activeChild.kill(signal);
    } catch {
      // The preserving wrapper's settlement and final result stay authoritative.
    }
  }
}

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

function forwardBounded(stream, destination, state) {
  stream.on('data', (chunk) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = MAX_CHILD_OUTPUT_BYTES - state.bytes;
    if (remaining > 0) destination.write(bytes.subarray(0, remaining));
    state.bytes += bytes.length;
    if (state.bytes > MAX_CHILD_OUTPUT_BYTES && !outputLimitExceeded) {
      outputLimitExceeded = true;
      if (activeChild) activeChild.kill('SIGTERM');
    }
  });
}

function runChild(command, label) {
  return new Promise((resolveResult) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      activeChild = null;
      resolveResult(result);
    };
    try {
      const child = spawn(command[0], command.slice(1), {
        cwd: repositoryRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      activeChild = child;
      forwardBounded(child.stdout, process.stdout, { bytes: 0 });
      forwardBounded(child.stderr, process.stderr, { bytes: 0 });
      child.once('error', (error) => settle(Object.freeze({ label, error })));
      child.once('close', (status, signal) => settle(Object.freeze({ label, status, signal })));
      if (receivedSignal) child.kill(receivedSignal);
    } catch (error) {
      settle(Object.freeze({ label, error }));
    }
  });
}

function resultFailure(result) {
  if (result.error) return `${result.label} could not be spawned`;
  if (result.signal) return `${result.label} exited from ${result.signal}`;
  if (!Number.isInteger(result.status)) return `${result.label} returned no exit status`;
  if (result.status !== 0) return `${result.label} exited ${result.status}`;
  return null;
}

const failures = [];
let primaryExitCode = 0;

try {
  if (process.argv.length !== 2) throw new Error('usage: run-phase65-full-tests.mjs');
  if (process.env.FSB_PHASE65_TEST_SKIP_STATIC_CONTRACTS === '1') {
    if (!testRepositoryRoot) throw new Error('static contract bypass requires an injected repository root');
  } else {
    assertStaticContracts();
  }
  if (process.env.FSB_PHASE65_TEST_WRAPPER_PATH && !testRepositoryRoot) {
    throw new Error('test wrapper override requires an injected repository root');
  }
  const commands = parseInjectedCommands();
  const executable = process.env.FSB_PHASE65_TEST_EXECUTABLE || process.execPath;
  if (process.env.FSB_PHASE65_TEST_EXECUTABLE && !testRepositoryRoot) {
    throw new Error('test executable override requires an injected repository root');
  }
  const result = await runChild([
    executable,
    wrapperPath,
    '--commands-json',
    JSON.stringify(commands),
  ], 'guarded Phase 65 matrix');
  const failure = resultFailure(result);
  if (failure) {
    failures.push(failure);
    primaryExitCode = Number.isInteger(result.status) && result.status !== 0 ? result.status : 1;
  }
} catch (error) {
  primaryExitCode = primaryExitCode || 1;
  failures.push(error instanceof Error ? error.message : 'Phase 65 runner failed');
} finally {
  if (outputLimitExceeded) {
    failures.push('guarded Phase 65 matrix exceeded the bounded output limit');
    primaryExitCode = primaryExitCode || 1;
  }
  if (receivedSignal) {
    failures.push(`runner received ${receivedSignal}`);
    primaryExitCode = receivedSignal === 'SIGINT' ? 130 : 143;
  }
}

if (failures.length > 0) {
  for (const failure of [...new Set(failures)]) {
    console.error(`[phase65-full-tests] ${failure}`);
  }
  process.exit(primaryExitCode || 1);
}

console.log('[phase65-full-tests] PASS: focused, extension, and root matrices passed with workspace identity preserved');
