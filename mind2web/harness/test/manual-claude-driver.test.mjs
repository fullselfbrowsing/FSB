import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runManualClaudeTask, invalidToolRequests, claudeToolViolation, normalizeClaudeUsage, quotaHeadroom, TOOL_PREFIX, MAX_MCP_OUTPUT_TOKENS } from '../driver-claude-manual.mjs';
import { providerFailure } from '../manual-runner.mjs';
import { ALLOWED_TOOLS, PUBLIC_ALLOWED_TOOLS, actorPrompt } from '../browser-manual-profile.mjs';
import { MODEL, EFFORT, CLAUDE_CLI, QUOTA_HEADROOM } from '../model-family.mjs';
import { BENCH_ROOT, HARNESS_DIR } from '../proc.mjs';

const task = { task_id: 'fixture', website: 'https://fixture.test/', confirmed_task: 'Change the visible counter to one' };
const ANSWER = 'The observed fixture counter is one.';
const LIMIT_TEXT = "You've hit your limit · resets 4am (America/Chicago)";
const USAGE = { input_tokens: 120, cache_read_input_tokens: 4000, cache_creation_input_tokens: 600, output_tokens: 80 };
const NORMALIZED = { input_tokens: 4720, cached_input_tokens: 4000, cache_creation_input_tokens: 600, uncached_input_tokens: 120, output_tokens: 80, thinking_tokens: null };
// The only operator variables the CLI may inherit, plus the fixed isolation controls the driver sets.
const PASS_THROUGH = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING'];
const CONTROLS = ['CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'ENABLE_TOOL_SEARCH', 'DISABLE_AUTOUPDATER', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'MCP_TIMEOUT', 'MCP_TOOL_TIMEOUT', 'MAX_MCP_OUTPUT_TOKENS'];
// Present in the operator's environment when the benchmark is launched from a Claude Code session.
const LEAKS = { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'operator-session', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CODE_OAUTH_TOKEN: 'oauth-must-not-leak',
  ANTHROPIC_API_KEY: 'sk-ant-must-not-leak', ANTHROPIC_BASE_URL: 'https://leak.invalid', HF_TOKEN: 'hf-must-not-leak' };
const prefixed = names => names.map(name => TOOL_PREFIX + name);
const epoch = () => Math.floor(Date.now() / 1000);
const flag = (args, name) => {
  const index = args.indexOf(name);
  assert.ok(index >= 0 && index + 1 < args.length, `Missing CLI argument ${name}`);
  return args[index + 1];
};
const payload = result => JSON.parse(result.content.find(block => block.type === 'text').text);

const pngModule = fileURLToPath(new URL('../png.mjs', import.meta.url));
const toolsFile = fileURLToPath(new URL('../../../extension/ai/tool-definitions.js', import.meta.url));
const { TOOL_REGISTRY } = createRequire(import.meta.url)(toolsFile);
const publicCatalog = { tools: TOOL_REGISTRY.filter(tool => !['wait_for_element', 'wait_for_stable'].includes(tool.name)) };
// A stdio browser upstream double: owned tabs, real PNG captures and a click counter.
const browserSource = `
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { encodeSolidPng } from ${JSON.stringify(pngModule)};
const { TOOL_REGISTRY } = createRequire(import.meta.url)(${JSON.stringify(toolsFile)});
const tabs = new Map(); let next = 100, active = null, captures = 0;
const log = row => appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(row) + '\\n');
const reply = value => ({ content:[{type:'text',text:JSON.stringify(value)}] });
const error = value => ({ ...reply({success:false,...value}), isError:true });
log({type:'started',pid:process.pid}); process.on('exit', () => log({type:'exited',pid:process.pid}));
process.on('SIGTERM', () => process.exit(0));
async function handle(method, params) {
  if (method === 'initialize') return { protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'browser-double',version:'1'} };
  if (method === 'tools/list') return {tools:process.env.FIXTURE_PUBLIC_MODE ? TOOL_REGISTRY.filter(t=>!['wait_for_element','wait_for_stable'].includes(t.name)) : TOOL_REGISTRY};
  if (method !== 'tools/call') return {};
  const {name,arguments:args={}} = params; const id = args.tab_id ?? args.tabId;
  log({type:'tool',name,args});
  if (name === 'list_tabs') return reply({success:true,tabs:[...tabs.values()].map(t=>({id:t.id,title:'Fixture',domain:'fixture.test',windowId:1}))});
  if (name === 'open_tab') { const tab={id:++next,url:args.url,state:0}; tabs.set(tab.id,tab); active=tab.id; return reply({success:true,tabId:tab.id,url:tab.url}); }
  if (name === 'close_tab') { tabs.delete(id); return reply({success:true,closed:true,tabId:id}); }
  if (name === 'switch_tab') { if (!tabs.has(id)) return error({code:'TAB_NOT_OWNED',error:'Wrong task tab'}); active=id; return reply({success:true,tabId:id}); }
  const tab=tabs.get(id); if (!tab) return error({code:'TAB_NOT_OWNED',error:'No such task tab'});
  if (name === 'capture_screenshot') {
    captures++;
    if (active !== id) return error({error:'Wrong foreground tab'});
    const height=process.env.FIXTURE_PUBLIC_MODE ? 120 : 80;
    const bytes=encodeSolidPng(100,height,[tab.state,20,30]);
    return {content:[{type:'text',text:JSON.stringify({capture_id:'capture-'+captures,source_url:tab.url,timestamp:new Date().toISOString(),mode:'viewport',
      css_rect:{x:0,y:0,width:100,height},output_width:100,output_height:height,byte_length:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex'),effective_emulation:{device_mode:'current',device_scale_factor:1}})},
      {type:'image',mimeType:'image/png',data:bytes.toString('base64')}]};
  }
  if (name === 'get_text' && process.env.FIXTURE_PUBLIC_MODE && new URL(tab.url).hostname === '127.0.0.1') {
    const text=await (await fetch(tab.url)).text();
    return reply({success:true,text:text.match(/<main[^>]*>([^<]+)<\\/main>/)[1]});
  }
  if (name === 'execute_js') return reply({success:true,result:JSON.stringify({url:tab.url,x:0,y:0,width:100,height:80,dpr:1})});
  if (name === 'read_page' || name === 'get_page_snapshot') return reply({success:true,content:'Counter='+tab.state});
  if (name === 'click') { tab.state++; return reply({success:true,state:tab.state}); }
  return reply({success:true});
}
const input=createInterface({input:process.stdin});
input.on('line',line=>{ let msg;try{msg=JSON.parse(line);}catch{return;}
  if (msg.id === undefined) return;
  handle(msg.method,msg.params).then(result=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result})+'\\n'),
    error=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32603,message:error.message}})+'\\n'));
});
`;

async function fixture(t, env = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'claude-driver-test-'));
  const server = path.join(dir, 'browser.mjs'), log = path.join(dir, 'browser-log.jsonl'), rawDir = path.join(dir, 'raw');
  await writeFile(server, browserSource);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { task, rawDir, serverCommand: [process.execPath, server], env: { ...process.env, FIXTURE_LOG: log, ...env } };
  const lines = async file => (await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; }))
    .split('\n').filter(Boolean).map(line => JSON.parse(line));
  return {
    dir, rawDir,
    async run(extra) {
      const final = await runManualClaudeTask({ ...options, ...extra });
      if (extra?.run?.fixtureError) throw extra.run.fixtureError;
      return final;
    },
    events: () => lines(log),
    browserTools: async () => (await lines(log)).filter(row => row.type === 'tool'),
    raw: name => readFile(path.join(rawDir, name), 'utf8'),
    jsonl: name => lines(path.join(rawDir, name)),
  };
}

