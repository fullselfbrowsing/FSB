import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './proc.mjs';
import { HTML } from './live-smoke.mjs';
import { runCodexTask } from './driver-codex.mjs';
import { writeV2 } from './v2-writer.mjs';
import { validateTrajectoryDir } from './validate-v2.mjs';

export async function codexSmoke({ outputDir, serverCommand } = {}) {
  outputDir = path.resolve(outputDir ?? path.join(REPO_ROOT, '.context/om2w', `codex-live-${Date.now()}`));
  if (existsSync(path.join(outputDir, 'manifest.json'))) throw new Error('Use a new output directory to retain previous evidence');
  await mkdir(outputDir, { recursive: true });
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(HTML); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const task = { task_id: '88888888888888888888888888888888', website: `http://127.0.0.1:${server.address().port}/`,
    confirmed_task: 'Filter the Widget Store to blue products using its color filter and Apply filters button. Read the filtered results and report the Blue Widget price.', reference_length: 3, level: 'easy' };
  await writeFile(path.join(outputDir, 'task-ids.json'), JSON.stringify([task.task_id]) + '\n');
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ synthetic: true, real_fsb: true, benchmark_result: false,
    driver: 'codex', model: 'gpt-6.1-sol', effort: 'medium', source: 'local Widget Store fixture', task }, null, 2) + '\n');
  const summary = { synthetic: true, benchmark_result: false, real_fsb: true, started_at: new Date().toISOString(), output_dir: outputDir };
  try {
    summary.final = await runCodexTask({ task, rawDir: path.join(outputDir, 'raw'), maxActions: 10, timeoutMs: 120_000,
      serverCommand: serverCommand ?? [process.execPath, path.join(homedir(), '.fsb/native-host/runtime/package/build/index.js'), 'stdio'] });
    assert.equal(summary.final.outcome, 'complete', summary.final.error);
    assert.equal(summary.final.cleanup_ok, true, summary.final.cleanup_error);
    assert.match(summary.final.final_answer, /19\.99/);
    const steps = (await readFile(path.join(outputDir, 'raw/steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(steps.some(step => step.tool === 'select_option' && step.args.value === 'blue' && step.ok));
    assert.ok(steps.some(step => step.tool === 'click' && step.ok));
    const written = await writeV2({ task, rawDir: path.join(outputDir, 'raw'), outDir: path.join(outputDir, 'trajectories') });
    summary.validation = await validateTrajectoryDir(written.dir);
    assert.ok(summary.validation.ok, summary.validation.errors.join('; '));
    summary.steps = written.steps;
    summary.ok = true;
  } catch (err) { summary.ok = false; summary.error = err.message; }
  finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    summary.ended_at = new Date().toISOString();
    await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { output: { type: 'string' } } });
  const summary = await codexSmoke({ outputDir: values.output });
  console.log(JSON.stringify(summary));
  if (!summary.ok) process.exitCode = 1;
}
