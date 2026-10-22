import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runManualCodexTask } from '../driver-codex-manual.mjs';
import { BrowserScheduler } from '../browser-scheduler.mjs';
import { resultData, resultOK } from '../mcp-record-proxy.mjs';
import { verifyPublicDisposition } from '../public-disposition.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const task = { task_id: 'fixture', website: 'https://fixture.test/', confirmed_task: 'Change the visible counter to one' };
const pngModule = fileURLToPath(new URL('../png.mjs', import.meta.url));
const toolsFile = fileURLToPath(new URL('../../../extension/ai/tool-definitions.js', import.meta.url));
const { TOOL_REGISTRY } = createRequire(import.meta.url)(toolsFile);
const publicCatalog = { tools: TOOL_REGISTRY.filter(tool => !['wait_for_element', 'wait_for_stable'].includes(tool.name)) };
const browserSource = `
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { encodeSolidPng } from ${JSON.stringify(pngModule)};
const { TOOL_REGISTRY } = createRequire(import.meta.url)(${JSON.stringify(toolsFile)});
const tabs = new Map(); let next = 100, active = null, initialized = false, captures = 0, readiness = 0, clicks = 0;
const log = row => appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(row) + '\\n');
const reply = value => ({ content:[{type:'text',text:JSON.stringify(value)}] });
const error = value => ({ ...reply({success:false,...value}), isError:true });
log({type:'started',pid:process.pid}); process.on('exit', () => log({type:'exited',pid:process.pid}));
process.on('SIGTERM', () => process.exit(0));
async function handle(method, params) {
  if (method === 'initialize') { initialized = true; return { protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'browser-double',version:'1'} }; }
  if (method === 'tools/list') return {tools:process.env.FIXTURE_PUBLIC_MODE ? TOOL_REGISTRY.filter(t=>!['wait_for_element','wait_for_stable'].includes(t.name)) : TOOL_REGISTRY};
  if (method !== 'tools/call') return {};
  const {name,arguments:args={}} = params; const id = args.tab_id ?? args.tabId;
  log({type:'tool',name,args});
  if (process.env.FIXTURE_STRICT_INIT && !initialized) return error({code:'NOT_INITIALIZED',error:'Initialize this same upstream first'});
  if (name === 'list_tabs') {
    readiness++;
    if (readiness <= Number(process.env.FIXTURE_RELAY_POLLS || 0)) return error({error:'extension_not_connected'});
    return reply({success:true,tabs:[...tabs.values()].map(t=>({id:t.id,title:'Fixture',domain:'fixture.test',windowId:1}))});
  }
  if (name === 'open_tab') {
    if (readiness < Number(process.env.FIXTURE_RELAY_POLLS || 0)) return error({error:'extension_not_connected'});
    const tab={id:++next,url:args.url,state:0}; tabs.set(tab.id,tab); active=tab.id; return reply({success:true,tabId:tab.id,url:tab.url});
  }
  if (name === 'close_tab') {
    if (process.env.FIXTURE_CLOSE_FAIL) return error({error:'Primary close timeout'});
    if (process.env.FIXTURE_CLOSE_TIMEOUT_TASK && tabs.get(id)?.url?.startsWith('https://fixture.test/')) {
      tabs.delete(id); log({type:'hung_close',tabId:id});
      return {isError:true,content:[{type:'text',text:'Detected: Page navigation\\nWhy: Request mcp_1 (mcp:execute-action) timed out after 30000ms\\nNext action: Refresh page state.'}]};
    }
    tabs.delete(id); return reply({success:true,closed:true,tabId:id});
  }
  if (name === 'switch_tab') { if (!tabs.has(id)) return error({code:'TAB_NOT_OWNED',error:'Wrong task tab'}); active=id; return reply({success:true,tabId:id}); }
  const tab=tabs.get(id); if (!tab) return error({code:'TAB_NOT_OWNED',error:'No such task tab'});
  if (name === 'capture_screenshot') {
    captures++;
    if (active !== id) return error({error:'Wrong foreground tab'});
    if (captures === Number(process.env.FIXTURE_FAIL_CAPTURE_EXACT)) return error({code:'SCREENSHOT_CAPTURE_FAILED',error:'Settled fixture capture failure'});
    if (captures === Number(process.env.FIXTURE_TRANSIENT_CAPTURE_EXACT)) return error({code:'SCREENSHOT_CAPTURE_FAILED',error:'Frame with ID 0 was removed.',retryable:false});
    if (captures === Number(process.env.FIXTURE_FOREIGN_VISIBLE_CAPTURE_EXACT)) return error({code:'SCREENSHOT_CAPTURE_FAILED',error:'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',retryable:false});
    if (tab.url.startsWith('https://fixture.test/') && captures >= Number(process.env.FIXTURE_UNRESPONSIVE_CAPTURE_FROM || Infinity)
        && captures <= Number(process.env.FIXTURE_UNRESPONSIVE_CAPTURE_UNTIL || Infinity))
      return {isError:true,content:[{type:'text',text:'Detected: Page responsiveness\\nWhy: The current page did not respond before the page-read deadline.\\nNext action: Use navigate or close_tab to recover the tab. Inspect page state before repeating any mutation.\\n\\nRaw error: The page did not respond before the capture deadline. Navigate or close the tab to recover it.'}]};
    if (captures > Number(process.env.FIXTURE_BAD_CAPTURE_AFTER || Infinity)) return error({code:'PAGE_UNRESPONSIVE',error:'Capture deadline',cleanup_pending:process.env.FIXTURE_CLEANUP_PENDING === '1'});
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
  if (name === 'read_page' || name === 'get_page_snapshot') {
    if (process.env.FIXTURE_READ_DELAY) await new Promise(resolve=>setTimeout(resolve,Number(process.env.FIXTURE_READ_DELAY)));
    return reply({success:true,content:'Counter='+tab.state});
  }
  if (name === 'click') {
    clicks++; tab.state++;
    if (process.env.FIXTURE_UNKNOWN_ONCE && clicks === 1) return error({error:'Action outcome unknown',execution_outcome:'unknown',mayHaveExecuted:true});
    if (process.env.FIXTURE_DISCONNECT_ON_CLICK) { process.stdout.write('not-json\\n'); return new Promise(()=>{}); }
    return reply({success:true,state:tab.state});
  }
  return reply({success:true});
}
const input=createInterface({input:process.stdin});
input.on('line',line=>{ let msg;try{msg=JSON.parse(line);}catch{return;}
  if (msg.id === undefined) return;
  handle(msg.method,msg.params).then(result=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result})+'\\n'),
    error=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32603,message:error.message}})+'\\n'));
});
`;