// Speaks MCP to the task gateway the way Claude Code would: through the stdio
// shim named in the generated --mcp-config, or straight to its socket.
async function connectActor(config, { viaShim = false } = {}) {
  const server = config.mcpServers.fsb;
  let input, output, close, exited;
  if (viaShim) {
    const child = spawn(server.command, server.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
    exited = once(child, 'exit').then(() => new Error('The MCP stdio shim exited: ' + stderr));
    input = child.stdin; output = child.stdout;
    close = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; } };
  } else {
    const socket = createConnection(server.args[1]);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    input = output = socket; close = async () => socket.destroy();
  }
  const lines = createInterface({ input: output }), pending = new Map(); let id = 0;
  exited?.then(error => { for (const entry of pending.values()) entry.reject(error); pending.clear(); });
  lines.on('line', line => {
    let value; try { value = JSON.parse(line); } catch { return; }
    const entry = pending.get(value.id); if (!entry) return;
    pending.delete(value.id); value.error ? entry.reject(new Error(value.error.message)) : entry.resolve(value.result);
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id; pending.set(key, { resolve, reject });
    input.write(JSON.stringify({ jsonrpc: '2.0', id: key, method, params }) + '\n');
  });
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fake-claude-code', version: '1' } });
  input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  return { request, call: (name, args = {}) => request('tools/call', { name, arguments: args }), async close() { lines.close(); await close(); } };
}

