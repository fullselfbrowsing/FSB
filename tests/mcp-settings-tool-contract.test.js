'use strict';

/**
 * mcp-settings-tool-contract.test.js (Phase 66.1, plan 07)
 *
 * The `settings` tool as an MCP host sees it. A real SDK Client is linked by
 * InMemoryTransport to the BUILT runtime (mcp/build/runtime.js
 * createRuntime({ bridge })) with a fake bridge, so the suite binds no port
 * and runs on Node 20.
 *
 * Part 1, the built-runtime contract:
 * - tool shape: exactly one `settings` tool, its short description, its
 *   host-safe inputSchema and no annotations (SC1, D-03, D-04)
 * - the 72 tools that existed at 8a058bdf keep their names and their
 *   description-free shape, compared with the frozen Phase 69 fixture
 *   (tests/fixtures/mcp-tools-list-8a058bdf.json, which still carries
 *   BASELINE_8A058BDF_TOOLS_DIGEST). Phase 69 shortens their descriptions on
 *   purpose (69-CONTEXT D-22), so description equality moved to
 *   tests/mcp-description-budget.test.js (SC5, D-21, MCP-04)
 * - the MCP prompts (with the tool-reference table) and resources (with
 *   fsb://config) are byte-identical, and reading fsb://config still sends
 *   exactly one mcp:get-config request (D-21, MCP-04)
 * - every runtime (stdio and HTTP sessions) registers settings, and settings
 *   stays out of TOOL_REGISTRY and the queue's readOnlyTools (SC5)
 * - the built mapFSBError renders SETTING_ codes under the Settings label and
 *   passes the extension's sentence and hint through (D-07)
 * - MCP-edge rules: value coercion, rejected value types, local refusals and
 *   the value-safe write preflight (SC2, RESEARCH Pattern 5)
 *
 * Part 2, end to end: MCP Client -> built settings tool -> fake bridge -> the
 * real dispatchMcpMessageRoute and route handlers -> a fake chrome.storage.
 * The fake bridge stands in for MCPBridgeClient, so the _routeMessage switch
 * hop is proven in tests/mcp-settings-route.test.js Part B, not here.
 * - read-all, read-one and write in the D-07 shapes, and a Config instance
 *   that refreshes on the write (SC1)
 * - refusals that list what is allowed (hosted model ids, shipped agent ids,
 *   enum values, integer range) without the submitted value (D-07, D-15)
 * - a protected key's value never reaches the bridge, storage, the operator
 *   log, the recorder or console/stderr (SC2, T-66.1-04)
 * - a delegated agent can read but not write (SC5, D-20)
 * - a test-only fixture key (fsbFixtureFastMode) is readable and writable
 *   with no mcp/src change, and settings.ts names no production key (SC4)
 *
 * console.log/error/warn and process.stderr.write are captured for the whole
 * run and scanned at the end: no submitted SENTINEL value may appear there.
 * check() writes through the original streams, so its own lines are never
 * part of that scan.
 *
 * The suite reads no .planning file and runs no git: the baseline values are
 * literal constants below.
 *
 * Standalone: npm --prefix mcp run build && node tests/mcp-settings-tool-contract.test.js
 * The root test chain builds mcp before this suite runs.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Pinned baselines (D-21). Never change one of these to match a new build: a
// mismatch is a regression to find in the owning file.
// ---------------------------------------------------------------------------

// tools/list minus `settings`, measured from a build whose mcp/src equals
// 8a058bdf (66.1-TOOLS-DIGEST-BASELINE.json; Node 24 and Node 20 agree).
// Phase 69 intentionally shortens the existing descriptions (69-CONTEXT
// D-22), so this value is now asserted against the frozen 8a058bdf fixture,
// not the current build; the current build is held to the fixture's names and
// description-free shape below.
const BASELINE_8A058BDF_TOOLS_DIGEST = { count: 72, sha256: '8321cc7234a7e1d817b5a3e818e75e243d76e60d1911d88b410d38147c8c4a05' };

// Prompts and resources, measured on 2026-10-15 from a build of 469907cb,
// whose mcp/src equals 8a058bdf. Phase 69 keeps these constants unchanged.
const BASELINE_8A058BDF_PROMPTS_DIGEST = { count: 6, sha256: 'cc2dbc24a668a8e6b3866388ce188cba93ef4e900499ee158e9032ccdd55d3c8' };
// The prompt tool table ("# FSB Tool Reference (49 tools)"), kept separate so
// a failure names the table.
const BASELINE_8A058BDF_TOOL_REFERENCE_SHA256 = 'dfa3846f76ab304be341b97dffabd4b0259e8a37cf7bfbeecebc8248350bcb95';
const BASELINE_8A058BDF_RESOURCES_DIGEST = { count: 5, sha256: '2a328451612964481d9b9da1c3feca343c1d77cc8ca9a626acc9c6ee8afb01f7' };

// getPrompt arguments for the prompts that take any; the other two take none.
const FIXED_PROMPT_ARGS = {
  'search-and-extract': { site: 'example.com', query: 'q', fields: 'a,b' },
  'fill-form': { url: 'https://example.com/form', formData: 'name: A' },
  'monitor-page': { url: 'https://example.com', watchFor: 'price change' },
  'navigate-and-read': { url: 'https://example.com', extract: 'title' }
};

const CANNED_CONFIG = { success: true, provider: 'xai', model: 'grok-4-1-fast', apiKeyConfigured: true, connected: true };

// The settings tool itself (plan 66.1-03). Pinned on its own so Phase 69 can
// decide separately whether to shorten it.
const SETTINGS_DESCRIPTION =
  'Read or change FSB settings. No args returns all; key returns one with its allowed values; key and value sets it. API keys and endpoints are read-only.';
const SETTINGS_INPUT_SCHEMA_JSON =
  '{"type":"object","properties":{"key":{"type":"string","description":"Setting name"},"value":{"type":"string","description":"New value (string; true/false and numbers accepted)"}},"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}';

const SETTING_CODES = [
  'SETTING_REQUEST_INVALID',
  'SETTING_UNKNOWN_KEY',
  'SETTING_PROTECTED_KEY',
  'SETTING_VALUE_INVALID',
  'SETTING_PROVIDER_NOT_READY',
  'SETTING_DELEGATED_WRITE_REFUSED',
  'SETTING_UNSUPPORTED',
  'SETTING_STORAGE_FAILED'
];

// errors.ts SETTING_NEXT_ACTION_FALLBACK: the one Next action for a SETTING_
// result that carries no recovery hint.
const SETTING_FALLBACK_NEXT_ACTION =
  'Call settings with only a key to see its type and allowed values, or with no arguments to list every setting.';
const PANEL_HINT = 'Change this setting in the FSB Control Panel.';

// ---------------------------------------------------------------------------
// Output, checks and the console/stderr capture
// ---------------------------------------------------------------------------

const ORIGINAL_STDOUT_WRITE = process.stdout.write;
const ORIGINAL_STDERR_WRITE = process.stderr.write;
const ORIGINAL_CONSOLE = { log: console.log, error: console.error, warn: console.warn };

let passed = 0;
let failed = 0;

function out(line) {
  ORIGINAL_STDOUT_WRITE.call(process.stdout, line + '\n');
}

function check(cond, msg) {
  if (cond) {
    passed += 1;
    out('  PASS: ' + msg);
  } else {
    failed += 1;
    ORIGINAL_STDERR_WRITE.call(process.stderr, '  FAIL: ' + msg + '\n');
  }
}

function checkDeep(actual, expected, msg) {
  const ok = util.isDeepStrictEqual(actual, expected);
  check(ok, ok ? msg : msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const captured = [];
let capturing = false;

function captureText(args) {
  try {
    return args.map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg, { depth: 8 }))).join(' ');
  } catch (_e) {
    return '[uninspectable]';
  }
}

function startCapture() {
  if (capturing) return;
  capturing = true;
  for (const method of Object.keys(ORIGINAL_CONSOLE)) {
    const original = ORIGINAL_CONSOLE[method];
    console[method] = function (...args) {
      captured.push(captureText(args));
      return original.apply(console, args);
    };
  }
  process.stderr.write = function (chunk, ...rest) {
    try {
      captured.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    } catch (_e) { /* capture is best-effort */ }
    return ORIGINAL_STDERR_WRITE.call(process.stderr, chunk, ...rest);
  };
}

