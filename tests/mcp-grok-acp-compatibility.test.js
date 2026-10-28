#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { PassThrough, Readable } = require('node:stream');
const { EventEmitter } = require('node:events');

const buildRoot = path.resolve(__dirname, '../mcp/build/agent-providers');
const load = (name) => import(pathToFileURL(path.join(buildRoot, name)).href);

function initialize(version, authenticated = true) {
  return {
    jsonrpc: '2.0', id: 1,
    result: {
      protocolVersion: 1,
      agentCapabilities: {
        mcpCapabilities: { http: true, sse: true },
        sessionCapabilities: { close: {}, list: {} },
        futureInformationalCapability: { description: 'Additional capability advertised only' },
      },
      authMethods: [
        { id: 'grok.com', name: 'Updated account label', description: 'New explanatory text', future: true },
        { id: 'api_key', name: 'API key', description: 'Not selected by FSB' },
        ...(authenticated ? [{ id: 'cached_token', name: 'Saved OAuth', description: 'Stored account' }] : []),
      ],
      _meta: {
        agentVersion: version,
        defaultAuthMethodId: authenticated ? 'cached_token' : null,
        mcpServers: [],
        futureDisplayField: { enabled: true },
      },
    },
  };
}

function response(stdout = '', code = 0) {
  const out = Buffer.from(stdout);
  const err = Buffer.alloc(0);
  return { stdout: out, stderr: err, exit: { code, signal: null }, zeroize() { out.fill(0); err.fill(0); } };
}

async function testContracts(contract) {
  for (const version of ['1.0.4', '1.0.62', '1.0.999', '1.12.0', '2.0.0', '10.1.2']) {
    const init = initialize(version);
    init._meta = { traceFormat: 2 };
    assert.deepEqual(contract.parseGrokBuildInitializeResponse(init, version), {
      authState: 'oauth', authenticationMethodId: 'cached_token',
    }, `capabilities, not CLI version ${version}, determine protocol compatibility`);
    assert.equal(contract.parseGrokBuildInitializeResponse(init, '99.0.0'), null,
      'the running executable must agree with the retained detected version');
    const auth = { jsonrpc: '2.0', id: 2, result: { _meta: {
      auth_mode: 'Oidc', subscription_tier: 'SuperGrok',
      is_team_principal: false, can_administer_team: true,
      feedback_trace_offer: false, backend_billed: true,
    } } };
    assert.equal(contract.validateGrokBuildAuthenticationResponse(auth), true);
    assert(contract.parseGrokBuildProbeTranscript([
      { jsonrpc: '2.0', method: '_x.ai/models/catalog_changed', params: { generation: 12 } },
      init, auth,
    ], true, version));
    assert.deepEqual(contract.parseGrokBuildInitializeResponse(initialize(version, false), version), {
      authState: 'unauthenticated', authenticationMethodId: null,
    });
  }
  for (const mutate of [
    (r) => { r.protocolVersion = 2; },
    (r) => { r.agentCapabilities.mcpCapabilities.http = false; },
    (r) => { delete r.agentCapabilities.sessionCapabilities.close; },
    (r) => { r._meta.mcpServers = [{ name: 'other' }]; },
    (r) => { r._meta.defaultAuthMethodId = 'api_key'; },
    (r) => { r.authMethods.push({ id: 'cached_token', name: 'Duplicate' }); },
  ]) {
    const init = initialize('1.0.62'); mutate(init.result);
    assert.equal(contract.parseGrokBuildInitializeResponse(init, '1.0.62'), null);
  }
  assert.equal(contract.validateGrokBuildAuthenticationResult({ _meta: { auth_mode: 'ApiKey' } }), false);
  assert.equal(contract.validateGrokBuildAuthenticationResult({ _meta: { auth_mode: 'Oidc', futureAccountDisplay: {} } }), true);
  assert.equal(contract.parseGrokBuildProbeTranscript([initialize('1.0.62'), initialize('1.0.62')], false, '1.0.62'), null);
  assert.equal(contract.parseGrokBuildExtensionNotification({ jsonrpc: '2.0', method: '_x.ai/permissions/changed', params: {} }), null);
  assert.equal(contract.parseGrokBuildExtensionNotification({ jsonrpc: '2.0', method: '_x.ai/mcp/future_server', params: {} }), null);
  assert.deepEqual(contract.grokBuildMcpServerStatusFromNotification({ kind: 'mcp_server_status', params: {
    sessionId: 'owned-session', name: 'fsb', source: 'local', status: 'ready', futureProgress: true,
  } }), { sessionId: 'owned-session', name: 'fsb', source: 'local', status: 'ready' });
}