const initEvent = (tools, extra = {}) => ({ type: 'system', subtype: 'init', cwd: '/fake-claude-work', session_id: 'claude-init-session', model: MODEL, tools,
  mcp_servers: [{ name: 'fsb', status: 'connected' }], permissionMode: 'dontAsk', apiKeySource: 'none', claude_code_version: '2.1.302', ...extra });
function rateLimitEvent(status, { fiveHour = 0.25, sevenDay = 0.4, resetsAt = epoch() + 3600 } = {}) {
  return { type: 'rate_limit_event', rate_limit_info: { status, resetsAt, rateLimitType: 'five_hour',
    unifiedWindows: { five_hour: { utilization: fiveHour, resetsAt }, seven_day: { utilization: sevenDay, resetsAt: resetsAt + 4 * 86400 } } } };
}
const resultEvent = (extra = {}) => ({ type: 'result', subtype: 'success', is_error: false, result: ANSWER, num_turns: 3, duration_ms: 2100,
  duration_api_ms: 1800, session_id: 'claude-result-session', total_cost_usd: 0.0421, usage: USAGE,
  modelUsage: { [MODEL]: { inputTokens: 120, outputTokens: 80, costUSD: 0.0421 } }, permission_denials: [], ...extra });

/**
 * A stand-in for the Claude CLI injected through the driver's `run` option. It
 * reads the generated prompt and MCP config, connects to the real gateway,
 * derives its init tool list from the gateway's tools/list and streams
 * stream-json events while `operate` drives tool turns.
 */
function fakeClaude({ operate, onSpawn, init = tools => initEvent(tools), rateLimit = rateLimitEvent('allowed'), result = resultEvent(),
  code = 0, viaShim = false, connect = Boolean(operate) } = {}) {
  const run = async (command, args, options) => {
    const seen = run.seen = { command, args: [...args], options, env: { ...options.env }, emitted: [],
      promptPath: flag(args, '--system-prompt-file'), mcpConfigPath: flag(args, '--mcp-config') };
    let actor;
    try {
      seen.prompt = await readFile(seen.promptPath, 'utf8');
      seen.config = JSON.parse(await readFile(seen.mcpConfigPath, 'utf8'));
      await onSpawn?.(seen);
      const emit = event => { const line = JSON.stringify(event) + '\n'; seen.emitted.push(line); options.onStdout(line); };
      actor = connect ? await connectActor(seen.config, { viaShim }) : null;
      const tools = actor ? prefixed((await actor.request('tools/list')).tools.map(tool => tool.name)) : flag(args, '--allowedTools').split(',');
      emit(init(tools));
      if (rateLimit) emit(rateLimit);
      let next = 0;
      // One assistant message may hold several tool_use blocks; their results return together in one user message.
      const turn = async (...calls) => {
        const uses = calls.map(([name, input = {}]) => ({ type: 'tool_use', id: `toolu_fake_${++next}`, name: TOOL_PREFIX + name, input }));
        emit({ type: 'assistant', message: { id: `msg_fake_${next}`, type: 'message', role: 'assistant', model: MODEL, content: uses },
          parent_tool_use_id: null, session_id: 'claude-init-session' });
        const values = [];
        for (const [index, use] of uses.entries()) values.push(await actor.call(calls[index][0], use.input));
        emit({ type: 'user', message: { role: 'user', content: uses.map((use, index) => ({ type: 'tool_result', tool_use_id: use.id,
          content: values[index].content, ...(values[index].isError ? { is_error: true } : {}) })) }, parent_tool_use_id: null, session_id: 'claude-init-session' });
        return values;
      };
      const call = async (name, input) => (await turn([name, input]))[0];
      await operate?.({ actor, emit, call, turn, options, seen });
      if (result) emit(result);
      return options.signal.aborted ? { code: 128, signal: 'SIGKILL', timedOut: false } : { code, timedOut: false };
    } catch (error) { run.fixtureError = error; throw error; }
    finally { await actor?.close(); }
  };
  return run;
}

