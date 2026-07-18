'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

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

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

const repoRoot = path.resolve(__dirname, '..');
const canonicalVersion = '0.10.0';
const prePhase57MessageTypes = [
  'mcp:start-automation', 'mcp:stop-automation', 'mcp:get-status',
  'mcp:get-task-snapshot', 'mcp:trigger', 'mcp:stop-trigger',
  'mcp:get-trigger-status', 'mcp:list-triggers', 'mcp:start-visual-session',
  'mcp:end-visual-session', 'mcp:execute-action', 'mcp:go-back',
  'mcp:get-dom', 'mcp:get-tabs', 'mcp:get-site-guides',
  'mcp:get-page-snapshot', 'mcp:get-memory', 'mcp:get-config',
  'mcp:read-page', 'mcp:list-sessions', 'mcp:get-session', 'mcp:get-logs',
  'mcp:search-memory', 'mcp:create-agent', 'mcp:list-agents',
  'mcp:run-agent', 'mcp:stop-agent', 'mcp:delete-agent', 'mcp:toggle-agent',
  'mcp:get-agent-stats', 'mcp:get-agent-history', 'mcp:list-credentials',
  'mcp:fill-credential', 'mcp:list-payments', 'mcp:use-payment-method',
  'mcp:capabilities-search', 'mcp:capabilities-invoke', 'agent:register',
  'agent:release', 'agent:status',
];
const prePhase57ToolDefinitionsHash = '94ccbd785f8daefeea67032534ad6dd0864129e12569964254735086b93edac2';
const prePhase61ExtensionPermissions = [
  'activeTab', 'scripting', 'storage', 'unlimitedStorage', 'tabs', 'windows',
  'sidePanel', 'debugger', 'webNavigation', 'alarms', 'clipboardWrite',
  'offscreen', 'system.memory',
];
const phase63ExtensionPermissions = [
  'activeTab', 'scripting', 'storage', 'unlimitedStorage', 'tabs', 'windows',
  'sidePanel', 'debugger', 'webNavigation', 'alarms', 'clipboardWrite',
  'offscreen', 'nativeMessaging', 'system.memory',
];
const phase63ExactProductionDependencies = Object.freeze({
  '@modelcontextprotocol/sdk': '1.29.0',
  'smol-toml': '1.6.1',
  'strip-json-comments': '5.0.3',
  ws: '8.19.0',
  yaml: '2.8.3',
  zod: '3.25.76',
});
const phase63BundleDependencies = Object.freeze([
  '@modelcontextprotocol/sdk',
  'smol-toml',
  'strip-json-comments',
  'ws',
  'yaml',
  'zod',
]);
const prePhase61ContentScripts = [
  {
    matches: ['<all_urls>'],
    js: ['canvas-interceptor.js'],
    run_at: 'document_start',
    world: 'MAIN',
  },
];
const phase59ExtErrorCodes = [
  'agent_provider_offline',
  'bridge_topology_changed',
  'ext_unauthorized',
  'invalid_ext_request',
  'ext_request_timeout',
];
const phase60AdapterMethods = ['detect', 'buildSpawn', 'parseEvents', 'kill', 'caps'];

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, relativePath))).digest('hex');
}

function dependencyNameFromLockPath(lockPath) {
  const match = lockPath.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/);
  return match ? match[1] : null;
}