async function testResponseDrivenProbe(probeModule, environmentModule) {
  const environment = environmentModule.buildSanitizedAgentEnvironment(
    process.env, {}, environmentModule.DELEGATION_AGENT_ENVIRONMENT_POLICY,
  );
  const childProgram = `
    let input = '', initialized = false;
    const seen = [];
    process.stdin.on('data', b => {
      input += b;
      for (;;) {
        const end = input.indexOf('\\n');
        if (end < 0) return;
        const request = JSON.parse(input.slice(0,end)); input = input.slice(end+1);
        seen.push(request.id);
        if (request.id === 1) {
          setTimeout(() => {
            initialized = true;
            process.stdout.write(JSON.stringify({jsonrpc:'2.0', id:1, result:{ready:true}})+'\\n');
          }, 10);
        } else if (request.id === 2) {
          if (!initialized) process.exit(9);
          const line=JSON.stringify({result:{ready:true}, id:2, jsonrpc:'2.0'})+'\\n';
          process.stdout.write(line.slice(0,12));
          setTimeout(() => process.stdout.write(line.slice(12)), 10);
        }
      }
    });
    process.stdin.on('end', () => process.exit(JSON.stringify(seen) === '[1,2]' ? 0 : 8));
  `;
  const result = await probeModule.runBoundedProcessProbe({
    command: process.execPath, argv: ['-e', childProgram], cwd: process.cwd(), environment,
    timeoutMs: 5000, stdoutLimitBytes: 65536, stderrLimitBytes: 65536,
    stdinBytes: Array.from(Buffer.from('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n')),
    stdinCloseAfterJsonRpcResponseId: 2,
    stdinJsonRpcFollowup: {
      afterResponseId: 1,
      bytes: Array.from(Buffer.from('{"jsonrpc":"2.0","id":2,"method":"authenticate"}\n')),
    },
  });
  try {
    assert.equal(result.exit.code, 0);
    assert.deepEqual(result.stdout.toString().trim().split('\n').map(JSON.parse).map((m) => m.id), [1, 2],
      'stdin remains open through the expected response, regardless of JSON key order or chunk framing');
  } finally { result.zeroize(); }
  await assert.rejects(probeModule.runBoundedProcessProbe({
    command: process.execPath, argv: [], cwd: process.cwd(), environment,
    timeoutMs: 1000, stdoutLimitBytes: 65536, stderrLimitBytes: 65536,
    stdinCloseAfterJsonRpcResponseId: 1,
  }), (error) => error.code === 'invalid_descriptor');
}

async function testUnexpectedRequestDenied(acp) {
  const input = new PassThrough();
  const output = new PassThrough();
  const requests = [];
  input.on('data', (bytes) => requests.push(...bytes.toString().trim().split('\n').map(JSON.parse)));
  output.end(JSON.stringify({ jsonrpc: '2.0', id: 71, method: 'terminal/create', params: { command: 'untrusted' } }) + '\n');
  const controller = acp.createGrokBuildAcpController({
    stdin: input, stdout: output, task: 'Read the example page title', cwd: '/tmp/owned',
    endpoint: 'http://127.0.0.1:12345/mcp', expectedCliVersion: '1.0.62',
    onEvent() {}, async recordSession() {}, async deleteSession() {},
  });
  await assert.rejects(controller.run(), (error) => error.reason === 'configuration_surface');
  assert.deepEqual(requests.at(-1), { jsonrpc: '2.0', id: 71, error: {
    code: -32601, message: 'Client capability is not available',
  } });
}

async function testAdditiveController(acp) {
  const fixture = path.resolve(__dirname, 'fixtures/agent-streams/grok-build-1.0.4/contract-stream.jsonl');
  const messages = (await fs.readFile(fixture, 'utf8')).trim().split('\n').map(JSON.parse);
  for (const message of messages) {
    if (Object.hasOwn(message, 'id')) message._meta = { informationalTrace: 'new-envelope-field' };
    if (message.id === 1) message.result._meta.agentVersion = '1.0.62';
    if (message.id === 2) message.result._meta.futureAccountDisplay = { label: 'Account' };
    if (message.id === 5) message.result = { closed: true, completionVersion: 2, _meta: { cleanup: 'done' } };
  }
  const input = new PassThrough();
  input.resume();
  let deleted = 0;
  const controller = acp.createGrokBuildAcpController({
    stdin: input, stdout: Readable.from([messages.map(JSON.stringify).join('\n') + '\n']),
    task: 'Read the example page title', cwd: '/tmp/owned', endpoint: 'http://127.0.0.1:12345/mcp',
    expectedCliVersion: '1.0.62', onEvent() {}, async recordSession() {}, async deleteSession() { deleted += 1; },
  });
  const result = await controller.run();
  assert.equal(result.type, 'result');
  assert.equal(result.payload.is_error, false);
  assert.equal(deleted, 1, 'additive completion metadata preserves owned session cleanup');
}