test('the Claude driver bootstraps before spawn, isolates the CLI and records a complete run through the real gateway', async t => {
  const f = await fixture(t, LEAKS), order = [];
  const run = fakeClaude({ viaShim: true,
    onSpawn: async () => {
      order.push('spawn');
      const tools = await f.browserTools(), open = tools.findIndex(row => row.name === 'open_tab');
      assert.ok(open >= 0, 'The start page is opened before the CLI is spawned');
      assert.equal(tools[open].args.url, task.website);
      assert.ok(tools.slice(open + 1).some(row => row.name === 'capture_screenshot'), 'The start page frame is captured before the CLI is spawned');
    },
    operate: async ({ call, turn }) => {
      const observation = await call('read_page');
      assert.ok(observation.content.some(block => block.type === 'image'), 'Observations reach the actor as native image blocks');
      const results = await turn(['click', { selector: 'e1' }], ['read_page']);
      assert.ok(results.every(result => !result.isError));
    } });
  const final = await f.run({ run, beforeSpawn: async () => {
    order.push('admit');
    assert.deepEqual(await f.browserTools(), [], 'Admission precedes every browser call');
    return { allowed: true };
  } });
  const { seen } = run, { args } = seen;
  assert.deepEqual(order, ['admit', 'spawn']);

  assert.equal(seen.command, CLAUDE_CLI);
  assert.equal(args[0], '-p');
  assert.equal(flag(args, '--model'), MODEL); assert.equal(flag(args, '--effort'), EFFORT);
  assert.equal(flag(args, '--tools'), '', 'Every built-in tool is disabled');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(flag(args, '--permission-mode'), 'dontAsk');
  assert.ok(args.includes('--no-session-persistence'));
  assert.equal(flag(args, '--allowedTools'), prefixed(ALLOWED_TOOLS).join(','));
  assert.equal(flag(args, '--disallowedTools'), 'ListMcpResourcesTool,ReadMcpResourceTool');
  assert.equal(flag(args, '--output-format'), 'stream-json'); assert.ok(args.includes('--verbose'));
  assert.equal(flag(args, '--setting-sources'), ''); assert.deepEqual(JSON.parse(flag(args, '--settings')), { disableAllHooks: true });
  assert.equal(flag(args, '--max-turns'), '400');
  for (const name of ['--disable-slash-commands', '--no-chrome']) assert.ok(args.includes(name), name);
  assert.ok(!args.includes('--dangerously-skip-permissions'));

  // The generated MCP config is what actually carried the actor's calls (via the stdio shim) to the gateway.
  assert.deepEqual(Object.keys(seen.config.mcpServers), ['fsb']);
  assert.equal(seen.config.mcpServers.fsb.type, 'stdio'); assert.equal(seen.config.mcpServers.fsb.command, process.execPath);
  assert.equal(seen.config.mcpServers.fsb.args.length, 2);
  assert.equal(seen.config.mcpServers.fsb.args[0], path.join(HARNESS_DIR, 'mcp-task-stdio.mjs'));

  for (const key of [...Object.keys(LEAKS), 'FIXTURE_LOG']) assert.equal(key in seen.env, false, `${key} must not reach the CLI`);
  assert.deepEqual(Object.keys(seen.env).filter(key => !PASS_THROUGH.includes(key) && !CONTROLS.includes(key)), [], 'The CLI env is allowlisted');
  assert.equal(seen.env.MAX_MCP_OUTPUT_TOKENS, '100000'); assert.equal(MAX_MCP_OUTPUT_TOKENS, 100_000);
  assert.equal(seen.env.ENABLE_TOOL_SEARCH, 'false'); assert.equal(seen.env.DISABLE_AUTOUPDATER, '1');
  assert.equal(seen.env.PATH, process.env.PATH); assert.equal(seen.env.HOME, process.env.HOME);

  assert.match(seen.prompt, /Images may be downscaled before you see them/);
  assert.equal(seen.prompt, actorPrompt(await readFile(path.join(BENCH_ROOT, 'config/browser-manual-v2-prompt.md'), 'utf8'), false, 'claude'));
  assert.doesNotMatch(seen.prompt, /may fall back to Google/);
  assert.equal(seen.options.input, `Starting website: ${task.website}\nTask: ${task.confirmed_task}\n`);
  assert.equal(seen.options.capture, false); assert.ok(seen.options.timeoutMs > 0 && seen.options.timeoutMs <= 1_200_000);
  assert.equal(seen.options.cwd, path.dirname(seen.promptPath));
  await assert.rejects(access(seen.options.cwd), { code: 'ENOENT' }, 'The per-task prompt and MCP config directory is removed');

  assert.equal(final.outcome, 'complete'); assert.equal(final.final_answer, ANSWER); assert.equal(final.error, null);
  assert.equal(final.driver, 'claude'); assert.equal(final.profile, 'browser-manual-v2');
  assert.equal(final.model, MODEL); assert.equal(final.effort, EFFORT);
  assert.equal(final.tool_calls, 3, 'Counted per tool_result block, including two results in one user message');
  assert.deepEqual(final.usage, NORMALIZED); assert.deepEqual(final.claude_usage, USAGE);
  assert.equal(final.session_id, 'claude-init-session', 'The init session wins over the result session');
  assert.equal(final.num_turns, 3); assert.equal(final.total_cost_usd, 0.0421); assert.equal(final.duration_api_ms, 1800);
  assert.deepEqual(final.model_usage, resultEvent().modelUsage); assert.deepEqual(final.permission_denials, []);
  assert.deepEqual({ ...final.init, tools: [...final.init.tools].sort() }, { session_id: 'claude-init-session', model: MODEL, cli_version: '2.1.302',
    tools: prefixed(ALLOWED_TOOLS).sort(), mcp_servers: [{ name: 'fsb', status: 'connected' }], permission_mode: 'dontAsk', api_key_source: 'none' });
  assert.equal(final.rate_limit.status, 'allowed'); assert.equal(final.rate_limit.unifiedWindows.five_hour.utilization, 0.25);
  assert.ok(!Number.isNaN(Date.parse(final.rate_limit.observed_at)));
  assert.equal(final.model_spawn_requested, true); assert.equal(final.cleanup_ok, true); assert.equal(final.cleanup_error, null);
  assert.equal(final.action_count, 1); assert.equal(final.actor_mutations_dispatched, 1);
  assert.deepEqual(JSON.parse(await f.raw('final.json')), final);

  assert.equal(await f.raw('stream.jsonl'), seen.emitted.join(''), 'Raw stream bytes are kept verbatim');
  const times = await f.jsonl('stream-event-times.jsonl');
  assert.deepEqual(times.map(row => row.index), times.map((_, index) => index));
  assert.deepEqual(times.map(row => row.type), seen.emitted.map(line => JSON.parse(line).type));
  assert.deepEqual(times.filter(row => row.tools).map(row => row.tools), [['mcp__fsb__read_page'], ['mcp__fsb__click', 'mcp__fsb__read_page']]);
  const browser = await f.browserTools();
  assert.equal(browser.filter(row => row.name === 'read_page').length, 2); assert.equal(browser.filter(row => row.name === 'click').length, 1);
  assert.ok(browser.some(row => row.name === 'close_tab' && row.args.tab_id === 101), 'The bootstrapped task tab is closed');
  const steps = await f.jsonl('steps.jsonl');
  assert.equal(steps.length, 4); assert.ok(steps.every(row => row.screenshot_path));
  assert.equal((await f.events()).filter(row => row.type === 'exited').length, 1);
});

