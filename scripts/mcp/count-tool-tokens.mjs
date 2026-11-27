#!/usr/bin/env node
/**
 * Phase 71 tool-list token counter (D-26; supports MCP-01; V4 M-71-09).
 *
 * Counts the tokens the MCP tool list costs a Claude model, for the 8a058bdf
 * pin (tests/fixtures/mcp-tools-list-8a058bdf.json) and for the current
 * mcp/build tools/list (listed in-process after the build-freshness check).
 * Each tool is sent in Anthropic tool format, {name, description,
 * input_schema}, built through canonicalJson so SDK keys set to undefined are
 * dropped (Pitfall 16).
 *
 *   ANTHROPIC_API_KEY=... node scripts/mcp/count-tool-tokens.mjs --model <id> [--model <id> ...]
 *       [--json] [--strip-schema-keyword]
 *
 * For each model and each list it calls POST /v1/messages/count_tokens twice,
 * once with the tools and once with the same request and no tools, and
 * reports tool tokens = with - without. The result is an estimate, printed
 * with two caveats: newer tokenizers count more, and Claude Code's default
 * tool search loads only tool names at session start.
 *
 * --strip-schema-keyword drops the top-level `$schema` keyword from every
 * input_schema, in case the API rejects it.
 *
 * The API key is read only from the environment (deps.env) and is never
 * printed: errors print a status code or a fixed message, never a response
 * body, a request or an error text. It is NOT part of npm test; the test
 * injects fetch, so no test reaches the network.
 *
 * Exit codes: 0 counted; 1 request or response failure; 2 usage or setup.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  REPO_ROOT,
  canonicalJson,
  listToolsFromRuntimeModule,
  readBaselineFixture,
  sortByName,
} from './lib/tools-list.mjs';

export const COUNT_TOKENS_URL = 'https://api.anthropic.com/v1/messages/count_tokens';
export const ANTHROPIC_VERSION = '2023-06-01';
export const USER_MESSAGE = 'List the available tools.';
export const ESTIMATE_LABEL = 'estimate';
export const CAVEATS = Object.freeze([
  'newer tokenizers count about 30% more tokens for the same text',
  "Claude Code's default tool search loads only tool names at session start, so whole-schema counts overstate session-start context",
]);
export const EXIT = Object.freeze({ OK: 0, FAILED: 1, USAGE: 2 });
// Each count_tokens call, response body included, is bounded (IN-04): a
// stalled connection must not hang the V4 M-71-09 step. deps.timeoutMs
// overrides it (tests only).
export const REQUEST_TIMEOUT_MS = 30000;

const API_KEY_VARIABLE = 'ANTHROPIC_API_KEY';
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,99}$/;
const MCP_SRC = path.join(REPO_ROOT, 'mcp', 'src');
const MCP_BUILD = path.join(REPO_ROOT, 'mcp', 'build');
const REBUILD_HINT = 'run npm --prefix mcp run build';

const USAGE = `Usage: ${API_KEY_VARIABLE}=... node scripts/mcp/count-tool-tokens.mjs --model <id> [--model <id> ...] [--json] [--strip-schema-keyword]

Counts the tool-list tokens of the 8a058bdf pin and of the current mcp/build per model
with the Anthropic count_tokens endpoint (an estimate).

  --model <id>              a Claude model id (repeatable; at least one)
  --json                    print the result as JSON
  --strip-schema-keyword    drop the top-level $schema keyword from every input_schema
  --help                    show this help

The key is read from the ${API_KEY_VARIABLE} environment variable and never printed.
Exit codes: 0 counted; 1 request or response failure; 2 usage or setup.`;

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

// A request or response failure. Its message is fixed text or a status code.
class CountError extends Error {}

export function parseArgs(argv) {
  const options = { help: false, models: [], json: false, stripSchemaKeyword: false };
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--help' || flag === '-h') options.help = true;
    else if (flag === '--json') options.json = true;
    else if (flag === '--strip-schema-keyword') options.stripSchemaKeyword = true;
    else if (flag === '--model') {
      if (args.length === 0) throw new UsageError('--model needs a model id');
      const model = args.shift();
      if (!MODEL_PATTERN.test(model)) throw new UsageError('--model must be a model id such as claude-sonnet-4-5');
      if (options.models.includes(model)) throw new UsageError('a model is given twice');
      options.models.push(model);
    } else {
      throw new UsageError('unknown argument');
    }
  }
  return options;
}

function listSourceFiles(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Throws when runtime.js is missing from mcpBuild, or when any mcpSrc
 * .ts file is newer than its compiled .js (the tests/helpers/mcp-in-process.mjs
 * guard): a stale build would count old tools.
 */
export function assertBuildFresh({ mcpSrc = MCP_SRC, mcpBuild = MCP_BUILD } = {}) {
  if (!fs.existsSync(path.join(mcpBuild, 'runtime.js'))) {
    throw new Error(`mcp/build/runtime.js is missing -- ${REBUILD_HINT}`);
  }
  const stale = [];
  for (const sourcePath of listSourceFiles(mcpSrc)) {
    const relative = path.relative(mcpSrc, sourcePath);
    const buildPath = path.join(mcpBuild, relative.replace(/\.ts$/, '.js'));
    if (!fs.existsSync(buildPath)) continue;
    if (fs.statSync(sourcePath).mtimeMs > fs.statSync(buildPath).mtimeMs) {
      const posix = (value) => value.split(path.sep).join('/');
      stale.push(`mcp/build/${posix(relative.replace(/\.ts$/, '.js'))} is older than mcp/src/${posix(relative)}`);
    }
  }
  if (stale.length > 0) throw new Error(`${stale.join('; ')} -- ${REBUILD_HINT}`);
}