function configuration(args, key) { return JSON.parse(args.find(arg => arg.startsWith(key + '=')).slice(key.length + 1)); }
async function connectActor(args) {
  const socket = createConnection(configuration(args, 'mcp_servers.fsb.args')[1]);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  const lines = createInterface({ input: socket }), pending = new Map(); let id = 0;
  lines.on('line', line => { const value = JSON.parse(line); const p = pending.get(value.id); if (!p) return; pending.delete(value.id); value.error ? p.reject(new Error(value.error.message)) : p.resolve(value.result); });
  const request = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n'); });
  await request('initialize', {protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'fake-codex',version:'1'}});
  socket.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  return { request, call: (name,args={}) => request('tools/call',{name,arguments:args}), close() { lines.close(); socket.destroy(); } };
}

async function fixture(t, env = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'manual-driver-test-'));
  const server = path.join(dir, 'browser.mjs'), log = path.join(dir, 'browser-log.jsonl');
  await writeFile(server, browserSource);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { task, rawDir: path.join(dir, 'raw'), serverCommand: [process.execPath, server],
    env: { ...process.env, FIXTURE_LOG: log, ...env } };
  return { dir, log, options, run: async extra => {
    const final = await runManualCodexTask({ ...options, ...extra });
    if (extra?.run?.fixtureError) throw extra.run.fixtureError;
    return final;
  },
    events: async () => (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse),
    steps: async () => (await readFile(path.join(dir, 'raw/steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse) };
}
function fakeActor(operate, result = {}) {
  const run = async (_command, args, options) => {
    const emit = event => options.onStdout(JSON.stringify(event)+'\n');
    emit({type:'thread.started',thread_id:'fake-session'});
    const actor = await connectActor(args);
    try {
      await actor.request('tools/list');
      const call = async (name, params = {}) => {
        const id = 'item-'+Math.random(); emit({type:'item.started',item:{id,type:'mcp_tool_call',server:'fsb',tool:name}});
        const value=await actor.call(name,params); emit({type:'item.completed',item:{id,type:'mcp_tool_call',server:'fsb',tool:name,result:value}}); return value;
      };
      await operate({ actor, call, options, emit, args });
      if (!result.timedOut && !options.signal.aborted) {
        await writeFile(args[args.indexOf('-o')+1], 'The observed fixture counter is one.');
        emit({type:'turn.completed',usage:{input_tokens:100,output_tokens:20}});
      }
      return { code: options.signal.aborted ? 128 : 0, timedOut: false, ...result };
    } catch (error) { run.fixtureError = error; throw error; }
    finally { actor.close(); }
  };
  return run;
}

test('driver uses one just-before-spawn permit and retains real RPC observations and cleanup', async t => {
  const f=await fixture(t), order=[];
  const final=await f.run({beforeSpawn:async()=>{order.push('admit');return {allowed:true};},run:fakeActor(async({call,options})=>{
    order.push('actor'); assert.equal(options.timeoutMs <= 1_200_000, true);
    await call('read_page'); const result=await call('click',{selector:'e1'});
    assert.ok(result.content.some(x=>x.type==='image'));
  })});
  assert.deepEqual(order,['admit','actor']); assert.equal(final.outcome,'complete');
  assert.equal(final.cleanup_ok,true); assert.equal(final.actor_mutations_dispatched,1); assert.equal(final.action_count,1);
  assert.equal(final.model_spawn_requested,true); assert.equal(final.session_id,'fake-session'); assert.equal(final.tool_calls,2);
  const rows=await f.steps(); assert.equal(rows.length,3); assert.ok(rows.every(x=>x.screenshot_path));
  for (const row of rows) assert.ok((await stat(row.screenshot_path)).size>24);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.dir,'raw/final.json'))),final);
  assert.equal((await f.events()).filter(x=>x.type==='exited').length,1);
});

