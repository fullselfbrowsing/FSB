/**
 * Phase 69 test helper: in-process tools/list of the current mcp/build.
 *
 * Re-exports scripts/mcp/lib/tools-list.mjs (SDK Client over
 * InMemoryTransport, mock AgentScope, stub bridge, canonical metrics, shape
 * projection, fixture reader) and adds the build-staleness guard, the
 * current-build listing and the verbatim D-12 `expect` tool list. It never
 * runs git and never spawns a process, so it is safe in shallow CI clones and
 * on Node 20.
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, listToolsFromRuntimeModule } from '../../scripts/mcp/lib/tools-list.mjs';

export * from '../../scripts/mcp/lib/tools-list.mjs';

// The 29 tools that accept the optional `expect` parameter (CONTEXT D-12), in
// the D-12 order. Embedded verbatim, never derived, so a drift on either side
// fails a test instead of silently reshaping the list. Plan 69-07's parity
// test compares it with the MCP and extension mirrors.
export const EXPECT_TOOL_NAMES_VERBATIM = Object.freeze([
  'execute_js',
  'click', 'right_click', 'double_click', 'click_at', 'double_click_at', 'click_and_hold',
  'type_text', 'insert_text', 'press_enter', 'press_key', 'clear_input',
  'select_option', 'check_box', 'set_attribute',
  'drag_drop', 'drag', 'drag_variable_speed', 'drop_file', 'upload_file',
  'select_text_range', 'scroll_to_top', 'scroll_to_bottom', 'scroll_to_element',
  'navigate', 'go_back', 'go_forward', 'refresh', 'back',
]);

const MCP_SRC = path.join(REPO_ROOT, 'mcp', 'src');
const MCP_BUILD = path.join(REPO_ROOT, 'mcp', 'build');
const RUNTIME_BUILD_PATH = path.join(MCP_BUILD, 'runtime.js');
const REBUILD_HINT = 'run `npm --prefix mcp run build`';

function listSourceFiles(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

// Throws when mcp/build/runtime.js is missing, or when any mcp/src/**/*.ts is
// newer than its compiled mcp/build/**/*.js (generalises the guard in
// tests/visual-session-schema-lock.test.js). A stale build has caused phantom
// contract failures before, so fail loudly instead of listing old code.
export function assertBuildFresh() {
  if (!fs.existsSync(RUNTIME_BUILD_PATH)) {
    throw new Error(`mcp/build/runtime.js is missing -- ${REBUILD_HINT}`);
  }
  const stale = [];
  for (const sourcePath of listSourceFiles(MCP_SRC)) {
    const relative = path.relative(MCP_SRC, sourcePath);
    const buildPath = path.join(MCP_BUILD, relative.replace(/\.ts$/, '.js'));
    if (!fs.existsSync(buildPath)) continue;
    if (fs.statSync(sourcePath).mtimeMs > fs.statSync(buildPath).mtimeMs) {
      stale.push(`mcp/build/${relative.replace(/\.ts$/, '.js').split(path.sep).join('/')} is older than mcp/src/${relative.split(path.sep).join('/')}`);
    }
  }
  if (stale.length > 0) {
    throw new Error(`${stale.join('; ')} -- ${REBUILD_HINT}`);
  }
}

// tools/list of the current mcp/build (stub bridge, mock AgentScope), after
// the staleness guard.
export async function listCurrentTools() {
  assertBuildFresh();
  return listToolsFromRuntimeModule(RUNTIME_BUILD_PATH);
}
