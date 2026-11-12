import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectManual } from '../manual-runner.mjs';
import { FAMILY } from '../model-family.mjs';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const normal = (overrides = {}) => ({ outcome: 'complete', cleanup_ok: true, actor_mutations_dispatched: 1,
  action_count: 1, duration_ms: 100, actor_duration_ms: 90, cleanup_duration_ms: 10, usage: null, error: null, ...overrides });
// Provider availability failures earn one fresh rerun; the others need an operator.
const AVAILABILITY = [['quota', 'usage_limit_reached'], ['rate_limit', 'HTTP429 rate_limit exceeded'], ['transport', 'connection refused after dispatch']];
const OPERATOR = [['authentication', 'Authentication invalid token'], ['configuration', 'Invalid model configuration']];

async function fixture(t, count = 1) {
  const runDir = await mkdtemp(path.join(tmpdir(), 'manual-collector-test-'));
  t.after(() => rm(runDir, { recursive: true, force: true }));
  const state = { initialized: 0, closed: 0, circuit: [], writes: [], drives: [] };
  const dependencies = {
    keeper: { async initialize() { state.initialized++; }, async close() { state.closed++; } },
    fingerprint: async () => ({ fixture: 'immutable-sources' }),
    circuit: async (action, data) => { state.circuit.push({ action, data }); return { allowed: true, ready: true, family: FAMILY, generation: 0 }; },
    writeV2: async ({ task }) => { state.writes.push(task.task_id); return { dir: 'fake-export', warnings: [] }; },
    validate: async () => ({ ok: true, errors: [] }),
    drive: async options => { state.drives.push(options.task.task_id); await options.beforeSpawn(); return normal(); },
  };
  const options = { runDir, tasks: Array.from({ length: count }, (_, i) => ({ task_id: `task_${i}`, website: 'https://fixture.test/', confirmed_task: `Goal ${i}` })),
    concurrency: 1, serverCommand: ['fake', '/fixture/build/index.js'], source: { sha256: 'dataset' },
    circuitState: path.join(runDir, 'circuit.json'), dependencies };
  return { runDir, state, dependencies, options, run: extra => collectManual({ ...options, ...extra }) };
}

test('collector keeps ten slots bounded and checkpoints every task once', async t => {
  const f = await fixture(t, 13), ten = deferred(), release = deferred();
  let active = 0, maximum = 0, admissions = 0;
  f.dependencies.drive = async options => {
    f.state.drives.push(options.task.task_id);
    assert.equal((await options.beforeSpawn()).allowed, true); admissions++;
    active++; maximum = Math.max(maximum, active); if (active === 10) ten.resolve();
    await release.promise; active--; return normal();
  };
  const work = f.run({ concurrency: 10 });
  await ten.promise; assert.equal(maximum, 10); release.resolve();
  const { manifest } = await work;
  assert.equal(maximum, 10); assert.equal(admissions, 13);
  assert.equal(manifest.collection_complete, true); assert.equal(manifest.outcomes.length, 13);
  assert.equal(new Set(f.state.drives).size, 13); assert.deepEqual(manifest.active_task_ids, []);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.runDir, 'manifest.json'))), manifest);
  assert.equal(f.state.closed, 1); await assert.rejects(stat(path.join(f.runDir, '.lock')), { code: 'ENOENT' });
});

test('a normal task timeout neither opens the model circuit nor replays on resume', async t => {
  const f = await fixture(t);
  f.dependencies.drive = async options => { f.state.drives.push(options.task.task_id); await options.beforeSpawn(); return normal({ outcome: 'timeout', error: 'Task walltime timeout after browser queue wait' }); };
  const first = await f.run();
  assert.equal(first.manifest.outcomes[0].outcome, 'timeout');
  assert.equal(f.state.circuit.some(x => x.action === 'failure'), false);
  await f.run({ resume: true }); assert.equal(f.state.drives.length, 1);
});