test('a requested tool outside the FSB profile is recorded, cannot run, and does not stop the actor', async t => {
  const f = await fixture(t);
  const run = fakeClaude({ operate: async ({ emit, call, options }) => {
    await call('read_page');
    emit({ type: 'assistant', message: { role: 'assistant', model: MODEL, content: [{ type: 'text', text: 'A shell would be faster.' },
      { type: 'tool_use', id: 'toolu_bash', name: 'Bash', input: { command: 'curl https://fixture.test/' } }] } });
    emit({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_bash', is_error: true,
      content: '<tool_use_error>Error: No such tool available: Bash</tool_use_error>' }] } });
    assert.equal(options.signal.aborted, false, 'A request for a tool that does not exist cannot execute, so the CLI keeps running');
    await call('click', { selector: 'e1' });
  } });
  const final = await f.run({ run });
  assert.equal(final.outcome, 'complete'); assert.deepEqual(final.invalid_tool_requests, ['Bash']);
  assert.equal(final.actor_mutations_dispatched, 1); assert.equal(final.cleanup_ok, true);
  assert.equal((await f.browserTools()).filter(row => row.name === 'click').length, 1);
});

test('an init event that exposes a tool outside the profile is a tool violation before any model turn', async t => {
  const f = await fixture(t);
  const run = fakeClaude({ init: tools => initEvent([...tools, 'Bash']),
    operate: async ({ options }) => { assert.equal(options.signal.aborted, true, 'The CLI is aborted on its init event'); } });
  const final = await f.run({ run });
  assert.equal(final.outcome, 'tool_violation'); assert.equal(final.error, 'Unexpected Claude tools: Bash');
  assert.equal(final.final_answer, null); assert.equal(final.tool_calls, 0); assert.equal(final.cleanup_ok, true);
  assert.equal(final.init.tools.at(-1), 'Bash');
});

