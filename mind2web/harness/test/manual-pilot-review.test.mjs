import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BENCH_ROOT } from '../proc.mjs';
import { fixedCanary } from '../manual-pilot.mjs';
import { encodeSolidPng } from '../png.mjs';
import { writeV2 } from '../v2-writer.mjs';
import { DEFAULT_PROFILE_PATH } from '../manual-live-gate.mjs';
import { writePilotCheckpointBundle, verifyPilotCheckpointBundle, recordPilotReview, verifyPilotReviewComplete } from '../manual-pilot-review.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => readFile(file, 'utf8').then(JSON.parse);
const save = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value) + '\n'); };

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'pilot-review-unit-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const spec = await json(path.join(BENCH_ROOT, 'config/browser-manual-v2-canary.json'));
  const tasks = spec.task_ids.map((task_id, index) => ({ task_id, confirmed_task: `Synthetic unit goal ${index}`, website: `https://site-${index}.test/`, reference_length: 2, level: 'easy' }));
  const selection = await fixedCanary(tasks), candidate = 2;
  const gate = { ok: true, selected_concurrency: candidate, fixed_sample_sha256: spec.task_ids_sha256, receipt_path: path.join(root, 'accepted-gate.json') };
  await save(gate.receipt_path, gate);
  const frames = [];
  for (const [phase, selected] of [['serial-a', selection.serialA], ['concurrent', tasks], ['serial-b', selection.serialB]]) {
    const directory = path.join(root, `concurrency-${candidate}`, phase), attempts = [], outcomes = [];
    for (const [index, task] of selected.entries()) {
      const raw = path.join(directory, 'raw', task.task_id, 'attempt-1'), shot = path.join(raw, 'shots/final.png');
      await mkdir(path.dirname(shot), { recursive: true });
      const bytes = encodeSolidPng(120, 100, [index * 15, phase === 'concurrent' ? 130 : 30, 70]); await writeFile(shot, bytes);
      const receipt = { task_id: task.task_id, attempt_id: 'attempt-1', frame_id: `unit-${phase}-${index}`, capture_id: `unit-native-${phase}-${index}`,
        tab_id: 100 + index, source_url: task.website, sha256: hash(bytes), byte_length: bytes.length,
        output_width: 120, output_height: 100, screenshot_path: shot };
      const step = { seq: 0, kind: 'bootstrap', tool: 'open_tab', args: { url: task.website }, ok: true, tab_id: receipt.tab_id,
        url: task.website, screenshot_path: shot, frame_receipt: receipt };
      await writeFile(path.join(raw, 'steps.jsonl'), JSON.stringify(step) + '\n');
      const final = { outcome: phase === 'concurrent' ? 'timeout' : 'complete', cleanup_ok: true,
        final_answer: 'Synthetic private answer; this test called no browser or model.' };
      await save(path.join(raw, 'final.json'), final);
      await writeV2({ task, rawDir: raw, outDir: path.join(directory, 'trajectories'), allowlistPath: DEFAULT_PROFILE_PATH });
      attempts.push({ task_id: task.task_id, index: 1, raw_dir: raw, state: 'finished', final });
      outcomes.push({ task_id: task.task_id, selected_attempt: 1, exported: true, outcome: final.outcome });
      frames.push({ shot, bytes, raw });
    }
    await save(path.join(directory, 'manifest.json'), { collection_complete: true, attempts, outcomes });
  }
  const outputDir = path.join(root, 'descriptive-checkpoints');
  return { root, outputDir, gate, tasks, frames,
    build: () => writePilotCheckpointBundle({ pilotOutputDir: root, outputDir, allTasks: tasks, gateReceipt: gate }) };
}

test('ten blinded pairs contain twenty unchanged selected native final PNGs and a balanced private key', async t => {
  const f = await fixture(t), built = await f.build();
  assert.equal(built.image_count, 20); assert.equal(built.task_count, 10); assert.equal(built.human_calibrated, false);
  const verified = await verifyPilotCheckpointBundle(f.outputDir);
  assert.equal(verified.key.records.filter(row => row.conditions.A.condition === 'serial').length, 5);
  const publicBytes = await readFile(built.public_manifest.path, 'utf8');
  for (const field of ['selected_attempt', 'final_answer', 'outcome', 'native_receipt', 'concurrency-']) assert.equal(publicBytes.includes(field), false);
  for (const pair of verified.manifest.pairs) for (const side of ['A', 'B']) {
    const native = verified.key.records.find(row => row.review_id === pair.review_id).conditions[side].native_receipt;
    assert.equal(hash(await readFile(path.join(f.outputDir, 'review', pair.images[side].file))), native.sha256);
  }
  const again = await f.build();
  assert.equal(again.already_recorded, true); assert.deepEqual(again.public_manifest, built.public_manifest);
  assert.equal((await verifyPilotReviewComplete(f.outputDir)).complete, false);
});

