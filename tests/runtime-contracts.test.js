/**
 * Regression checks for narrowed runtime/emitter contracts.
 * Run: node tests/runtime-contracts.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function readRepoFile() {
  return fs.readFileSync(path.join(__dirname, '..', ...arguments), 'utf8');
}

const backgroundSource = readRepoFile('extension', 'background.js');
const stateEmitterSource = readRepoFile('extension', 'ai', 'state-emitter.js');
const popupSource = readRepoFile('extension', 'ui', 'popup.js');
const sidepanelSource = readRepoFile('extension', 'ui', 'sidepanel.js');
const dashboardSource = readRepoFile('showcase', 'js', 'dashboard.js');
const wsClientSource = readRepoFile('extension', 'ws', 'ws-client.js');
const adapterSource = readRepoFile('mcp', 'src', 'agent-providers', 'adapter.ts');
const authoritySource = readRepoFile('mcp', 'src', 'agent-providers', 'effective-authority.ts');
const runtimeFilesSource = readRepoFile('mcp', 'src', 'agent-providers', 'runtime-files.ts');
const spawnSupervisorSource = readRepoFile('mcp', 'src', 'agent-providers', 'spawn-supervisor.ts');
const serveDelegationSource = readRepoFile('mcp', 'src', 'agent-providers', 'serve-delegation.ts');
const registrySource = readRepoFile('mcp', 'src', 'agent-providers', 'registry.ts');
const preSpawnBarrierSource = spawnSupervisorSource.slice(
  spawnSupervisorSource.indexOf('private async executePreSpawnAuthorityBarrier('),
  spawnSupervisorSource.indexOf('private async resolveActivation('),
);

console.log('\n--- background contract cleanup tests ---');

// Phase 166 narrowed createSessionHooks to drop the emitter passthrough; a
// later refactor moved progress hooks to a sendSessionStatus callback and
// removed SessionStateEmitter from background.js entirely. These regression
// asserts lock in the further-narrowed contract.
assert(!backgroundSource.includes('emitter: sessionHooks.emitter'), 'background no longer passes sessionHooks.emitter into runAgentLoop');
assert(!/new\s+SessionStateEmitter\s*\(/.test(backgroundSource), 'background no longer instantiates SessionStateEmitter');
assert(backgroundSource.includes('createToolProgressHook(function'), 'tool progress hook is wired to a sendSessionStatus callback');
assert(backgroundSource.includes('sendSessionStatus(tabId, statusData)'), 'progress hook callback delegates to sendSessionStatus');
assert(backgroundSource.includes('function createSessionHooks(sessionId)'), 'createSessionHooks signature preserved');

console.log('\n--- direct consumer boundary tests ---');

// popup migrated off sessionStateEvent to dedicated statusUpdate /
// automationComplete / automationError channels; sidepanel is still the only
// direct sessionStateEvent consumer.
assert(!popupSource.includes("case 'sessionStateEvent':"), 'popup no longer consumes sessionStateEvent directly');
assert(popupSource.includes("case 'statusUpdate':") || popupSource.includes("case 'automationComplete':"), 'popup consumes statusUpdate / automationComplete channels');
assert(sidepanelSource.includes("case 'sessionStateEvent':"), 'sidepanel still consumes sessionStateEvent');
assert(!dashboardSource.includes('sessionStateEvent'), 'dashboard does not consume sessionStateEvent directly');
assert(!wsClientSource.includes('sessionStateEvent'), 'ws client does not consume or relay sessionStateEvent directly');

console.log('\n--- state-emitter documentation tests ---');

assert(stateEmitterSource.includes('popup and sidepanel'), 'state-emitter docs name popup and sidepanel as direct consumers');
assert(
  stateEmitterSource.includes('Dashboard state') && stateEmitterSource.includes('uses separate status and relay channels.'),
  'state-emitter docs explain dashboard state uses separate channels'
);
assert(!stateEmitterSource.includes('sidepanel, popup, and\ndashboard listeners receive delta updates without polling'), 'state-emitter no longer claims dashboard receives sessionStateEvent directly');

console.log('\n--- direct runtime authority contracts ---');

assert(adapterSource.includes('export interface DirectRuntimeReference'), 'adapter exposes the private direct runtime reference type');
assert(adapterSource.includes('export interface PreSpawnIdentityProbe'), 'adapter exposes the private pre-spawn identity descriptor');
assert(adapterSource.includes('export interface EffectiveAuthorityAttestation'), 'adapter exposes the private effective-authority descriptor');
assert(authoritySource.includes("endpointRef: 'direct_runtime_endpoint'"), 'authority descriptor resolves only a supervisor-owned endpoint reference');
assert(authoritySource.includes("parsed.hostname !== '127.0.0.1'"), 'direct runtime materialization pins numeric loopback');
assert(serveDelegationSource.indexOf('await dependencies.startHttp') < serveDelegationSource.indexOf('createDirectRuntimeReference('), 'serve materializes the direct reference only after HTTP ownership');
assert(serveDelegationSource.includes('dependencies.mintGeneration()'), 'serve owns the direct runtime generation');
assert(registrySource.includes('CODEX_ADAPTER_ID') && registrySource.includes('createCodexAdapter'), 'production adapter roster retains the canonical Codex registration');
assert(!authoritySource.includes('CODEX_ADAPTER_ID') && !authoritySource.includes('createCodexAdapter'), 'generic authority substrate remains provider-neutral after Codex registration');
assert(spawnSupervisorSource.includes('executePreSpawnAuthorityBarrier'), 'supervisor owns the generic pre-spawn authority barrier');
assert(spawnSupervisorSource.includes('runBoundedProcessProbe'), 'supervisor consumes the bounded byte-probe primitive');
assert(spawnSupervisorSource.indexOf('executePreSpawnAuthorityBarrier(') < spawnSupervisorSource.indexOf("role: 'direct',"), 'pre-spawn authority completes before direct runtime preparation');
assert(runtimeFilesSource.includes("'direct',"), 'runtime files expose the direct scratch role');
assert(runtimeFilesSource.includes("entry.role === 'direct'"), 'direct scratch cleanup has an exact empty-directory path');
assert(!spawnSupervisorSource.includes("run.adapterId === 'codex'") && !spawnSupervisorSource.includes("run.adapterId !== 'codex'"), 'generic supervisor authority has no provider-id branch');
assert(!/(?:run|spec)\.adapterId\s*(?:===|!==|==|!=)|switch\s*\(\s*(?:run|spec)\.adapterId|(?:CODEX|OPENCODE|CLAUDE_CODE)_ADAPTER_ID/.test(preSpawnBarrierSource), 'pre-spawn authority barrier uses the generic adapter descriptor without a provider-id conditional');

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