async function testMaintenance(auth, runtimeModule) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-grok-maintenance-'));
  try {
    const runtime = runtimeModule.createGrokBuildPrivateRuntime({ rootPath: root });
    await runtime.ensureBase();
    const calls = [];
    const coordinator = auth.createGrokBuildAuthCoordinator({
      runtime,
      detect: async () => ({ installed: false, version: '2.5.0', authState: 'unknown',
        binary: { command: '/fixture/grok', realPath: '/fixture/grok', argvPrefix: [] }, profileVersion: null,
        diagnostic: { code: 'sandbox_unavailable', message: 'Strict sandbox refused' } }),
      probe: async (descriptor) => {
        calls.push(descriptor);
        if (descriptor.argv.includes('--help')) return response('Usage: grok logout');
        return response();
      },
      spawn() { throw new Error('Maintenance must never start login'); },
    });
    assert.deepEqual(await coordinator.status(), { state: 'unknown' });
    assert.equal(calls.length, 0, 'status never starts OAuth');
    assert.deepEqual(await coordinator.logout(), { state: 'unauthenticated' });
    assert.deepEqual(calls.map((d) => d.argv), [['logout', '--help'], ['logout']]);
    assert(calls.every((d) => d.environment.GROK_HOME === runtime.paths.grokHome));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function testExplicitCacheRecovery(auth, runtimeModule) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-grok-explicit-login-'));
  try {
    const runtime = runtimeModule.createGrokBuildPrivateRuntime({ rootPath: root });
    await runtime.ensureBase();
    assert((await fs.readFile(runtime.paths.configPath, 'utf8')).includes('[auth]\npreferred_method = "oidc"'),
      'private automatic authentication cannot fall through to a browser login');
    await fs.writeFile(runtime.paths.authPath, '{"expired":"fixture-only"}', { mode: 0o600 });
    const binary = { command: '/fixture/grok', realPath: '/fixture/grok', argvPrefix: [] };
    let verified = false, loginCalls = 0;
    const probes = [];
    const coordinator = auth.createGrokBuildAuthCoordinator({
      runtime, platform: 'win32',
      detect: async () => verified
        ? { installed: true, version: '2.0.0', authState: 'oauth', binary,
          profileVersion: runtimeModule.GROK_BUILD_PROFILE_VERSION }
        : { installed: false, version: '2.0.0', authState: 'unknown', binary,
          profileVersion: null, diagnostic: { code: 'agent_protocol_drift', message: 'Empty expired-cache initialization' } },
      probe: async (descriptor) => { probes.push(descriptor.argv); return response('Usage: grok login'); },
      spawn(command, argv) {
        loginCalls += 1;
        assert.deepEqual(argv, ['login', '--oauth']);
        const child = new EventEmitter();
        child.pid = 424242; child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
        queueMicrotask(() => { verified = true; child.stdout.end(); child.stderr.end(); child.emit('close', 0, null); });
        return child;
      },
    });
    assert.deepEqual(await coordinator.status(), { state: 'unknown' });
    assert.equal(loginCalls, 0, 'a status check never starts expired-cache recovery');
    assert.equal(probes.length, 0);
    assert.deepEqual(await coordinator.begin(() => {}), { state: 'oauth', reason: 'none' });
    assert.equal(loginCalls, 1, 'only explicit Connect starts OAuth recovery');
    assert.deepEqual(probes, [['login', '--help']]);
    assert.equal(await fs.readFile(runtime.paths.authPath, 'utf8'), '{"expired":"fixture-only"}',
      'FSB does not delete or replace private credentials to repair the profile');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function main() {
  const [contract, probe, env, acp, auth, runtime] = await Promise.all([
    load('grok-acp-contract.js'), load('process-probe.js'), load('spawn-environment.js'),
    load('grok-acp.js'), load('grok-auth.js'), load('grok-runtime.js'),
  ]);
  await testContracts(contract);
  await testResponseDrivenProbe(probe, env);
  await testUnexpectedRequestDenied(acp);
  await testAdditiveController(acp);
  await testMaintenance(auth, runtime);
  await testExplicitCacheRecovery(auth, runtime);
  console.log('mcp-grok-acp-compatibility.test.js: PASS');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