test('public driver freezes44 tools and prepares the guard before admission while retaining native frames and exact cleanup', async t => {
  const f = await fixture(t, { FIXTURE_PUBLIC_MODE: '1' }), order = [];
  const final = await f.run({ publicRelease: true, publicCatalog, publicPins: { published_version: '0.11.2' },
    beforeSpawn: async () => {
      const opened = (await f.events()).filter(row => row.type === 'tool' && row.name === 'open_tab');
      assert.equal(opened.length, 1); assert.equal(opened[0].args.active, false); order.push('admit'); return { allowed: true };
    }, run: fakeActor(async ({ actor, call, options, args }) => {
      order.push('actor'); assert.equal(options.env.FSB_BENCH_PUBLIC_RELEASE, '1');
      const tools = (await actor.request('tools/list')).tools; assert.equal(tools.length, 44);
      assert.ok(!tools.some(tool => ['wait_for_element', 'wait_for_stable'].includes(tool.name)));
      const prompt = await readFile(configuration(args, 'model_instructions_file'), 'utf8');
      assert.match(prompt, /may fall back to Google/); assert.match(prompt, /read_page can click consent UI/);
      const observation = await call('read_page'); assert.ok(observation.content.some(block => block.type === 'image'));
      assert.equal(resultData(await call('list_tabs')).find(row => row.tabs).tabs.length, 1, 'Guard is hidden from actor inventory');
      await call('click', { selector: '#counter' });
    }) });
  assert.deepEqual(order, ['admit', 'actor']); assert.equal(final.outcome, 'complete');
  assert.equal(final.public_release, true); assert.equal(final.profile, 'browser-manual-public-v1');
  assert.equal(final.public_catalog.tool_count, 44); assert.equal(final.cleanup_ok, true);
  assert.equal(final.action_count, 2); assert.equal(final.actor_mutations_dispatched, 2);
  const events = (await f.events()).filter(row => row.type === 'tool'), closes = events.filter(row => row.name === 'close_tab');
  assert.equal(closes.length, 2); assert.equal(events.at(-1).name, 'close_tab');
  assert.equal(events.at(-1).args.tab_id, 101, 'Causal guard closes last and no post-close inventory occurs');
  const meta = JSON.parse(await readFile(path.join(f.dir, 'raw/proxy-meta.json')));
  assert.equal(meta.child_cleanup.public_guard_drain.ok, true); assert.equal(meta.child_cleanup.public_guard_disposal.ok, true);
  assert.equal(meta.child_cleanup.public_client_shutdown.client_closed, true);
  assert.equal((await f.steps()).find(row => row.tool === 'read_page').kind, 'action');
});