test('provider failure after mutation stays unresolved even for the last task and cannot replay after reset', async t => {
  // Authentication and configuration failures stay unresolved at once; an
  // availability failure does once its single fresh rerun is also interrupted.
  for (const [kind, error] of [...OPERATOR, ...AVAILABILITY]) await t.test(kind, async t => {
    const f = await fixture(t), raws = [], originalFinals = [];
    f.dependencies.drive = async options => {
      f.state.drives.push(options.task.task_id); await options.beforeSpawn(); raws.push(options.rawDir);
      const final = normal({ outcome: 'error', model_spawn_requested: true, error });
      originalFinals.push(JSON.stringify(final)); await mkdir(options.rawDir, { recursive: true });
      await writeFile(path.join(options.rawDir, 'final.json'), originalFinals.at(-1));
      await writeFile(path.join(options.rawDir, 'steps.jsonl'), '{"tool":"click","execution_outcome":"reported_success"}\n');
      return final;
    };
    const retried = AVAILABILITY.some(([name]) => name === kind), attempts = retried ? 2 : 1;
    let { manifest } = await f.run();
    if (retried) {
      assert.equal(manifest.state, 'waiting_for_model'); assert.equal(manifest.attempts[0].provider_retry.kind, kind);
      ({ manifest } = await f.run({ resume: true }));
    }
    const attempt = manifest.attempts.at(-1);
    assert.equal(manifest.state, 'paused_health'); assert.equal(manifest.collection_complete, false);
    assert.equal(manifest.last_block.code, 'PROVIDER_INTERRUPTED_AFTER_MUTATION');
    assert.equal(manifest.outcomes.length, 0); assert.equal(f.state.writes.length, 0);
    assert.equal(manifest.attempts.length, attempts); assert.equal(attempt.consumes_attempt, true);
    assert.equal(attempt.index, attempts); assert.equal(attempt.logical_attempt, attempts);
    assert.equal(attempt.infrastructure_pending, true); assert.equal(attempt.requires_task_recovery, true);
    assert.equal(attempt.retryable_before_mutation, false); assert.equal(attempt.provider_interruption.kind, kind);
    assert.equal(attempt.provider_retry, undefined);
    assert.equal(attempt.final.outcome, 'error'); assert.equal(attempt.final.error, error);
    assert.deepEqual(f.state.circuit.filter(row => row.action === 'failure').map(row => row.data.kind), Array(attempts).fill(kind));
    for (const [index, raw] of raws.entries()) assert.equal(await readFile(path.join(raw, 'final.json'), 'utf8'), originalFinals[index]);
    const circuitCalls = f.state.circuit.length;
    // The fake provider is already ready. Editing only the run state must not
    // turn a previously mutated task into a fresh infrastructure attempt.
    manifest.state = 'running'; manifest.last_block = null;
    await writeFile(path.join(f.runDir, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(f.run({ resume: true }), /PROVIDER_INTERRUPTED_AFTER_MUTATION/);
    assert.equal(f.state.drives.length, attempts); assert.equal(f.state.circuit.length, circuitCalls);
    for (const [index, raw] of raws.entries()) assert.equal(await readFile(path.join(raw, 'final.json'), 'utf8'), originalFinals[index]);
  });
});

test('a first availability interruption after mutation is retained unscored and reruns once as attempt 2', async t => {
  for (const [kind, error] of AVAILABILITY) await t.test(kind, async t => {
    const f = await fixture(t); let originalFinal;
    f.dependencies.drive = async options => {
      f.state.drives.push(options.attemptId); await options.beforeSpawn();
      if (options.attemptId !== 'attempt-1') return normal();
      const final = normal({ outcome: 'error', model_spawn_requested: true, error });
      originalFinal = JSON.stringify(final); await mkdir(options.rawDir, { recursive: true });
      await writeFile(path.join(options.rawDir, 'final.json'), originalFinal);
      return final;
    };
    const first = (await f.run()).manifest, interrupted = first.attempts[0], retry = interrupted.provider_retry;
    assert.equal(first.state, 'waiting_for_model'); assert.equal(first.collection_complete, false);
    assert.equal(first.outcomes.length, 0); assert.equal(f.state.writes.length, 0);
    assert.equal(interrupted.consumes_attempt, true); assert.equal(interrupted.requires_task_recovery, undefined);
    assert.equal(interrupted.infrastructure_pending, undefined); assert.equal(interrupted.provider_interruption, undefined);
    assert.equal(retry.code, 'PROVIDER_INTERRUPTED_RETRY'); assert.equal(retry.kind, kind); assert.equal(retry.error, error);
    assert.equal(retry.raw_dir, interrupted.raw_dir); assert.ok(Number.isFinite(Date.parse(retry.detected_at)));
    assert.match(retry.policy, /excluded from scoring/);
    assert.deepEqual(first.last_block, { state: 'waiting_for_model', task_id: 'task_0', detail: retry });
    assert.deepEqual(f.state.circuit.map(row => row.action), ['status', 'admit', 'failure']);
    assert.equal(f.state.circuit[2].data.kind, kind); assert.equal(f.state.circuit[2].data.error, error);
    assert.deepEqual(JSON.parse(await readFile(path.join(f.runDir, 'manifest.json'))).attempts[0].provider_retry, retry);
    const second = (await f.run({ resume: true })).manifest, rerun = second.attempts[1];
    assert.deepEqual(f.state.drives, ['attempt-1', 'attempt-2']);
    assert.equal(second.state, 'collected'); assert.equal(second.collection_complete, true);
    assert.equal(second.attempts.length, 2); assert.equal(rerun.index, 2); assert.equal(rerun.logical_attempt, 2);
    assert.equal(rerun.raw_dir, path.join(f.runDir, 'raw', 'task_0', 'attempt-2'));
    assert.equal(second.outcomes.length, 1); assert.equal(second.outcomes[0].selected_attempt, 2);
    assert.equal(second.outcomes[0].raw_dir, rerun.raw_dir); assert.deepEqual(f.state.writes, ['task_0']);
    assert.deepEqual(second.attempts[0], interrupted);
    assert.equal(await readFile(path.join(interrupted.raw_dir, 'final.json'), 'utf8'), originalFinal);
    assert.equal(f.state.circuit.at(-1).action, 'success');
    await f.run({ resume: true }); assert.equal(f.state.drives.length, 2);
  });
});

test('only the first consuming attempt earns a provider rerun', async t => {
  await t.test('a denied admission before it does not spend the rerun', async t => {
    const f = await fixture(t); let denyNextAdmission = true;
    f.dependencies.circuit = async (action, data) => {
      f.state.circuit.push({ action, data });
      if (action === 'admit' && denyNextAdmission) { denyNextAdmission = false; return { allowed: false }; }
      return { allowed: true, ready: true };
    };
    f.dependencies.drive = async options => {
      f.state.drives.push(options.attemptId);
      if (!(await options.beforeSpawn()).allowed) return normal({ outcome: 'provider_pending', actor_mutations_dispatched: 0 });
      return options.attemptId === 'attempt-2' ? normal({ outcome: 'error', model_spawn_requested: true, error: 'usage_limit_reached' }) : normal();
    };
    assert.equal((await f.run()).manifest.attempts[0].consumes_attempt, false);
    const retried = (await f.run({ resume: true })).manifest;
    assert.equal(retried.state, 'waiting_for_model'); assert.equal(retried.attempts[1].logical_attempt, 1);
    assert.equal(retried.attempts[1].provider_retry.kind, 'quota'); assert.equal(retried.attempts[1].requires_task_recovery, undefined);
    const { manifest } = await f.run({ resume: true });
    assert.equal(manifest.collection_complete, true); assert.equal(manifest.outcomes[0].selected_attempt, 3);
    assert.equal(manifest.attempts[2].logical_attempt, 2); assert.deepEqual(f.state.drives, ['attempt-1', 'attempt-2', 'attempt-3']);
  });
  await t.test('a spent pre-mutation retry leaves none for a later availability interruption', async t => {
    const f = await fixture(t);
    f.dependencies.drive = async options => {
      f.state.drives.push(options.attemptId); await options.beforeSpawn();
      return options.attemptId === 'attempt-1' ? normal({ outcome: 'never_started', actor_mutations_dispatched: 0, error: 'usage_limit_reached' })
        : normal({ outcome: 'error', model_spawn_requested: true, error: 'usage_limit_reached' });
    };
    assert.equal((await f.run()).manifest.attempts[0].retryable_before_mutation, true);
    const { manifest } = await f.run({ resume: true }), attempt = manifest.attempts[1];
    assert.equal(manifest.state, 'paused_health'); assert.equal(manifest.last_block.code, 'PROVIDER_INTERRUPTED_AFTER_MUTATION');
    assert.equal(attempt.logical_attempt, 2); assert.equal(attempt.provider_retry, undefined);
    assert.equal(attempt.requires_task_recovery, true); assert.equal(attempt.provider_interruption.kind, 'quota');
    assert.equal(manifest.outcomes.length, 0); assert.equal(f.state.writes.length, 0);
    await assert.rejects(f.run({ resume: true }), /PROVIDER_INTERRUPTED_AFTER_MUTATION/);
    assert.deepEqual(f.state.drives, ['attempt-1', 'attempt-2']);
  });
});

test('provider interruption drains existing actors without refilling slots or selecting the interrupted task', async t => {
  for (const [kind, error, state] of [['quota', 'usage_limit_reached', 'waiting_for_model'], ['configuration', 'Invalid model configuration', 'paused_health']]) await t.test(kind, async t => {
    const f = await fixture(t, 3), second = deferred(), failed = deferred(), finish = deferred();
    let settled = false;
    f.dependencies.circuit = async (action, data) => {
      f.state.circuit.push({ action, data }); if (action === 'failure') failed.resolve();
      return { allowed: true, ready: true };
    };
    f.dependencies.drive = async options => {
      f.state.drives.push(options.task.task_id); await options.beforeSpawn();
      if (options.task.task_id === 'task_0') { await second.promise; return normal({ outcome: 'error', error, model_spawn_requested: true }); }
      second.resolve(); await finish.promise; return normal();
    };
    const work = f.run({ concurrency: 2 }).then(result => { settled = true; return result; });
    try {
      await failed.promise; await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(settled, false); assert.equal(f.state.closed, 0);
      assert.ok((await stat(path.join(f.runDir, '.lock'))).isFile());
    } finally { finish.resolve(); }
    const { manifest } = await work, interrupted = manifest.attempts.filter(attempt => attempt.task_id === 'task_0');
    assert.deepEqual(f.state.drives.sort(), ['task_0', 'task_1']);
    assert.deepEqual(f.state.writes, ['task_1']); assert.equal(f.state.closed, 1);
    assert.deepEqual(manifest.outcomes.map(row => row.task_id), ['task_1']);
    assert.equal(manifest.state, state); assert.equal(manifest.collection_complete, false);
    assert.equal(interrupted.length, 1); assert.equal(f.state.circuit.find(row => row.action === 'failure').data.kind, kind);
    if (kind === 'quota') {
      assert.equal(interrupted[0].provider_retry.kind, 'quota'); assert.equal(interrupted[0].requires_task_recovery, undefined);
    } else {
      assert.equal(interrupted[0].requires_task_recovery, true); assert.equal(interrupted[0].provider_retry, undefined);
    }
  });
});

test('unresolved mutation is checkpointed before circuit reporting even if that reporting fails', async t => {
  for (const [name, error, unresolvedAttempt] of [['configuration', 'Invalid model configuration', 1],
    ['second availability interruption', 'usage_limit_reached', 2]]) await t.test(name, async t => {
    const f = await fixture(t); let checkpointed = false;
    f.dependencies.circuit = async action => {
      if (action === 'failure' && f.state.drives.length === unresolvedAttempt) {
        const saved = JSON.parse(await readFile(path.join(f.runDir, 'manifest.json')));
        checkpointed = saved.attempts.at(-1).requires_task_recovery === true && saved.outcomes.length === 0;
        throw new Error('Circuit journal is unavailable');
      }
      return { allowed: true, ready: true };
    };
    f.dependencies.drive = async options => {
      f.state.drives.push(options.task.task_id); await options.beforeSpawn();
      return normal({ outcome: 'error', model_spawn_requested: true, error });
    };
    if (unresolvedAttempt === 2) assert.equal((await f.run()).manifest.attempts[0].provider_retry.kind, 'quota');
    const { manifest } = await f.run({ resume: unresolvedAttempt === 2 });
    assert.equal(checkpointed, true); assert.equal(manifest.outcomes.length, 0);
    assert.equal(manifest.attempts.length, unresolvedAttempt);
    assert.equal(manifest.attempts.at(-1).requires_task_recovery, true); assert.equal(f.state.writes.length, 0);
    assert.equal(manifest.state, 'paused_health'); assert.equal(manifest.collection_complete, false);
    manifest.state = 'waiting_for_model'; await writeFile(path.join(f.runDir, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(f.run({ resume: true }), /PROVIDER_INTERRUPTED_AFTER_MUTATION/);
    assert.equal(f.state.drives.length, unresolvedAttempt);
  });
});

test('a provider rerun whose circuit report fails pauses for health instead of waiting for the model', async t => {
  const f = await fixture(t);
  f.dependencies.circuit = async (action, data) => {
    f.state.circuit.push({ action, data });
    if (action === 'failure') throw new Error('Circuit journal is unavailable');
    return { allowed: true, ready: true };
  };
  f.dependencies.drive = async options => {
    f.state.drives.push(options.task.task_id); await options.beforeSpawn();
    return normal({ outcome: 'error', model_spawn_requested: true, error: 'usage_limit_reached' });
  };
  const { manifest } = await f.run(), saved = JSON.parse(await readFile(path.join(f.runDir, 'manifest.json')));
  assert.equal(manifest.state, 'paused_health'); assert.equal(manifest.collection_complete, false);
  assert.deepEqual(manifest.worker_errors, [{ error: 'Circuit journal is unavailable', code: null }]);
  assert.equal(saved.state, 'paused_health'); assert.equal(saved.attempts[0].provider_retry.kind, 'quota');
  assert.equal(saved.outcomes.length, 0); assert.equal(f.state.writes.length, 0);
  await assert.rejects(f.run({ resume: true }), /Health gate requires repair/);
  assert.equal(f.state.drives.length, 1);
});

test('a stop discovered during another admission prevents that queued actor spawn and abandons its permit', async t => {
  const f = await fixture(t, 3), pendingAdmission = deferred(), releaseAdmission = deferred(), quota = deferred();
  const queuedPermit = { allowed: true, family: FAMILY, generation: 4, probe_token: 'queued-not-spawned' }, spawned = [];
  f.dependencies.circuit = async (action, data) => {
    f.state.circuit.push({ action, data });
    if (action === 'admit' && data.scope === 'actor:task_1') {
      pendingAdmission.resolve(); await releaseAdmission.promise; return queuedPermit;
    }
    if (action === 'failure') quota.resolve();
    return { allowed: true, ready: true, family: FAMILY, generation: 4 };
  };
  f.dependencies.drive = async options => {
    f.state.drives.push(options.task.task_id);
    const admission = await options.beforeSpawn();
    if (options.task.task_id === 'task_0') {
      assert.equal(admission.allowed, true); spawned.push(options.task.task_id);
      await pendingAdmission.promise;
      return normal({ outcome: 'error', error: 'usage_limit_reached', model_spawn_requested: true });
    }
    assert.equal(admission.allowed, false);
    return normal({ outcome: 'provider_pending', model_spawn_requested: false, actor_mutations_dispatched: 0, action_count: 0 });
  };
  const work = f.run({ concurrency: 2 });
  await quota.promise; releaseAdmission.resolve();
  const { manifest } = await work;
  assert.deepEqual(spawned, ['task_0']); assert.deepEqual(f.state.drives.sort(), ['task_0', 'task_1']);
  assert.deepEqual(f.state.circuit.find(row => row.action === 'abandon').data.permit, queuedPermit);
  assert.equal(manifest.outcomes.length, 0); assert.equal(manifest.collection_complete, false);
  assert.equal(manifest.state, 'waiting_for_model');
  assert.equal(manifest.attempts.find(attempt => attempt.task_id === 'task_0').provider_retry.kind, 'quota');
  assert.equal(manifest.attempts.find(attempt => attempt.task_id === 'task_1').consumes_attempt, false);
});

test('browser operational faults cannot be classified as provider configuration or quota failures', async t => {
  for (const health of [{ queue_expiries: 1 }, { fault: { code: 'FRAME_HASH_MISMATCH' } },
    { uncertain_upstream: true }, { cleanup_ok: false, cleanup_error: 'Close not verified' }]) {
    const f = await fixture(t, 2);
    f.dependencies.drive = async options => {
      f.state.drives.push(options.task.task_id); await options.beforeSpawn();
      return normal({ outcome: 'error', model_spawn_requested: true, error: 'usage_limit_reached or unknown configuration', ...health });
    };
    const { manifest } = await f.run();
    assert.equal(manifest.state, 'paused_health'); assert.equal(f.state.drives.length, 1);
    assert.equal(f.state.circuit.some(row => row.action === 'failure' || row.action === 'success'), false);
    assert.equal(manifest.attempts[0].requires_task_recovery, undefined); assert.equal(manifest.attempts[0].provider_retry, undefined);
  }
});

test('unverified cleanup blocks slot refill and every resume without replaying the normal task', async t => {
  const f = await fixture(t, 2);
  f.dependencies.drive = async options => { f.state.drives.push(options.task.task_id); await options.beforeSpawn(); return normal({ outcome: 'timeout', cleanup_ok: false, cleanup_error: 'Primary close timed out' }); };
  const { manifest } = await f.run();
  assert.equal(manifest.state, 'paused_health'); assert.equal(f.state.drives.length, 1);
  assert.equal(manifest.outcomes[0].outcome, 'timeout'); assert.equal(manifest.attempts[0].final.cleanup_ok, false);
  await assert.rejects(f.run({ resume: true }), /unverified owned cleanup/i);
  assert.equal(f.state.drives.length, 1);
});

test('a pre-mutation infrastructure failure consumes the single remaining retry', async t => {
  const f = await fixture(t);
  let calls = 0;
  f.dependencies.drive = async options => { await options.beforeSpawn(); return ++calls === 1
    ? normal({ outcome: 'never_started', actor_mutations_dispatched: 0, error: 'usage_limit_reached' }) : normal(); };
  const first = await f.run();
  assert.equal(first.manifest.state, 'waiting_for_model'); assert.equal(first.manifest.outcomes.length, 0);
  assert.equal(first.manifest.attempts[0].retryable_before_mutation, true);
  const second = await f.run({ resume: true });
  assert.equal(second.manifest.outcomes[0].selected_attempt, 2); assert.equal(second.manifest.attempts.length, 2);
  assert.equal(second.manifest.attempts[1].logical_attempt, 2); assert.equal(calls, 2);
  await f.run({ resume: true }); assert.equal(calls, 2);
});

test('two actual pre-mutation failures exhaust the cap without a third model call', async t => {
  const f = await fixture(t); let calls = 0;
  f.dependencies.drive = async options => { calls++; await options.beforeSpawn(); return normal({ outcome: 'never_started', actor_mutations_dispatched: 0, error: 'usage_limit_reached' }); };
  await f.run(); await f.run({ resume: true }); const third = await f.run({ resume: true });
  assert.equal(calls, 2); assert.equal(third.manifest.state, 'paused_health');
  assert.match(third.manifest.last_block.detail, /retry exhausted/i);
});

test('a denied pre-spawn permit preserves its raw directory but consumes no model attempt', async t => {
  const f = await fixture(t); let ready = false, calls = 0;
  f.dependencies.circuit = async action => action === 'admit' ? { allowed: ready } : { ready: true, allowed: true };
  f.dependencies.drive = async options => { const permit = await options.beforeSpawn(); if (!permit.allowed) return normal({ outcome: 'provider_pending', actor_mutations_dispatched: 0 }); calls++; return normal(); };
  await f.run(); ready = true;
  const { manifest } = await f.run({ resume: true });
  assert.equal(calls, 1); assert.equal(manifest.attempts.length, 2);
  assert.equal(manifest.attempts[0].consumes_attempt, false); assert.equal(manifest.attempts[1].logical_attempt, 1);
  assert.equal(manifest.outcomes[0].selected_attempt, 2);
});

test('provider-pending does not conceal failed owned cleanup', async t => {
  const f = await fixture(t, 2);
  f.dependencies.drive = async () => normal({ outcome: 'provider_pending', actor_mutations_dispatched: 0, cleanup_ok: false, cleanup_error: 'Owned inventory unavailable' });
  const { manifest } = await f.run();
  assert.equal(manifest.state, 'paused_health'); assert.equal(manifest.collection_complete, false);
  await assert.rejects(f.run({ resume: true }), /unverified owned cleanup/i);
});

test('a quota discovered during preparation prevents all queued actor spawns', async t => {
  const f = await fixture(t, 10), opened = deferred(); let unavailable = false, spawned = 0;
  f.dependencies.circuit = async (action, data) => {
    f.state.circuit.push({ action, data });
    if (action === 'failure') { unavailable = true; opened.resolve(); }
    return { allowed: !unavailable, ready: !unavailable, generation: unavailable ? 1 : 0 };
  };
  f.dependencies.drive = async options => {
    if (options.task.task_id !== 'task_0') await opened.promise;
    const permit = await options.beforeSpawn();
    if (!permit.allowed) return normal({ outcome: 'provider_pending', actor_mutations_dispatched: 0 });
    spawned++; return normal({ outcome: 'never_started', actor_mutations_dispatched: 0, error: 'usage_limit_reached' });
  };
  const { manifest } = await f.run({ concurrency: 10 });
  assert.equal(spawned, 1); assert.equal(manifest.state, 'waiting_for_model'); assert.equal(manifest.outcomes.length, 0);
  assert.equal(manifest.attempts.filter(x => x.consumes_attempt).length, 1);
});

test('resume rejects any changed frozen source, task IDs or model configuration', async t => {
  const f = await fixture(t); await f.run();
  for (const changes of [{ model: 'different-model' }, { source: { sha256: 'changed' } }, { tasks: [{ ...f.options.tasks[0], task_id: 'other' }] }]) {
    await assert.rejects(f.run({ resume: true, ...changes }), /different frozen configuration/);
    await assert.rejects(stat(path.join(f.runDir, '.lock')), { code: 'ENOENT' });
  }
  assert.equal(f.state.drives.length, 1);
});

test('malformed existing manifest bytes cannot be overwritten as a new run', async t => {
  const f = await fixture(t), file = path.join(f.runDir, 'manifest.json');
  const malformed = '{"preserve_this_history":'; await writeFile(file, malformed);
  await assert.rejects(f.run());
  assert.equal(await readFile(file, 'utf8'), malformed); assert.equal(f.state.drives.length, 0);
  assert.equal(f.state.closed, 1); await assert.rejects(stat(path.join(f.runDir, '.lock')), { code: 'ENOENT' });
});

test('checkpoint failure still closes the keeper and releases the collection lock', async t => {
  const f = await fixture(t), file = path.join(f.runDir, 'manifest.json');
  f.dependencies.keeper.initialize = async () => { await rm(file); await mkdir(file); };
  await assert.rejects(f.run());
  assert.equal(f.state.closed, 1); await assert.rejects(stat(path.join(f.runDir, '.lock')), { code: 'ENOENT' });
});

test('an unexpected worker failure drains existing actors before keeper or lock release', async t => {
  const f = await fixture(t, 2), second = deferred(), failed = deferred(), release = deferred();
  let settled = false;
  f.dependencies.drive = async options => {
    await options.beforeSpawn();
    if (options.task.task_id === 'task_0') { await second.promise; failed.resolve(); throw new Error('Unexpected final artifact write failure'); }
    second.resolve(); await release.promise; return normal();
  };
  const work = f.run({ concurrency: 2 }).then(value => { settled = true; return value; }, error => { settled = true; return { error }; });
  try {
    await failed.promise; await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(settled, false, 'The other actor still owns an active attempt');
    assert.equal(f.state.closed, 0); assert.ok((await stat(path.join(f.runDir, '.lock'))).isFile());
  } finally { release.resolve(); await work; }
  assert.equal(f.state.closed, 1); await assert.rejects(stat(path.join(f.runDir, '.lock')), { code: 'ENOENT' });
});

test('admitted but unspawned actors abandon the exact permit before preserving a nonconsuming attempt', async t => {
  const f = await fixture(t), permit = { family: FAMILY, generation: 7, probe_token: 'half-open-probe' };
  const calls = [];
  f.dependencies.circuit = async (action, data) => {
    calls.push({ action, data });
    return action === 'admit' ? { allowed: true, permit } : { allowed: true, ready: true };
  };
  f.dependencies.drive = async options => {
    assert.deepEqual(await options.beforeSpawn(), { allowed: true, permit });
    return normal({ outcome: 'provider_pending', actor_mutations_dispatched: 0, model_spawn_requested: false });
  };
  const { manifest } = await f.run();
  assert.deepEqual(calls.map(x => x.action), ['status', 'admit', 'abandon']);
  assert.deepEqual(calls.at(-1).data, { permit });
  assert.equal(manifest.attempts[0].consumes_attempt, false); assert.equal(manifest.outcomes.length, 0);
  assert.equal(manifest.state, 'waiting_for_model'); assert.equal(f.state.writes.length, 0);
});

test('simultaneous graceful drain and failed cleanup preserve the health blocker', async t => {
  const f = await fixture(t, 2); let draining = false, calls = 0;
  f.dependencies.drive = async options => {
    calls++; await options.beforeSpawn(); draining = true;
    return normal({ outcome: 'timeout', cleanup_ok: false, cleanup_error: 'Owned child absence is unverified' });
  };
  const { manifest } = await f.run({ shouldStop: () => draining });
  assert.equal(calls, 1); assert.equal(manifest.state, 'paused_health'); assert.equal(manifest.collection_complete, false);
  assert.match(manifest.last_block.detail, /absence is unverified/);
  assert.equal(manifest.attempts[0].final.cleanup_ok, false);
});