test('a rejected rate limit is a quota error that keeps its reset epoch, with or without a result event', async t => {
  for (const mode of ['error-result', 'exit-only']) await t.test(mode, async t => {
    const f = await fixture(t), resetsAt = epoch() + 3 * 3600;
    const events = [initEvent(prefixed(ALLOWED_TOOLS)), rateLimitEvent('rejected', { fiveHour: 1, resetsAt }),
      ...(mode === 'error-result' ? [resultEvent({ is_error: true, result: LIMIT_TEXT, num_turns: 1, total_cost_usd: 0,
        usage: { input_tokens: 0, output_tokens: 0 } })] : [])];
    // Chunks split mid-line and an unterminated last line, as a killed or flushing CLI can leave them.
    const raw = events.map(event => JSON.stringify(event)).join('\n');
    const final = await f.run({ run: async (_command, _args, options) => {
      for (const [start, end] of [[0, 41], [41, 777], [777, raw.length]]) options.onStdout(raw.slice(start, end));
      if (mode === 'exit-only') options.onStderr('API Error: request rejected\n');
      return { code: 1, timedOut: false };
    } });
    assert.equal(final.outcome, 'error', 'The start page was bootstrapped, so the run started');
    assert.match(final.error, /Claude rate limit rejected/);
    assert.ok(final.error.includes(`"resetsAt":${resetsAt}`), final.error);
    assert.ok(final.error.includes(mode === 'error-result' ? LIMIT_TEXT : 'API Error: request rejected'), final.error);
    assert.equal(providerFailure(final.error), 'quota');
    assert.equal(final.rate_limit.status, 'rejected'); assert.equal(final.final_answer, null);
    assert.equal(final.model_spawn_requested, true); assert.equal(final.cleanup_ok, true);
    assert.equal(await f.raw('stream.jsonl'), raw);
    const steps = await f.jsonl('steps.jsonl');
    assert.equal(steps.length, 1); assert.ok(steps[0].screenshot_path, 'The bootstrap frame keeps the attempt judgeable');
  });
});

test('an error_max_turns result is a step limit rather than a provider failure', async t => {
  const f = await fixture(t);
  const run = fakeClaude({ code: 1, result: resultEvent({ subtype: 'error_max_turns', is_error: true, result: undefined, num_turns: 401 }),
    operate: async ({ call }) => { await call('read_page'); } });
  const final = await f.run({ run });
  assert.equal(final.outcome, 'step_limit'); assert.equal(final.final_answer, null);
  assert.match(final.error, /error_max_turns/); assert.equal(providerFailure(final.error), null);
  assert.equal(final.num_turns, 401); assert.equal(final.tool_calls, 1); assert.deepEqual(final.usage, NORMALIZED);
  assert.equal(final.cleanup_ok, true);
});

test('a successful result without answer text is no_answer', async t => {
  for (const text of ['', ' \n\t ']) await t.test(JSON.stringify(text), async t => {
    const f = await fixture(t);
    const final = await f.run({ run: fakeClaude({ result: resultEvent({ result: text }) }) });
    assert.equal(final.outcome, 'no_answer'); assert.equal(final.final_answer, null);
    assert.equal(final.error, 'Claude finished without a final answer');
    assert.deepEqual(final.usage, NORMALIZED); assert.equal(final.cleanup_ok, true);
  });
});

