import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BENCH_ROOT, REPO_ROOT } from './proc.mjs';
import { RecordingProxy, resultData, resultOK } from './mcp-record-proxy.mjs';
import { writeV2 } from './v2-writer.mjs';
import { validateTrajectoryDir } from './validate-v2.mjs';

export const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>FSB live integration fixture</title>
<style>body{font:20px system-ui;margin:60px;color:#19354c;background:#f4f7fb}main{background:white;max-width:850px;padding:32px;border-radius:16px}h1{font-size:32px}label{display:block;margin:20px 0 6px}input,select,button{font:inherit;padding:10px}button{display:block;margin:24px 0;background:#195d9d;color:white;border:0;border-radius:6px}li{padding:12px}</style></head>
<body><main><h1>Widget Store — FSB live test</h1><p>Local test data. No purchases or accounts.</p>
<form id="filters"><label for="query">Product name</label><input id="query" name="query" autocomplete="off">
<label for="color">Color</label><select id="color" name="color"><option value="all">All colors</option><option value="blue">Blue</option><option value="red">Red</option></select>
<button id="apply" type="submit">Apply filters</button></form><p id="status">No filters applied.</p><ul id="results"><li>Blue Widget — $19.99</li><li>Red Widget — $29.99</li></ul></main>
<script>document.getElementById('filters').addEventListener('submit',event=>{event.preventDefault();const query=document.getElementById('query').value.toLowerCase();const color=document.getElementById('color').value;const products=[['blue','Blue Widget — $19.99'],['red','Red Widget — $29.99']];document.getElementById('results').innerHTML=products.filter(([c,name])=>(color==='all'||color===c)&&name.toLowerCase().includes(query)).map(([,name])=>'<li>'+name+'</li>').join('');document.getElementById('status').textContent='Applied color: '+color;});</script></body></html>`;

export async function liveSmoke({ outputDir, command } = {}) {
  outputDir = path.resolve(outputDir ?? path.join(REPO_ROOT, '.context/om2w', `live-fsb-${Date.now()}`));
  if (existsSync(path.join(outputDir, 'raw/steps.jsonl'))) throw new Error('Choose a new output directory; previous live evidence is retained');
  command ??= [process.execPath, path.join(homedir(), '.fsb/native-host/runtime/package/build/index.js'), 'stdio'];
  if (!Array.isArray(command) || !command.length || command.some(value => typeof value !== 'string')) throw new Error('Invalid FSB server command');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'task-ids.json'), JSON.stringify(['99999999999999999999999999999999']) + '\n');
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ synthetic: true, real_fsb: true, benchmark_result: false, driver: 'scripted real FSB integration smoke', source: 'local fixture plus example.com' }, null, 2) + '\n');
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(HTML); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const startUrl = `http://127.0.0.1:${server.address().port}/`;
  const allowlist = JSON.parse(await readFile(path.join(BENCH_ROOT, 'config/tool-allowlist.json'), 'utf8'));
  const proxy = new RecordingProxy({ command, rawDir: path.join(outputDir, 'raw'), startUrl, allowlist });
  const summary = { started_at: new Date().toISOString(), source: 'real FSB extension via existing bridge relay', benchmark_result: false, checks: [], output_dir: outputDir };
  async function call(name, args = {}, { allowFailure = false } = {}) {
    const result = await proxy.handle('tools/call', { name, arguments: args });
    const data = resultData(result);
    summary.checks.push({ tool: name, ok: resultOK(result), data });
    console.log(JSON.stringify({ tool: name, ok: resultOK(result), detail: JSON.stringify(data).slice(0, 450) }));
    if (!allowFailure) assert.ok(resultOK(result), `${name}: ${JSON.stringify(data)}`);
    return data;
  }
  try {
    await proxy.handle('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'FSB live integration smoke', version: '1' } });
    proxy.upstream.notify('notifications/initialized');
    const tools = (await proxy.handle('tools/list')).tools;
    assert.equal(tools.length, Object.keys(allowlist.actions).length + allowlist.reads.length);
    summary.allowed_tools = tools.map(t => t.name);
    await call('read_page');
    await call('type_text', { selector: '#query', text: 'Widget', clear_first: true, visual_reason: 'Fill the local test product search' });
    await call('select_option', { selector: '#color', value: 'blue', visual_reason: 'Choose the blue product filter in the local fixture' });
    await call('click', { selector: '#apply', visual_reason: 'Apply filters in the local test fixture' });
    const products = JSON.stringify(await call('get_text', { selector: '#results' }));
    assert.ok(products.includes('Blue Widget') && products.includes('$19.99') && !products.includes('Red Widget'), 'Rendered product filter result is incorrect');
    const status = JSON.stringify(await call('get_text', { selector: '#status' }));
    assert.ok(status.includes('Applied color: blue'));
    await call('navigate', { url: 'https://example.com/', visual_reason: 'Verify public-page navigation in the owned smoke-test tab' });
    const publicPage = JSON.stringify(await call('read_page'));
    assert.ok(/documentation examples|Example Domain/i.test(publicPage), 'Public-page content is unexpected');
    await call('go_back', { visual_reason: 'Return to the local test fixture' }, { allowFailure: true });
    if (!summary.checks.at(-1).ok) await call('navigate', { url: startUrl, visual_reason: 'Recover from the recorded Back failure and return to the local fixture' });
    const finalPage = JSON.stringify(await call('read_page'));
    assert.ok(finalPage.includes('Blue Widget'), 'Back navigation did not return to the fixture');
    const task = { task_id: '99999999999999999999999999999999', confirmed_task: 'Filter the local Widget Store to blue products, read the Blue Widget price, verify example.com displays its documentation-example notice and return to the store.', website: startUrl, reference_length: 6, level: 'easy' };
    await writeFile(path.join(outputDir, 'raw/final.json'), JSON.stringify({ task_id: task.task_id, model: 'scripted-real-FSB-smoke', outcome: 'complete', final_answer: 'Blue Widget: $19.99. example.com displays its documentation-example notice. Returned to the local store.' }, null, 2) + '\n');
    const written = await writeV2({ task, rawDir: path.join(outputDir, 'raw'), outDir: path.join(outputDir, 'trajectories') });
    summary.validation = await validateTrajectoryDir(written.dir);
    assert.ok(summary.validation.ok, summary.validation.errors.join('; '));
    summary.steps = written.steps;
    summary.pipeline_ok = true;
    summary.failed_checks = summary.checks.filter(check => !check.ok).map(check => check.tool);
    summary.ok = summary.failed_checks.length === 0;
  } catch (err) {
    summary.ok = false;
    summary.error = err.message;
    console.error(err.message);
  } finally {
    if (proxy.tabId !== null) {
      try {
        const cleanup = await proxy.upstream.request('tools/call', { name: 'close_tab', arguments: { tab_id: proxy.tabId, allow_active: true, visual_reason: 'Close only the temporary tab created by this smoke test', client: 'Claude' } });
        summary.cleanup_ok = resultOK(cleanup);
      } catch (err) { summary.cleanup_error = err.message; }
    }
    await proxy.close();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    summary.ended_at = new Date().toISOString();
    await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { output: { type: 'string' }, 'fsb-server-cmd': { type: 'string' } } });
  const summary = await liveSmoke({ outputDir: values.output, command: values['fsb-server-cmd'] ? JSON.parse(values['fsb-server-cmd']) : undefined });
  console.log(JSON.stringify({ ok: summary.ok, pipeline_ok: summary.pipeline_ok, failed_checks: summary.failed_checks, output_dir: summary.output_dir, error: summary.error, steps: summary.steps, cleanup_ok: summary.cleanup_ok }));
  if (!summary.ok) process.exitCode = 1;
}
