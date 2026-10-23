import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { inspectPng } from './png.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error('Invalid public native-failure evidence: ' + message); };
const CAPTURE_CODES = new Set(['SCREENSHOT_CAPTURE_FAILED', 'SCREENSHOT_TARGET_NOT_FOUND', 'SCREENSHOT_REGION_OUT_OF_BOUNDS', 'SCREENSHOT_TOO_LARGE', 'INVALID_SCREENSHOT_ARGUMENTS', 'PAGE_UNRESPONSIVE']);
// The public release reports a capture timeout on a busy page as plain diagnostic text.
const FSB_DIAGNOSTIC = /^Detected: [^\n]+\nWhy: /;
const UNRESPONSIVE_TEXT = /^Detected: Page responsiveness\b[\s\S]*did not respond before the (?:capture|page-read) deadline/;
export function publicNativeCaptureFailure(result) {
  if (result?.isError !== true || !Array.isArray(result.content) || !result.content.length) return null;
  const rows = [];
  for (const block of result.content) {
    if (block.type !== 'text' || typeof block.text !== 'string') return null;
    try { rows.push(JSON.parse(block.text)); }
    catch {
      // Only the release's own diagnostic format; other unparsed text stays ambiguous.
      if (!FSB_DIAGNOSTIC.test(block.text)) return null;
      rows.push(UNRESPONSIVE_TEXT.test(block.text) ? { success: false, code: 'PAGE_UNRESPONSIVE', text: block.text } : { success: false, text: block.text });
    }
  }
  // Any settled capture refusal is a task outcome; the guard health capture that
  // must follow proves the browser itself still captures before collection continues.
  if (rows.some(row => !row || typeof row !== 'object' || row.success === true || !(row.success === false || row.error || row.code || row.text))) return null;
  if (/"(?:cleanup_pending|in_flight)"\s*:\s*true|TAB_NOT_OWNED|TAB_OUT_OF_SCOPE|AGENT_NOT_REGISTERED|BAD_TOKEN|PUBLIC_|bridge.disconnected|extension_not_connected|quota|rate.limit|server.exited|transport|socket|connection.*(?:lost|closed|failed)/i.test(JSON.stringify(rows))) return null;
  const code = rows[0].code ?? rows[0].errorCode;
  return { response_sha256: sha(JSON.stringify(result)), code: CAPTURE_CODES.has(code) ? code : code ? String(code) : 'PUBLIC_CAPTURE_FAILED', result: structuredClone(result) };
}
// The guard plus only the listed popups FSB assigned to another agent, each of
// which the harness then closed by exact Chrome tab ID.
function guardWithForeign(ids, drain, cleanup) {
  if (!Array.isArray(ids)) return false;
  const foreign = [...(drain.foreign_tab_ids ?? [])].sort((a, b) => a - b);
  if (foreign.length && (cleanup.foreign_tab_closure?.ok !== true || foreign.some(id => !cleanup.foreign_tab_closure.closed?.includes(id))
      || foreign.some(id => !cleanup.foreign_tabs?.some(row => row.tab_id === id)))) return false;
  return JSON.stringify([...ids].sort((a, b) => a - b)) === JSON.stringify([drain.guard_tab_id, ...foreign].sort((a, b) => a - b));
}
const within = (root, file) => {
  const relative = path.relative(root, file);
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

async function descriptorBytes(root, descriptor, basename) {
  if (!descriptor || !path.isAbsolute(descriptor.path ?? '') || !within(root, descriptor.path)
      || basename && path.basename(descriptor.path) !== basename || !Number.isInteger(descriptor.bytes)
      || !/^[0-9a-f]{64}$/.test(descriptor.sha256 ?? '')) fail('file descriptor');
  let cursor = descriptor.path;
  while (cursor !== root) {
    if ((await lstat(cursor)).isSymbolicLink()) fail('symlinked artifact');
    cursor = path.dirname(cursor);
  }
  const bytes = await readFile(descriptor.path);
  if (bytes.length !== descriptor.bytes || sha(bytes) !== descriptor.sha256) fail('artifact changed');
  return bytes;
}

/** A native capture failure is a measured product outcome only after separate
 * cleanup and a successful guard health observation. It is never a page frame. */
export async function verifyPublicDisposition(rawDir, final) {
  const proof = final?.public_disposition;
  if (!proof) return null;
  rawDir = path.resolve(rawDir);
  if (proof.version !== 1 || proof.kind !== 'public_native_failure' || proof.native_result_verified !== true
      || proof.cleanup_verified !== true || proof.health_verified !== true || proof.missing_frame !== true
      || typeof proof.effect_unknown !== 'boolean' || final.cleanup_ok !== true || final.uncertain_upstream
      || final.queue_expiries || !final.fault || !isDeepStrictEqual(proof.original_fault, final.fault)) fail('disposition or terminal state');
  const native = proof.native_error;
  if (!native || native.tool !== 'capture_screenshot' || typeof native.operation_id !== 'string'
      || !/^[0-9a-f]{64}$/.test(native.response_sha256 ?? '') || typeof native.code !== 'string' || !native.code) fail('native response binding');
  const stepsBytes = await readFile(path.join(rawDir, 'steps.jsonl'));
  if (!stepsBytes.toString().endsWith('\n')) fail('incomplete operation log');
  const steps = stepsBytes.toString().split('\n').filter(Boolean).map(JSON.parse);
  const matching = steps.filter(step => step.operation_id === native.operation_id && step.native_capture_result);
  if (matching.length !== 1 || matching[0].frame_receipt || matching[0].screenshot_path) fail('missing or substituted failure frame');
  if (proof.effect_unknown !== (matching[0].execution_outcome === 'unknown') || proof.original_fault?.seq !== matching[0].seq
      || proof.original_fault?.code !== 'CAPTURE_FAILED') fail('original operation outcome differs');
  const response = matching[0].native_capture_result;
  if (sha(JSON.stringify(response)) !== native.response_sha256) fail('native response changed');
  const checkedResponse = publicNativeCaptureFailure(response);
  if (!checkedResponse || checkedResponse.code !== native.code) fail('native error is not authoritative');
  const cleanup = JSON.parse(await descriptorBytes(rawDir, proof.cleanup_evidence, 'childcleanup.json'));
  const health = JSON.parse(await descriptorBytes(rawDir, proof.health_evidence, 'public-health.json'));
  const drain = cleanup.public_guard_drain, disposal = cleanup.public_guard_disposal,
    shutdown = cleanup.public_client_shutdown;
  if (cleanup.cleanup_ok !== true || cleanup.ok !== true || drain?.ok !== true || disposal?.ok !== true
      || disposal.closed !== true || disposal.post_close_inventory_requested !== false
      || shutdown?.cleanup_ok !== true || shutdown.client_closed !== true || shutdown.guard_server_closed !== true
      || shutdown.guard_disposed !== true || shutdown.guard_prepared !== true || shutdown.guard_close_attempted !== true
      || !Number.isInteger(drain.guard_tab_id) || drain.guard_tab_id < 1
      || disposal.guard_tab_id !== drain.guard_tab_id || shutdown.guard_tab_id !== drain.guard_tab_id
      || !Array.isArray(drain.task_tab_ids) || drain.task_tab_ids.length
      || !guardWithForeign(drain.inventory?.tab_ids, drain, cleanup) || !guardWithForeign(disposal.prior_inventory?.tab_ids, drain, cleanup)) fail('owned cleanup was not verified');
  for (const receipt of [drain, disposal, shutdown]) if (receipt.adapter_version !== 'public-release-guard-v1') fail('unknown adapter protocol');
  if (drain.method !== 'public_guard_only_inventory' || disposal.method !== 'public_exact_guard_close_ack_after_guard_only_inventory'
      || shutdown.method !== disposal.method || disposal.private_registry_drain_attested !== false || shutdown.private_registry_drain_attested !== false) fail('unsupported cleanup method');
  const closedIds = new Set();
  if (!Array.isArray(cleanup.closes)) fail('task close inventory');
  for (const close of cleanup.closes) {
    const row = close.result?.[0], id = close.tab_id;
    if (!Number.isInteger(id) || id < 1 || id === drain.guard_tab_id || closedIds.has(id)) fail('task close acknowledgement');
    closedIds.add(id);
    if (close.foreign_owned === true) continue;
    // An unacknowledged FSB close is accepted only when the exact-ID fallback closed that tab.
    if (close.method === 'osascript_exact_tab_id_after_unacknowledged_close') {
      if (close.ok !== true || close.osascript_fallback?.ok !== true || !close.osascript_fallback.closed?.includes(id)) fail('task close fallback');
      continue;
    }
    if (close.ok !== true || !Array.isArray(close.result) || close.result.length !== 1 || row?.success !== true || row.closed !== true
        || (row.tab_id ?? row.tabId ?? row.id) !== id) fail('task close acknowledgement');
  }
  if (health.ok !== true || health.read_verified !== true || health.not_actor_frame !== true || health.native_metadata_verified !== true
      || health.adapter_version !== 'public-release-guard-v1' || health.method !== 'public_guard_native_capture'
      || health.model_calls !== 0 || health.task_actions_replayed !== 0
      || !Number.isInteger(health.guard_id ?? health.guard_tab_id)) fail('guard health state');
  const png = await descriptorBytes(rawDir, health.png, 'public-health.png');
  const image = inspectPng(png);
  if (!image.ok || image.width < 100 || image.height < 100 || image.width !== health.png.width || image.height !== health.png.height) fail('health PNG geometry');
  const metadata = health.metadata;
  if (!metadata || metadata.sha256 !== sha(png) || metadata.byte_length !== png.length
      || metadata.output_width !== image.width || metadata.output_height !== image.height
      || typeof metadata.source_url !== 'string' || !metadata.capture_id || metadata.mode !== 'viewport'
      || metadata.effective_emulation?.device_mode !== 'current') fail('health native image binding');
  const meta = JSON.parse(await readFile(path.join(rawDir, 'proxy-meta.json')));
  const guard = meta.public_guard;
  if (guard?.ok !== true || guard.adapter_version !== 'public-release-guard-v1' || guard.guard_tab_id !== drain.guard_tab_id
      || metadata.source_url !== guard.source_url || !isDeepStrictEqual(meta.public_disposition, proof)
      || meta.cleanup_ok !== true || meta.uncertain_upstream || meta.queue_expiries || !meta.task_dispatch_halted) fail('saved guard or disposition differs');
  const url = new URL(metadata.source_url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password) fail('health source is not the private local guard');
  const guardId = health.guard_id ?? health.guard_tab_id;
  if (guardId !== drain.guard_tab_id) fail('health and cleanup guard differ');
  for (const key of ['before_inventory', 'after_inventory']) {
    const ids = health[key]?.tab_ids;
    if (!Array.isArray(ids) || ids.length !== 1 || ids[0] !== guardId) fail('guard inventory continuity');
  }
  const times = [matching[0].ended_at, cleanup.started_at, drain.at, health.before_inventory.at,
    health.started_at, metadata.timestamp, health.ended_at, health.after_inventory.at,
    disposal.prior_inventory.at, disposal.at, cleanup.ended_at].map(Date.parse);
  // The final health inventory is captured just before the returned ended_at.
  [times[6], times[7]] = [times[7], times[6]];
  if (times.some(value => !Number.isFinite(value)) || times.some((value, index) => index && value < times[index - 1])) fail('failure, health and cleanup chronology');
  if (steps.some(step => step !== matching[0] && Date.parse(step.started_at) > Date.parse(matching[0].ended_at))) fail('task tool dispatched after native failure');
  return { kind: proof.kind, native_error: native, missing_frame: true, effect_unknown: proof.effect_unknown,
    goal_state: 'unknown_without_terminal_evidence', cleanup_evidence: proof.cleanup_evidence,
    health_evidence: proof.health_evidence, health_png: health.png };
}

export async function publicAttemptBlocker(attempt, { publicRelease = false } = {}) {
  const final = attempt.final;
  if (attempt.state !== 'finished' || final?.cleanup_ok !== true || final?.uncertain_upstream) return true;
  // A provider failure with verified cleanup is resumable once the controller
  // has scheduled its retry; it is never selected as a scored outcome.
  if (final?.provider_error && !attempt.provider_retry && !attempt.retryable_before_mutation) return true;
  if (!final.fault) {
    if (final.public_disposition) fail('disposition without its original fault');
    return false;
  }
  return !(publicRelease && await verifyPublicDisposition(attempt.raw_dir, final));
}
