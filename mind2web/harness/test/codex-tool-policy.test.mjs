import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CODEX_TOOL_ISOLATION, CODEX_MODEL_CATALOG, codexArguments, codexToolViolation, tomlValue } from '../driver-codex.mjs';
import { ALLOWED_TOOLS, actorPrompt } from '../browser-manual-profile.mjs';
import { sourceFingerprint } from '../manual-runner.mjs';
import { FAMILY, FAMILY_CONFIG_PATH, CLAUDE_CLI } from '../model-family.mjs';
import { BENCH_ROOT } from '../proc.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const configuration = args => args.flatMap((value, index) => value === '-c' ? [args[index + 1]] : []);
const nested = (value, key) => key.split('.').reduce((object, part) => object[part], value);

function parseToml(values) {
  const localPython = path.join(BENCH_ROOT, 'judge/.venv/bin/python');
  const result = spawnSync(existsSync(localPython) ? localPython : 'python3', ['-c',
    'import json,sys,tomllib; print(json.dumps([tomllib.loads(value) for value in json.load(sys.stdin)]))'],
  { input: JSON.stringify(values), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('production actor overrides are valid TOML and preserve the isolated direct FSB interface', () => {
  const args = codexArguments({ model: 'gpt-6.1-sol', effort: 'medium', socketPath: '/fixture/quoted "socket".sock',
    promptPath: '/fixture/instructions.md', answerPath: '/fixture/answer.txt', allowed: ALLOWED_TOOLS, toolTimeoutSeconds: 300 });
  const overrides = configuration(args), parsed = parseToml(overrides);
  const value = key => {
    const index = overrides.findIndex(item => item.startsWith(key + '='));
    assert.notEqual(index, -1, key);
    return nested(parsed[index], key);
  };
  for (const [key, expected] of Object.entries(CODEX_TOOL_ISOLATION)) assert.deepEqual(value(key), expected, key);
  assert.equal(args[args.indexOf('-m') + 1], 'gpt-6.1-sol');
  assert.equal(value('model_reasoning_effort'), 'medium');
  assert.equal(value('model_catalog_json'), CODEX_MODEL_CATALOG);
  assert.deepEqual(value('mcp_servers'), {});
  assert.deepEqual(value('mcp_servers.fsb.enabled_tools'), ALLOWED_TOOLS);
  assert.equal(value('mcp_servers.fsb.args')[1], '/fixture/quoted "socket".sock');
  assert.equal(value('mcp_servers.fsb.tool_timeout_sec'), 300);
  assert.ok(args.includes('--ignore-user-config'));
  assert.ok(args.includes('--ignore-rules'));
  assert.equal(args[args.indexOf('-s') + 1], 'read-only');
});

test('nested Codex feature tables serialize as TOML rather than JSON objects', () => {
  const values = [{ enabled: true, excluded_tool_namespaces: ['functions', 'clock'], direct_only_tool_namespaces: ['mcp__fsb'] },
    { 'quoted.key': ['line\nbreak', 'quote"slash\\', '日本語'], empty: {} }];
  assert.deepEqual(parseToml(values.map(value => 'fixture=' + tomlValue(value))).map(value => value.fixture), values);
  assert.throws(() => tomlValue(null), TypeError);
});

test('the isolation contract disables other execution and integration paths without disabling direct images', () => {
  for (const key of ['shell_tool', 'unified_exec', 'unified_exec_tty', 'apply_patch_freeform', 'view_image',
    'apps', 'plugins', 'remote_plugin', 'tool_suggest', 'skill_search', 'skill_mcp_dependency_install',
    'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'computer_use', 'in_app_browser',
    'in_app_local_automation', 'code_mode_host', 'multi_agent', 'multi_agent_v2', 'goals', 'sleep_tool',
    'image_generation', 'artifact', 'memories', 'external_agent_memory_import', 'hooks', 'auth_elicitation']) {
    assert.equal(CODEX_TOOL_ISOLATION['features.' + key], false, key);
  }
  assert.equal(CODEX_TOOL_ISOLATION.web_search, 'disabled');
  assert.equal(CODEX_TOOL_ISOLATION['apps._default.enabled'], false);
  assert.equal(CODEX_TOOL_ISOLATION['features.skip_host_skill_discovery'], true);
  assert.deepEqual(CODEX_TOOL_ISOLATION['features.code_mode'], { enabled: true,
    excluded_tool_namespaces: ['functions', 'clock'], direct_only_tool_namespaces: ['mcp__fsb'] });
});

test('runtime event guard rejects retained Codex resource helpers and every non-FSB tool event', () => {
  assert.equal(ALLOWED_TOOLS.length, 46);
  for (const tool of ALLOWED_TOOLS) assert.equal(codexToolViolation({ item: { type: 'mcp_tool_call', server: 'fsb', tool } }, ALLOWED_TOOLS), null);
  for (const tool of ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']) {
    assert.match(codexToolViolation({ item: { type: 'mcp_tool_call', server: 'codex', tool } }, ALLOWED_TOOLS), /Disallowed MCP tool/);
    assert.match(codexToolViolation({ item: { type: 'mcp_tool_call', server: 'fsb', tool } }, ALLOWED_TOOLS), /Disallowed MCP tool/);
  }
  for (const type of ['command_execution', 'web_search', 'file_change', 'image_generation', 'browser_use', 'future_tool']) {
    assert.match(codexToolViolation({ item: { type } }, ALLOWED_TOOLS), /Disallowed tool event/);
  }
  assert.equal(codexToolViolation({ item: { type: 'agent_message' } }, ALLOWED_TOOLS), null);
});

test('local model catalog changes only the two declared non-browser tool creation fields', async () => {
  const bytes = await readFile(CODEX_MODEL_CATALOG), catalog = JSON.parse(bytes);
  const receipt = JSON.parse(await readFile(path.join(BENCH_ROOT, 'config/codex-gpt61sol-browser-policy.receipt.json')));
  assert.equal(digest(bytes), receipt.policy_catalog_sha256);
  assert.equal(receipt.bundled_catalog_sha256, '262dc36e0e7beb290aef8196bd59f42acf51647b8f7b68dafa533ae7742019e6');
  assert.equal(receipt.original_selected_model_sha256, 'c431dcf452fd42fe88ca2d4b6adfa151d00cc76e25859a4638c7c309cec7ae23');
  assert.equal(catalog.models.length, 1);
  const current = catalog.models[0], original = structuredClone(current);
  assert.equal(current.slug, 'gpt-6.1-sol');
  assert.deepEqual(Object.keys(receipt.changed_fields).sort(), ['apply_patch_tool_type', 'experimental_supported_tools']);
  for (const [key, change] of Object.entries(receipt.changed_fields)) {
    assert.deepEqual(current[key], change.to);
    original[key] = change.from;
  }
  assert.equal(current.apply_patch_tool_type, null);
  assert.deepEqual(current.experimental_supported_tools, []);
  assert.deepEqual(original.experimental_supported_tools, ['send_user_message_async', 'clock']);
  const canonical = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  // The receipt uses sorted, ASCII JSON, matching the archived official entry.
  const ascii = JSON.stringify(canonical(original)).replace(/[^\x00-\x7f]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  assert.equal(digest(ascii), receipt.original_selected_model_sha256);
});

test('collector fingerprints bind the model family, the pinned actor CLI bytes and its prompt variant',
  { skip: !existsSync(CLAUDE_CLI) && 'Pinned Claude CLI is not installed locally' }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-policy-fingerprint-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['runtime/build', 'runtime/ai', 'runtime/node_modules', 'extension']) await mkdir(path.join(root, directory), { recursive: true });
  for (const [file, text] of [['runtime/build/index.js', 'fixture'], ['runtime/package.json', '{}'],
    ['runtime/ai/tool-definitions.cjs', 'fixture'], ['extension/manifest.json', '{}']]) await writeFile(path.join(root, file), text);
  const fingerprints = await sourceFingerprint({ serverCommand: [process.execPath, path.join(root, 'runtime/build/index.js')], extensionDir: path.join(root, 'extension') });
  assert.equal(fingerprints.model_family, digest(await readFile(FAMILY_CONFIG_PATH)));
  assert.equal(fingerprints.actor_cli, digest(await readFile(CLAUDE_CLI)));
  const prompt = await readFile(path.join(BENCH_ROOT, 'config/browser-manual-v2-prompt.md'), 'utf8');
  assert.equal(fingerprints.prompt, digest(actorPrompt(prompt, false, FAMILY)));
  assert.notEqual(fingerprints.prompt, digest(actorPrompt(prompt, false, 'codex')));
  // The Codex actor policy no longer drives collection, so it is not a collector source.
  for (const key of ['codex_tool_isolation', 'codex_model_catalog', 'codex_model_catalog_receipt']) assert.equal(Object.hasOwn(fingerprints, key), false, key);
});
