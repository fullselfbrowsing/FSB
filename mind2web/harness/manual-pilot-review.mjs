import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fixedCanary } from './manual-pilot.mjs';
import { inspectPng } from './png.mjs';
import { verifyPublicDisposition } from './public-disposition.mjs';

export const PILOT_REVIEW_SEED = 'fsb-visible-pilot-checkpoints-v2-20261018';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const serialize = value => JSON.stringify(value, null, 2) + '\n';
const canonical = value => JSON.stringify(value && typeof value === 'object' ? Array.isArray(value)
  ? value.map(item => JSON.parse(canonical(item))) : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
const same = (a, b) => canonical(a) === canonical(b);
const json = file => readFile(file, 'utf8').then(JSON.parse);
const LABELS = ['visibly_met', 'visibly_not_met', 'insufficient_visible_evidence'];
const COMPARISONS = ['A_more_visible_progress', 'B_more_visible_progress', 'similar', 'not_comparable'];
const RULES = 'Automated descriptive review of the last saved native image only. Images are unchanged and no browser task is replayed. '
  + 'Visible checkpoints do not establish full task success, evaluator ground truth, causal concurrency effects or human calibration. '
  + 'Goal ratings do not affect the operational concurrency decision.';

async function optional(file) {
  try { return await json(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function descriptor(file) {
  const bytes = await readFile(file); return { path: path.resolve(file), bytes: bytes.length, sha256: hash(bytes) };
}
async function assertEvidence(item) {
  if (!item?.path || !same(await descriptor(item.path), item)) throw new Error('Pilot review source or copied evidence changed');
}
async function jsonl(file) {
  const text = await readFile(file, 'utf8');
  if (text && !text.endsWith('\n')) throw new Error('Pilot review requires complete JSONL records');
  return text.split('\n').filter(line => line.trim()).map(JSON.parse);
}
function childFile(root, relative) {
  const absolute = path.resolve(root, relative), rel = path.relative(root, absolute);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('Unsafe pilot review evidence path');
  return absolute;
}

async function selectedCheckpoint(pilotOutputDir, candidate, name, task, publicRelease = false) {
  const phaseDir = path.join(pilotOutputDir, `concurrency-${candidate}`, name);
  const manifestPath = path.join(phaseDir, 'manifest.json'), manifest = await json(manifestPath);
  const row = manifest.outcomes.find(row => row.task_id === task.task_id);
  const attempt = manifest.attempts.find(attempt => attempt.task_id === task.task_id && attempt.index === row?.selected_attempt);
  if (!manifest.collection_complete || !row || !attempt || attempt.state !== 'finished' || attempt.final?.cleanup_ok !== true
      || attempt.raw_dir !== path.join(phaseDir, 'raw', task.task_id, `attempt-${attempt.index}`)) throw new Error('Pilot checkpoint requires an exact selected, cleaned-up exported attempt');
  const stepsPath = path.join(attempt.raw_dir, 'steps.jsonl'), finalPath = path.join(attempt.raw_dir, 'final.json');
  const final = await json(finalPath);
  if (!same(final, attempt.final) || final.outcome !== row.outcome) throw new Error('Pilot checkpoint raw final differs from its selected attempt');
  if (!row.exported) {
    const disposition = publicRelease && manifest.public_release === true ? await verifyPublicDisposition(attempt.raw_dir, final) : null;
    if (!disposition) throw new Error('Pilot checkpoint lacks a verified selected trajectory or native failure');
    if (await optional(path.join(phaseDir, 'trajectories', task.task_id, 'result.json'))) throw new Error('Missing final checkpoint was replaced by another image');
    return { task_id: task.task_id, condition: name === 'concurrent' ? 'concurrent' : 'serial', phase: name,
      selected_attempt: attempt.index, outcome: final.outcome, final_answer: final.final_answer ?? null,
      unavailable: true, native_receipt: null, raw_dir: attempt.raw_dir, disposition,
      sources: await Promise.all([manifestPath, stepsPath, finalPath, path.join(attempt.raw_dir, 'proxy-meta.json'),
        disposition.cleanup_evidence.path, disposition.health_evidence.path, disposition.health_png.path].map(descriptor)) };
  }
  const steps = await jsonl(stepsPath), entry = steps.filter(entry => entry.screenshot_path && entry.frame_receipt).at(-1);
  const receipt = entry?.frame_receipt;
  if (!receipt || receipt.task_id !== task.task_id || receipt.tab_id !== entry.tab_id || receipt.source_url !== entry.url
      || receipt.screenshot_path !== entry.screenshot_path
      || !receipt.frame_id || !receipt.capture_id || path.resolve(entry.screenshot_path) !== childFile(attempt.raw_dir, path.relative(attempt.raw_dir, entry.screenshot_path))) {
    throw new Error('Pilot checkpoint has no exact native final frame receipt');
  }
  const rawBytes = await readFile(entry.screenshot_path), png = inspectPng(rawBytes);
  if (!png.ok || png.width < 100 || png.height < 100 || hash(rawBytes) !== receipt.sha256 || rawBytes.length !== receipt.byte_length
      || png.width !== receipt.output_width || png.height !== receipt.output_height) throw new Error('Pilot checkpoint native PNG or receipt bytes differ');
  const exportDir = path.join(phaseDir, 'trajectories', task.task_id), resultPath = path.join(exportDir, 'result.json');
  const result = await json(resultPath), last = result.action_history?.at(-1);
  if (!last?.screenshot || path.basename(last.screenshot) !== last.screenshot) throw new Error('Pilot checkpoint export has no final image');
  const exported = path.join(exportDir, 'trajectory', last.screenshot);
  if (hash(await readFile(exported)) !== receipt.sha256 || last.url !== receipt.source_url) throw new Error('Pilot checkpoint export is not the exact selected native final image');
  return { task_id: task.task_id, condition: name === 'concurrent' ? 'concurrent' : 'serial', phase: name,
    selected_attempt: attempt.index, outcome: final.outcome, final_answer: final.final_answer ?? null,
    native_receipt: receipt, raw_seq: entry.seq,
    sources: await Promise.all([manifestPath, stepsPath, finalPath, resultPath, entry.screenshot_path, exported].map(descriptor)) };
}

export async function writePilotCheckpointBundle({ pilotOutputDir, outputDir, allTasks, gateReceipt, publicRelease = false }) {
  pilotOutputDir = path.resolve(pilotOutputDir); outputDir = path.resolve(outputDir);
  if (!gateReceipt?.ok || ![1, 2, 5, 10].includes(gateReceipt.selected_concurrency)) throw new Error('A passing pilot operational receipt is required');
  const selected = await fixedCanary(allTasks), candidate = gateReceipt.selected_concurrency;
  if (gateReceipt.fixed_sample_sha256 !== selected.spec.task_ids_sha256) throw new Error('Pilot review cannot substitute another task sample');
  const gate = await descriptor(path.join(pilotOutputDir, 'accepted-gate.json'));
  if (!same(await json(gate.path), gateReceipt)) throw new Error('Pilot review gate differs from saved acceptance');
  const ordered = [...selected.tasks].sort((a, b) => hash(`${PILOT_REVIEW_SEED}|order|${a.task_id}`).localeCompare(hash(`${PILOT_REVIEW_SEED}|order|${b.task_id}`)));
  const serialFirst = new Set([...selected.tasks].sort((a, b) => hash(`${PILOT_REVIEW_SEED}|side|${a.task_id}`).localeCompare(hash(`${PILOT_REVIEW_SEED}|side|${b.task_id}`))).slice(0, 5).map(task => task.task_id));
  const serialA = new Set(selected.serialA.map(task => task.task_id));
  const pairs = [], key = [];
  for (const [index, task] of ordered.entries()) {
    const reviewId = `review-${String(index + 1).padStart(3, '0')}`;
    const serial = await selectedCheckpoint(pilotOutputDir, candidate, serialA.has(task.task_id) ? 'serial-a' : 'serial-b', task, publicRelease);
    const concurrent = await selectedCheckpoint(pilotOutputDir, candidate, 'concurrent', task, publicRelease);
    const conditions = serialFirst.has(task.task_id) ? { A: serial, B: concurrent } : { A: concurrent, B: serial };
    const images = Object.fromEntries(Object.entries(conditions).map(([side, record]) => [side,
      record.unavailable ? { unavailable: true, reason: 'Final native page evidence is unavailable; no earlier or independent health frame is substituted.' }
        : { file: `${reviewId}/${side}.png`, sha256: record.native_receipt.sha256, bytes: record.native_receipt.byte_length }]));
    pairs.push({ review_id: reviewId, task: task.confirmed_task, website: task.website, images });
    key.push({ review_id: reviewId, task_id: task.task_id, conditions });
  }
  const imageCount = pairs.flatMap(pair => Object.values(pair.images)).filter(image => !image.unavailable).length;
  const publicManifest = { format_version: 1, seed: PILOT_REVIEW_SEED, task_count: 10, image_count: imageCount,
    ...(publicRelease ? { public_release: true, checkpoint_count: 20, unavailable_checkpoints: 20 - imageCount } : {}),
    blinded: true, review_kind: 'automated_descriptive_visible_goal_checkpoints', human_calibrated: false,
    affects_operational_gate: false, limitations: RULES, pairs };
  const taskPromptsHash = hash(canonical(pairs.map(pair => ({ review_id: pair.review_id, task: pair.task, website: pair.website }))));
  const privateKey = { format_version: 1, seed: PILOT_REVIEW_SEED, gate, fixed_sample_sha256: selected.spec.task_ids_sha256,
    public_manifest_sha256: hash(serialize(publicManifest)), task_prompts_sha256: taskPromptsHash, records: key };
  const publicPath = path.join(outputDir, 'review/manifest.json'), privatePath = path.join(outputDir, 'private/conditions.json');
  const prior = await optional(privatePath);
  if (prior) {
    if (!same(prior, privateKey) || !same(await json(publicPath), publicManifest)) throw new Error('Pilot review bundle differs from its selected immutable evidence');
    await verifyPilotCheckpointBundle(outputDir);
    return bundleSummary(outputDir, publicManifest, taskPromptsHash, true);
  }
  const existing = await readdir(outputDir).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  if (existing.length) throw new Error('Partial pilot review bundle requires inspection; no evidence is overwritten');
  await mkdir(path.join(outputDir, 'review'), { recursive: true }); await mkdir(path.join(outputDir, 'private'), { recursive: true });
  for (const record of key) for (const [side, evidence] of Object.entries(record.conditions)) {
    if (evidence.unavailable) continue;
    const target = childFile(path.join(outputDir, 'review'), `${record.review_id}/${side}.png`);
    await mkdir(path.dirname(target), { recursive: true }); await copyFile(evidence.native_receipt.screenshot_path, target);
    if (hash(await readFile(target)) !== evidence.native_receipt.sha256) throw new Error('Pilot review image copy differs from the native frame');
  }
  await writeFile(publicPath, serialize(publicManifest), { flag: 'wx' });
  const template = pairs.map(pair => ({ review_id: pair.review_id, A: { visible_goal: null, evidence: null },
    B: { visible_goal: null, evidence: null }, comparison: null, notes: null }));
  await writeFile(path.join(outputDir, 'review/notes-template.jsonl'), template.map(row => JSON.stringify(row)).join('\n') + '\n', { flag: 'wx' });
  await writeFile(path.join(outputDir, 'review/INSTRUCTIONS.md'), '# Blinded pilot checkpoint review\n\n'
    + RULES + `\n\nInspect all${imageCount} available images before looking at private/conditions.json. Missing final frames require insufficient_visible_evidence and not_comparable; never substitute an earlier or guard image. For each side use `
    + LABELS.join(', ') + '; cite visible details in evidence. Comparison values: ' + COMPARISONS.join(', ')
    + '. Complete notes.jsonl from the template, then record the completion receipt with manual-pilot-review.mjs --bundle <directory> --notes <notes.jsonl> --reviewer <agent name>. '
    + 'No human reviewer is required. This review is separate from the historical60-case calibration bundle.\n', { flag: 'wx' });
  await writeFile(privatePath, serialize(privateKey), { flag: 'wx' });
  await verifyPilotCheckpointBundle(outputDir);
  return bundleSummary(outputDir, publicManifest, taskPromptsHash, false);
}

async function bundleSummary(outputDir, manifest, taskPromptsHash, alreadyRecorded) {
  return { output_dir: outputDir, task_count: 10, image_count: manifest.image_count, human_calibrated: false, affects_operational_gate: false,
    public_manifest: await descriptor(path.join(outputDir, 'review/manifest.json')),
    private_key: await descriptor(path.join(outputDir, 'private/conditions.json')), task_prompts_sha256: taskPromptsHash,
    images_sha256: hash(canonical(manifest.pairs.map(pair => ({ review_id: pair.review_id, images: pair.images })))), already_recorded: alreadyRecorded };
}

export async function verifyPilotCheckpointBundle(outputDir) {
  outputDir = path.resolve(outputDir);
  const manifest = await json(path.join(outputDir, 'review/manifest.json')), key = await json(path.join(outputDir, 'private/conditions.json'));
  const actualImages = manifest.pairs?.flatMap(pair => Object.values(pair.images ?? {})).filter(image => !image.unavailable).length;
  if (manifest.task_count !== 10 || manifest.image_count !== actualImages || !manifest.public_release && manifest.image_count !== 20
      || manifest.public_release && (manifest.checkpoint_count !== 20 || manifest.unavailable_checkpoints !== 20 - actualImages)
      || manifest.pairs?.length !== 10 || key.records?.length !== 10
      || key.public_manifest_sha256 !== hash(await readFile(path.join(outputDir, 'review/manifest.json')))
      || manifest.seed !== PILOT_REVIEW_SEED || key.seed !== PILOT_REVIEW_SEED) throw new Error('Pilot review manifest or private key is inconsistent');
  await assertEvidence(key.gate);
  const seen = new Set(); let serialA = 0;
  for (const pair of manifest.pairs) {
    if (seen.has(pair.review_id)) throw new Error('Duplicate pilot review pair'); seen.add(pair.review_id);
    const record = key.records.find(row => row.review_id === pair.review_id);
    if (!record || !same(Object.values(record.conditions).map(row => row.condition).sort(), ['concurrent', 'serial'])) throw new Error('Pilot review pair lacks both actual conditions');
    if (record.conditions.A.condition === 'serial') serialA++;
    for (const side of ['A', 'B']) {
      const image = pair.images[side], native = record.conditions[side];
      if (image.unavailable) {
        if (manifest.public_release !== true || native.unavailable !== true || native.native_receipt !== null
            || !same(await verifyPublicDisposition(native.raw_dir, await json(path.join(native.raw_dir, 'final.json'))), native.disposition)) throw new Error('Unavailable pilot checkpoint lacks its original native failure');
        for (const source of native.sources) await assertEvidence(source);
        continue;
      }
      if (image.sha256 !== native.native_receipt.sha256 || image.bytes !== native.native_receipt.byte_length) throw new Error('Pilot review side differs from its native receipt');
      const bytes = await readFile(childFile(path.join(outputDir, 'review'), image.file));
      if (hash(bytes) !== image.sha256 || bytes.length !== image.bytes) throw new Error('Pilot review copied PNG changed');
      for (const source of native.sources) await assertEvidence(source);
    }
  }
  if (serialA !== 5) throw new Error('Pilot review A/B condition balance changed');
  const taskPromptsHash = hash(canonical(manifest.pairs.map(pair => ({ review_id: pair.review_id, task: pair.task, website: pair.website }))));
  if (taskPromptsHash !== key.task_prompts_sha256) throw new Error('Pilot review task prompts changed');
  return { manifest, key, summary: await bundleSummary(outputDir, manifest, taskPromptsHash, true) };
}

function validateNotes(rows, manifest) {
  if (rows.length !== 10 || new Set(rows.map(row => row.review_id)).size !== 10) throw new Error('Pilot review requires one completed note for each of ten pairs');
  for (const row of rows) {
    if (!manifest.pairs.some(pair => pair.review_id === row.review_id) || !COMPARISONS.includes(row.comparison)) throw new Error('Pilot review note has an unknown pair or comparison');
    for (const side of ['A', 'B']) if (!LABELS.includes(row[side]?.visible_goal) || typeof row[side]?.evidence !== 'string' || !row[side].evidence.trim()) throw new Error('Pilot review notes must cite visible evidence for both images');
    const pair = manifest.pairs.find(pair => pair.review_id === row.review_id);
    for (const side of ['A', 'B']) if (pair.images[side].unavailable && row[side].visible_goal !== 'insufficient_visible_evidence') throw new Error('Missing pilot evidence cannot establish a visible goal');
    if (Object.values(pair.images).some(image => image.unavailable) && row.comparison !== 'not_comparable') throw new Error('Missing pilot frames cannot support a visual comparison');
  }
}
function descriptiveSummary(rows, key) {
  const byCondition = Object.fromEntries(['serial', 'concurrent'].map(condition => [condition, Object.fromEntries(LABELS.map(label => [label, 0]))]));
  const comparisons = Object.fromEntries(COMPARISONS.map(value => [value, 0]));
  for (const row of rows) {
    const record = key.records.find(item => item.review_id === row.review_id);
    for (const side of ['A', 'B']) byCondition[record.conditions[side].condition][row[side].visible_goal]++;
    comparisons[row.comparison]++;
  }
  return { by_condition: byCondition, blinded_pair_comparisons: comparisons, task_count: 10,
    image_count: key.records.flatMap(record => Object.values(record.conditions)).filter(record => !record.unavailable).length,
    interpretation: RULES, human_calibrated: false, affects_operational_gate: false };
}

export async function recordPilotReview({ outputDir, notesPath, reviewer }) {
  outputDir = path.resolve(outputDir);
  if (typeof reviewer !== 'string' || !reviewer.trim() || !notesPath) throw new Error('A named automated reviewer and completed notes file are required');
  const verified = await verifyPilotCheckpointBundle(outputDir), rows = await jsonl(notesPath);
  validateNotes(rows, verified.manifest);
  const target = path.join(outputDir, 'review/notes.jsonl'), bytes = await readFile(notesPath);
  const existing = await readFile(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing && !existing.equals(bytes)) throw new Error('Existing pilot review notes cannot be replaced');
  if (!existing) await writeFile(target, bytes, { flag: 'wx' });
  const fields = { ok: true, kind: 'automated_descriptive_pilot_checkpoint_review', reviewer: reviewer.trim(),
    human_calibrated: false, affects_operational_gate: false, task_count: 10, image_count: verified.manifest.image_count,
    public_manifest: verified.summary.public_manifest, private_key: verified.summary.private_key,
    task_prompts_sha256: verified.summary.task_prompts_sha256, images_sha256: verified.summary.images_sha256,
    operational_gate: verified.key.gate, notes: await descriptor(target),
    descriptive_summary: descriptiveSummary(rows, verified.key), review_source_sha256: hash(await readFile(fileURLToPath(import.meta.url))) };
  const receiptPath = path.join(outputDir, 'completion.json'), prior = await optional(receiptPath);
  if (prior) {
    const { completed_at, ...saved } = prior;
    if (!same(fields, saved)) throw new Error('Existing pilot review completion differs');
  } else await writeFile(receiptPath, serialize({ ...fields, completed_at: new Date().toISOString() }), { flag: 'wx' });
  return { complete: true, receipt: await descriptor(receiptPath), ...fields };
}

export async function verifyPilotReviewComplete(outputDir) {
  outputDir = path.resolve(outputDir);
  const receipt = await optional(path.join(outputDir, 'completion.json'));
  if (!receipt) return { complete: false };
  if (receipt.notes?.path !== path.join(outputDir, 'review/notes.jsonl') || typeof receipt.reviewer !== 'string' || !receipt.reviewer.trim()) throw new Error('Pilot descriptive receipt lacks its named reviewer or bundled notes');
  const verified = await verifyPilotCheckpointBundle(outputDir), rows = await jsonl(receipt.notes?.path);
  validateNotes(rows, verified.manifest); await assertEvidence(receipt.notes);
  if (receipt.ok !== true || receipt.kind !== 'automated_descriptive_pilot_checkpoint_review' || receipt.human_calibrated !== false
      || receipt.affects_operational_gate !== false || receipt.task_count !== 10 || receipt.image_count !== verified.manifest.image_count
      || !same(receipt.public_manifest, verified.summary.public_manifest) || !same(receipt.private_key, verified.summary.private_key)
      || receipt.task_prompts_sha256 !== verified.summary.task_prompts_sha256 || receipt.images_sha256 !== verified.summary.images_sha256
      || !same(receipt.operational_gate, verified.key.gate) || !same(receipt.descriptive_summary, descriptiveSummary(rows, verified.key))
      || receipt.review_source_sha256 !== hash(await readFile(fileURLToPath(import.meta.url)))) throw new Error('Pilot descriptive completion receipt differs from saved images, tasks or notes');
  return { complete: true, receipt: await descriptor(path.join(outputDir, 'completion.json')), ...receipt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { bundle: { type: 'string' }, notes: { type: 'string' }, reviewer: { type: 'string' } } });
  recordPilotReview({ outputDir: values.bundle, notesPath: values.notes, reviewer: values.reviewer })
    .then(value => console.log(JSON.stringify({ complete: value.complete, receipt: value.receipt, task_count: value.task_count, image_count: value.image_count })))
    .catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
}