test('a missing native final frame fails before creating a bundle and never substitutes an earlier image', async t => {
  const f = await fixture(t); await rm(f.frames[0].shot);
  await assert.rejects(f.build(), { code: 'ENOENT' });
  await assert.rejects(stat(f.outputDir), { code: 'ENOENT' });
});

test('saved review rejects changed copied PNG, raw final or task prompt rather than silently refreshing it', async t => {
  const f = await fixture(t), built = await f.build();
  const manifest = await json(built.public_manifest.path), first = path.join(f.outputDir, 'review', manifest.pairs[0].images.A.file);
  const copied = await readFile(first); await writeFile(first, encodeSolidPng(120, 100, [240, 20, 30]));
  await assert.rejects(verifyPilotCheckpointBundle(f.outputDir), /copied PNG changed/);
  await writeFile(first, copied);
  const finalPath = path.join(f.frames[0].raw, 'final.json'), finalBytes = await readFile(finalPath);
  await save(finalPath, { outcome: 'changed' });
  await assert.rejects(verifyPilotCheckpointBundle(f.outputDir), /source or copied evidence changed/);
  await writeFile(finalPath, finalBytes);
  manifest.pairs[0].task = 'Changed goal'; await save(built.public_manifest.path, manifest);
  await assert.rejects(verifyPilotCheckpointBundle(f.outputDir), /manifest or private key is inconsistent/);
});

async function completedNotes(f, { count = 10 } = {}) {
  const template = (await readFile(path.join(f.outputDir, 'review/notes-template.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  const rows = template.slice(0, count).map(row => ({ ...row,
    A: { visible_goal: 'insufficient_visible_evidence', evidence: 'Synthetic solid-color unit image has no readable goal evidence.' },
    B: { visible_goal: 'visibly_not_met', evidence: 'Synthetic unit image does not display the requested state.' }, comparison: 'not_comparable', notes: 'Unit fixture only.' }));
  const file = path.join(f.root, 'completed-notes.jsonl'); await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n'); return file;
}

test('automated completion binds all task/image/note hashes without changing the operational gate', async t => {
  const f = await fixture(t); await f.build(); const notesPath = await completedNotes(f);
  const gateBytes = await readFile(f.gate.receipt_path);
  const recorded = await recordPilotReview({ outputDir: f.outputDir, notesPath, reviewer: 'Synthetic unit reviewer' });
  assert.equal(recorded.complete, true); assert.equal(recorded.human_calibrated, false); assert.equal(recorded.affects_operational_gate, false);
  assert.equal((await verifyPilotReviewComplete(f.outputDir)).complete, true);
  assert.deepEqual(await readFile(f.gate.receipt_path), gateBytes);
  const bytes = await readFile(recorded.receipt.path);
  await recordPilotReview({ outputDir: f.outputDir, notesPath, reviewer: 'Synthetic unit reviewer' });
  assert.deepEqual(await readFile(recorded.receipt.path), bytes);
  const changed = await readFile(path.join(f.outputDir, 'review/notes.jsonl'), 'utf8');
  await writeFile(path.join(f.outputDir, 'review/notes.jsonl'), changed.replace('Unit fixture only.', 'Changed after completion.'));
  await assert.rejects(verifyPilotReviewComplete(f.outputDir), /source or copied evidence changed/);
});

test('nine pairs or empty evidence cannot produce a completion receipt', async t => {
  const f = await fixture(t); await f.build();
  const notesPath = await completedNotes(f, { count: 9 });
  await assert.rejects(recordPilotReview({ outputDir: f.outputDir, notesPath, reviewer: 'Synthetic unit reviewer' }), /ten pairs/);
  await assert.rejects(stat(path.join(f.outputDir, 'completion.json')), { code: 'ENOENT' });
  const full = await completedNotes(f), rows = (await readFile(full, 'utf8')).trim().split('\n').map(JSON.parse);
  rows[0].A.evidence = ''; await writeFile(full, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  await assert.rejects(recordPilotReview({ outputDir: f.outputDir, notesPath: full, reviewer: 'Synthetic unit reviewer' }), /visible evidence/);
});