test('public mode gives the actor the 44-tool public profile, the public prompt and the public env flag', async t => {
  const f = await fixture(t, { FIXTURE_PUBLIC_MODE: '1' });
  const run = fakeClaude({
    onSpawn: async () => {
      const opened = (await f.browserTools()).filter(row => row.name === 'open_tab');
      assert.ok(opened.some(row => row.args.url === task.website), 'The public start page is bootstrapped before spawn');
    },
    operate: async ({ actor, call }) => {
      const tools = (await actor.request('tools/list')).tools;
      assert.equal(tools.length, 44);
      assert.ok(!tools.some(tool => ['wait_for_element', 'wait_for_stable'].includes(tool.name)));
      assert.ok((await call('read_page')).content.some(block => block.type === 'image'));
      await call('click', { selector: '#counter' });
    } });
  const final = await f.run({ run, publicRelease: true, publicCatalog, publicPins: { published_version: '0.11.2' } });
  const { seen } = run;
  assert.equal(seen.env.FSB_BENCH_PUBLIC_RELEASE, '1');
  assert.equal(flag(seen.args, '--allowedTools'), prefixed(PUBLIC_ALLOWED_TOOLS).join(','));
  assert.equal(PUBLIC_ALLOWED_TOOLS.length, 44);
  assert.match(seen.prompt, /may fall back to Google/); assert.match(seen.prompt, /Target elements with any selector/);
  assert.match(seen.prompt, /Images may be downscaled before you see them/);
  assert.equal(final.outcome, 'complete'); assert.equal(final.final_answer, ANSWER);
  assert.equal(final.profile, 'browser-manual-public-v1'); assert.equal(final.public_release, true);
  assert.equal(final.public_catalog.tool_count, 44); assert.equal(final.provider_error, null);
  assert.equal(final.init.tools.length, 44); assert.equal(final.tool_calls, 2);
  assert.equal(final.action_count, 2, 'Public read_page consumes the UI budget'); assert.equal(final.cleanup_ok, true);
});

test('quotaHeadroom returns the pressured window with the latest reset and ignores cool, expired or unknown windows', () => {
  const now = 1_800_000_000, limits = { five_hour: 0.9, seven_day: 0.97 };
  const info = unifiedWindows => ({ status: 'allowed', resetsAt: now + 3600, rateLimitType: 'five_hour', unifiedWindows });
  const row = (utilization, resetsAt) => ({ utilization, resetsAt });
  assert.deepEqual(quotaHeadroom(info({ five_hour: row(0.95, now + 3 * 3600), seven_day: row(0.99, now + 4 * 86400) }), limits, now),
    { window: 'seven_day', utilization: 0.99, limit: 0.97, resetsAt: now + 4 * 86400 }, 'Both windows pressured: the later reset wins');
  assert.equal(quotaHeadroom(info({ five_hour: row(0.95, now + 7200), seven_day: row(0.98, now + 3600) }), limits, now).window, 'five_hour',
    'Windows are ranked by reset time, not by name');
  assert.deepEqual(quotaHeadroom(info({ five_hour: row(0.9, now + 3600), seven_day: row(0.969, now + 86400) }), limits, now),
    { window: 'five_hour', utilization: 0.9, limit: 0.9, resetsAt: now + 3600 }, 'The threshold itself counts; a window below it does not');
  assert.equal(quotaHeadroom(info({ five_hour: row(0.899, now + 3600), seven_day: row(0.969, now + 86400) }), limits, now), null);
  for (const resetsAt of [now, now - 1])
    assert.equal(quotaHeadroom(info({ five_hour: row(1, resetsAt) }), limits, now), null, `A window whose reset has arrived (${resetsAt - now}s) is ignored`);
  assert.deepEqual(quotaHeadroom(info({ five_hour: row(1, now - 1), seven_day: row(0.99, now + 60) }), limits, now),
    { window: 'seven_day', utilization: 0.99, limit: 0.97, resetsAt: now + 60 }, 'An expired window does not hide one that is still pressured');
  assert.equal(quotaHeadroom(info({ seven_day_overage_included: row(1, now + 3600) }), limits, now), null, 'Windows without a configured limit are ignored');
  for (const missing of [undefined, null, {}, { status: 'allowed' }, { unifiedWindows: null }, info({})])
    assert.equal(quotaHeadroom(missing, limits, now), null, JSON.stringify(missing));
  const future = epoch() + 3600;
  assert.equal(quotaHeadroom(info({ five_hour: row(QUOTA_HEADROOM.five_hour, future) })).limit, QUOTA_HEADROOM.five_hour, 'Defaults come from the family config');
  assert.equal(quotaHeadroom(info({ five_hour: row(QUOTA_HEADROOM.five_hour - 0.01, future) })), null);
});