function resolveLockedDependencyPath(lock, fromPackagePath, dependencyName) {
  let current = fromPackagePath;
  while (true) {
    const candidate = current
      ? `${current}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (lock.packages[candidate]) return candidate;
    if (!current) break;
    const parentNodeModules = current.lastIndexOf('/node_modules/');
    current = parentNodeModules === -1 ? '' : current.slice(0, parentNodeModules);
  }
  return null;
}

function deriveProductionLockRows(lock) {
  const root = lock.packages[''];
  const queue = Object.keys(root.dependencies || {})
    .sort()
    .map((name) => resolveLockedDependencyPath(lock, '', name));
  const seen = new Set();
  while (queue.length > 0) {
    const lockPath = queue.shift();
    if (!lockPath || seen.has(lockPath)) continue;
    seen.add(lockPath);
    const entry = lock.packages[lockPath];
    for (const name of [...new Set([
      ...Object.keys(entry.dependencies || {}),
      ...Object.keys(entry.optionalDependencies || {}),
    ])].sort()) {
      queue.push(resolveLockedDependencyPath(lock, lockPath, name));
    }
  }
  return [...seen].sort().map((lockPath) => {
    const entry = lock.packages[lockPath];
    return {
      path: lockPath,
      name: dependencyNameFromLockPath(lockPath),
      version: entry.version,
      integrity: entry.integrity,
    };
  });
}

function recursivelyListFiles(relativeRoot) {
  const files = [];
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  function visit(absoluteDirectory, relativeDirectory) {
    for (const name of fs.readdirSync(absoluteDirectory).sort()) {
      const absolutePath = path.join(absoluteDirectory, name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const stat = fs.lstatSync(absolutePath);
      if (stat.isDirectory() && !stat.isSymbolicLink()) visit(absolutePath, relativePath);
      else files.push(relativePath);
    }
  }
  visit(absoluteRoot, '');
  return files;
}

function extractMcpMessageTypes(typesSource) {
  const start = typesSource.indexOf('export type MCPMessageType =');
  const end = typesSource.indexOf('\n\n// Messages FROM extension TO MCP server', start);
  if (start < 0 || end < 0) return [];
  return Array.from(typesSource.slice(start, end).matchAll(/^\s*\|\s*'([^']+)'/gm), (match) => match[1]);
}

function extractRuntimeVersion(versionSource) {
  const match = versionSource.match(/FSB_MCP_VERSION = '([^']+)'/);
  return match ? match[1] : null;
}

function collectExplicitVersions(text) {
  const matches = [];
  const patterns = [
    /fsb-mcp-server@(\d+\.\d+\.\d+)/g,
    /FSB MCP Server (\d+\.\d+\.\d+)/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match) {
      matches.push(match[1]);
      match = pattern.exec(text);
    }
  }

  return matches;
}

function runCommand(command) {
  return execSync(command, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

async function run() {
  const rootPackageJson = readJson('package.json');
  const packageJson = readJson('mcp/package.json');
  const serverJson = readJson('mcp/server.json');
  const versionSource = readText('mcp/src/version.ts');
  const packageReadme = readText('mcp/README.md');
  const rootReadme = readText('README.md');
  const typesSource = readText('mcp/src/types.ts');
  const dispatcherSource = readText('extension/ws/mcp-tool-dispatcher.js');
  const manifest = readJson('extension/manifest.json');
  const backgroundSource = readText('extension/background.js');
  const bridgeSource = readText('extension/ws/mcp-bridge-client.js');
  const delegationUiSpec = readText('.planning/phases/61-delegation-ux-sw-eviction-persistence/61-UI-SPEC.md');
  const extProtocolSource = readText('mcp/src/ext-protocol.ts');
  const adapterSource = readText('mcp/src/agent-providers/adapter.ts');
  const adapterRegistrySource = readText('mcp/src/agent-providers/registry.ts');
  const diagnosticsSource = readText('mcp/src/diagnostics.ts');
  const indexSource = readText('mcp/src/index.ts');
  const compatibilitySource = readText('mcp/src/agent-providers/compatibility.ts');
  const nativeConstantsSource = readText('mcp/src/native-host/constants.ts');
  const builtNativeConstantsSource = readText('mcp/build/native-host/constants.js');
  const nativeDaemonSource = readText('mcp/src/native-host/daemon.ts');
  const mcpLock = readJson('mcp/package-lock.json');
  const runtimeIntegrity = readJson('mcp/native-host/runtime-integrity.json');
  const ciSource = readText('.github/workflows/ci.yml');
  const packagingTestSource = readText('tests/mcp-native-host-packaging.test.js');

  console.log('\n--- metadata parity ---');
  assertEqual(packageJson.version, canonicalVersion, 'mcp/package.json version stays on canonical version parity target');
  assertEqual(extractRuntimeVersion(versionSource), canonicalVersion, 'FSB_MCP_VERSION matches canonical package version');
  assertEqual(serverJson.version, canonicalVersion, 'server.json top-level version matches canonical package version');
  assertEqual(serverJson.packages[0].version, canonicalVersion, 'server.json package version matches canonical package version');

  console.log('\n--- cli output parity ---');
  const helpOutput = runCommand('node mcp/build/index.js help');
  const installOutput = runCommand('node mcp/build/index.js install');
  assert(helpOutput.includes(`FSB MCP Server ${canonicalVersion}`), 'help output prints canonical MCP version');
  assert(installOutput.includes(`FSB MCP Server ${canonicalVersion}`), 'install output prints canonical MCP version');

  console.log('\n--- docs flow parity ---');
  assert(packageReadme.includes('doctor'), 'mcp README mentions doctor');
  assert(packageReadme.includes('status --watch'), 'mcp README mentions status --watch');
  assert(rootReadme.includes('doctor'), 'root README mentions doctor');
  assert(rootReadme.includes('status --watch'), 'root README mentions status --watch');

  const explicitVersions = [
    ...collectExplicitVersions(packageReadme),
    ...collectExplicitVersions(rootReadme),
  ];
  for (const version of explicitVersions) {
    assertEqual(version, canonicalVersion, `explicit README MCP version reference stays on ${canonicalVersion}`);
  }

  console.log('\n--- Phase 57 additive wire freeze ---');
  const messageTypes = extractMcpMessageTypes(typesSource);
  assert(
    JSON.stringify(messageTypes.slice(0, prePhase57MessageTypes.length)) === JSON.stringify(prePhase57MessageTypes),
    'every pre-Phase-57 MCPMessageType remains present, unchanged, and in order',
  );
  assert(
    JSON.stringify(messageTypes.slice(prePhase57MessageTypes.length)) === JSON.stringify(['system:client-inventory']),
    'system:client-inventory is the only Phase 57 MCPMessageType addition',
  );
  assert(
    /type: 'mcp:result' \| 'mcp:progress' \| 'mcp:error';/.test(typesSource),
    'the MCP response type union remains byte-stable',
  );
  assertEqual(sha256('extension/ai/tool-definitions.js'), prePhase57ToolDefinitionsHash,
    'extension MCP tool definitions retain the pre-Phase-57 hash');
  assertEqual(sha256('mcp/ai/tool-definitions.cjs'), prePhase57ToolDefinitionsHash,
    'server MCP tool definitions retain the pre-Phase-57 hash');
  assert(
    dispatcherSource.includes('return { success: true, agentId, agentIdShort, ownershipTokens: {}, connectionId: connectionId };'),
    'agent:register response remains the exact established envelope',
  );

  console.log('\n--- Phase 59 wire and Phase 60 adapter freeze ---');
  assert(
    messageTypes.every((type) => !type.startsWith('ext:')),
    'the Phase 59 ext frame family remains outside the historical MCPMessageType union',
  );
  for (const shape of [
    "type: 'ext:request';",
    "type: 'ext:event';",
    "type: 'ext:response'; payload: Record<string, unknown>; error?: never",
    "type: 'ext:response'; error: ExtError; payload?: never",
    "export type BridgeCapability = 'agent-spawn';",
    'capabilities?: BridgeCapability[];',
  ]) {
    assert(typesSource.includes(shape), `Phase 59 additive wire shape remains exact: ${shape}`);
  }
  const extErrorBlock = extProtocolSource.match(/EXT_ERROR_CODES = Object\.freeze\(\[([\s\S]*?)\]\s*as const\)/);
  const actualExtErrorCodes = extErrorBlock
    ? Array.from(extErrorBlock[1].matchAll(/'([^']+)'/g), (match) => match[1])
    : [];
  assert(
    JSON.stringify(actualExtErrorCodes) === JSON.stringify(phase59ExtErrorCodes),
    'Phase 59 transport errors remain the exact five-value ordered set',
  );
  assert(
    /const REQUEST_KEYS = new Set\(\['id', 'type', 'method', 'payload'\]\);/.test(extProtocolSource)
      && /const EVENT_KEYS = new Set\(\['id', 'type', 'event', 'payload'\]\);/.test(extProtocolSource)
      && /const RESPONSE_KEYS = new Set\(\['id', 'type', 'payload', 'error'\]\);/.test(extProtocolSource)
      && /if \(hasPayload === hasError\) return null;/.test(extProtocolSource),
    'Phase 59 request/event/response parsers remain closed and response payload/error stays exclusive',
  );

  const adapterInterface = adapterSource.match(/export interface AgentProviderAdapter\s*\{([\s\S]*?)\n\}/);
  const actualAdapterMethods = adapterInterface
    ? Array.from(adapterInterface[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\(/gm), (match) => match[1])
    : [];
  assert(
    JSON.stringify(actualAdapterMethods) === JSON.stringify(phase60AdapterMethods),
    'Phase 60 provider-neutral adapter remains exactly five methods in order',
  );
  assert(
    /export interface AgentEvent\s*\{\s*readonly type: AgentEventType;\s*readonly sessionId: string;\s*readonly payload: Readonly<Record<string, unknown>>;\s*\}/m.test(adapterSource),
    'Phase 60 adapter still exposes only normalized type/sessionId/payload events',
  );
  assert(
    /const CANONICAL_IDS = Object\.freeze\(\[CLAUDE_CODE_ADAPTER_ID\] as const\);/.test(adapterRegistrySource)
      && /id: CLAUDE_CODE_ADAPTER_ID,\s*adapter: createClaudeCodeAdapter\(dependencies\)/m.test(adapterRegistrySource),
    'Phase 60 production registry remains the single closed Claude Code adapter slot',
  );
  assert(
    !/(?:hold|resume|status)\s*\(/.test(adapterInterface ? adapterInterface[1] : ''),
    'Phase 61 lifecycle does not expand the frozen Phase 60 adapter interface',
  );

  console.log('\n--- Phase 62 doctor compatibility authority ---');
  const runDoctorBlock = indexSource.match(
    /async function runDoctor\([\s\S]*?\n\}\n\nasync function runWaitForExtension/,
  );
  const runDoctorSource = runDoctorBlock ? runDoctorBlock[0] : '';
  assertEqual(
    (runDoctorSource.match(/collectBridgeDiagnostics\(/g) || []).length,
    1,
    'doctor collects exactly one diagnostics snapshot',
  );
  assert(
    runDoctorSource.includes('JSON.stringify(diagnostics, null, 2)')
      && runDoctorSource.includes('formatDoctor(diagnostics)'),
    'doctor text and JSON modes consume the same collected snapshot',
  );
  assert(
    runDoctorSource.includes("diagnostics.diagnosticLayer === 'healthy' ? 0 : 1"),
    'doctor preserves its established healthy/unhealthy exit semantics',
  );
  assert(
    diagnosticsSource.includes('ADAPTER_COMPATIBILITY_MATRIX')
      && diagnosticsSource.includes('classifyAdapterCompatibility')
      && diagnosticsSource.includes('compatibilityMatrix: ADAPTER_COMPATIBILITY_MATRIX'),
    'doctor collection imports and returns the canonical compatibility authority',
  );
  assert(
    !indexSource.includes('classifyAdapterCompatibility')
      && !indexSource.includes('ADAPTER_COMPATIBILITY_MATRIX')
      && !indexSource.includes("'2.1.177'"),
    'doctor formatter neither reclassifies nor hardcodes canonical adapter versions',
  );
  assert(
    compatibilitySource.includes("profileVersion: '2.1.177'")
      && compatibilitySource.includes("minimumVersion: '2.1.177'")
      && compatibilitySource.includes("testedThroughVersion: '2.1.177'"),
    'canonical matrix remains the sole explicit Phase 62 version/profile authority',
  );

  const doctorCollectorBlock = diagnosticsSource.match(
    /async function collectAdapterDoctorRows[\s\S]*?\n\}\n\nfunction projectBridgeAuthMetadata/,
  );
  const doctorCollectorSource = doctorCollectorBlock ? doctorCollectorBlock[0] : '';
  assert(
    doctorCollectorBlock !== null
      && !/process\.env|providerConfig|sessionSecret\s*:|\.connect\s*\(|\.start\s*\(|browser|chrome\./.test(doctorCollectorSource),
    'adapter doctor collection has no auth inference, provider start, or browser authority',
  );
  const authProjectionBlock = diagnosticsSource.match(
    /function projectBridgeAuthMetadata[\s\S]*?\n\}\n\nfunction emptyActiveTab/,
  );
  const authProjectionSource = authProjectionBlock ? authProjectionBlock[0] : '';
  assert(
    authProjectionBlock !== null
      && !/\.\.\.|sessionId|allowedExtensionOrigin|previousSecret|fingerprint|bearer|token/i.test(authProjectionSource),
    'bridge-auth doctor projection neither spreads nor names forbidden private fields',
  );

  console.log('\n--- Phase 63 native doctor projection boundary ---');
  const formatDoctorBlock = indexSource.match(
    /export function formatDoctor[\s\S]*?\n\}\n\nfunction buildCursorDeeplink/,
  );
  const formatDoctorSource = formatDoctorBlock ? formatDoctorBlock[0] : '';
  assert(
    formatDoctorBlock !== null
      && formatDoctorSource.indexOf("lines.push('Bridge auth:');")
        < formatDoctorSource.indexOf("lines.push('Native messaging host:');")
      && formatDoctorSource.indexOf("lines.push('Native messaging host:');")
        < formatDoctorSource.indexOf("lines.push('Install paths:');"),
    'doctor source pins Native messaging host after Bridge auth and before Install paths',
  );
  for (const label of [
    'Install state',
    'Expected location',
    'Manifest/registry',
    'Chrome allowlist',
    'Launcher',
    'Daemon',
    'Reason',
  ]) {
    assert(
      formatDoctorSource.includes(`lines.push(\`  ${label}:`),
      `doctor formatter retains the approved native label: ${label}`,
    );
  }

  const nativeProjectorBlock = diagnosticsSource.match(
    /export function projectNativeHostBrowserStatus[\s\S]*?\n\}\n\nfunction readOwnCallable/,
  );
  const nativeProjectorSource = nativeProjectorBlock ? nativeProjectorBlock[0] : '';
  assert(
    nativeProjectorBlock !== null
      && nativeProjectorSource.includes(
        'return Object.freeze({ installState, registration, allowlist, launcher, daemon });',
      ),
    'browser-safe native projector explicitly reconstructs the exact five approved keys',
  );
  assert(
    !/expectedLocation|reason|registry|path|manifest|error|username|environment|secret|session|child|task|\.\.\./i
      .test(nativeProjectorSource),
    'browser-safe native projector cannot name or spread local, registry, or private detail',
  );
  assert(
    runDoctorSource.includes('JSON.stringify(diagnostics, null, 2)')
      && runDoctorSource.includes('formatDoctor(diagnostics)')
      && !/installNativeHost|uninstallNativeHost|wakeNativeHost|repairNativeHost|rotateBridgeSessionSecret|resetBridgePairing|startServeDelegation/.test(runDoctorSource),
    'the one doctor route projects one snapshot without native mutation, wake, pairing, or serve authority',
  );

  const nativeCollectionIndex = diagnosticsSource.indexOf(
    'const nativeHost = await collectNativeHostDoctor(inspectNativeHost);',
  );
  const bridgeCreationIndex = diagnosticsSource.indexOf('const bridge = bridgeFactory();');
  assert(
    nativeCollectionIndex >= 0
      && bridgeCreationIndex >= 0
      && nativeCollectionIndex < bridgeCreationIndex,
    'native diagnostics are collected once before bridge probes',
  );
  assertEqual(
    (diagnosticsSource.match(/const nativeHost = await collectNativeHostDoctor\(inspectNativeHost\);/g) || []).length,
    1,
    'the diagnostics collector has one native inspection collection site',
  );
  const doctorLayerBlock = diagnosticsSource.match(
    /export function classifyDoctorLayer[\s\S]*?\n\}\n\nexport function applyDiagnosticClassification/,
  );
  assert(
    doctorLayerBlock !== null && !doctorLayerBlock[0].includes('nativeHost'),
    'optional native-host state cannot change historical doctor-layer classification',
  );

  console.log('\n--- Phase 61 Chrome 116 and Phase 63 native permission boundary ---');
  assertEqual(manifest.manifest_version, 3, 'extension remains on Manifest V3');
  assertEqual(manifest.minimum_chrome_version, '116', 'extension minimum Chrome version is exactly string 116');
  assertEqual(rootPackageJson.engines.chrome, '>=116.0.0', 'root engine metadata requires Chrome 116');
  assertEqual(rootPackageJson.config.min_chrome_version, '116.0.0', 'root setup metadata requires Chrome 116');
  assertEqual(
    String(Number.parseInt(rootPackageJson.engines.chrome.replace(/^>=/, ''), 10)),
    manifest.minimum_chrome_version,
    'engine metadata normalizes to the manifest Chrome floor',
  );
  assertEqual(
    String(Number.parseInt(rootPackageJson.config.min_chrome_version, 10)),
    manifest.minimum_chrome_version,
    'setup metadata normalizes to the manifest Chrome floor',
  );
  assert(
    JSON.stringify(manifest.permissions) === JSON.stringify(phase63ExtensionPermissions),
    'Phase 63 permission roster is the established ordered roster plus nativeMessaging',
  );
  assert(
    JSON.stringify(manifest.host_permissions) === JSON.stringify(['<all_urls>']),
    'Chrome 116 pin adds no host permission',
  );
  assert(
    JSON.stringify(manifest.background) === JSON.stringify({ service_worker: 'background.js' }),
    'background service-worker declaration remains unchanged',
  );
  assert(
    JSON.stringify(manifest.content_scripts) === JSON.stringify(prePhase61ContentScripts),
    'content-script declarations remain unchanged',
  );
  assertEqual(
    manifest.permissions.filter((permission) => permission === 'nativeMessaging').length,
    1,
    'nativeMessaging permission appears exactly once',
  );
  assert(!manifest.permissions.includes('downloads'), 'downloads permission remains absent');
  for (const manifestKey of ['optional_permissions', 'optional_host_permissions', 'externally_connectable']) {
    assert(!Object.prototype.hasOwnProperty.call(manifest, manifestKey), `${manifestKey} authority remains absent`);
  }

  const bridgeImport = "try { importScripts('ws/mcp-bridge-client.js'); } catch (e) { console.error('[FSB] Failed to load mcp-bridge-client.js:', e.message); }";
  assertEqual(backgroundSource.split(bridgeImport).length - 1, 1, 'background loads the established bridge script exactly once');
  assert(
    backgroundSource.indexOf("importScripts('ws/mcp-tool-dispatcher.js')") < backgroundSource.indexOf(bridgeImport),
    'bridge load order remains after the MCP dispatcher',
  );

  for (const pattern of [
    /chrome\.runtime\.(?:connectNative|sendNativeMessage)\s*\(/,
    /\bnativeMessaging\b/,
    /\bchild_process\b/,
    /\bprocess\s*\./,
    /\b(?:execFile|execSync|spawn|spawnSync|fork)\s*\(/,
    /\brestart(?:Daemon|Service|Process)\s*\(/i,
  ]) {
    assert(!pattern.test(bridgeSource), `extension bridge has no native, shell, process, or daemon-restart authority matching ${pattern}`);
  }

  for (const snippet of [
    'Copy doctor command',
    'Open provider setup',
    'does not offer automatic retry or daemon restart',
    'It cannot edit files, run shell commands, or fetch arbitrary URLs.',
  ]) {
    assert(delegationUiSpec.includes(snippet), `approved future UI contract retains data-only recovery text: ${snippet}`);
  }
  assert(!/doctor|provider setup/i.test(bridgeSource), 'bridge does not implement or execute future doctor/setup UI dispositions');

  console.log('\n--- Phase 63 protocol, package, and artifact parity ---');
  const nativeConstantTokens = [
    "NATIVE_HOST_NAME = 'io.github.fullselfbrowsing.fsb_native_host'",
    "NATIVE_HOST_DEFAULT_EXTENSION_ID = 'badgafnfchcihdfnjneklogedcdkmjfk'",
    'NATIVE_HOST_PROTOCOL_VERSION = 1',
    'NATIVE_HOST_MAX_FRAME_BYTES = 4096',
    "NATIVE_HOST_HEALTH_PRODUCT = 'fsb-mcp-server'",
    "NATIVE_HOST_HEALTH_PROTOCOL = 'fsb-native-host-health-v1'",
    'NATIVE_HOST_OWNER_MARKER_SCHEMA = 1',
  ];
  for (const token of nativeConstantTokens) {
    assert(nativeConstantsSource.includes(token), `source native-host constants retain ${token}`);
    assert(builtNativeConstantsSource.includes(token), `compiled native-host constants retain ${token}`);
  }
  assert(
    nativeDaemonSource.includes("const HEALTH_URL = 'http://127.0.0.1:7226/health';")
      && nativeDaemonSource.includes('value.service !== NATIVE_HOST_HEALTH_PRODUCT')
      && nativeDaemonSource.includes('value.nativeHostProtocol !== NATIVE_HOST_PROTOCOL_VERSION')
      && nativeDaemonSource.includes("return value.serveReady ? 'ready' : 'not_ready';"),
    'daemon health gate pins loopback endpoint, product, protocol, and explicit readiness',
  );

  assert(
    JSON.stringify(packageJson.dependencies) === JSON.stringify(phase63ExactProductionDependencies),
    'MCP direct production dependencies remain exact-pinned and closed',
  );
  assert(
    JSON.stringify(packageJson.bundleDependencies) === JSON.stringify(phase63BundleDependencies),
    'MCP bundleDependencies retain the exact ordered production roster',
  );
  assert(
    JSON.stringify(mcpLock.packages[''].dependencies) === JSON.stringify(phase63ExactProductionDependencies)
      && JSON.stringify(mcpLock.packages[''].bundleDependencies) === JSON.stringify(phase63BundleDependencies),
    'lock root repeats the exact dependency pins and bundle roster',
  );
  assert(
    runtimeIntegrity.schema === 1
      && runtimeIntegrity.packageName === packageJson.name
      && runtimeIntegrity.packageVersion === packageJson.version
      && runtimeIntegrity.lockSha256 === sha256('mcp/package-lock.json'),
    'runtime integrity receipt binds schema, package identity, version, and exact lock bytes',
  );
  assert(
    JSON.stringify(runtimeIntegrity.directDependencies) === JSON.stringify(
      phase63BundleDependencies.map((name) => ({
        name,
        version: phase63ExactProductionDependencies[name],
      })),
    )
      && JSON.stringify(runtimeIntegrity.bundleDependencies) === JSON.stringify(phase63BundleDependencies)
      && JSON.stringify(runtimeIntegrity.productionPackages) === JSON.stringify(deriveProductionLockRows(mcpLock)),
    'runtime integrity receipt is the exact lock-derived production closure',
  );

  assertEqual(packageJson.files.filter((entry) => entry === 'native-host/').length, 1,
    'MCP package includes the native-host payload root exactly once');
  for (const artifactPath of [
    'mcp/native-host/posix/fsb-native-host-launcher.mjs.in',
    'mcp/native-host/runtime-integrity.json',
    'mcp/native-host/windows/fsb-native-host-bootstrap.c',
    'mcp/native-host/windows/fsb-native-host-bootstrap-version.rc.in',
  ]) {
    assert(fs.existsSync(path.join(repoRoot, artifactPath)), `required native package source exists: ${artifactPath}`);
  }
  for (const workflowToken of [
    'native-host-windows:',
    'node scripts/build-native-host-windows.mjs --arch x64',
    'node scripts/build-native-host-windows.mjs --arch arm64',
    'mcp/native-host/bin/win32-x64/fsb-native-host.exe',
    'mcp/native-host/bin/win32-arm64/fsb-native-host.exe',
    'mcp/native-host/windows-artifacts.json',
    'runtime-payload:',
    'node tests/mcp-native-host-packaging.test.js --section workflow-and-pack',
  ]) {
    assert(ciSource.includes(workflowToken), `CI retains blocking native artifact proof: ${workflowToken}`);
  }
  for (const packedArtifactToken of [
    'native-host/bin/win32-x64/fsb-native-host.exe',
    'native-host/bin/win32-arm64/fsb-native-host.exe',
    'native-host/windows-artifacts.json',
    'native-host/posix/fsb-native-host-launcher.mjs.in',
    'native-host/runtime-integrity.json',
    'build/native-host/index.js',
  ]) {
    assert(packagingTestSource.includes(packedArtifactToken),
      `packed-artifact contract retains ${packedArtifactToken}`);
  }
  const nativePayloadFiles = recursivelyListFiles('mcp/native-host');
  assert(
    nativePayloadFiles.every((relativePath) => !/(?:^|\/)(?:[^/]+\.(?:bat|cmd)|native-host-shim|com\.fsb\.mcp|sea-config)(?:$|\/)/iu.test(relativePath)),
    'native payload tree contains no batch, command, SEA, or historical-shim artifact',
  );
  const nativeSourceGraph = recursivelyListFiles('mcp/src/native-host')
    .map((relativePath) => readText(`mcp/src/native-host/${relativePath}`))
    .join('\n');
  assert(
    !/com\.fsb\.mcp|native-host-shim|mcp-to-ext|ext-to-mcp|ipc[-_ ]relay|echo[-_ ]mode/iu.test(nativeSourceGraph),
    'native source graph contains no historical shim, relay, or echo-mode authority',
  );

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