function stopCapture() {
  if (!capturing) return;
  capturing = false;
  for (const method of Object.keys(ORIGINAL_CONSOLE)) console[method] = ORIGINAL_CONSOLE[method];
  process.stderr.write = ORIGINAL_STDERR_WRITE;
}

function describeError(err) {
  return err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : String(err);
}

async function section(name, fn) {
  out('\n--- ' + name + ' ---');
  try {
    await fn();
  } catch (err) {
    check(false, name + ' threw: ' + describeError(err));
  }
}

// ---------------------------------------------------------------------------
// Built MCP modules (ESM, loaded once)
// ---------------------------------------------------------------------------

let mcp = null;

async function loadMcp() {
  const sdk = (p) => pathToFileURL(path.join(ROOT, 'mcp', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm', p)).href;
  const build = (p) => pathToFileURL(path.join(ROOT, 'mcp', 'build', p)).href;
  const [clientModule, transportModule, runtimeModule, errorsModule, queueModule, inventoryModule, identityModule, phase69Module] =
    await Promise.all([
      import(sdk('client/index.js')),
      import(sdk('inMemory.js')),
      import(build('runtime.js')),
      import(build('errors.js')),
      import(build('queue.js')),
      import(build('client-inventory.js')),
      import(pathToFileURL(path.join(ROOT, 'scripts', 'bench', 'lib', 'identity.mjs')).href),
      import(pathToFileURL(path.join(ROOT, 'tests', 'helpers', 'mcp-in-process.mjs')).href)
    ]);
  // AgentScope's lazy agent:register reads the client inventory. Answer it
  // from fixed dependencies so no version probe runs on this machine.
  inventoryModule.__configureClientInventoryForTests({
    platforms: { 'claude-code': {}, opencode: {}, codex: {} },
    now: () => 1_800_000_000_000,
    execFile: (_file, _args, _options, callback) => {
      callback(Object.assign(new Error('not installed'), { code: 'ENOENT' }), '', '');
    }
  });
  return {
    Client: clientModule.Client,
    InMemoryTransport: transportModule.InMemoryTransport,
    createRuntime: runtimeModule.createRuntime,
    mapFSBError: errorsModule.mapFSBError,
    FSB_ERROR_MESSAGES: errorsModule.FSB_ERROR_MESSAGES,
    TaskQueue: queueModule.TaskQueue,
    resetInventory: () => inventoryModule.__configureClientInventoryForTests(null),
    toolsListDigest: identityModule.toolsListDigest,
    canonicalJson: identityModule.canonicalJson,
    sha256Hex: identityModule.sha256Hex,
    readBaselineFixture: phase69Module.readBaselineFixture,
    projectShape: phase69Module.projectShape,
    EXPECT_TOOL_NAMES_VERBATIM: phase69Module.EXPECT_TOOL_NAMES_VERBATIM
  };
}

// ---------------------------------------------------------------------------
// Fake bridge and client sessions
// ---------------------------------------------------------------------------

// The extension-side bridge client the dispatcher sees: only agent_delegated
// is mapped to a delegated run (the real detector is proven in
// tests/mcp-settings-route.test.js Part B).
function makeFakeBridgeClient() {
  return {
    _isDelegationScopedInbound(_type, payload) {
      return Boolean(payload && payload.agentId === 'agent_delegated');
    }
  };
}

// Stands in for WebSocketBridge. Every message is recorded as
// { type, payload, opts } (shallow copies, so an own `value` property stays
// visible). agent:register answers with options.agentId. A respond(type,
// payload) override answers first; otherwise a dispatcher forwards the
// message to the real dispatchMcpMessageRoute and wraps the result as
// MCPBridgeClient._handleMessage does.
function makeBridge(options) {
  const settings = options || {};
  const fakeClient = makeFakeBridgeClient();
  const bridge = {
    isConnected: true,
    calls: [],
    agentId: settings.agentId || 'agent_contract',
    async sendAndWait(message, opts) {
      const type = message && message.type;
      const payload = message && message.payload;
      bridge.calls.push({
        type,
        payload: payload && typeof payload === 'object' ? Object.assign({}, payload) : payload,
        opts: opts && typeof opts === 'object' ? Object.assign({}, opts) : opts
      });
      if (type === 'agent:register') return { success: true, agentId: bridge.agentId };
      if (typeof settings.respond === 'function') {
        const answer = await settings.respond(type, payload || {});
        if (answer !== undefined) return answer;
      }
      if (settings.dispatcher) {
        const result = await settings.dispatcher.dispatchMcpMessageRoute({ type, payload, client: fakeClient });
        return Object.assign({ success: true }, result);
      }
      return { success: false, error: 'Unknown MCP message type: ' + type };
    },
    settingsCalls() {
      return bridge.calls.filter((call) => call.type === 'mcp:get-settings' || call.type === 'mcp:set-setting');
    },
    setCalls() {
      return bridge.calls.filter((call) => call.type === 'mcp:set-setting');
    }
  };
  return bridge;
}

async function openSession(bridge) {
  const runtime = mcp.createRuntime({ bridge });
  const [serverSide, clientSide] = mcp.InMemoryTransport.createLinkedPair();
  await runtime.server.connect(serverSide);
  const client = new mcp.Client({ name: 'settings-contract', version: '1.0.0' });
  await client.connect(clientSide);
  return {
    runtime,
    client,
    async close() {
      try { await client.close(); } catch (_e) { /* already closed */ }
      try { await runtime.server.close(); } catch (_e) { /* already closed */ }
    }
  };
}

async function withSession(bridge, fn) {
  const session = await openSession(bridge);
  try {
    return await fn(session.client, session.runtime);
  } finally {
    await session.close();
  }
}

// One settings call. An SDK that throws on rejected arguments is folded into
// the same { isError, text } shape a returned error has.
async function callSettings(client, args) {
  try {
    const result = await client.callTool({ name: 'settings', arguments: args });
    const text = ((result && result.content) || []).map((part) => (part && part.text) || '').join('\n');
    return { isError: result && result.isError === true, text, raw: result };
  } catch (err) {
    return { isError: true, text: String(err && err.message ? err.message : err), raw: null, thrown: true };
  }
}

function errorText(result) {
  return ((result && result.content) || []).map((part) => (part && part.text) || '').join('\n');
}

function lineStarting(text, prefix) {
  return String(text).split('\n').find((line) => line.startsWith(prefix));
}

function countOf(text, needle) {
  return String(text).split(needle).length - 1;
}

function usesUnionOrTypeArray(node) {
  if (Array.isArray(node)) return node.some(usesUnionOrTypeArray);
  if (!node || typeof node !== 'object') return false;
  for (const key of Object.keys(node)) {
    if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') return true;
    if (key === 'type' && Array.isArray(node[key])) return true;
    if (usesUnionOrTypeArray(node[key])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Part 1: the built-runtime contract
// ---------------------------------------------------------------------------

async function partContract() {
  await section('settings on the wire: shape, description and schema (SC1, D-03, D-04)', async () => {
    await withSession(makeBridge(), async (client) => {
      const { tools } = await client.listTools();
      const matches = tools.filter((tool) => tool.name === 'settings');
      check(matches.length === 1, 'tools/list has exactly one tool named settings (found by name)');
      const tool = matches[0] || {};
      check(tool.description === SETTINGS_DESCRIPTION, 'the description is the plan-03 sentence');
      check(typeof tool.description === 'string' && tool.description.length <= 200,
        'the description is at most 200 characters (got ' + String(tool.description || '').length + ')');
      check(JSON.stringify(tool.inputSchema) === SETTINGS_INPUT_SCHEMA_JSON,
        'the inputSchema is the pinned host-safe JSON (got ' + JSON.stringify(tool.inputSchema) + ')');

      const schema = tool.inputSchema || {};
      const properties = schema.properties || {};
      checkDeep(Object.keys(properties).sort(), ['key', 'value'], 'the schema has exactly key and value');
      check(!hasOwn(schema, 'required'), 'neither parameter is required');
      check(!usesUnionOrTypeArray(schema), 'the schema has no anyOf/oneOf/allOf and no type array');
      check(properties.key && properties.key.type === 'string' && properties.value && properties.value.type === 'string',
        'both parameters are plain type string');
      check(!JSON.stringify(schema).includes('maxLength'), 'the schema carries no maxLength');
      check(tool.annotations === undefined, 'settings carries no annotations');

      const offenders = tools.filter((candidate) => usesUnionOrTypeArray(candidate.inputSchema)).map((candidate) => candidate.name);
      checkDeep(offenders, [], 'no tool in tools/list uses anyOf or a type array (unchanged from the baseline)');

      // Phase 69 (69-CONTEXT D-22): descriptions of the 72 baseline tools are
      // shortened on purpose, so description equality is replaced by the
      // budget gate and the must-keep table in tests/mcp-description-budget.test.js
      // (plus its manual-site coverage checks). Names and shape stay frozen
      // here against the committed 8a058bdf fixture, and the "minus settings"
      // rule stays.
      const fixture = mcp.readBaselineFixture();
      checkDeep(mcp.toolsListDigest(fixture.tools), BASELINE_8A058BDF_TOOLS_DIGEST,
        'the frozen 8a058bdf fixture carries BASELINE_8A058BDF_TOOLS_DIGEST');
      const baselineTools = tools.filter((candidate) => candidate.name !== 'settings');
      checkDeep(baselineTools.map((tool) => tool.name).sort(), fixture.tools.map((tool) => tool.name).sort(),
        'the current tool names minus settings equal the 8a058bdf names');
      const expectNames = new Set(mcp.EXPECT_TOOL_NAMES_VERBATIM);
      const fixtureByName = new Map(fixture.tools.map((tool) => [tool.name, tool]));
      const drifted = [];
      for (const tool of baselineTools) {
        const fixtureTool = fixtureByName.get(tool.name);
        if (!fixtureTool) continue; // reported by the name check above
        const projection = mcp.projectShape(tool);
        const properties = projection.inputSchema && projection.inputSchema.properties;
        if (expectNames.has(tool.name) && properties && hasOwn(properties, 'expect')) delete properties.expect;
        if (mcp.canonicalJson(projection) !== mcp.canonicalJson(mcp.projectShape(fixtureTool))) drifted.push(tool.name);
      }
      checkDeep(drifted, [],
        'the 72 tools that existed at 8a058bdf keep their description-free shape (expect allowed on the 29 D-12 tools)');
      if (drifted.length > 0) {
        out('  DIAG: a drifted shape means a pre-existing tool changed a type, required list, default, enum or other');
        out('  DIAG: non-description key; diff against tests/fixtures/mcp-tools-list-8a058bdf.json and fix the owning file.');
      }
    });
  });

  await section('prompts and resources are byte-identical to 8a058bdf (D-21, MCP-04)', async () => {
    await withSession(makeBridge(), async (client) => {
      const { prompts } = await client.listPrompts();
      const messages = {};
      for (const prompt of prompts) {
        const reply = await client.getPrompt({ name: prompt.name, arguments: FIXED_PROMPT_ARGS[prompt.name] || {} });
        messages[prompt.name] = reply.messages;
      }
      const promptsDigest = { count: prompts.length, sha256: mcp.sha256Hex(mcp.canonicalJson({ prompts, messages })) };
      checkDeep(promptsDigest, BASELINE_8A058BDF_PROMPTS_DIGEST,
        'listPrompts plus every getPrompt reply equals BASELINE_8A058BDF_PROMPTS_DIGEST');

      const table = messages['tool-reference'] && messages['tool-reference'][0] && messages['tool-reference'][0].content
        ? messages['tool-reference'][0].content.text
        : '';
      check(String(table).startsWith('# FSB Tool Reference (49 tools)'), 'the tool-reference prompt is the 49-tool table');
      check(mcp.sha256Hex(String(table)) === BASELINE_8A058BDF_TOOL_REFERENCE_SHA256,
        'the prompt tool table equals BASELINE_8A058BDF_TOOL_REFERENCE_SHA256');

      const { resources } = await client.listResources();
      const { resourceTemplates } = await client.listResourceTemplates();
      const resourcesDigest = { count: resources.length, sha256: mcp.sha256Hex(mcp.canonicalJson({ resources, resourceTemplates })) };
      checkDeep(resourcesDigest, BASELINE_8A058BDF_RESOURCES_DIGEST,
        'listResources plus listResourceTemplates equals BASELINE_8A058BDF_RESOURCES_DIGEST');
      check(resources.some((resource) => resource.uri === 'fsb://config'), 'fsb://config is still listed');
    });

    const configBridge = makeBridge({
      respond: (type) => (type === 'mcp:get-config' ? clone(CANNED_CONFIG) : undefined)
    });
    await withSession(configBridge, async (client) => {
      const reply = await client.readResource({ uri: 'fsb://config' });
      checkDeep(configBridge.calls, [{ type: 'mcp:get-config', payload: {}, opts: { timeout: 10000 } }],
        "reading fsb://config sends exactly one {type:'mcp:get-config', payload:{}} with a 10 s timeout");
      checkDeep(reply && reply.contents,
        [{ uri: 'fsb://config', mimeType: 'application/json', text: JSON.stringify(CANNED_CONFIG, null, 2) }],
        'fsb://config returns the extension payload pretty-printed as application/json');
    });
  });

  await section('every runtime registers settings; it stays off the autopilot surface (SC5)', async () => {
    const first = await openSession(makeBridge());
    const second = await openSession(makeBridge());
    try {
      check(first.runtime.server !== second.runtime.server, 'two createRuntime() calls build two servers');
      const firstTools = (await first.client.listTools()).tools.map((tool) => tool.name);
      const secondTools = (await second.client.listTools()).tools.map((tool) => tool.name);
      check(firstTools.filter((name) => name === 'settings').length === 1, 'the first runtime registers settings');
      check(secondTools.filter((name) => name === 'settings').length === 1, 'the second runtime registers settings');
    } finally {
      await first.close();
      await second.close();
    }

    const indexSource = fs.readFileSync(path.join(ROOT, 'mcp', 'src', 'index.ts'), 'utf8');
    const httpSource = fs.readFileSync(path.join(ROOT, 'mcp', 'src', 'http.ts'), 'utf8');
    const runtimeSource = fs.readFileSync(path.join(ROOT, 'mcp', 'src', 'runtime.ts'), 'utf8');
    check(/createRuntime\(/.test(indexSource), 'mcp/src/index.ts (stdio) builds its session with createRuntime(');
    check(/createRuntime\(/.test(httpSource), 'mcp/src/http.ts (HTTP) builds its sessions with createRuntime(');
    check(countOf(runtimeSource, 'registerSettingsTool(server, bridge, queue, agentScope);') === 1,
      'createRuntime registers settings exactly once');

    const toolDefinitions = require(path.join(ROOT, 'mcp', 'ai', 'tool-definitions.cjs'));
    const registryNames = toolDefinitions.TOOL_REGISTRY.map((tool) => tool.name);
    check(registryNames.length > 0 && !registryNames.includes('settings'), 'TOOL_REGISTRY has no tool named settings');
    const queue = new mcp.TaskQueue();
    check(queue.readOnlyTools instanceof Set && !queue.readOnlyTools.has('settings'),
      "a TaskQueue's readOnlyTools does not contain 'settings'");
  });

  await section('built mapFSBError renders SETTING_ codes under Settings (D-07)', async () => {
    for (const code of SETTING_CODES) {
      const withSentence = mcp.mapFSBError({
        success: false, code, errorCode: code, error: 'The request was refused.', recoveryHint: PANEL_HINT
      });
      const text = errorText(withSentence);
      check(withSentence.isError === true, code + ' is an error result');
      check(text.startsWith('Detected: Settings\n'), code + ' renders Detected: Settings');
      check(lineStarting(text, 'Why: ') === 'Why: ' + code + ': The request was refused.', code + ' appears verbatim in the Why line');
      check(lineStarting(text, 'Next action: ') === 'Next action: ' + PANEL_HINT, code + ' uses the recoveryHint verbatim');
      check(!text.includes('Page navigation'), code + ' never renders Page navigation');
      check(!text.includes('Raw error:'), code + ' adds no Raw error line');

      const bare = mcp.mapFSBError({ success: false, code, errorCode: code });
      const bareText = errorText(bare);
      check(bareText.startsWith('Detected: Settings\n') && lineStarting(bareText, 'Why: ') === 'Why: ' + code,
        code + ' with no sentence renders the code alone');
      check(lineStarting(bareText, 'Next action: ') === 'Next action: ' + SETTING_FALLBACK_NEXT_ACTION,
        code + ' with no recoveryHint uses the single settings fallback');
      check(!bareText.includes('Update the MCP server/extension pair'),
        code + ' with no recoveryHint never says Update the MCP server/extension pair');
      check(!bareText.includes('Page navigation'), code + ' with no sentence never renders Page navigation');
    }

    const blankHint = errorText(mcp.mapFSBError({
      success: false, code: 'SETTING_UNKNOWN_KEY', errorCode: 'SETTING_UNKNOWN_KEY', error: 'Unknown setting key.', recoveryHint: '   '
    }));
    check(lineStarting(blankHint, 'Next action: ') === 'Next action: ' + SETTING_FALLBACK_NEXT_ACTION,
      'a blank recoveryHint falls back to the settings Next action');

    const modelName = errorText(mcp.mapFSBError({
      success: false,
      code: 'SETTING_VALUE_INVALID',
      errorCode: 'SETTING_VALUE_INVALID',
      error: 'modelName must be a known model for xai. Allowed: grok-4-1-fast.'
    }));
    check(modelName.startsWith('Detected: Settings\n') && !modelName.includes('Detected: Configuration'),
      'a SETTING_VALUE_INVALID sentence naming modelName is not configuration_error');

    const notFound = errorText(mcp.mapFSBError({
      success: false, code: 'SETTING_UNKNOWN_KEY', errorCode: 'SETTING_UNKNOWN_KEY', error: 'Setting not found.'
    }));
    check(notFound.startsWith('Detected: Settings\n') && !notFound.includes('Page navigation') && !notFound.includes('Refresh page state'),
      "a SETTING_UNKNOWN_KEY sentence containing 'not found' is not element_not_found");

    const element = mcp.mapFSBError({ success: false, error: 'Element not found' });
    check(element.isError === true
      && errorText(element) === 'Detected: Page navigation\nWhy: Element not found\nNext action: Refresh page state with read_page or get_dom_snapshot, then retry.',
    "{success:false, error:'Element not found'} still renders the element_not_found text");

    const allowedSentence = 'maxIterations must be a whole number from 50 to 500. Allowed: 50 to 500.';
    const allowed = errorText(mcp.mapFSBError({
      success: false, code: 'SETTING_VALUE_INVALID', errorCode: 'SETTING_VALUE_INVALID', error: allowedSentence
    }));
    check(lineStarting(allowed, 'Why: ') === 'Why: SETTING_VALUE_INVALID: ' + allowedSentence,
      'an error ending with an Allowed clause appears unchanged in the Why line');
    check(countOf(allowed, 'Allowed: 50 to 500.') === 1, 'the Allowed clause appears exactly once');

    const fields = errorText(mcp.mapFSBError({
      success: false,
      code: 'SETTING_VALUE_INVALID',
      errorCode: 'SETTING_VALUE_INVALID',
      error: 'maxIterations must be a whole number.',
      values: ['SENTINEL-V'],
      range: { min: 1, max: 2 },
      value: 'SENTINEL-VAL'
    }));
    check(!fields.includes('SENTINEL'), 'values, range and value fields are never rendered (no SENTINEL)');
    check(!fields.includes('Allowed:'), 'MCP never builds an Allowed clause of its own');
    check(!fields.includes('1 to 2'), 'the range field is never formatted into the text');
  });

  await section('values reach the bridge as strings; other types are refused (SC2)', async () => {
    const bridge = makeBridge({
      respond: (type, payload) => {
        if (type === 'mcp:get-settings') {
          return { success: true, key: payload.key, value: 'old', type: 'string', writable: true };
        }
        if (type === 'mcp:set-setting') {
          return { success: true, key: payload.key, value: payload.value, previous: 'old', changed: [payload.key] };
        }
        return undefined;
      }
    });
    await withSession(bridge, async (client) => {
      for (const [input, expected] of [[true, 'true'], [50, '50'], [1.5, '1.5']]) {
        const before = bridge.setCalls().length;
        const result = await callSettings(client, { key: 'fsbContractKey', value: input });
        const sets = bridge.setCalls();
        const last = sets[sets.length - 1];
        check(!result.isError && sets.length === before + 1, 'value ' + JSON.stringify(input) + ' is written');
        check(last && last.payload.value === expected,
          'value ' + JSON.stringify(input) + " arrives in mcp:set-setting as '" + expected + "' (got " + JSON.stringify(last && last.payload.value) + ')');
      }

      for (const [label, input] of [['null', null], ['an object', { a: 'SENTINEL-OBJ' }], ['an array', ['SENTINEL-ARR']]]) {
        const before = bridge.calls.length;
        const result = await callSettings(client, { key: 'fsbContractKey', value: input });
        check(result.isError === true, 'value ' + label + ' is refused with isError');
        check(bridge.calls.length === before, 'value ' + label + ' makes no bridge call');
        check(!result.text.includes('SENTINEL'), 'the refusal for ' + label + ' does not echo the value');
      }
    });
  });

  await section('local refusals never reach the bridge (SC2)', async () => {
    const bridge = makeBridge({
      respond: (type, payload) => (type === 'mcp:get-settings'
        ? { success: true, key: payload.key, value: 1, type: 'integer', writable: true }
        : undefined)
    });
    await withSession(bridge, async (client) => {
      const cases = [
        ['value without key', { value: 'x' }],
        ['a 65-character key (read)', { key: 'k'.repeat(65) }],
        ['a 65-character key (write)', { key: 'k'.repeat(65), value: 'SENTINEL-K65' }],
        ['a 2049-character value', { key: 'maxIterations', value: 'SENTINEL-LONG' + 'x'.repeat(2049 - 'SENTINEL-LONG'.length) }]
      ];
      for (const [label, args] of cases) {
        const before = bridge.calls.length;
        const result = await callSettings(client, args);
        check(result.isError === true && result.text.includes('SETTING_REQUEST_INVALID'), label + ' returns SETTING_REQUEST_INVALID');
        check(bridge.calls.length === before, label + ' makes no bridge call');
        check(!result.text.includes('SENTINEL'), label + ' does not echo the value');
      }
      const valueOnly = await callSettings(client, { value: 'x' });
      check(valueOnly.text.startsWith('Detected: Settings\n'), 'a local refusal renders under the Settings label');

      const before = bridge.settingsCalls().length;
      const boundary = await callSettings(client, { key: 'k'.repeat(64) });
      check(!boundary.isError && bridge.settingsCalls().length === before + 1, 'a 64-character key is allowed through');
    });
  });

  await section('write preflight keeps the value in the MCP process (RESEARCH Pattern 5, T-66.1-05)', async () => {
    const unsupportedBridge = makeBridge({
      respond: (type) => ({ success: false, error: 'Unknown MCP message type: ' + type })
    });
    await withSession(unsupportedBridge, async (client) => {
      const result = await callSettings(client, { key: 'debugMode', value: 'SENTINEL-UNSUP' });
      check(result.isError === true && result.text.includes('SETTING_UNSUPPORTED'),
        'an extension without settings routes gets SETTING_UNSUPPORTED');
      check(unsupportedBridge.setCalls().length === 0, 'no mcp:set-setting is sent to an extension without settings routes');
      check(!JSON.stringify(unsupportedBridge.calls).includes('SENTINEL'), 'the value never reaches an old extension');
      check(!result.text.includes('SENTINEL'), 'SETTING_UNSUPPORTED does not echo the value');
    });

    const readOnlyBridge = makeBridge({
      respond: (type, payload) => {
        if (type === 'mcp:get-settings') return { success: true, key: payload.key, value: '[set]', type: 'secret', writable: false };
        if (type === 'mcp:set-setting') {
          return {
            success: false,
            code: 'SETTING_PROTECTED_KEY',
            errorCode: 'SETTING_PROTECTED_KEY',
            error: payload.key + ' is read-only over MCP; change it in the FSB Control Panel.',
            recoveryHint: PANEL_HINT
          };
        }
        return undefined;
      }
    });
    await withSession(readOnlyBridge, async (client) => {
      const result = await callSettings(client, { key: 'apiKey', value: 'sk-SENTINEL-PRE' });
      const sets = readOnlyBridge.setCalls();
      check(sets.length === 1 && !hasOwn(sets[0].payload, 'value'),
        'a key the extension reports as writable:false is written without a value property');
      check(result.isError === true && result.text.includes('SETTING_PROTECTED_KEY'), 'the extension refusal reaches the host');
      check(!JSON.stringify(readOnlyBridge.calls).includes('SENTINEL') && !result.text.includes('SENTINEL'),
        'the protected value never leaves the MCP process');
    });

    const unknownFailure = {
      success: false,
      code: 'SETTING_UNKNOWN_KEY',
      errorCode: 'SETTING_UNKNOWN_KEY',
      error: 'Unknown setting key. Call settings with no arguments to list keys.'
    };
    const unknownBridge = makeBridge({
      respond: (type) => (type === 'mcp:get-settings' || type === 'mcp:set-setting' ? clone(unknownFailure) : undefined)
    });
    await withSession(unknownBridge, async (client) => {
      const result = await callSettings(client, { key: 'noSuchSetting', value: 'SENTINEL-UNKNOWN' });
      const sets = unknownBridge.setCalls();
      check(sets.length === 1 && !hasOwn(sets[0].payload, 'value'),
        'an unknown key (SETTING_UNKNOWN_KEY preflight) is written without a value property');
      check(result.isError === true && result.text.includes('SETTING_UNKNOWN_KEY'), 'SETTING_UNKNOWN_KEY reaches the host');
      check(!JSON.stringify(unknownBridge.calls).includes('SENTINEL') && !result.text.includes('SENTINEL'),
        'the value for an unknown key never leaves the MCP process');
    });

    const capBridge = makeBridge({
      respond: (type) => (type === 'mcp:get-settings'
        ? { success: false, code: 'AGENT_CAP_REACHED', errorCode: 'AGENT_CAP_REACHED', error: 'Agent cap reached.' }
        : undefined)
    });
    await withSession(capBridge, async (client) => {
      const result = await callSettings(client, { key: 'debugMode', value: 'SENTINEL-CAP' });
      check(result.isError === true, 'a failed preflight (AGENT_CAP_REACHED) is an error');
      check(capBridge.setCalls().length === 0, 'a failed preflight sends no mcp:set-setting');
      check(!result.text.includes('SENTINEL'), 'a failed preflight does not echo the value');
    });
  });

  await section('transport failures render under Settings, never as page navigation (WR-07)', async () => {
    const UNCONFIRMED_HINT = 'The change may have been applied. Call settings with only this key to check its current value before retrying.';
    const UNAVAILABLE_HINT = 'Check that the FSB extension is connected, then call settings again.';
    const writablePreflight = (payload) => ({ success: true, key: payload.key, value: false, type: 'boolean', writable: true });
    const timeoutError = (type) => new Error('Request req_1 (' + type + ') timed out after 10000ms');
    const expectSettingsText = (result, label) => {
      check(result.isError === true && result.text.startsWith('Detected: Settings\n'), label + ' renders Detected: Settings');
      check(!result.text.includes('Page navigation') && !result.text.includes('Refresh page state'), label + ' never renders page-navigation advice');
      check(result.text.includes('SETTING_UNAVAILABLE'), label + ' carries SETTING_UNAVAILABLE');
      check(!result.text.includes('SENTINEL'), label + ' never echoes the value');
    };

    // A write that times out after it was sent: its outcome is unknown.
    const lateBridge = makeBridge({
      respond: (type, payload) => {
        if (type === 'mcp:get-settings') return writablePreflight(payload);
        if (type === 'mcp:set-setting') throw timeoutError(type);
        return undefined;
      }
    });
    await withSession(lateBridge, async (client) => {
      const result = await callSettings(client, { key: 'debugMode', value: 'SENTINEL-LATE' });
      expectSettingsText(result, 'a write timeout');
      check(lineStarting(result.text, 'Next action: ') === 'Next action: ' + UNCONFIRMED_HINT,
        'a write timeout says the change may have been applied and to check the key');
      check(result.text.includes('(timeout)'), 'a write timeout names the timeout');
      check(lateBridge.setCalls().length === 1, 'the write was sent once and is not retried');
    });

    // A read (or the write preflight) that times out: nothing was written.
    const readTimeoutBridge = makeBridge({
      respond: (type) => {
        if (type === 'mcp:get-settings') throw timeoutError(type);
        return undefined;
      }
    });
    await withSession(readTimeoutBridge, async (client) => {
      const read = await callSettings(client, { key: 'debugMode' });
      expectSettingsText(read, 'a read timeout');
      check(lineStarting(read.text, 'Next action: ') === 'Next action: ' + UNAVAILABLE_HINT, 'a read timeout asks to check the connection');
      const preflight = await callSettings(client, { key: 'debugMode', value: 'SENTINEL-PRE-TIMEOUT' });
      expectSettingsText(preflight, 'a preflight timeout');
      check(!preflight.text.includes('may have been applied'), 'a preflight timeout never claims the change may have been applied');
      check(readTimeoutBridge.setCalls().length === 0, 'a preflight timeout sends no mcp:set-setting');
    });

    // A lost link mid-write is also an unconfirmed write.
    const droppedBridge = makeBridge({
      respond: (type, payload) => {
        if (type === 'mcp:get-settings') return writablePreflight(payload);
        if (type === 'mcp:set-setting') throw new Error('Extension disconnected');
        return undefined;
      }
    });
    await withSession(droppedBridge, async (client) => {
      const result = await callSettings(client, { key: 'debugMode', value: 'true' });
      expectSettingsText(result, 'a dropped link during a write');
      check(result.text.includes('(disconnected)') && result.text.includes('may have been applied'),
        'a dropped link during a write is reported as unconfirmed');
    });

    // The extension answers without running the route (mcp_authority_not_ready).
    const notReadyBridge = makeBridge({
      respond: (type) => (type === 'mcp:get-settings' || type === 'mcp:set-setting'
        ? { success: false, error: 'mcp_authority_not_ready' }
        : undefined)
    });
    await withSession(notReadyBridge, async (client) => {
      const read = await callSettings(client, { key: 'debugMode' });
      expectSettingsText(read, 'mcp_authority_not_ready on a read');
      check(read.text.includes('(mcp_authority_not_ready)') && read.text.includes('Nothing was changed.'),
        'mcp_authority_not_ready is named and says nothing was changed');
      const write = await callSettings(client, { key: 'debugMode', value: 'SENTINEL-AUTH' });
      expectSettingsText(write, 'mcp_authority_not_ready on a write preflight');
      check(notReadyBridge.setCalls().length === 0, 'a not-ready preflight sends no mcp:set-setting');
    });

    // A code-less write refusal with free text: the text is not shown.
    const freeTextBridge = makeBridge({
      respond: (type, payload) => {
        if (type === 'mcp:get-settings') return writablePreflight(payload);
        if (type === 'mcp:set-setting') return { success: false, error: 'handler blew up near SENTINEL-FREE' };
        return undefined;
      }
    });
    await withSession(freeTextBridge, async (client) => {
      const result = await callSettings(client, { key: 'debugMode', value: 'true' });
      expectSettingsText(result, 'a code-less write refusal');
      check(!result.text.includes('Raw error:') && !result.text.includes('blew up'), 'free-text extension errors are not rendered');
    });

    // Not connected keeps the extension-layer rendering.
    const offlineBridge = makeBridge({
      respond: () => { throw new Error(mcp.FSB_ERROR_MESSAGES['extension_not_connected']); }
    });
    await withSession(offlineBridge, async (client) => {
      const result = await callSettings(client, { key: 'debugMode', value: 'SENTINEL-OFFLINE' });
      check(result.isError === true && !result.text.includes('SETTING_UNAVAILABLE') && !result.text.includes('Page navigation'),
        'a not-connected bridge keeps the extension-not-connected rendering');
      check(lineStarting(result.text, 'Detected: ') === 'Detected: ' + errorText(mcp.mapFSBError({ success: false, error: 'extension_not_connected' })).split('\n')[0].slice('Detected: '.length),
        'a not-connected bridge renders exactly like the tool\'s own not-connected answer');
      check(!result.text.includes('SENTINEL'), 'a not-connected bridge never echoes the value');
    });
  });

  await section('success output is one compact line in the D-07 shapes', async () => {
    const bridge = makeBridge({
      respond: (type, payload) => {
        if (type === 'mcp:get-settings' && payload.key === undefined) {
          return { success: true, settings: { debugMode: false, maxIterations: 100 }, readOnly: ['apiKey'], extra: 'dropped' };
        }
        if (type === 'mcp:get-settings') {
          return { success: true, key: payload.key, value: 100, type: 'integer', writable: true, range: { min: 50, max: 500 }, extra: 'dropped' };
        }
        if (type === 'mcp:set-setting') {
          return { success: true, key: payload.key, value: 200, previous: 100, changed: [payload.key], extra: 'dropped' };
        }
        return undefined;
      }
    });
    await withSession(bridge, async (client) => {
      const shapes = [
        ['read-all', {}, ['readOnly', 'settings']],
        ['read-one', { key: 'maxIterations' }, ['key', 'range', 'type', 'value', 'writable']],
        ['write', { key: 'maxIterations', value: '200' }, ['changed', 'key', 'previous', 'value']]
      ];
      for (const [mode, args, keys] of shapes) {
        const result = await callSettings(client, args);
        check(!result.isError, mode + ' succeeds');
        check(!result.text.includes('\n'), mode + ' output is one line');
        let parsed = null;
        try { parsed = JSON.parse(result.text); } catch (_e) { parsed = null; }
        checkDeep(parsed && Object.keys(parsed).sort(), keys, mode + ' output has exactly the D-07 keys');
        check(parsed !== null && result.text === JSON.stringify(parsed), mode + ' output is compact JSON');
      }
    });

    // WR-02: a provider switch also sets modelName; its new and previous value
    // reach the client as `coupled`, which one-key writes never carry.
    const coupled = { modelName: { value: 'gemini-2.5-flash', previous: 'grok-4' } };
    const pairBridge = makeBridge({
      respond: (type, payload) => {
        if (type === 'mcp:get-settings') return { success: true, key: payload.key, value: 'xai', type: 'enum', writable: true };
        if (type === 'mcp:set-setting') {
          return { success: true, key: payload.key, value: 'gemini', previous: 'xai', changed: ['modelProvider', 'modelName'], coupled: clone(coupled), extra: 'dropped' };
        }
        return undefined;
      }
    });
    await withSession(pairBridge, async (client) => {
      const result = await callSettings(client, { key: 'modelProvider', value: 'gemini' });
      let parsed = null;
      try { parsed = JSON.parse(result.text); } catch (_e) { parsed = null; }
      check(!result.isError && !result.text.includes('\n'), 'a provider switch is one compact line');
      checkDeep(parsed, { key: 'modelProvider', value: 'gemini', previous: 'xai', changed: ['modelProvider', 'modelName'], coupled },
        'a provider switch passes the coupled modelName through and drops other fields');
    });
  });
}

// ---------------------------------------------------------------------------
// Part 2 fakes: chrome.storage.local, automationLogger, fetch and the session
// recorder (the tests/mcp-settings-route.test.js pattern). Installed only for
// Part 2 and restored afterwards.
// ---------------------------------------------------------------------------

const fakeStorage = { store: {}, setCalls: [], listeners: [] };
const loggerCalls = [];
const recorderEntries = [];
let fetchCalls = 0;

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function resetStorage(initial) {
  fakeStorage.store = clone(initial || {});
  fakeStorage.setCalls = [];
}

function pickFromStore(keys) {
  const store = fakeStorage.store;
  if (keys === null || keys === undefined) return clone(store);
  const list = typeof keys === 'string' ? [keys] : keys;
  if (Array.isArray(list)) {
    const result = {};
    for (const key of list) {
      if (hasOwn(store, key)) result[key] = clone(store[key]);
    }
    return result;
  }
  if (typeof keys === 'object') {
    const result = {};
    for (const key of Object.keys(keys)) {
      result[key] = hasOwn(store, key) ? clone(store[key]) : keys[key];
    }
    return result;
  }
  return {};
}

const FAKE_GLOBAL_NAMES = [
  'chrome',
  'automationLogger',
  'fetch',
  'fsbMcpSessionRecorder',
  'FsbSpreadsheetRecordRedaction',
  'FsbSettingsSchema',
  'FsbDelegationProviders',
  'FsbAgentCapRecommendation'
];

function installExtensionFakes() {
  const saved = {};
  for (const name of FAKE_GLOBAL_NAMES) {
    saved[name] = { had: hasOwn(globalThis, name), value: hasOwn(globalThis, name) ? globalThis[name] : undefined };
  }

  globalThis.chrome = {
    storage: {
      local: {
        // Callback and promise forms. Both settle on a later macrotask, and a
        // set fires the onChanged listeners before it resolves, as Chrome does.
        get(keys, callback) {
          const promise = nextTick().then(() => pickFromStore(keys));
          if (typeof callback === 'function') {
            promise.then((result) => callback(result), () => callback({}));
            return undefined;
          }
          return promise;
        },
        set(items, callback) {
          const snapshot = clone(items);
          fakeStorage.setCalls.push(snapshot);
          const promise = nextTick().then(() => {
            const changes = {};
            for (const key of Object.keys(snapshot)) {
              changes[key] = { oldValue: clone(fakeStorage.store[key]), newValue: clone(snapshot[key]) };
              fakeStorage.store[key] = clone(snapshot[key]);
            }
            for (const listener of fakeStorage.listeners.slice()) {
              try { listener(changes, 'local'); } catch (_e) { /* a listener cannot break the writer */ }
            }
          });
          if (typeof callback === 'function') {
            promise.then(() => callback(), () => callback());
            return undefined;
          }
          return promise;
        }
      },
      onChanged: {
        addListener(listener) {
          fakeStorage.listeners.push(listener);
        }
      }
    },
    tabs: {
      create() {
        throw new Error('the settings path must not open a tab');
      }
    }
  };

  globalThis.automationLogger = {
    info(message, data) { loggerCalls.push({ level: 'info', message, data: clone(data) }); },
    warn(message, data) { loggerCalls.push({ level: 'warn', message, data: clone(data) }); },
    error(message, data) { loggerCalls.push({ level: 'error', message, data: clone(data) }); },
    debug(message, data) { loggerCalls.push({ level: 'debug', message, data: clone(data) }); }
  };

  globalThis.fetch = function () {
    fetchCalls += 1;
    throw new Error('network access is not allowed on the settings path');
  };

  // The dispatcher records every message route here. With no spreadsheet
  // redactor present it calls recordDispatch directly.
  delete globalThis.FsbSpreadsheetRecordRedaction;
  globalThis.fsbMcpSessionRecorder = {
    recordDispatch(entry) {
      recorderEntries.push(entry);
    }
  };

  return function restore() {
    for (const name of FAKE_GLOBAL_NAMES) {
      if (saved[name].had) globalThis[name] = saved[name].value;
      else delete globalThis[name];
    }
  };
}

// The shipped agent registry first (globalThis.FsbDelegationProviders), then
// the schema and the dispatcher, all against the fakes above.
function loadExtension() {
  require(path.join(ROOT, 'extension', 'utils', 'delegation-providers.js'));
  const configModule = require(path.join(ROOT, 'extension', 'config', 'config.js'));
  const dispatcher = require(path.join(ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js'));
  return {
    Config: configModule.Config,
    schema: globalThis.FsbSettingsSchema,
    dispatcher
  };
}

// JSON and util.inspect (which also shows symbol-keyed fields) of a value.
function sinkText(value) {
  let json = '';
  try { json = JSON.stringify(value === undefined ? null : value); } catch (_e) { json = '[unserializable]'; }
  return json + '\n' + util.inspect(value, { depth: 12, breakLength: Infinity });
}

function parseLine(text) {
  try { return JSON.parse(text); } catch (_e) { return null; }
}

function quotedLiteralPattern(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('[\'"]' + escaped + '[\'"]');
}

// ---------------------------------------------------------------------------
// Part 2: MCP Client -> built settings tool -> fake bridge -> real
// dispatchMcpMessageRoute -> real route handler -> fake chrome.storage.
// The fake bridge stands in for MCPBridgeClient, so the _routeMessage switch
// hop is proven separately (tests/mcp-settings-route.test.js Part B).
// ---------------------------------------------------------------------------

async function partEndToEnd() {
  const restore = installExtensionFakes();
  let ext = null;
  try {
    ext = loadExtension();
  } catch (err) {
    restore();
    check(false, 'the extension schema and dispatcher load under the fakes: ' + describeError(err));
    return;
  }
  const PRODUCTION_SCHEMA = ext.schema;
  const dispatcher = ext.dispatcher;

  try {
    await section('end-to-end setup', async () => {
      check(PRODUCTION_SCHEMA && typeof PRODUCTION_SCHEMA.create === 'function', 'config.js installed the production FsbSettingsSchema');
      check(typeof dispatcher.dispatchMcpMessageRoute === 'function', 'the dispatcher exports dispatchMcpMessageRoute');
      checkDeep(Array.from(globalThis.FsbDelegationProviders.ids()).filter(globalThis.FsbDelegationProviders.isShippedId),
        ['claude-code', 'grok-build'], 'the shipped agent ids are claude-code and grok-build');
    });

    await section('end to end: read all and read one (SC1)', async () => {
      resetStorage({ apiKey: 'sk-E2E-SENTINEL', maxIterations: 100 });
      const bridge = makeBridge({ dispatcher });
      await withSession(bridge, async (client) => {
        const all = await callSettings(client, {});
        const parsed = parseLine(all.text);
        check(!all.isError && !all.text.includes('\n'), 'read-all is one line');
        checkDeep(parsed && Object.keys(parsed).sort(), ['readOnly', 'settings'], 'read-all parses to {settings, readOnly}');
        const settings = (parsed && parsed.settings) || {};
        const productionKeys = PRODUCTION_SCHEMA.keys();
        check(productionKeys.length === 36 && Object.keys(settings).length === productionKeys.length,
          'read-all returns every schema key (36 today, got ' + Object.keys(settings).length + ')');
        checkDeep(Object.keys(settings).sort(), productionKeys.slice().sort(), 'read-all keys are the schema keys');
        check(settings.apiKey === '[set]', "the stored apiKey reads as '[set]'");
        check(parsed && Array.isArray(parsed.readOnly) && parsed.readOnly.length === 11, 'read-all lists 11 read-only keys');
        checkDeep(parsed && parsed.readOnly, PRODUCTION_SCHEMA.readOnlyKeys(), 'readOnly is the schema read-only list');
        check(!all.text.includes('sk-E2E'), 'the stored secret never appears in read-all');

        const one = await callSettings(client, { key: 'maxIterations' });
        check(one.text === '{"key":"maxIterations","value":100,"type":"integer","writable":true,"range":{"min":50,"max":500}}',
          'read-one returns the exact compact line (got ' + one.text + ')');
        check(fakeStorage.setCalls.length === 0, 'reads write nothing to storage');
      });
      checkDeep(bridge.settingsCalls().map((call) => call.type), ['mcp:get-settings', 'mcp:get-settings'],
        'each read is one mcp:get-settings through the bridge');
    });

    await section('end to end: write, invalid value and consumer refresh (SC1, D-13)', async () => {
      resetStorage({ apiKey: 'sk-E2E-SENTINEL', maxIterations: 100 });
      const bridge = makeBridge({ dispatcher });
      await withSession(bridge, async (client) => {
        const consumer = new ext.Config();
        consumer._cachedConfig = { stale: true };
        consumer._cacheTimestamp = Date.now();

        const write = await callSettings(client, { key: 'debugMode', value: true });
        check(write.text === '{"key":"debugMode","value":true,"previous":false,"changed":["debugMode"]}',
          'a boolean write returns the exact compact line (got ' + write.text + ')');
        checkDeep(fakeStorage.setCalls, [{ debugMode: true }], 'storage saw exactly one set call {debugMode:true}');
        check(fakeStorage.store.debugMode === true, 'debugMode is stored as boolean true');
        check(consumer._cachedConfig === null && consumer._cacheTimestamp === 0, "a Config instance's cache was cleared by onChanged");

        const before = clone(fakeStorage.store);
        fakeStorage.setCalls = [];
        const invalid = await callSettings(client, { key: 'maxIterations', value: 600 });
        check(invalid.isError === true && invalid.text.includes('SETTING_VALUE_INVALID'), 'maxIterations 600 is SETTING_VALUE_INVALID');
        check(invalid.text.includes('Allowed: 50 to 500'), 'the refusal carries Allowed: 50 to 500');
        check(fakeStorage.setCalls.length === 0, 'an invalid value makes no storage write');
        checkDeep(fakeStorage.store, before, 'storage is unchanged after an invalid value');
      });
    });

    await section('end to end: refusals say what is allowed, never the value (D-07, D-15)', async () => {
      resetStorage({ modelProvider: 'xai' });
      const bridge = makeBridge({ dispatcher });
      await withSession(bridge, async (client) => {
        const before = clone(fakeStorage.store);
        fakeStorage.setCalls = [];

        const model = await callSettings(client, { key: 'modelName', value: 'SENTINEL-MODEL' });
        check(model.isError === true && model.text.includes('SETTING_VALUE_INVALID'), 'an unknown hosted modelName is SETTING_VALUE_INVALID');
        check(model.text.includes('Allowed:') && model.text.includes('grok-4-1-fast'), 'the modelName refusal lists the known xai model ids');
        check(!model.text.includes('SENTINEL-MODEL'), 'the modelName refusal does not echo the value');

        const agent = await callSettings(client, { key: 'agentProviderId', value: 'SENTINEL-AGENT' });
        check(agent.isError === true && agent.text.includes('claude-code') && agent.text.includes('grok-build'),
          'the agentProviderId refusal lists the shipped agent ids');
        check(!agent.text.includes('SENTINEL-AGENT'), 'the agentProviderId refusal does not echo the value');

        const stt = await callSettings(client, { key: 'sttProvider', value: 'SENTINEL-STT' });
        check(stt.isError === true && stt.text.includes('Allowed: browser, whisper'), 'the enum refusal lists browser, whisper');
        check(!stt.text.includes('SENTINEL-STT'), 'the enum refusal does not echo the value');

        check(fakeStorage.setCalls.length === 0, 'none of the three refusals writes to storage');
        checkDeep(fakeStorage.store, before, 'storage is unchanged after the three refusals');
      });
      const submitted = bridge.setCalls().map((call) => call.payload.value);
      checkDeep(submitted, ['SENTINEL-MODEL', 'SENTINEL-AGENT', 'SENTINEL-STT'],
        'writable keys send their value, so the extension decides and words the refusal');
    });

    await section('end to end: a protected key value never leaves the MCP process (SC2, T-66.1-04)', async () => {
      resetStorage({ apiKey: 'sk-E2E-SENTINEL', maxIterations: 100 });
      const loggerBefore = loggerCalls.length;
      const recorderBefore = recorderEntries.length;
      const bridge = makeBridge({ dispatcher });
      await withSession(bridge, async (client) => {
        const result = await callSettings(client, { key: 'apiKey', value: 'sk-NEW-SENTINEL' });
        check(result.isError === true && result.text.includes('SETTING_PROTECTED_KEY'), 'an apiKey write returns SETTING_PROTECTED_KEY');
        check(!result.text.includes('sk-NEW-SENTINEL'), 'the tool reply does not echo the value');
      });
      const sets = bridge.setCalls();
      check(sets.length === 1 && !hasOwn(sets[0].payload, 'value'), 'the extension is asked to write apiKey without a value');
      check(!sinkText(bridge.calls).includes('sk-NEW-SENTINEL'), 'no recorded bridge message carries the value');
      check(fakeStorage.store.apiKey === 'sk-E2E-SENTINEL', 'storage still holds the original apiKey');
      check(fakeStorage.setCalls.length === 0, 'the refusal makes no storage write');
      check(!sinkText(fakeStorage.store).includes('sk-NEW-SENTINEL'), 'no storage value carries the submitted value');
      const newLogs = loggerCalls.slice(loggerBefore);
      check(newLogs.some((call) => call.level === 'warn' && call.message === 'MCP settings write refused'),
        'the refusal is logged for the operator (D-18)');
      check(!sinkText(loggerCalls).includes('sk-NEW-SENTINEL'), 'no automationLogger call carries the value');
      const newEntries = recorderEntries.slice(recorderBefore);
      check(newEntries.length > 0, 'the dispatcher recorded the settings calls');
      check(!sinkText(recorderEntries).includes('sk-NEW-SENTINEL'), 'no recorder entry carries the value');
      check(!captured.some((line) => line.includes('sk-NEW-SENTINEL')), 'no captured console or stderr text carries the value');
    });

    await section('end to end: modelProvider writes the provider pair (D-15)', async () => {
      resetStorage({ geminiApiKey: 'gm-E2E-SENTINEL', modelProvider: 'xai', modelName: 'grok-4-1-fast' });
      await withSession(makeBridge({ dispatcher }), async (client) => {
        const result = await callSettings(client, { key: 'modelProvider', value: 'gemini' });
        const parsed = parseLine(result.text);
        check(!result.isError, 'modelProvider gemini is accepted with geminiApiKey stored');
        checkDeep(parsed && parsed.changed, ['modelProvider', 'modelName'], 'the write reports changed [modelProvider, modelName]');
        check(fakeStorage.store.modelProvider === 'gemini' && fakeStorage.store.modelName === 'gemini-2.5-flash',
          'storage holds gemini and gemini-2.5-flash');
        check(fakeStorage.setCalls.length === 1, 'the pair is written in one storage set call');
        check(!result.text.includes('gm-E2E'), 'the stored provider key never appears in the reply');
      });
    });

    await section('end to end: a delegated agent can read but not write (SC5, D-20)', async () => {
      resetStorage({ debugMode: true });
      const bridge = makeBridge({ dispatcher, agentId: 'agent_delegated' });
      await withSession(bridge, async (client) => {
        const write = await callSettings(client, { key: 'debugMode', value: false });
        check(write.isError === true && write.text.includes('SETTING_DELEGATED_WRITE_REFUSED'),
          'a delegated write returns SETTING_DELEGATED_WRITE_REFUSED');
        check(fakeStorage.setCalls.length === 0 && fakeStorage.store.debugMode === true, 'the delegated write changes nothing');
        const read = await callSettings(client, { key: 'debugMode' });
        const parsed = parseLine(read.text);
        check(!read.isError && parsed && parsed.key === 'debugMode' && parsed.value === true, 'the delegated read still succeeds');
      });
      check(bridge.calls.some((call) => call.type === 'agent:register'), 'the session registered as agent_delegated');
      check(bridge.settingsCalls().every((call) => call.payload.agentId === 'agent_delegated'),
        'every settings message carried the delegated agentId');
    });

    await section('SC4: a test-only schema key works with no mcp/src change (D-17)', async () => {
      const fixture = PRODUCTION_SCHEMA.create(PRODUCTION_SCHEMA.entries.concat([
        { key: 'fsbFixtureFastMode', type: 'boolean', cls: 'writable', default: false }
      ]));
      resetStorage({});
      try {
        globalThis.FsbSettingsSchema = fixture;
        await withSession(makeBridge({ dispatcher }), async (client) => {
          const all = parseLine((await callSettings(client, {})).text);
          check(all && all.settings && all.settings.fsbFixtureFastMode === false, 'read-all includes fsbFixtureFastMode false');
          const write = await callSettings(client, { key: 'fsbFixtureFastMode', value: true });
          const parsed = parseLine(write.text);
          check(!write.isError, 'fsbFixtureFastMode is writable through the tool');
          checkDeep(parsed && parsed.changed, ['fsbFixtureFastMode'], 'the fixture write reports changed [fsbFixtureFastMode]');
          check(fakeStorage.store.fsbFixtureFastMode === true, 'the fixture value is stored');
        });
      } finally {
        globalThis.FsbSettingsSchema = PRODUCTION_SCHEMA;
      }
      check(!PRODUCTION_SCHEMA.keys().includes('fsbFixtureFastMode'), 'the production schema keys lack the fixture key');
      await withSession(makeBridge({ dispatcher }), async (client) => {
        const after = await callSettings(client, { key: 'fsbFixtureFastMode' });
        check(after.isError === true && after.text.includes('SETTING_UNKNOWN_KEY'), 'after restoring, the fixture key is unknown again');
      });

      const settingsSource = fs.readFileSync(path.join(ROOT, 'mcp', 'src', 'tools', 'settings.ts'), 'utf8');
      const named = PRODUCTION_SCHEMA.keys().filter((key) => quotedLiteralPattern(key).test(settingsSource));
      checkDeep(named, [], 'mcp/src/tools/settings.ts names no production setting key in quotes');
    });

    await section('end-to-end side effects', async () => {
      check(fetchCalls === 0, 'the settings path made no network call');
      // Writable values (SENTINEL-MODEL, -AGENT, -STT) do reach the extension,
      // which refuses them; stored secrets (sk-E2E, gm-E2E) are only ever
      // masked. Neither kind may reach the recorder or the operator log.
      check(recorderEntries.length > 0 && !sinkText(recorderEntries).includes('SENTINEL'),
        'no recorder entry from the whole end-to-end run carries a SENTINEL value');
      check(loggerCalls.length > 0 && !sinkText(loggerCalls).includes('SENTINEL'),
        'no automationLogger call from the whole end-to-end run carries a SENTINEL value');
    });
  } finally {
    globalThis.FsbSettingsSchema = PRODUCTION_SCHEMA;
    restore();
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function run() {
  startCapture();
  try {
    mcp = await loadMcp();
    await partContract();
    await partEndToEnd();
  } finally {
    stopCapture();
    if (mcp) mcp.resetInventory();
  }

  out('\n--- console and stderr never carry a submitted value (T-66.1-04) ---');
  const leaked = captured.filter((line) => line.includes('SENTINEL'));
  check(captured.length > 0, 'console/stderr output was captured during the run (' + captured.length + ' lines)');
  check(leaked.length === 0, 'no captured console or stderr text contains a SENTINEL value');
  if (leaked.length > 0) out('  DIAG: first leaked line: ' + JSON.stringify(leaked[0].slice(0, 200)));

  out('\nmcp-settings-tool-contract: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  stopCapture();
  failed += 1;
  ORIGINAL_STDERR_WRITE.call(process.stderr, '  FAIL: test harness threw: ' + describeError(err) + '\n');
  out('\nmcp-settings-tool-contract: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(1);
});