test('claudeToolViolation admits only prefixed profile tools from the fsb server', () => {
  const init = (tools, servers = [{ name: 'fsb', status: 'connected' }]) => ({ type: 'system', subtype: 'init', tools, mcp_servers: servers });
  const assistant = (...content) => ({ type: 'assistant', message: { content } });
  assert.equal(claudeToolViolation(init(prefixed(ALLOWED_TOOLS)), ALLOWED_TOOLS), null);
  assert.equal(claudeToolViolation(init([...prefixed(ALLOWED_TOOLS), 'Bash', 'mcp__fsb__upload_file']), ALLOWED_TOOLS),
    'Unexpected Claude tools: Bash, mcp__fsb__upload_file');
  assert.equal(claudeToolViolation(init(['read_page', 'mcp__other__read_page']), ALLOWED_TOOLS), 'Unexpected Claude tools: read_page, mcp__other__read_page');
  assert.equal(claudeToolViolation(init(prefixed(ALLOWED_TOOLS), [{ name: 'fsb', status: 'connected' }, { name: 'claude.ai Gmail', status: 'connected' }]), ALLOWED_TOOLS),
    'Unexpected MCP servers: claude.ai Gmail');
  assert.equal(claudeToolViolation(assistant({ type: 'text', text: 'Reading.' }, { type: 'tool_use', name: 'mcp__fsb__read_page' }), ALLOWED_TOOLS), null);
  // Names outside the init inventory cannot run; only server-side tools stop the actor.
  assert.equal(claudeToolViolation(assistant({ type: 'tool_use', name: 'mcp__fsb__upload_file' }), ALLOWED_TOOLS), null);
  assert.equal(claudeToolViolation(assistant({ type: 'server_tool_use', name: 'web_search' }), ALLOWED_TOOLS), 'Disallowed server tool: web_search');
  assert.equal(claudeToolViolation(assistant({ type: 'tool_use', name: 'mcp__fsb__wait_for_stable' }), PUBLIC_ALLOWED_TOOLS), null);
  assert.deepEqual(invalidToolRequests(assistant({ type: 'tool_use', name: 'mcp__fsb__read_page' }, { type: 'tool_use', name: 'mcp__fsb__triple_click_placeholder' },
    { type: 'tool_use', name: 'mcp__fsb__wait_for_stable' }), PUBLIC_ALLOWED_TOOLS), ['mcp__fsb__triple_click_placeholder', 'mcp__fsb__wait_for_stable']);
  assert.deepEqual(invalidToolRequests(init(prefixed(ALLOWED_TOOLS)), ALLOWED_TOOLS), []);
  assert.equal(claudeToolViolation({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x' }] } }, ALLOWED_TOOLS), null);
});

test('normalizeClaudeUsage folds cache reads and writes into input under the shared cached-token key', () => {
  assert.equal(normalizeClaudeUsage(null), null); assert.equal(normalizeClaudeUsage(undefined), null);
  assert.deepEqual(normalizeClaudeUsage(USAGE), NORMALIZED);
  assert.deepEqual(normalizeClaudeUsage({ input_tokens: 7, output_tokens: 3 }),
    { input_tokens: 7, cached_input_tokens: 0, cache_creation_input_tokens: 0, uncached_input_tokens: 7, output_tokens: 3, thinking_tokens: null });
  assert.deepEqual(normalizeClaudeUsage({ cache_read_input_tokens: 50, output_tokens_details: { thinking_tokens: 9 } }),
    { input_tokens: 50, cached_input_tokens: 50, cache_creation_input_tokens: 0, uncached_input_tokens: 0, output_tokens: 0, thinking_tokens: 9 });
});
