import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inspectPng } from './png.mjs';

export const QUEUE_TIMEOUT_CODES = new Set(['BROWSER_QUEUE_TIMEOUT', 'GATEWAY_QUEUE_TIMEOUT']);
export const MISSING_QUEUE_EXPORT_CODES = new Set(['NO_STEP_LOG', 'NO_BOOTSTRAP', 'NO_BOOTSTRAP_SCREENSHOT', 'MISSING_READ_SCREENSHOT', 'MISSING_ACTION_SCREENSHOT']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function records(file) {
  let bytes;
  try { bytes = await readFile(file); } catch (error) { if (error.code === 'ENOENT') return { rows: [], file: null }; throw error; }
  const text = bytes.toString('utf8');
  if (text && !text.endsWith('\n')) throw new Error('Incomplete queue evidence JSONL');
  return { rows: text.split('\n').filter(line => line.trim()).map(JSON.parse), file: { path: file, bytes: bytes.length, sha256: hash(bytes) } };
}

// A failed candidate may retain a missing observation only when its dispatch was
// explicitly denied in a queue. Native capture failures and bad pixels never qualify.
export async function queueTimingEvidence(rawDir) {
  const steps = await records(path.join(rawDir, 'steps.jsonl'));
  const gateway = await records(path.join(rawDir, 'gateway-requests.jsonl'));
  const emissions = await records(path.join(rawDir, 'emissions.jsonl'));
  const emitted = new Set(emissions.rows.map(row => row.frame_id));
  const queueRows = steps.rows.filter(row => QUEUE_TIMEOUT_CODES.has(row.error_code));
  const gatewayRows = gateway.rows.filter(row => row.event === 'rejected'
    && QUEUE_TIMEOUT_CODES.has(row.code ?? row.rejection_code) && row.execution_outcome === 'not_executed' && !row.dispatched);
  const frames = [], missing = [];
  const rawPath = await realpath(rawDir);
  let invalid = null;
  for (const row of steps.rows) {
    if (row.screenshot_path) {
      const bytes = await readFile(row.screenshot_path), image = inspectPng(bytes), receipt = row.frame_receipt;
      const relative = path.relative(rawPath, await realpath(row.screenshot_path));
      if (!image.ok || !receipt || receipt.sha256 !== hash(bytes) || receipt.byte_length !== bytes.length
          || (receipt.task_id !== path.basename(rawDir) && receipt.task_id !== path.basename(path.dirname(rawDir)))
          || receipt.tab_id !== row.tab_id || receipt.source_url !== row.url
          || receipt.output_width !== image.width || receipt.output_height !== image.height
          || !receipt.frame_id || !receipt.capture_id || !/^https?:\/\//.test(receipt.source_url ?? '')
          || (row.kind !== 'bootstrap' && !emitted.has(receipt.frame_id))
          || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) { invalid = 'A retained frame failed native receipt or PNG validation'; break; }
      frames.push({ path: row.screenshot_path, bytes: bytes.length, sha256: hash(bytes), source_url: receipt.source_url });
      continue;
    }
    if (['research_read', 'denied', 'foreign_read'].includes(row.kind) && !QUEUE_TIMEOUT_CODES.has(row.error_code)) continue;
    const nondispatched = !row.timing?.upstream_started && !row.timing?.capture_started;
    const completedReadAwaitingCapture = ['read', 'bootstrap'].includes(row.kind) && row.execution_outcome === 'reported_success'
      && row.timing?.upstream_finished && !row.timing?.capture_started;
    if (!QUEUE_TIMEOUT_CODES.has(row.error_code) || (!nondispatched && !completedReadAwaitingCapture)) {
      invalid = 'A required observation is missing without a proved queue denial'; break;
    }
    missing.push({ seq: row.seq, code: row.error_code, upstream_read_completed: Boolean(completedReadAwaitingCapture), capture_dispatched: false });
  }
  const noFramesExplained = frames.length === 0 && (gatewayRows.length > 0 && steps.rows.length === 0
    || steps.rows.length > 0 && steps.rows.every(row => QUEUE_TIMEOUT_CODES.has(row.error_code) && !row.timing?.upstream_started && !row.timing?.capture_started));
  const valid = !invalid && queueRows.length + gatewayRows.length > 0;
  return { valid, reason: invalid, queue_denials: queueRows.length + gatewayRows.length,
    missing_observations: missing, frames, can_explain_missing_export: valid && (missing.length > 0 || noFramesExplained),
    steps: steps.file, gateway: gateway.file, emissions: emissions.file };
}