test('public driver cancels only the invalid actor after settled capture failure and preserves a verified separate health proof', async t => {
  const f = await fixture(t, { FIXTURE_PUBLIC_MODE: '1', FIXTURE_FAIL_CAPTURE_EXACT: '2' }), globalFaults = [];
  const final = await f.run({ publicRelease: true, publicCatalog, onFault: detail => globalFaults.push(detail),
    run: fakeActor(async ({ call }) => {
      const failed = await call('read_page'); assert.equal(failed.isError, true);
      assert.ok(!failed.content.some(block => block.type === 'image'));
      assert.match(JSON.stringify(resultData(failed)), /Settled fixture capture failure/);
    }) });
  assert.equal(final.outcome, 'capture_failure'); assert.equal(final.cleanup_ok, true);
  assert.equal(final.fault.code, 'CAPTURE_FAILED'); assert.equal(final.uncertain_upstream, false);
  assert.equal(final.provider_error, null, 'Expected local actor cancellation is not a provider fault');
  assert.deepEqual(globalFaults, []); assert.equal(final.actor_mutations_dispatched, 1);
  assert.ok(await verifyPublicDisposition(path.join(f.dir, 'raw'), final));
  const events = (await f.events()).filter(row => row.type === 'tool');
  assert.equal(events.filter(row => row.name === 'read_page').length, 1);
  assert.equal(events.filter(row => row.name === 'capture_screenshot').length, 3, 'Bootstrap, original failure and independent guard capture only');
  assert.equal(events.at(-1).name, 'close_tab');
  assert.equal((await f.steps()).filter(row => row.screenshot_path).length, 1, 'Independent health PNG never becomes actor trajectory evidence');
});

test('public native-failure proof never hides genuine provider errors or an unexpected CLI exit', async t => {
  for (const mode of ['provider-event', 'unexpected-exit']) await t.test(mode, async t => {
    const f = await fixture(t, { FIXTURE_PUBLIC_MODE: '1', FIXTURE_FAIL_CAPTURE_EXACT: '2' });
    const final = await f.run({ publicRelease: true, publicCatalog,
      run: fakeActor(async ({ call, emit }) => {
        await call('read_page');
        if (mode === 'provider-event') emit({ type: 'turn.failed', error: { message: 'Usage limit reached; retry after reset', code: 'quota' } });
      }, mode === 'unexpected-exit' ? { code: 1 } : {}) });
    assert.equal(final.outcome, 'capture_failure'); assert.equal(final.cleanup_ok, true);
    assert.ok(final.public_disposition, 'Original native cleanup/health proof is retained as raw evidence');
    assert.match(final.provider_error, mode === 'provider-event' ? /Usage limit reached/ : /exited unexpectedly with code 1/);
    assert.match(final.error, /Settled fixture capture failure/);
    assert.equal((await f.events()).filter(row => row.type === 'tool' && row.name === 'read_page').length, 1);
  });
});

test('denied admission launches no actor or page tool and closes its unstarted upstream', async t => {
  const f=await fixture(t,{FIXTURE_STRICT_INIT:'1'}); let spawns=0;
  const final=await f.run({beforeSpawn:async()=>({allowed:false}),run:async()=>{spawns++;throw new Error('Must not launch');}});
  assert.equal(spawns,0); assert.equal(final.outcome,'provider_pending'); assert.equal(final.model_spawn_requested,false);
  assert.equal(final.actor_mutations_dispatched,0); assert.equal(final.cleanup_ok,true);
  assert.equal((await f.events()).filter(x=>x.type==='tool').length,0);
  assert.equal((await f.events()).filter(x=>x.type==='exited').length,1);
});

