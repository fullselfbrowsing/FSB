#!/usr/bin/env node
/**
 * Phase 69 tools/list baseline generator (D-04).
 *
 * Rebuilds the Phase 66 pin 8a058bdf in a temporary directory and lists its
 * MCP tools in-process, then either writes the frozen fixture
 * (tests/fixtures/mcp-tools-list-8a058bdf.json) or re-derives it and compares
 * byte for byte.
 *
 *   node scripts/mcp/tools-list-baseline.mjs --write   regenerate the fixture
 *   node scripts/mcp/tools-list-baseline.mjs --check   re-derive and compare
 *
 * Steps: `git archive <pin> mcp` into a mkdtemp directory, symlink the
 * checkout's mcp/node_modules into it, compile with that copy's tsc (no
 * `npm run build`: its clean and cp steps are not needed because
 * mcp/ai/tool-definitions.cjs is tracked and arrives with the archive), then
 * createRuntime() + SDK Client over InMemoryTransport.
 *
 * This script needs git history, so it is NOT part of `npm test`; CI clones
 * are shallow and lack the pin. The chained tests read the committed fixture.
 *
 * Exit codes: 0 match / written; 1 drift; 2 usage or setup error.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  FIXTURE_RELATIVE_PATH,
  PIN_COMMIT,
  REPO_ROOT,
  canonicalBytes,
  canonicalJson,
  descChars,
  listToolsFromRuntimeModule,
  paramChars,
  readInstalledVersions,
  sha256Hex,
  sortByName,
  toolsListDigest,
} from './lib/tools-list.mjs';

export const GENERATOR_COMMAND = 'node scripts/mcp/tools-list-baseline.mjs --write';
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

const USAGE = `Usage: node scripts/mcp/tools-list-baseline.mjs (--write | --check)

Rebuilds ${PIN_COMMIT.slice(0, 8)} in a temp directory and lists its MCP tools in-process.

  --write   write ${FIXTURE_RELATIVE_PATH}
  --check   re-derive the list and compare it with the committed fixture
  --help    show this help

Exit codes: 0 match or written; 1 drift; 2 usage or setup error.`;

export function parseArgs(argv) {
  const out = { write: false, check: false, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--write') out.write = true;
    else if (arg === '--check') out.check = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!out.help && out.write === out.check) throw new Error('pass exactly one of --write or --check');
  return out;
}

// A missing pin, a failed archive/extract or a failed tsc: exit 2, not drift.
class SetupError extends Error {}

function gitEnv() {
  return { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
}

function assertPinAvailable() {
  const result = spawnSync('git', ['cat-file', '-e', `${PIN_COMMIT}^{commit}`], {
    cwd: REPO_ROOT,
    env: gitEnv(),
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new SetupError(`${PIN_COMMIT.slice(0, 8)} not in this clone (CI clones are shallow); run locally`);
  }
}

function runChecked(command, args, options, label) {
  const result = spawnSync(command, args, { shell: false, ...options });
  if (result.error || result.signal || result.status !== 0) {
    const stderr = result.stderr ? Buffer.from(result.stderr).toString('utf8').trim() : '';
    const reason = result.error ? result.error.message : (result.signal || `exit ${result.status}`);
    throw new SetupError(`${label} failed (${reason})${stderr ? `:\n${stderr}` : ''}`);
  }
  return result;
}

// Builds the pin in a temp directory and returns its tools/list, sorted by
// name and in canonical form (sorted keys, undefined values dropped).
export async function buildPinTools() {
  assertPinAvailable();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-p69-pin-'));
  try {
    const archive = runChecked('git', ['archive', '--format=tar', PIN_COMMIT, 'mcp'], {
      cwd: REPO_ROOT,
      env: gitEnv(),
      maxBuffer: MAX_ARCHIVE_BYTES,
    }, 'git archive').stdout;
    runChecked('tar', ['-x', '-C', tmp], { input: archive }, 'tar -x');

    const pinMcp = path.join(tmp, 'mcp');
    fs.symlinkSync(path.join(REPO_ROOT, 'mcp', 'node_modules'), path.join(pinMcp, 'node_modules'), 'dir');
    runChecked(process.execPath, [path.join(pinMcp, 'node_modules', '.bin', 'tsc'), '-p', '.'], {
      cwd: pinMcp,
      maxBuffer: 64 * 1024 * 1024,
    }, 'tsc -p . (pin build)');

    const tools = sortByName(await listToolsFromRuntimeModule(path.join(pinMcp, 'build', 'runtime.js')));
    return JSON.parse(canonicalJson(tools));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function buildMeta(tools) {
  const { sdkVersion, zodVersion } = readInstalledVersions();
  return {
    sourceCommit: PIN_COMMIT,
    sdkVersion,
    zodVersion,
    command: GENERATOR_COMMAND,
    count: tools.length,
    sha256: sha256Hex(canonicalJson(tools)),
    toolsListDigest: toolsListDigest(tools).sha256,
  };
}

export function serializeFixture(meta, tools) {
  return `${JSON.stringify({ meta, tools }, null, 2)}\n`;
}

function figures(tools) {
  return {
    count: tools.length,
    descChars: descChars(tools),
    paramChars: paramChars(tools),
    bytes: canonicalBytes({ tools }),
  };
}

function printFigures(label, tools) {
  const f = figures(tools);
  process.stdout.write(`${label}: ${f.count} tools; description chars ${f.descChars}; `
    + `parameter-description chars ${f.paramChars}; canonical bytes of {tools} ${f.bytes}\n`);
}

function firstDifferingTool(expectedTools, actualTools) {
  const expected = new Map(expectedTools.map((tool) => [tool.name, canonicalJson(tool)]));
  const actual = new Map(actualTools.map((tool) => [tool.name, canonicalJson(tool)]));
  const names = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  for (const name of names) {
    if (expected.get(name) !== actual.get(name)) {
      if (!expected.has(name)) return `${name} (only in the rebuilt pin)`;
      if (!actual.has(name)) return `${name} (only in the fixture)`;
      return name;
    }
  }
  return null;
}

export async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`tools-list-baseline: ${error.message}\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let tools;
  try {
    tools = await buildPinTools();
  } catch (error) {
    if (!(error instanceof SetupError)) throw error;
    process.stderr.write(`tools-list-baseline: ${error.message}\n`);
    return 2;
  }
  const meta = buildMeta(tools);
  const fixturePath = path.join(REPO_ROOT, FIXTURE_RELATIVE_PATH);

  if (options.write) {
    fs.writeFileSync(fixturePath, serializeFixture(meta, tools));
    printFigures(`wrote ${FIXTURE_RELATIVE_PATH}`, tools);
    process.stdout.write(`sha256 ${meta.sha256}; toolsListDigest ${meta.toolsListDigest}\n`);
    return 0;
  }

  let fixture;
  try {
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    process.stderr.write(`tools-list-baseline: cannot read ${FIXTURE_RELATIVE_PATH}: ${error.message}\n`);
    return 2;
  }
  printFigures('rebuilt pin', tools);
  printFigures('fixture    ', Array.isArray(fixture.tools) ? fixture.tools : []);

  const fixtureTools = Array.isArray(fixture.tools) ? fixture.tools : [];
  const toolsMatch = canonicalJson(fixtureTools) === canonicalJson(tools);
  const shaMatch = Boolean(fixture.meta) && fixture.meta.sha256 === meta.sha256;
  const metaMatch = canonicalJson(fixture.meta) === canonicalJson(meta);
  if (toolsMatch && shaMatch && metaMatch) {
    process.stdout.write(`check: fixture matches the rebuilt ${PIN_COMMIT.slice(0, 8)} byte for byte (sha256 ${meta.sha256})\n`);
    return 0;
  }
  if (!toolsMatch) {
    process.stdout.write(`check: DRIFT in tools; first differing tool: ${firstDifferingTool(fixtureTools, tools) || '(order or array shape)'}\n`);
  }
  if (!shaMatch) process.stdout.write(`check: DRIFT in meta.sha256 (fixture ${fixture.meta && fixture.meta.sha256}, rebuilt ${meta.sha256})\n`);
  if (!metaMatch) {
    process.stdout.write(`check: DRIFT in meta (fixture ${canonicalJson(fixture.meta)}, rebuilt ${canonicalJson(meta)})\n`);
  }
  process.stdout.write(`check: regenerate with ${GENERATOR_COMMAND} only if the pin build itself is meant to change\n`);
  return 1;
}

const invokedPath = process.argv[1] ? (() => {
  try { return pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return null; }
})() : null;
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    process.stderr.write(`tools-list-baseline: ${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 2;
  });
}