export function defaultDeps() {
  return {
    env: process.env,
    fetch: globalThis.fetch,
    readBaseline: async () => readBaselineFixture().tools,
    readCurrent: async () => {
      assertBuildFresh();
      return listToolsFromRuntimeModule(path.join(MCP_BUILD, 'runtime.js'));
    },
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

/** A tools/list entry in Anthropic tool format, through canonicalJson. */
export function toAnthropicTool(tool, { stripSchemaKeyword = false } = {}) {
  const converted = JSON.parse(canonicalJson({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
  if (stripSchemaKeyword && converted.input_schema && typeof converted.input_schema === 'object') {
    delete converted.input_schema.$schema;
  }
  return converted;
}

async function countTokens(deps, apiKey, model, tools) {
  const body = { model };
  if (tools) body.tools = tools;
  body.messages = [{ role: 'user', content: USER_MESSAGE }];
  const timeoutMs = Number.isSafeInteger(deps.timeoutMs) && deps.timeoutMs > 0 ? deps.timeoutMs : REQUEST_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await deps.fetch(COUNT_TOKENS_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new CountError(signal.aborted ? 'count_tokens request timed out' : 'count_tokens request failed (network error)');
  }
  if (!response || !response.ok) {
    const status = response && Number.isSafeInteger(response.status) ? response.status : 'unknown';
    throw new CountError(`count_tokens request failed with HTTP ${status}`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new CountError(signal.aborted ? 'count_tokens request timed out' : 'count_tokens response was not JSON');
  }
  const tokens = data && data.input_tokens;
  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    throw new CountError('count_tokens response had no valid input_tokens');
  }
  return tokens;
}

async function measureList(deps, apiKey, model, tools) {
  const withTools = await countTokens(deps, apiKey, model, tools);
  const withoutTools = await countTokens(deps, apiKey, model, null);
  return { tools: tools.length, withTools, withoutTools, toolTokens: withTools - withoutTools };
}

const round = (value, places) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function renderText(report) {
  const lines = [`count-tool-tokens: tool-list tokens per model (${report.label}; count_tokens, with tools minus without)`];
  for (const entry of report.models) {
    lines.push(`model ${entry.model} (${report.label}):`);
    lines.push(`  baseline 8a058bdf: ${entry.baseline.tools} tools, ${entry.baseline.toolTokens} tool tokens`
      + ` (${entry.baseline.withTools} with tools - ${entry.baseline.withoutTools} without)`);
    lines.push(`  current mcp/build: ${entry.current.tools} tools, ${entry.current.toolTokens} tool tokens`
      + ` (${entry.current.withTools} with tools - ${entry.current.withoutTools} without)`);
    lines.push(entry.ratio === null
      ? '  ratio n/a (baseline tool tokens not positive)'
      : `  ratio ${entry.ratio} (current / baseline); reduction ${entry.reductionPercent}%`);
  }
  lines.push(`caveats (${report.label}):`);
  for (const caveat of report.caveats) lines.push(`  - ${caveat}`);
  return `${lines.join('\n')}\n`;
}

/**
 * CLI entry. Returns the exit code; never calls process.exit.
 * overrides replace any dependency (tests inject env, fetch, the two tool
 * lists and the output streams).
 */
export async function main(argv = process.argv.slice(2), overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  const err = (text) => deps.stderr(`count-tool-tokens: ${text}\n`);

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(`usage error: ${error.message}\n${USAGE}`);
    return EXIT.USAGE;
  }
  if (options.help) {
    deps.stdout(`${USAGE}\n`);
    return EXIT.OK;
  }
  if (options.models.length === 0) {
    err(`usage error: pass at least one --model <id>\n${USAGE}`);
    return EXIT.USAGE;
  }
  const apiKey = deps.env ? deps.env[API_KEY_VARIABLE] : undefined;
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    err(`${API_KEY_VARIABLE} is not set; export it in the environment (it is never printed)`);
    return EXIT.USAGE;
  }
  if (typeof deps.fetch !== 'function') {
    err('no fetch implementation is available (Node 18 or newer is required)');
    return EXIT.USAGE;
  }

  let baseline;
  let current;
  try {
    baseline = sortByName(await deps.readBaseline());
    current = sortByName(await deps.readCurrent());
  } catch (error) {
    err(`cannot load the tool lists: ${error && error.message ? error.message : 'unknown error'}`);
    return EXIT.USAGE;
  }
  const convert = (tool) => toAnthropicTool(tool, { stripSchemaKeyword: options.stripSchemaKeyword });
  const baselineTools = baseline.map(convert);
  const currentTools = current.map(convert);

  const models = [];
  try {
    for (const model of options.models) {
      const baselineCounts = await measureList(deps, apiKey, model, baselineTools);
      const currentCounts = await measureList(deps, apiKey, model, currentTools);
      const ratio = baselineCounts.toolTokens > 0 ? currentCounts.toolTokens / baselineCounts.toolTokens : null;
      models.push({
        model,
        baseline: baselineCounts,
        current: currentCounts,
        ratio: ratio === null ? null : round(ratio, 4),
        reductionPercent: ratio === null ? null : round((1 - ratio) * 100, 2),
      });
    }
  } catch (error) {
    err(error instanceof CountError ? error.message : 'count_tokens failed');
    return EXIT.FAILED;
  }

  const report = { label: ESTIMATE_LABEL, models, caveats: [...CAVEATS] };
  deps.stdout(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderText(report));
  return EXIT.OK;
}

const invokedPath = (() => {
  try {
    return process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
  } catch {
    return null;
  }
})();
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, () => {
    process.stderr.write('count-tool-tokens: unexpected failure\n');
    process.exitCode = EXIT.FAILED;
  });
}