test('provider reset context survives selected error messages and later failure events without changing raw stream bytes', async t => {
  const f = await fixture(t);
  const events = [{ type: 'error', error: { message: "You've hit your usage limit. Try again at Oct 22nd, 2026 1:27 AM.",
    code: 'usage_limit_reached', resetsAt: 1792640400, timezone: 'America/Chicago' } },
    { type: 'turn.failed', error: { message: 'Provider request failed', type: 'usage_limit_reached' } }];
  const raw = events.map(event => JSON.stringify(event)).join('\n') + '\n';
  const final = await f.run({ run: async (_command, _args, options) => {
    options.onStdout(raw.slice(0, 37)); options.onStdout(raw.slice(37)); return { code: 1 };
  } });
  assert.equal(final.outcome, 'never_started'); assert.equal(final.cleanup_ok, true);
  assert.match(final.error, /Oct 22nd, 2026 1:27 AM/);
  assert.match(final.error, /"resetsAt":1792640400/); assert.match(final.error, /"timezone":"America\/Chicago"/);
  assert.match(final.error, /Provider request failed/); assert.match(final.error, /"type":"turn.failed"/);
  assert.equal(await readFile(path.join(f.dir, 'raw/stream.jsonl'), 'utf8'), raw);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.dir, 'raw/final.json'))), final);
});

test('same-upstream relay readiness polling precedes exactly one bootstrap open', async t => {
  const f=await fixture(t,{FIXTURE_RELAY_POLLS:'2'});
  const final=await f.run({run:fakeActor(async({call})=>{await call('read_page');})});
  assert.equal(final.outcome,'complete'); assert.equal(final.cleanup_ok,true);
  const tools=(await f.events()).filter(x=>x.type==='tool'), open=tools.findIndex(x=>x.name==='open_tab');
  assert.equal(tools.filter(x=>x.name==='open_tab').length,1);
  assert.ok(tools.slice(0,open).filter(x=>x.name==='list_tabs').length>=3);
});

test('expired preparation never spawns an actor after the walltime deadline', async t => {
  const f=await fixture(t); let spawns=0;
  const final=await f.run({timeoutMs:10,beforeSpawn:async()=>{await wait(30);return {allowed:true};},run:async()=>{spawns++;return {code:0};}});
  assert.equal(spawns,0); assert.equal(final.outcome,'provider_pending'); assert.equal(final.model_spawn_requested,false);
  assert.equal(final.cleanup_ok,true);
});

test('ordinary actor walltime remains timeout and keeps its recorded frames', async t => {
  const f=await fixture(t);
  const final=await f.run({run:fakeActor(async({call})=>{await call('read_page');},{timedOut:true,code:128})});
  assert.equal(final.outcome,'timeout'); assert.equal(final.final_answer,null); assert.equal(final.cleanup_ok,true);
  assert.equal(final.actor_mutations_dispatched,0); assert.equal((await f.steps()).length,2);
});

test('completed unknown action needs emitted fresh state before another mutation, without replay', async t => {
  const f=await fixture(t,{FIXTURE_UNKNOWN_ONCE:'1'}); let denied;
  const final=await f.run({run:fakeActor(async({call})=>{
    await call('read_page'); assert.equal(resultOK(await call('click',{selector:'e1'})),false);
    denied=await call('click',{selector:'e1'}); assert.equal(resultOK(denied),false);
    assert.match(JSON.stringify(resultData(denied)),/verif|fresh|state/i);
    assert.ok(resultOK(await call('get_page_snapshot')));
    assert.ok(resultOK(await call('click',{selector:'e1'})));
  })});
  assert.equal(final.outcome,'complete'); assert.equal(final.cleanup_ok,true);
  assert.equal((await f.events()).filter(x=>x.type==='tool'&&x.name==='click').length,2);
});

test('ongoing transport uncertainty is preserved and halts new browser dispatch', async t => {
  const f=await fixture(t,{FIXTURE_DISCONNECT_ON_CLICK:'1'}), scheduler=new BrowserScheduler();
  const final=await f.run({scheduler,run:fakeActor(async({call})=>{await call('read_page');await call('click',{selector:'e1'});})});
  assert.equal(final.uncertain_upstream,true); assert.ok(scheduler.halted); assert.equal(final.actor_mutations_dispatched,1);
  const rows=await f.steps(); assert.equal(rows.at(-1).execution_outcome,'unknown');
  assert.equal((await f.events()).filter(x=>x.type==='tool'&&x.name==='click').length,1);
});

