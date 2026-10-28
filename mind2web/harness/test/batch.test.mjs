import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { options, runBench } from '../run-bench.mjs';
import { preflight } from '../preflight.mjs';
import { localHfToken, DATASET_REV } from '../dataset.mjs';
import { atomicJson, acquireRunLock, failureClass } from '../run-state.mjs';
import { encodeSolidPng } from '../png.mjs';
import { runJudgeJobs, JUDGE_PROTOCOL } from '../judge-jobs.mjs';
import { MODEL, EFFORT, JUDGE_ENGINE, CLAUDE_CLI } from '../model-family.mjs';

function tasks(count = 2) {
  return Array.from({ length: count }, (_, i) => ({ task_id: (i + 1).toString(16).padStart(32, '0'),
    confirmed_task: `Find product ${i + 1}.`, website: 'https://store.example/', reference_length: 1, level: 'easy' }));
}
async function fixture(t, count = 2) {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'om2w-batch-test-'));
  t.after(() => rm(resultsDir, { recursive: true, force: true }));
  const o = options(['--run-id', 'test', '--driver', 'codex', '--browser', 'existing', '--count', String(count)]);
  const observed = { calls: [], hubs: 0, closed: 0 };
  const deps = { resultsDir, loadTasks: async () => ({ tasks: tasks(count), source: { sha256: 'fixture', revision: DATASET_REV, path: '/fixture' } }),
    preflight: async () => ({ ok: true, checks: [] }), runCommand: async () => ({ code: 0, stdout: 'frozen-commit', stderr: '' }),
    createHub: () => ({ initialize: async () => { observed.hubs++; }, close: async () => { observed.closed++; } }),
    drivers: { codex: async args => { observed.calls.push(args.task.task_id); return completedAttempt(args); } }, wait: async () => {} };
  return { o, deps, observed, runDir: path.join(resultsDir, 'test') };
}
async function completedAttempt({ task, rawDir }, outcome = 'complete') {
  const shot = path.join(rawDir, 'shots/0000.png');
  await mkdir(path.dirname(shot), { recursive: true });
  await writeFile(shot, encodeSolidPng(32, 32));
  await writeFile(path.join(rawDir, 'steps.jsonl'), JSON.stringify({ seq: 0, kind: 'bootstrap', tool: 'open_tab', args: { url: task.website },
    ok: true, url: task.website, screenshot_path: shot }) + '\n');
  const final = { outcome, final_answer: outcome === 'complete' ? '$19.99' : null, error: outcome === 'complete' ? null : 'Task timed out',
    action_count: 0, duration_ms: 5, usage: { input_tokens: 10, output_tokens: 2 }, cleanup_ok: true };
  await atomicJson(path.join(rawDir, 'final.json'), final);
  return final;
}

// Stands in for the Python judge: checks the pinned arguments and writes the
// summary a successful job leaves behind.
function fakeJudgeRun(runDir, observed, expected = 1) {
  return async (_command, args) => {
    const engine = args[args.indexOf('--engine') + 1], variant = args[args.indexOf('--variant') + 1], pass = args[args.indexOf('--pass_number') + 1];
    observed.push(`${engine}-${variant}-${pass}`);
    assert.equal(engine, JUDGE_ENGINE); assert.equal(args[args.indexOf('--cli') + 1], CLAUDE_CLI);
    assert.equal(args[args.indexOf('--model') + 1], MODEL); assert.equal(args[args.indexOf('--effort') + 1], EFFORT);
    assert.equal(args[args.indexOf('--num_workers') + 1], '10');
    assert.equal(args[args.indexOf('--engine-concurrency') + 1], '10');
    assert.equal(args[args.indexOf('--judge-protocol') + 1], JUDGE_PROTOCOL);
    const summary = { expected, successes: 0, errors: 0, pending_judgments: 0, infrastructure_errors: 0,
      judge_protocol: JUDGE_PROTOCOL, workers: 10, engine_concurrency: 10, global_cli_limit: 10 };
    await atomicJson(path.join(runDir, 'judge', `${engine}-${variant}-pass${pass}`, 'summary.json'), summary);
    return { code: 0, stdout: JSON.stringify(summary), stderr: '' };
  };
}

