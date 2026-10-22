/**
 * Phase 69 in-process MCP tools/list library (D-04, D-05, D-22).
 *
 * Lists a built FSB MCP runtime in-process: createRuntime() from a build's
 * runtime.js, an SDK Client over InMemoryTransport, a structural AgentScope
 * mock (no setters, so no client-inventory process probes run) and a stub
 * bridge. Nothing here runs git or spawns a process, so chained tests can
 * import it in shallow CI clones. The generator that rebuilds the 8a058bdf
 * pin (scripts/mcp/tools-list-baseline.mjs) is the only git user.
 *
 * Bytes are always Buffer.byteLength(canonicalJson(x), 'utf8'): SDK tool
 * objects carry keys set to undefined, which canonicalJson drops.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalJson, sha256Hex, toolsListDigest } from '../../bench/lib/identity.mjs';

export { canonicalJson, sha256Hex, toolsListDigest };

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const PIN_COMMIT = '8a058bdf0d17c1e3e79ec3104cc1996326b4c402';
export const FIXTURE_RELATIVE_PATH = 'tests/fixtures/mcp-tools-list-8a058bdf.json';
export const SETTINGS_TOOL_NAME = 'settings';

const DEFAULT_SDK_ESM_ROOT = path.join(REPO_ROOT, 'mcp', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm');
const DEFAULT_RUNTIME_PATH = path.join(REPO_ROOT, 'mcp', 'build', 'runtime.js');

// ESM paths on purpose: createRequire().resolve() returns dist/cjs, while
// mcp/build loads dist/esm (RESEARCH Finding 20).
export async function loadSdk(sdkEsmRoot = DEFAULT_SDK_ESM_ROOT) {
  const [clientModule, transportModule] = await Promise.all([
    import(pathToFileURL(path.join(sdkEsmRoot, 'client', 'index.js')).href),
    import(pathToFileURL(path.join(sdkEsmRoot, 'inMemory.js')).href),
  ]);
  return { Client: clientModule.Client, InMemoryTransport: transportModule.InMemoryTransport };
}

// Structural AgentScope (tests/mcp-client-identity.test.js). It has no
// setClientInfoSupplier / setClientInventorySupplier, so createRuntime wires
// no inventory supplier and no execFile probe can run (RESEARCH Finding 18).
export function makeMockAgentScope() {
  return {
    ensure: async () => 'agent-test',
    ownershipTokenFor: () => null,
    currentOwnershipToken: () => null,
    currentConnectionId: () => null,
    captureOwnershipToken: () => {},
    reset: () => {},
  };
}

// Stands in for WebSocketBridge. Every sendAndWait is recorded as
// { message, options } in `calls`; the answer comes from onSend when given.
export function makeStubBridge({ onSend } = {}) {
  const calls = [];
  return {
    isConnected: true,
    calls,
    on() {},
    off() {},
    async sendAndWait(message, options) {
      calls.push({ message, options });
      return onSend ? onSend(message, options) : { success: true };
    },
  };
}

export async function createInProcessClient({ runtimePath = DEFAULT_RUNTIME_PATH, bridge, agentScope } = {}) {
  const { Client, InMemoryTransport } = await loadSdk();
  const { createRuntime } = await import(pathToFileURL(runtimePath).href);
  const runtime = createRuntime({
    bridge: bridge || makeStubBridge(),
    agentScope: agentScope || makeMockAgentScope(),
  });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await runtime.server.connect(serverSide);
  const client = new Client({ name: 'fsb-phase69', version: '0.0.0' });
  await client.connect(clientSide);
  return {
    client,
    runtime,
    async close() {
      try { await client.close(); } catch (_error) { /* already closed */ }
      try { await runtime.server.close(); } catch (_error) { /* already closed */ }
    },
  };
}

export async function listToolsFromRuntimeModule(runtimePath = DEFAULT_RUNTIME_PATH) {
  const session = await createInProcessClient({ runtimePath });
  try {
    const result = await session.client.listTools();
    return result.tools;
  } finally {
    await session.close();
  }
}

function codeUnitCompare(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function sortByName(tools) {
  return [...tools].sort((a, b) => codeUnitCompare(String(a && a.name), String(b && b.name)));
}

export function filterToNames(tools, names) {
  const wanted = new Set(names);
  return tools.filter((tool) => tool && wanted.has(tool.name));
}

// ---------------------------------------------------------------------------
// Metrics (D-05)
// ---------------------------------------------------------------------------

export function canonicalBytes(value) {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

export function descChars(tools) {
  return tools.reduce((sum, tool) => sum + (typeof tool.description === 'string' ? tool.description.length : 0), 0);
}

// Top-level inputSchema.properties descriptions only.
export function paramChars(tools) {
  return tools.reduce((sum, tool) => {
    const properties = (tool.inputSchema && tool.inputSchema.properties) || {};
    return sum + Object.values(properties).reduce((inner, property) => (
      inner + (property && typeof property.description === 'string' ? property.description.length : 0)
    ), 0);
  }, 0);
}

export function estimateTokens(chars) {
  return Math.ceil(chars / 4);
}

// ---------------------------------------------------------------------------
// Shape projection (D-22)
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Removes the `description` keyword from a JSON Schema node and every schema
// below it. Map keys under `properties` (and the other keyword maps) are
// parameter names, never keywords, so they are kept even when a parameter is
// itself called `description`.
function stripSchemaDescriptions(node) {
  if (!isPlainObject(node)) return;
  delete node.description;
  for (const mapKeyword of ['properties', 'patternProperties', '$defs', 'definitions']) {
    if (isPlainObject(node[mapKeyword])) {
      for (const key of Object.keys(node[mapKeyword])) stripSchemaDescriptions(node[mapKeyword][key]);
    }
  }
  if (Array.isArray(node.items)) node.items.forEach(stripSchemaDescriptions);
  else stripSchemaDescriptions(node.items);
  if (Array.isArray(node.prefixItems)) node.prefixItems.forEach(stripSchemaDescriptions);
  stripSchemaDescriptions(node.additionalProperties);
  stripSchemaDescriptions(node.not);
  for (const listKeyword of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(node[listKeyword])) node[listKeyword].forEach(stripSchemaDescriptions);
  }
}

// Description-free projection of one tools/list entry. Keeps names, types,
// required lists, defaults, enums, exclusiveMinimum, additionalProperties,
// $schema and execution; drops the tool description and every schema
// description.
export function projectShape(tool) {
  const clone = JSON.parse(canonicalJson(tool));
  if (isPlainObject(clone)) {
    delete clone.description;
    stripSchemaDescriptions(clone.inputSchema);
  }
  return clone;
}

// ---------------------------------------------------------------------------
// Fixture and installed versions
// ---------------------------------------------------------------------------

export function readBaselineFixture() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, FIXTURE_RELATIVE_PATH), 'utf8'));
}

export function readInstalledVersions() {
  const readVersion = (...segments) => JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'mcp', 'node_modules', ...segments, 'package.json'), 'utf8'),
  ).version;
  return {
    sdkVersion: readVersion('@modelcontextprotocol', 'sdk'),
    zodVersion: readVersion('zod'),
  };
}