test('capture cleanup quarantine halts the global scheduler and never emits a replacement image', async t => {
  const f=await fixture(t,{FIXTURE_BAD_CAPTURE_AFTER:'2',FIXTURE_CLEANUP_PENDING:'1'}), scheduler=new BrowserScheduler();
  const final=await f.run({scheduler,run:fakeActor(async({call})=>{
    await call('read_page');const failed=await call('click',{selector:'e1'});assert.ok(!failed.content.some(x=>x.type==='image'));
    const before=(await f.events()).filter(x=>x.type==='tool').length;
    for (const name of ['get_page_snapshot','list_tabs','get_site_guide']) assert.equal(resultOK(await call(name)),false);
    assert.equal((await f.events()).filter(x=>x.type==='tool').length,before,'Global halt must also stop unleased reads and inventories');
  })});
  assert.ok(scheduler.halted); assert.equal(final.actor_mutations_dispatched,1); assert.equal(final.screenshot_errors,1);
  assert.equal(final.cleanup_ok,false);
  assert.equal((await f.events()).filter(x=>x.type==='tool'&&x.name==='close_tab').length,0,'Do not close a tab whose physical capture is unresolved');
  const rows=await f.steps(); assert.equal(rows.at(-1).screenshot_path,null); assert.ok(rows.at(-1).screenshot_error);
  await assert.rejects(scheduler.run('unrelated',()=>assert.fail('No dispatch while cleanup is uncertain')));
});

test('a failed primary close preserves original complete outcome and false cleanup', async t => {
  const f=await fixture(t,{FIXTURE_CLOSE_FAIL:'1'});
  const final=await f.run({run:fakeActor(async({call})=>{await call('read_page');})});
  assert.equal(final.outcome,'complete'); assert.equal(final.cleanup_ok,false); assert.match(final.cleanup_error,/close/i);
  assert.equal(final.final_answer,'The observed fixture counter is one.');
  assert.equal((await f.events()).filter(x=>x.type==='exited').length,1);
});

test('mutating call cap stops the third actor action without a third native dispatch', async t => {
  const f=await fixture(t);
  const final=await f.run({maxActions:2,run:fakeActor(async({call})=>{
    await call('read_page'); await call('click',{selector:'e1'}); await call('click',{selector:'e1'});
    assert.equal(resultOK(await call('click',{selector:'e1'})),false);
  })});
  assert.equal(final.outcome,'step_limit'); assert.equal(final.action_count,2); assert.equal(final.actor_mutations_dispatched,2);
  assert.equal((await f.events()).filter(x=>x.type==='tool'&&x.name==='click').length,2);
  assert.equal(final.cleanup_ok,true);
});

test('a completed read cannot start focus or capture after another task globally halts browser work', async t => {
  const f=await fixture(t,{FIXTURE_READ_DELAY:'100'}), scheduler=new BrowserScheduler();
  await f.run({scheduler,run:fakeActor(async({call})=>{
    const pending=call('read_page');
    const until=Date.now()+2000;
    while (!(await f.events()).some(x=>x.type==='tool'&&x.name==='read_page')) {
      assert.ok(Date.now()<until,'The fixture read must actually be dispatched'); await wait(2);
    }
    const before=(await f.events()).filter(x=>x.type==='tool'&&['switch_tab','capture_screenshot'].includes(x.name)).length;
    scheduler.halt('Another task reports unresolved native capture cleanup');
    const result=await pending;
    assert.ok(!result.content.some(x=>x.type==='image'));
    assert.equal((await f.events()).filter(x=>x.type==='tool'&&['switch_tab','capture_screenshot'].includes(x.name)).length,before,
      'Deadline drain never bypasses a global health halt');
  })});
});

