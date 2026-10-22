import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runClaudeTask } from '../driver-claude-code.mjs';

const task = { task_id: 'b'.repeat(32), website: 'https://store.example/', confirmed_task: 'Find a price.', reference_length: 2, level: 'easy' };
async function cliFixture(t, code) {
  const root = await mkdtemp(path.join(tmpdir(), 'om2w-driver-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const command = path.join(root, 'fake-claude');
  await writeFile(command, '#!/usr/bin/env node\n' + code);
  await chmod(command, 0o755);
  return { root, command };
}
test('driver persists a complete result and loads only its configured MCP server', async t => {
  const { root, command } = await cliFixture(t, `
    const fs = require('node:fs');
    const args=process.argv.slice(2);
    const config=JSON.parse(fs.readFileSync(args[args.indexOf('--mcp-config')+1]));
    console.log(JSON.stringify({type:'system',subtype:'init',tools:[],mcp_servers:[]}));
    console.log(JSON.stringify({type:'result',subtype:'success',num_turns:1,result:JSON.stringify({args,servers:Object.keys(config.mcpServers),url:config.mcpServers.fsb.env.OM2W_START_URL})}));
  `);
  const rawDir = path.join(root, 'raw');
  const final = await runClaudeTask({ task, rawDir, command, serverCommand: [process.execPath, 'fake-server'] });
  assert.equal(final.outcome, 'complete');
  const answer = JSON.parse(final.final_answer);
  assert.deepEqual(answer.servers, ['fsb']); assert.equal(answer.url, task.website);
  assert.equal(answer.args[answer.args.indexOf('--tools') + 1], '');
  assert.ok(answer.args.includes('--strict-mcp-config'));
  assert.ok(answer.args[answer.args.indexOf('--disallowedTools') + 1].includes('mcp__fsb__run_task'));
  assert.equal(JSON.parse(await readFile(path.join(rawDir, 'final.json'), 'utf8')).outcome, 'complete');
});
test('driver records wall-clock expiry even without a CLI result', async t => {
  const { root, command } = await cliFixture(t, 'setInterval(()=>{},1000);');
  const final = await runClaudeTask({ task, rawDir: path.join(root, 'raw'), command, serverCommand: ['unused'], timeoutMs: 100 });
  assert.equal(final.outcome, 'timeout'); assert.equal(final.final_answer, null);
});