test('Codex and existing-browser options are explicit and validated', () => {
  const o = options(['--driver', 'codex', '--browser', 'existing']);
  assert.equal(o.model, 'gpt-6.1-sol'); assert.equal(o['max-actions'], '60');
  for (const args of [['--driver', 'other'], ['--browser', 'other'], ['--max-actions', '0'], ['--judge-passes', '0']]) assert.throws(() => options(args));
});
test('existing-browser preflight permits an occupied hub and requires Ext: yes', async () => {
  const calls = [];
  const args = { browserMode: 'existing', driver: 'codex', checkDataset: false, filesystem: async () => ({ bavail: 100, bsize: 1e9 }),
    serverCommand: ['node', '/fixture/index.js', 'stdio'], run: async (command, argv) => {
      calls.push([command, argv]); return { code: 0, stdout: argv.includes('status') ? 'Mode: relay\nExt: yes\nHub: yes' : 'Codex version', stderr: '' };
    } };
  assert.equal((await preflight(args)).ok, true);
  assert.ok(calls.every(([command]) => command !== 'lsof' && command !== 'claude'));
  const offline = await preflight({ ...args, run: async () => ({ code: 0, stdout: 'Ext: no', stderr: '' }) });
  assert.equal(offline.checks.find(c => c.name === 'extension').ok, false);
});
test('local Hugging Face login files are read without exposing the token', async t => {
  const f = await fixture(t);
  const tokenPath = path.join(f.deps.resultsDir, 'local-token');
  await writeFile(tokenPath, ' local-test-token\n');
  assert.equal(await localHfToken({ HF_TOKEN_PATH: tokenPath }), 'local-test-token');
  assert.equal(await localHfToken({ HF_TOKEN: ' environment-token ' }), 'environment-token');
});
test('missing official dataset keeps all 300 tasks pending without opening a tab or calling a model', async t => {
  const { o, deps, observed, runDir } = await fixture(t);
  o.tasks = 'all'; deps.loadTasks = async () => { throw new Error('Hugging Face HTTP 401'); };
  const { manifest } = await runBench(o, deps);
  assert.equal(manifest.state, 'waiting_for_dataset'); assert.equal(manifest.expected, 300);
  assert.equal(manifest.outcomes.length, 0); assert.equal(observed.hubs, 1); assert.equal(observed.closed, 1); assert.equal(observed.calls.length, 0);
  assert.equal(JSON.parse(await readFile(path.join(runDir, 'summary.json'))).expected, 300);
});
test('full benchmark rejects any dataset other than 300 tasks before browser actions', async t => {
  const { o, deps, observed } = await fixture(t); o.tasks = 'all';
  await assert.rejects(runBench(o, deps), /exactly 300/); assert.equal(observed.calls.length, 0);
});
test('all-task selection freezes exactly 300 IDs in dataset order before the first attempt', async t => {
  const { o, deps, observed, runDir } = await fixture(t, 300); o.tasks = 'all';
  const controller = new AbortController(); deps.signal = controller.signal;
  deps.drivers.codex = async args => {
    observed.calls.push(args.task.task_id);
    const ids = JSON.parse(await readFile(path.join(runDir, 'task-ids.json')));
    assert.deepEqual(ids, tasks(300).map(task => task.task_id));
    controller.abort(); return { outcome: 'rig_failure', error: 'Test interruption after selection verification' };
  };
  const { manifest } = await runBench(o, deps);
  assert.equal(manifest.expected, 300); assert.equal(manifest.pending_ids.length, 300); assert.equal(observed.calls.length, 1);
});
test('dataset wait advances automatically once local access becomes available', async t => {
  const { o, deps, observed } = await fixture(t, 1); o['wait-for-resources'] = true;
  const load = deps.loadTasks; let loads = 0;
  deps.loadTasks = async () => { if (++loads === 1) throw new Error('HTTP 401'); return load(); };
  const { manifest } = await runBench(o, deps);
  assert.equal(loads, 2); assert.equal(manifest.collection_complete, true); assert.equal(observed.calls.length, 1);
});
test('serial collection preserves normal failures and resume skips them and all browser setup', async t => {
  const { o, deps, observed } = await fixture(t);
  let busy = false;
  deps.drivers.codex = async args => {
    assert.equal(busy, false); busy = true; observed.calls.push(args.task.task_id);
    const persisted = JSON.parse(await readFile(path.join(deps.resultsDir, 'test/task-ids.json')));
    assert.equal(persisted.length, 2);
    const final = await completedAttempt(args, observed.calls.length === 1 ? 'timeout' : 'complete'); busy = false; return final;
  };
  const first = await runBench(o, deps);
  assert.equal(first.manifest.collection_complete, true); assert.equal(first.manifest.attempts.length, 2);
  assert.equal(first.manifest.exported, 2); assert.equal(first.manifest.outcomes[0].outcome, 'timeout');
  deps.preflight = async () => { throw new Error('Must not require browser for completed collection'); };
  const second = await runBench({ ...o, resume: true }, deps);
  assert.equal(second.manifest.attempts.length, 2); assert.equal(observed.calls.length, 2);
  assert.equal(observed.hubs, 1); assert.equal(observed.closed, 1);
  await assert.rejects(runBench({ ...o, resume: true, model: 'different-model' }, deps), /model changed/);
});
test('quota recovery waits for availability and preserves both attempts before one retry', async t => {
  const { o, deps, observed, runDir } = await fixture(t, 1); o['wait-for-resources'] = true;
  let probes = 0; deps.modelReady = async () => ({ ok: ++probes > 1 });
  deps.drivers.codex = async args => {
    observed.calls.push(args.task.task_id);
    return observed.calls.length === 1 ? { outcome: 'never_started', error: 'usage_limit_reached', usage: { input_tokens: 7 } } : completedAttempt(args);
  };
  const { manifest } = await runBench(o, deps);
  assert.equal(manifest.collection_complete, true); assert.equal(manifest.attempts.length, 2); assert.equal(probes, 2);
  assert.equal(manifest.attempts[0].failure_class, 'quota'); assert.equal(manifest.outcomes[0].selected_attempt, 2);
  assert.equal(JSON.parse(await readFile(path.join(runDir, 'summary.json'))).input_tokens, 17);
});
test('resuming a quota pause does not spend the infrastructure retry until a readiness probe passes', async t => {
  const { o, deps, observed } = await fixture(t, 1);
  deps.drivers.codex = async () => { observed.calls.push('quota'); return { outcome: 'error', error: 'You have hit your usage limit' }; };
  const first = await runBench(o, deps); assert.equal(first.manifest.state, 'waiting_for_quota');
  const controller = new AbortController(); deps.signal = controller.signal;
  deps.modelReady = async () => { controller.abort(); return { ok: false }; };
  const second = await runBench({ ...o, resume: true, 'wait-for-resources': true }, deps);
  assert.equal(second.manifest.outcomes.length, 0); assert.equal(second.manifest.attempts.length, 1); assert.equal(observed.calls.length, 1);
});
test('two infrastructure failures pause with no invented task verdict', async t => {
  const { o, deps } = await fixture(t, 1); o['wait-for-resources'] = true;
  deps.drivers.codex = async () => ({ outcome: 'rig_failure', error: 'extension disconnected' });
  const { manifest } = await runBench(o, deps);
  assert.equal(manifest.state, 'paused_retry_exhausted'); assert.equal(manifest.attempts.length, 2);
  assert.equal(manifest.outcomes.length, 0); assert.equal(manifest.pending_ids.length, 1);
});
test('an interrupted model call remains pending and retains partial evidence', async t => {
  const { o, deps } = await fixture(t, 1);
  const controller = new AbortController(); deps.signal = controller.signal;
  deps.drivers.codex = async args => { const result = await completedAttempt(args); controller.abort(); return result; };
  const { manifest } = await runBench(o, deps);
  assert.equal(manifest.outcomes.length, 0); assert.equal(manifest.attempts[0].failure_class, 'infrastructure');
  assert.equal(manifest.attempts[0].final.final_answer, null);
});
test('resume processes a saved completed attempt instead of invoking the model again', async t => {
  const { o, deps, observed, runDir } = await fixture(t, 1);
  deps.drivers.codex = async args => {
    observed.calls.push(args.task.task_id); await completedAttempt(args);
    throw new Error('Simulated controller exit after the model wrote final.json');
  };
  await assert.rejects(runBench(o, deps), /Simulated controller exit/);
  const unfinished = JSON.parse(await readFile(path.join(runDir, 'manifest.json')));
  assert.equal(unfinished.attempts[0].state, 'running'); assert.equal(unfinished.outcomes.length, 0);
  const { manifest } = await runBench({ ...o, resume: true }, deps);
  assert.equal(manifest.collection_complete, true); assert.equal(manifest.outcomes[0].selected_attempt, 1);
  assert.equal(observed.calls.length, 1);
});
test('run locks reject active owners and recover dead owners', async t => {
  const { runDir } = await fixture(t); await mkdir(runDir);
  const release = await acquireRunLock(runDir);
  await assert.rejects(acquireRunLock(runDir), /already active/); await release();
  await atomicJson(path.join(runDir, '.lock'), { pid: 2147483647 });
  const recovered = await acquireRunLock(runDir); await recovered();
  assert.equal(failureClass({ outcome: 'complete', cleanup_ok: false }), 'infrastructure');
  assert.equal(failureClass({ outcome: 'tool_violation' }), 'task');
});
test('six Claude jobs are sequential, capped at ten CLIs, and revalidate cached summaries on resume', async t => {
  const { runDir } = await fixture(t); await mkdir(runDir);
  const manifest = { task_ids: tasks(1).map(t => t.task_id), outcomes: [], source: {}, expected: 1, model: 'fixture', judge_protocol: 'scorefield-v2' };
  await atomicJson(path.join(runDir, 'task-ids.json'), manifest.task_ids);
  const observed = [];
  const run = fakeJudgeRun(runDir, observed);
  const first = await runJudgeJobs({ runDir, manifest, passes: 3, run });
  assert.equal(first.jobs.length, 6); assert.equal(first.complete, true);
  assert.equal(first.jobs.filter(j => j.status === 'complete').length, 6);
  assert.equal(JSON.parse(await readFile(path.join(runDir, 'judge-jobs.json'))).scope, `${JUDGE_ENGINE}_only`);
  assert.equal(observed.length, 6);
  await runJudgeJobs({ runDir, manifest, passes: 3, run });
  assert.equal(observed.length, 12);
});

test('a collected non-dry run judges under the pinned protocol', async t => {
  const { o, deps, runDir } = await fixture(t, 1);
  o.judge = true;
  const observed = [];
  deps.runJudgeJobs = args => runJudgeJobs({ ...args, run: fakeJudgeRun(runDir, observed) });
  const { manifest } = await runBench(o, deps);
  assert.equal(manifest.judge_protocol, JUDGE_PROTOCOL);
  assert.equal(manifest.collection_complete, true);
  assert.equal(manifest.state, 'complete');
  assert.equal(observed.length, 6);
  const jobs = JSON.parse(await readFile(path.join(runDir, 'judge-jobs.json'), 'utf8'));
  assert.equal(jobs.judge_protocol, JUDGE_PROTOCOL);
  assert.equal(jobs.jobs.filter(job => job.status === 'complete').length, 6);
});
