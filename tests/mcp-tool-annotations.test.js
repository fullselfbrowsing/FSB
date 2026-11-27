'use strict';

/**
 * Every MCP tool declares a title and the readOnly, destructive, idempotent
 * and openWorld hints, as the Anthropic Software Directory Policy requires.
 *
 * The tool list is read over the wire: the built runtime is connected to an
 * SDK Client through an in-memory transport, so the test sees exactly what a
 * host sees in tools/list. createRuntime() does not start the WebSocket
 * bridge, so no port is bound.
 *
 * Run after building: npm --prefix mcp run build && node tests/mcp-tool-annotations.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const BUILD_ROOT = path.join(REPO_ROOT, 'mcp', 'build');
const SDK_ROOT = path.join(REPO_ROOT, 'mcp', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm');
const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function importFile(file) {
  return import(pathToFileURL(file).href);
}

async function listToolsOverTheWire(createRuntime, Client, InMemoryTransport) {
  const { server } = createRuntime();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'fsb-annotation-test', version: '1.0.0' });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.listTools();
    return { tools: result.tools, registeredNames: Object.keys(server._registeredTools || {}) };
  } finally {
    await client.close();
    await server.close();
  }
}

async function run() {
  const { createRuntime } = await importFile(path.join(BUILD_ROOT, 'runtime.js'));
  const annotations = await importFile(path.join(BUILD_ROOT, 'tools', 'annotations.js'));
  const { TOOL_ANNOTATIONS, PENDING_TOOL_NAMES, annotateTools } = annotations;
  const { Client } = await importFile(path.join(SDK_ROOT, 'client', 'index.js'));
  const { InMemoryTransport } = await importFile(path.join(SDK_ROOT, 'inMemory.js'));
  const { McpServer } = await importFile(path.join(SDK_ROOT, 'server', 'mcp.js'));

  console.log('\n--- every tool on the wire carries a title and all four hints ---');
  const { tools, registeredNames } = await listToolsOverTheWire(createRuntime, Client, InMemoryTransport);
  check(tools.length > 0, 'tools/list returns tools (got ' + tools.length + ')');
  check(tools.length === registeredNames.length,
    'tools/list returns every registered tool (' + tools.length + ' of ' + registeredNames.length + ')');

  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const missingTitle = [];
  const titleMismatch = [];
  const nonBooleanHint = [];
  const readOnlyDestructive = [];
  const differsFromMap = [];
  for (const tool of tools) {
    const a = tool.annotations || {};
    if (typeof tool.title !== 'string' || tool.title.trim() === '') missingTitle.push(tool.name);
    if (a.title !== tool.title) titleMismatch.push(tool.name);
    for (const hint of HINTS) {
      if (typeof a[hint] !== 'boolean') nonBooleanHint.push(tool.name + '.' + hint);
    }
    if (a.readOnlyHint === true && a.destructiveHint !== false) readOnlyDestructive.push(tool.name);
    const entry = Object.prototype.hasOwnProperty.call(TOOL_ANNOTATIONS, tool.name) ? TOOL_ANNOTATIONS[tool.name] : null;
    if (entry && (entry.title !== tool.title || HINTS.some((hint) => entry[hint] !== a[hint]))) {
      differsFromMap.push(tool.name);
    }
  }
  check(missingTitle.length === 0, 'every tool has a non-empty top-level title' + (missingTitle.length ? ': ' + missingTitle.join(', ') : ''));
  check(titleMismatch.length === 0, 'annotations.title equals the top-level title' + (titleMismatch.length ? ': ' + titleMismatch.join(', ') : ''));
  check(nonBooleanHint.length === 0, 'every hint is a boolean' + (nonBooleanHint.length ? ': ' + nonBooleanHint.join(', ') : ''));
  check(readOnlyDestructive.length === 0, 'no read-only tool is destructive' + (readOnlyDestructive.length ? ': ' + readOnlyDestructive.join(', ') : ''));
  check(differsFromMap.length === 0, 'wire title and hints match the annotation map' + (differsFromMap.length ? ': ' + differsFromMap.join(', ') : ''));

  console.log('\n--- the annotation map and the registered tools agree ---');
  const registered = new Set(registeredNames);
  const mapNames = Object.keys(TOOL_ANNOTATIONS);
  const unmapped = registeredNames.filter((name) => !Object.prototype.hasOwnProperty.call(TOOL_ANNOTATIONS, name));
  const stale = mapNames.filter((name) => !registered.has(name) && !PENDING_TOOL_NAMES.has(name));
  check(unmapped.length === 0, 'every registered tool has an explicit map entry' + (unmapped.length ? ': ' + unmapped.join(', ') : ''));
  check(stale.length === 0, 'every map entry is registered or listed as pending' + (stale.length ? ': ' + stale.join(', ') : ''));
  const pendingWithoutEntry = [...PENDING_TOOL_NAMES].filter((name) => !Object.prototype.hasOwnProperty.call(TOOL_ANNOTATIONS, name));
  check(pendingWithoutEntry.length === 0, 'every pending name has a map entry' + (pendingWithoutEntry.length ? ': ' + pendingWithoutEntry.join(', ') : ''));
  const mapReadOnlyDestructive = mapNames.filter((name) => TOOL_ANNOTATIONS[name].readOnlyHint && TOOL_ANNOTATIONS[name].destructiveHint);
  check(mapReadOnlyDestructive.length === 0, 'no map entry is both read-only and destructive' + (mapReadOnlyDestructive.length ? ': ' + mapReadOnlyDestructive.join(', ') : ''));

  console.log('\n--- key classifications ---');
  const hintsOf = (name) => (byName.get(name) || {}).annotations || {};
  check(hintsOf('stop_trigger').readOnlyHint === false && hintsOf('stop_trigger').destructiveHint === false,
    'stop_trigger is not read-only and not destructive');
  check(hintsOf('complete_task').readOnlyHint === false, 'complete_task is not read-only');
  check(hintsOf('capture_screenshot').readOnlyHint === true, 'capture_screenshot is read-only');
  for (const name of ['replay_session', 'invoke_capability', 'use_payment_method', 'execute_js', 'close_tab']) {
    check(hintsOf(name).destructiveHint === true, name + ' is destructive');
  }
  check(hintsOf('read_page').readOnlyHint === true && hintsOf('read_page').openWorldHint === true,
    'read_page is read-only and open-world');
  check(hintsOf('list_tabs').readOnlyHint === true && hintsOf('list_tabs').openWorldHint === false,
    'list_tabs is read-only and not open-world');

  console.log('\n--- annotateTools patches the instance and tolerates fakes ---');
  const plain = new McpServer({ name: 'plain', version: '1.0.0' });
  check(!Object.prototype.hasOwnProperty.call(plain, 'tool') && plain.tool === McpServer.prototype.tool,
    'a server that annotateTools never saw keeps the SDK tool()');
  const patched = new McpServer({ name: 'patched', version: '1.0.0' });
  annotateTools(patched);
  check(Object.prototype.hasOwnProperty.call(patched, 'tool') && Object.prototype.hasOwnProperty.call(patched, 'registerTool'),
    'annotateTools wraps tool() and registerTool() on the instance');
  check(new McpServer({ name: 'after', version: '1.0.0' }).tool === McpServer.prototype.tool,
    'McpServer.prototype.tool is left alone');
  const viaRegisterTool = patched.registerTool('click', { description: 'click' }, async () => ({ content: [] }));
  check(viaRegisterTool && viaRegisterTool.title === 'Click Element'
      && viaRegisterTool.annotations && viaRegisterTool.annotations.destructiveHint === true,
    'registerTool() registrations are annotated too');

  const warnings = [];
  const originalConsoleError = console.error;
  console.error = (...args) => { warnings.push(args.join(' ')); };
  let fakeThrew = null;
  let unmappedHandle = null;
  try {
    const fake = { tool() { return undefined; } };
    annotateTools(fake);
    fake.tool('read_page', 'desc', {}, async () => ({}));
    fake.tool('some_future_tool', 'desc', {}, async () => ({}));

    const updates = [];
    const fakeWithHandle = {
      registerTool() {
        return {
          annotations: { extraHint: 'kept' },
          update(change) { updates.push(change); Object.assign(this, change); },
        };
      },
    };
    annotateTools(fakeWithHandle);
    unmappedHandle = fakeWithHandle.registerTool('some_future_tool', {}, async () => ({}));
  } catch (error) {
    fakeThrew = error;
  } finally {
    console.error = originalConsoleError;
  }
  check(fakeThrew === null, 'a fake server whose tool() returns undefined does not throw'
    + (fakeThrew ? ': ' + (fakeThrew.stack || fakeThrew) : ''));
  const unmapped2 = (unmappedHandle && unmappedHandle.annotations) || {};
  check(unmappedHandle && unmappedHandle.title === 'Some Future Tool' && unmapped2.title === 'Some Future Tool',
    'an unmapped name gets a Title Case title from its snake_case name');
  check(unmapped2.readOnlyHint === false && unmapped2.destructiveHint === true
      && unmapped2.idempotentHint === false && unmapped2.openWorldHint === true,
    'an unmapped name gets the conservative default hints');
  check(unmapped2.extraHint === 'kept', 'annotations already on the handle are kept');
  check(warnings.filter((line) => line.includes('some_future_tool')).length === 2
      && warnings.every((line) => !line.includes('\n')),
    'each unmapped registration writes one stderr warning line');
  check(!warnings.some((line) => line.includes('read_page')), 'a mapped name writes no warning');

  console.log('\nmcp-tool-annotations: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  failed++;
  console.error('  FAIL: test harness threw:', err && err.stack ? err.stack : err);
  console.log('\nmcp-tool-annotations: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(1);
});
