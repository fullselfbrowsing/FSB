import { createHash, randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { inspectPng } from './png.mjs';
import { operationClock } from './browser-scheduler.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, text) => Object.assign(new Error(text), { code });

export class ObservationRecorder {
  constructor({ taskId, attemptId, rawDir, request, session }) {
    Object.assign(this, { taskId, attemptId, rawDir, request, session });
  }
  async captureOnce({ operationId, seq, tabId, timing, waitMs = 250 }) {
    timing.capture_started = operationClock();
    const result = await this.request('capture_screenshot', { tab_id: tabId, mode: 'viewport', device_mode: 'current', wait_ms: waitMs }, 45_000);
    timing.capture_finished = operationClock();
    if (result?.isError) {
      const errors = (result.content ?? []).filter(x => x.type === 'text').map(x => { try { return JSON.parse(x.text); } catch { return { error: x.text }; } });
      const pending = errors.some(x => x.cleanup_pending === true);
      throw Object.assign(fail(pending ? 'CAPTURE_CLEANUP_PENDING' : 'CAPTURE_FAILED', JSON.stringify(errors)), { cleanup_pending: pending, native_capture_errors: errors });
    }
    const png = result.content?.find(x => x.type === 'image' && x.mimeType === 'image/png');
    const metadataBlock = result.content?.find(x => x.type === 'text');
    let metadata;
    try { metadata = JSON.parse(metadataBlock?.text); } catch { throw fail('CAPTURE_METADATA_INVALID', 'Capture returned no structured metadata'); }
    if (!png || !metadata) throw fail('CAPTURE_MISSING_IMAGE', 'Capture returned no inline native PNG');
    const bytes = Buffer.from(png.data, 'base64');
    const check = inspectPng(bytes);
    const hash = sha256(bytes);
    if (!check.ok || metadata.sha256 !== hash || metadata.byte_length !== bytes.length
      || metadata.output_width !== check.width || metadata.output_height !== check.height)
      throw fail('FRAME_HASH_MISMATCH', 'Native image bytes do not match the capture metadata');
    if (!metadata.capture_id || !metadata.timestamp || !metadata.source_url || metadata.mode !== 'viewport'
      || !Number.isFinite(Date.parse(metadata.timestamp)) || metadata.effective_emulation?.device_mode !== 'current'
      || !Number.isFinite(metadata.effective_emulation.device_scale_factor) || metadata.effective_emulation.device_scale_factor <= 0
      || !metadata.css_rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(metadata.css_rect[key]))
      || metadata.css_rect.width <= 0 || metadata.css_rect.height <= 0)
      throw fail('CAPTURE_METADATA_INVALID', 'Native capture is missing source or viewport identity');
    const screenshotPath = path.join(this.rawDir, 'shots', `${String(seq).padStart(4, '0')}.png`);
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, bytes, { flag: 'wx' });
    const receipt = {
      frame_id: randomUUID(), task_id: this.taskId, attempt_id: this.attemptId, operation_id: operationId,
      tab_id: tabId, capture_id: metadata.capture_id, source_url: metadata.source_url, timestamp: metadata.timestamp,
      css_rect: metadata.css_rect, output_width: metadata.output_width, output_height: metadata.output_height,
      device_scale_factor: metadata.effective_emulation.device_scale_factor, byte_length: bytes.length, sha256: hash,
      screenshot_path: screenshotPath, emitted_at: null,
      model_image_detail: 'original',
    };
    this.session.rememberFrame(receipt);
    return { receipt, image: { ...png, _meta: { ...png._meta, 'codex/imageDetail': 'original' } }, metadata };
  }
}
