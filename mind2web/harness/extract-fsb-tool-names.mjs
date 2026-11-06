#!/usr/bin/env node
// Lists every MCP tool fsb-mcp-server registers, by reading FSB source
// (read-only). Running the real server is not an option here: it binds the
// bridge port. The registration rules below mirror mcp/src/runtime.ts:
//   - manual.ts registers every non-read-only registry tool except "trigger"
//   - read-only.ts registers only read-only tools that have a bridge mapping
//   - triggers.ts registers TRIGGER_TOOL_NAMES from the registry
//   - screenshots.ts registers capture_screenshot from the registry
//   - the remaining files register literal names with server.tool(...)
//
// Usage: node extract-fsb-tool-names.mjs [--check]
//   --check exits 1 when config/fsb-tool-names.json is out of date.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BENCH_DIR = path.resolve(here, '..');
export const REPO_DIR = path.resolve(BENCH_DIR, '..', '..');
const OUT_PATH = path.join(BENCH_DIR, 'config', 'fsb-tool-names.json');

const REGISTRY_REL = 'extension/ai/tool-definitions.js';
const TOOLS_DIR_REL = 'mcp/src/tools';
const LITERAL_FILES = ['visual-session.ts', 'observability.ts', 'agents.ts', 'vault.ts', 'capabilities.ts', 'autopilot.ts'];

function readRepo(rel) {
  return readFileSync(path.join(REPO_DIR, rel), 'utf8');
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function findLine(text, pattern) {
  const match = pattern.exec(text);
  return match ? lineOf(text, match.index) : null;
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function loadRegistry() {
  const require = createRequire(import.meta.url);
  return require(path.join(REPO_DIR, REGISTRY_REL)).TOOL_REGISTRY;
}

export function extractToolNames() {
  const registry = loadRegistry();
  const registryText = readRepo(REGISTRY_REL);
  const definitionLine = (name) => findLine(registryText, new RegExp(`^\\s*name: '${escapeRe(name)}'`, 'm'));

  const manualRel = `${TOOLS_DIR_REL}/manual.ts`;
  const readOnlyRel = `${TOOLS_DIR_REL}/read-only.ts`;
  const triggersRel = `${TOOLS_DIR_REL}/triggers.ts`;
  const screenshotsRel = `${TOOLS_DIR_REL}/screenshots.ts`;
  const manualText = readRepo(manualRel);
  const readOnlyText = readRepo(readOnlyRel);
  const triggersText = readRepo(triggersRel);
  const screenshotsText = readRepo(screenshotsRel);

  const manualExclusions = new Set(JSON.parse(
    manualText.match(/TRIGGER_MANUAL_EXCLUSIONS = new Set\((\[[^\]]*\])\)/)[1].replace(/'/g, '"'),
  ));
  const mapBlock = readOnlyText.match(/const MESSAGE_TYPE_MAP[\s\S]*?\n};/)[0];
  const readOnlyMapped = new Set([...mapBlock.matchAll(/^ {2}(\w+): \(/gm)].map((m) => m[1]));
  const triggerNames = [...triggersText.match(/TRIGGER_TOOL_NAMES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  const manualLine = findLine(manualText, /^[ \t]+server\.tool\(/m);
  const readOnlyLine = findLine(readOnlyText, /^[ \t]+server\.tool\(/m);
  const triggersLine = findLine(triggersText, /^[ \t]+server\.tool\(/m);
  const screenshotsLine = findLine(screenshotsText, /^[ \t]+server\.tool\(/m);

  const tools = [];
  // Tools registered by literal name carry their own zod schema, so registry
  // params only describe tools whose registration reads the registry.
  const add = (name, registeredAt, registeredBy, fromRegistry = true) => {
    const def = fromRegistry ? registry.find((t) => t.name === name) || null : null;
    const defLine = def ? definitionLine(name) : null;
    tools.push({
      name,
      registered_by: registeredBy,
      source: registeredAt,
      definition: defLine ? `${REGISTRY_REL}:${defLine}` : null,
      read_only: def ? def._readOnly === true : null,
      params: def ? Object.keys(def.inputSchema.properties) : null,
      required: def ? def.inputSchema.required : null,
    });
  };

  for (const name of triggerNames) add(name, `${triggersRel}:${triggersLine}`, 'registerTriggerTools');
  for (const def of registry) {
    if (!def._readOnly && !manualExclusions.has(def.name)) add(def.name, `${manualRel}:${manualLine}`, 'registerManualTools');
  }
  for (const def of registry) {
    if (def._readOnly && readOnlyMapped.has(def.name)) add(def.name, `${readOnlyRel}:${readOnlyLine}`, 'registerReadOnlyTools');
  }
  add('capture_screenshot', `${screenshotsRel}:${screenshotsLine}`, 'registerScreenshotTools');

  for (const file of LITERAL_FILES) {
    const rel = `${TOOLS_DIR_REL}/${file}`;
    const text = readRepo(rel);
    for (const match of text.matchAll(/^( *)server\.tool\(\s*\n\s*'([^']+)'/gm)) {
      add(match[2], `${rel}:${lineOf(text, match.index)}`, file.replace(/\.ts$/, ''), false);
    }
  }

  const seen = new Set();
  for (const tool of tools) {
    if (seen.has(tool.name)) throw new Error(`duplicate tool registration: ${tool.name}`);
    seen.add(tool.name);
  }
  const unregistered = registry.filter((t) => !seen.has(t.name)).map((t) => t.name);

  let commit = null;
  try {
    commit = execFileSync('git', ['-C', REPO_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    // Not a git checkout; the list is still valid for the files on disk.
  }

  return {
    version: 1,
    source_commit: commit,
    count: tools.length,
    tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
    registry_entries_not_registered: unregistered,
  };
}

function stable(doc) {
  const { source_commit: _c, ...rest } = doc;
  return JSON.stringify(rest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const doc = extractToolNames();
  if (process.argv.includes('--check')) {
    const current = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
    if (stable(current) !== stable(doc)) {
      console.error(`${OUT_PATH} is out of date; rerun without --check`);
      process.exit(1);
    }
    console.log(`ok: ${doc.count} tools`);
  } else {
    writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`wrote ${OUT_PATH} (${doc.count} tools)`);
  }
}