test('a frame replaced during capture repeats only the observation and keeps the task healthy', async t => {
  const f = await fixture(t, { FIXTURE_TRANSIENT_CAPTURE_EXACT: '2' });
  const final = await f.run({ run: fakeActor(async ({ call }) => {
    const result = await call('click', { selector: 'e1' });
    assert.ok(result.content.some(block => block.type === 'image'), 'The retried capture still returns the observation');
  }) });
  assert.equal(final.outcome, 'complete'); assert.equal(final.cleanup_ok, true); assert.equal(final.fault, null);
  const rows = await f.steps(), click = rows.find(row => row.tool === 'click');
  assert.ok(rows.every(row => row.screenshot_path));
  assert.equal(click.capture_retries.length, 1); assert.match(click.capture_retries[0].error, /Frame with ID 0 was removed/);
  assert.equal(click.native_capture_result, undefined);
  const meta = JSON.parse(await readFile(path.join(f.dir, 'raw/proxy-meta.json')));
  assert.equal(meta.counts.screenshot_retries, 1);
  assert.equal((await f.events()).filter(row => row.type === 'tool' && row.name === 'click').length, 1, 'The action itself is never repeated');
});

test('a busy page that misses one capture deadline is observed again, not failed', async t => {
  const f = await fixture(t, { FIXTURE_UNRESPONSIVE_CAPTURE_FROM: '2', FIXTURE_UNRESPONSIVE_CAPTURE_UNTIL: '2' });
  const final = await f.run({ run: fakeActor(async ({ call }) => { await call('click', { selector: 'e1' }); }) });
  assert.equal(final.outcome, 'complete'); assert.equal(final.fault, null);
  const click = (await f.steps()).find(row => row.tool === 'click');
  assert.equal(click.capture_retries.length, 1); assert.match(click.capture_retries[0].error, /did not respond before the capture deadline/);
});

test('a public page that stays unresponsive becomes a verified native failure, not a rig fault', async t => {
  const f = await fixture(t, { FIXTURE_PUBLIC_MODE: '1', FIXTURE_UNRESPONSIVE_CAPTURE_FROM: '2' }), globalFaults = [];
  const final = await f.run({ publicRelease: true, publicCatalog, onFault: detail => globalFaults.push(detail),
    run: fakeActor(async ({ call }) => { const failed = await call('read_page'); assert.equal(failed.isError, true); }) });
  assert.equal(final.outcome, 'capture_failure'); assert.equal(final.cleanup_ok, true); assert.equal(final.uncertain_upstream, false);
  assert.deepEqual(globalFaults, [], 'A settled public capture timeout is a task outcome, not a global halt');
  const disposition = await verifyPublicDisposition(path.join(f.dir, 'raw'), final);
  assert.ok(disposition); assert.equal(disposition.native_error.code, 'PAGE_UNRESPONSIVE');
});

test('a public task-tab close that FSB never acknowledges is completed by the exact-ID fallback and verified absent', async t => {
  const f = await fixture(t, { FIXTURE_PUBLIC_MODE: '1', FIXTURE_CLOSE_TIMEOUT_TASK: '1' }), closed = [];
  // The double drops the tab while timing out, as the stuck renderer is torn down only by the fallback here.
  const final = await f.run({ publicRelease: true, publicCatalog, closeTabs: async ids => { closed.push(...ids); return { ok: true, closed: ids, missing: [] }; },
    run: fakeActor(async ({ call }) => { await call('read_page'); }) });
  assert.equal(final.outcome, 'complete'); assert.equal(final.cleanup_ok, true);
  const cleanup = JSON.parse(await readFile(path.join(f.dir, 'raw/childcleanup.json')));
  const close = cleanup.closes.find(row => row.method);
  assert.equal(close.method, 'osascript_exact_tab_id_after_unacknowledged_close'); assert.deepEqual(closed, [close.tab_id]);
});

test('a capture refused because another tab became visible re-focuses the task tab and observes again', async t => {
  const f = await fixture(t, { FIXTURE_FOREIGN_VISIBLE_CAPTURE_EXACT: '2' });
  const final = await f.run({ run: fakeActor(async ({ call }) => { await call('click', { selector: 'e1' }); }) });
  assert.equal(final.outcome, 'complete'); assert.equal(final.fault, null);
  const click = (await f.steps()).find(row => row.tool === 'click');
  assert.equal(click.capture_retries.length, 1); assert.match(click.capture_retries[0].error, /Cannot access contents of the page/);
  const tools = (await f.events()).filter(row => row.type === 'tool').map(row => row.name);
  const failedAt = tools.lastIndexOf('capture_screenshot', tools.length - 1);
  assert.ok(tools.filter(name => name === 'switch_tab').length >= 3, 'The task tab is re-focused before the repeated capture');
  assert.ok(failedAt > 0);
});
