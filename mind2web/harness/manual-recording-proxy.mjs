import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { StdioClient } from './mcp-client.mjs';
import { resultData, resultOK, DEFAULT_REASON } from './mcp-record-proxy.mjs';
import { profileFor, toolsForProfile, publicCatalogReceipt, COORDINATE_TOOLS, SHEET_TOOLS, classifyTool, actorToolSchema, checkJavascriptPolicy } from './browser-manual-profile.mjs';
import { PublicReleaseClient } from './public-release-client.mjs';
import { publicNativeCaptureFailure } from './public-disposition.mjs';
import { OwnedTaskSession } from './owned-task-session.mjs';
import { ObservationRecorder } from './observation-recorder.mjs';
import { BrowserScheduler, operationClock } from './browser-scheduler.mjs';
import { closeChromeTabs } from './chrome-tabs.mjs';

const errorResult = (code, error, outcome = 'not_executed') => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ success: false, code, error, execution_outcome: outcome }) }] });
const idFromResult = result => resultData(result).map(x => x.tab_id ?? x.tabId ?? x.tab?.id).find(Number.isInteger);
const unknown = result => resultData(result).some(row => row.mayHaveExecuted === true || row.execution_outcome === 'unknown'
  || row.outcome === 'unknown' || /^Detected:\s*Action outcome unknown(?:\r?\n|$)/i.test(row.text ?? '')
  || /unknown outcome|outcome.{0,12}unknown|may have|may already|timed? out|timeout|connection.*(?:lost|closed|failed)|disconnected|server exited|unresponsive/i.test(row.error ?? row.message ?? ''));
const digest = value => createHash('sha256').update(value).digest('hex');
// The public open_tab returns before navigation, so a capture can briefly see about:blank.
const TRANSIENT_CAPTURE = /Frame with ID \d+ was removed|No frame with (?:given )?id|Cannot find context with specified id|Execution context was destroyed|Inspected target navigated or closed|did not respond before the (?:capture|page-read) deadline|Browser internal page \(about:blank\)|SCREENSHOT_REGION_OUT_OF_BOUNDS|Cannot access contents of the page/i;
// Another tab can briefly become visible (a popup, or another client sharing the
// window), so a refused capture re-focuses the task tab before it is repeated.
const FOCUS_RACE = /Cannot access contents of the page/i;
// The public release's settled refusal for a listed tab owned by another agent.
export const foreignOwnershipText = result => resultData(result).map(row => row.text ?? row.error ?? '')
  .find(text => /Detected: Tab ownership[\s\S]*is owned by agent_[\w-]+, not the calling agent/.test(text)) ?? null;

export class ManualRecordingProxy {
  constructor({ command, rawDir, startUrl, taskId = 'fixture', attemptId = 'attempt-1', env, scheduler = new BrowserScheduler(),
    maxActions = 120, deadline = Infinity, onLimit, onDenied, onFault, clientLabel = 'Claude', upstream, public_release = false, publicRelease = public_release, publicCatalog, beforePublicDispatch,
    closeTabs = closeChromeTabs }) {
    Object.assign(this, { command, rawDir: path.resolve(rawDir), startUrl: new URL(startUrl).href, taskId, attemptId,
      scheduler, maxActions, deadline, onLimit, onDenied, onFault, clientLabel });
    this.publicRelease = publicRelease === true; this.profile = profileFor(this.publicRelease); this.allowedTools = toolsForProfile(this.profile);
    this.beforePublicDispatch = beforePublicDispatch; this.closeTabs = closeTabs;
    this.expectedPublicCatalog = publicCatalog ? publicCatalogReceipt(publicCatalog) : null;
    const raw = upstream ?? new StdioClient(command, { env, timeoutMs: 60_000, ...(this.publicRelease ? { stderr: null } : {}) });
    this.upstream = this.publicRelease && typeof raw.prepareGuard !== 'function' ? new PublicReleaseClient(raw, { clientLabel }) : raw;
    this.session = new OwnedTaskSession(); this.seq = 0; this.ownerId = `${taskId}/${attemptId}/${randomUUID()}`;
    this.pendingVerification = new Map(); this.verificationObservations = new Map();
    this.gatewayContext = new AsyncLocalStorage();
    this.meta = { profile: this.profile.id, ...(this.publicRelease ? { public_release: true, public_behavior: this.profile.public_behavior } : {}), task_id: taskId, attempt_id: attemptId, start_url: this.startUrl, tab_id: null,
      counts: { actions: 0, reads: 0, denied: 0, screenshot_errors: 0, screenshot_retries: 0, actor_mutations_dispatched: 0 },
      default_visual_reason: DEFAULT_REASON, started_at: new Date().toISOString(), owned_tabs: [], cleanup_ok: null };
    this.ready = mkdir(this.rawDir, { recursive: true });
    this.observations = new ObservationRecorder({ taskId, attemptId, rawDir: this.rawDir, session: this.session,
      request: async (name, args, timeout) => {
        const result = await this.request(name, args, timeout, { drain: true });
        if (this.publicRelease && name === 'capture_screenshot') {
          this.publicCaptureEvidence = publicNativeCaptureFailure(result);
          if (this.publicCaptureEntry && result?.isError) this.publicCaptureEntry.native_capture_result = structuredClone(result);
        }
        return result;
      } });
  }
  get tabId() { return this.session.primaryTabId; }
  async preparePublicRelease() {
    if (!this.publicRelease) return;
    this.publicPrepared ??= (async () => {
      await this.ready;
      this.meta.public_guard = await this.scheduler.run(this.ownerId, async () => {
        await this.checkPublicAttachment(); return this.upstream.prepareGuard();
      }, { deadline: this.deadline });
      if (this.meta.public_guard?.ok !== true) throw new Error('Public guard continuity could not be prepared');
      await this.handle('tools/list');
      await this.saveMeta();
    })();
    return this.publicPrepared;
  }
  async checkPublicAttachment() {
    if (!this.publicRelease || !this.beforePublicDispatch) return;
    try {
      const proof = await this.beforePublicDispatch();
      if (proof?.ok === false || proof === false) throw new Error('Public extension attachment changed');
    } catch {
      this.meta.uncertain_upstream = true; this.scheduler.halt('Public extension attachment changed or is unverified');
      throw Object.assign(new Error('Public extension attachment changed or is unverified'), { code: 'PUBLIC_ATTACHMENT_CHANGED', dispatched: false });
    }
  }
  async saveMeta() {
    this.metaWrites = (this.metaWrites ?? Promise.resolve()).catch(() => {}).then(async () => {
      await this.ready; await writeFile(path.join(this.rawDir, 'proxy-meta.json'), JSON.stringify(this.meta, null, 2) + '\n');
    });
    return this.metaWrites;
  }
  accountToolAttempt(name) {
    let classification;
    try { classification = classifyTool(name, this.profile); } catch {}
    const action = !classification || Boolean(this.profile.actions[name]);
    if (action && this.meta.counts.actions >= this.maxActions) return { action, charged: false, limit: true };
    this.meta.counts[action ? 'actions' : 'reads']++;
    return { action, charged: true, limit: false };
  }
  async accountGatewayRequest(method, params, context) {
    if (method !== 'tools/call') return null;
    context.accounting ??= this.accountToolAttempt(params?.name);
    await this.saveMeta();
    return context.accounting.limit ? { code: 'ACTION_LIMIT', message: '120 mutating/UI tool-call attempts exhausted' } : null;
  }
  async rejectGatewayRequest(method, params, context, code, message) {
    if (method !== 'tools/call') return null;
    if (!context.accounting) await this.accountGatewayRequest(method, params, context);
    if (!context.rejectionRecorded) {
      context.rejectionRecorded = true; this.meta.counts.denied++;
      if (code === 'GATEWAY_QUEUE_TIMEOUT') this.meta.queue_expiries = (this.meta.queue_expiries ?? 0) + 1;
      await appendFile(path.join(this.rawDir, 'gateway-rejections.jsonl'), JSON.stringify({ at: operationClock(),
        request_id: context.request_id, gateway_request_id: context.gateway_request_id,
        received: context.received, rejected: context.rejected, tool: params?.name, args: params?.arguments ?? {},
        code, error: message, execution_outcome: 'not_executed', budget_charged: context.accounting.charged,
        ui_attempt: context.accounting.action, queue_wait_ms: context.queue_wait_ms,
        operation_deadline_epoch_ms: context.operation_deadline_epoch_ms }) + '\n');
      await this.saveMeta();
      if (code === 'ACTION_LIMIT') this.onLimit?.();
    }
    return errorResult(code, message);
  }
  cancelGatewayRequest(context) {
    for (const [tabId, operationId] of context.affected_tabs ?? []) this.pendingVerification.set(tabId, operationId);
  }
  async metadataRequest(method, params) {
    const context = this.gatewayContext.getStore();
    if (context?.signal.aborted) throw Object.assign(new Error('Gateway request was cancelled before metadata dispatch'), { code: context.cancel_code ?? 'GATEWAY_CANCELLED', dispatched: false });
    const remaining = context ? context.operation_deadline_epoch_ms - context.now() : Infinity;
    if (remaining <= 0) throw Object.assign(new Error('Operation deadline reached before metadata dispatch'), { code: 'OPERATION_DEADLINE', dispatched: false });
    return this.upstream.request(method, params, { timeoutMs: Math.min(60_000, remaining) });
  }
  async noteEmitted(result, context) {
    let stage = 'validation', operationId;
    try {
      const receipts = resultData(result).filter(row => row?.observation).map(row => row.observation);
      const images = (result?.content ?? []).filter(block => block.type === 'image');
      if (images.length !== receipts.length) throw new Error('Actor response native image and observation counts differ');
      const expected = context?.returned_observations ?? [];
      if (context && (!Array.isArray(expected) || expected.length !== receipts.length))
        throw new Error('Actor response does not contain every observation prepared for this request');
      if (!receipts.length) { this.notifyPublicFault(); return; }
      const [{ inspectPng }, { sha256 }, { isDeepStrictEqual }] = await Promise.all([
        import('./png.mjs'), import('./observation-recorder.mjs'), import('node:util')]);
      const frames = [], frameIds = new Set(), operationIds = new Set();
      for (const [index, receipt] of receipts.entries()) {
        operationId = receipt.operation_id;
        const current = this.session.latestFrame(receipt.tab_id), image = images[index];
        if (!current || !isDeepStrictEqual(receipt, current) || current.emitted_at
          || receipt.task_id !== this.taskId || receipt.attempt_id !== this.attemptId
          || frameIds.has(receipt.frame_id) || operationIds.has(receipt.operation_id)
          || (context && (!Array.isArray(context.operation_ids) || !context.operation_ids.includes(receipt.operation_id)
            || !expected.some(frame => isDeepStrictEqual(frame, receipt)))))
          throw new Error('Emitted frame does not match this task and operation observation');
        if (receipt.model_image_detail !== 'original' || image.mimeType !== 'image/png'
          || image._meta?.['codex/imageDetail'] !== 'original' || typeof image.data !== 'string')
          throw new Error('Actor response requires a native PNG with original image metadata');
        const bytes = Buffer.from(image.data, 'base64'), check = inspectPng(bytes);
        if (bytes.toString('base64') !== image.data || !check.ok || sha256(bytes) !== receipt.sha256
          || bytes.length !== receipt.byte_length || check.width !== receipt.output_width || check.height !== receipt.output_height)
          throw new Error('Actor response native PNG does not match the recorded frame bytes and dimensions');
        frameIds.add(receipt.frame_id); operationIds.add(receipt.operation_id); frames.push(current);
      }
      stage = 'journal';
      for (const current of frames) {
        operationId = current.operation_id;
        await appendFile(path.join(this.rawDir, 'emissions.jsonl'), JSON.stringify({ frame_id: current.frame_id,
          operation_id: current.operation_id, task_id: this.taskId, tab_id: current.tab_id, sha256: current.sha256,
          ...(context ? { request_id: context.request_id, gateway_request_id: context.gateway_request_id,
            gateway_received: context.received, gateway_dispatched: context.dispatched, gateway_finished: context.finished,
            gateway_queue_wait_ms: context.queue_wait_ms } : {}),
          byte_length: current.byte_length, model_image_detail: 'original', emitted: operationClock(),
          delivery: 'Verified full native PNG with original metadata in MCP response accepted by task socket writer; model processing is unobserved' }) + '\n');
      }
      this.notifyPublicFault();
      for (const current of frames) {
        current.emitted_at = new Date().toISOString();
        if (this.verificationObservations.has(current.operation_id)) {
          this.pendingVerification.delete(current.tab_id); this.verificationObservations.delete(current.operation_id);
        }
      }
    } catch (error) {
      const code = stage === 'journal' ? 'EMISSION_EVIDENCE_FAILED' : 'EMISSION_FRAME_INVALID';
      this.meta.fault = { code, error: error.message, ...(operationId ? { operation_id: operationId } : {}) };
      this.scheduler.halt(stage === 'journal' ? 'Actor image emission evidence could not be persisted' : 'Actor original image emission could not be verified');
      try { this.onFault?.(this.meta.fault); }
      finally { await this.saveMeta(); }
      throw Object.assign(error, { code });
    }
  }
  notifyPublicFault() {
    if (this.publicFaultNotified || !this.meta.public_native_failure) return;
    this.publicFaultNotified = true;
    this.onFault?.({ ...this.meta.fault, local_public_native_failure: true });
  }
  async request(name, args, timeoutMs = SHEET_TOOLS.has(name) ? 180_000 : 60_000, { drain = false, actorMutation = false } = {}) {
    if (this.scheduler.halted && !this.cleanupInProgress) throw Object.assign(new Error(this.scheduler.halted), { code: 'BROWSER_HALTED', dispatched: false });
    const context = this.gatewayContext.getStore();
    if (context?.signal.aborted && (!drain || !context.native_dispatches)) throw Object.assign(new Error('Gateway request was cancelled before this upstream call'), { code: context.cancel_code ?? 'GATEWAY_CANCELLED', dispatched: false });
    if (!drain && !this.cleanupInProgress) this.scheduler.assertCanDispatch(this.ownerId, this.deadline);
    await this.checkPublicAttachment();
    const remaining = (context?.operation_deadline_epoch_ms ?? this.requestDeadline ?? Infinity) - (context?.now() ?? Date.now());
    if (remaining <= 0) throw Object.assign(new Error('Operation deadline reached before this upstream call'), { code: 'OPERATION_DEADLINE', dispatched: false });
    if (context) { context.native_dispatches = (context.native_dispatches ?? 0) + 1; context.first_native_dispatch ??= operationClock(); }
    if (actorMutation) this.meta.counts.actor_mutations_dispatched++;
    return this.upstream.request('tools/call', { name, arguments: args }, { timeoutMs: Math.min(timeoutMs, remaining) });
  }
  async inventory() {
    try {
      const result = await this.request('list_tabs', {}, 10_000);
      const rows = this.session.syncOwnedChildren(result);
      this.meta.owned_tabs = rows.map(row => row.id); return { result, rows };
    } catch (error) {
      if (error.dispatched === false) throw error;
      throw Object.assign(new Error('Authoritative owned-tab inventory failed: ' + error.message), { code: 'OWNED_INVENTORY_FAILED' });
    }
  }
  async focus(tabId, timing, { drain = false } = {}) {
    const interval = { tab_id: tabId, started: operationClock(), phase: drain ? 'capture' : 'input' };
    (timing.focus_intervals ??= []).push(interval);
    timing.focus_started ??= interval.started;
    let result;
    try {
      result = await this.request('switch_tab', { tabId, active: true, visual_reason: 'Focus this task-owned tab for browser input and its observation', client: this.clientLabel }, 15_000, { drain });
      if (unknown(result) || resultData(result).some(row => row.cleanup_pending === true || row.in_flight === true)) throw new Error('Native foreground operation has an unverified outcome');
      const foreign = this.publicRelease && !resultOK(result) ? foreignOwnershipText(result) : null;
      if (foreign) {
        this.session.markForeign(tabId, foreign); this.upstream.markForeign?.(tabId);
        (this.meta.public_foreign_tabs ??= []).push({ tab_id: tabId, stage: 'focus', native_error: foreign, at: new Date().toISOString() });
        throw Object.assign(new Error('FSB lists this tab but assigns it to another agent, so this task cannot focus it: ' + foreign), { code: 'PUBLIC_TAB_NOT_CONTROLLABLE', dispatched: true, settled: true });
      }
    } catch (error) {
      if (error.dispatched === false || error.code === 'PUBLIC_TAB_NOT_CONTROLLABLE') throw error;
      this.meta.uncertain_upstream = true;
      this.scheduler.halt('Native foreground completion is unverified');
      this.onFault?.({ code: 'FOREGROUND_UNCERTAIN', error: error.message });
      throw Object.assign(new Error('Native foreground completion is unverified: ' + error.message), { code: 'FOREGROUND_UNCERTAIN' });
    } finally {
      interval.finished = operationClock();
      timing.focus_finished ??= interval.finished;
    }
    if (!resultOK(result)) throw Object.assign(new Error(`Owned-tab foreground focus failed: ${JSON.stringify(resultData(result))}`), { code: 'FOREGROUND_FAILED' });
  }
  async checkFrame(args, tabId) {
    const frame = this.session.latestFrame(tabId);
    if (!frame || !frame.emitted_at || args.frame_id !== frame.frame_id)
      throw Object.assign(new Error('Use the latest emitted frame_id for this target tab'), { code: 'STALE_FRAME' });
    for (const [xKey, yKey] of [['x', 'y'], ['startX', 'startY'], ['endX', 'endY']]) {
      if (args[xKey] === undefined && args[yKey] === undefined) continue;
      if (!Number.isFinite(args[xKey]) || !Number.isFinite(args[yKey]) || args[xKey] < 0 || args[yKey] < 0
        || args[xKey] >= frame.css_rect.width || args[yKey] >= frame.css_rect.height)
        throw Object.assign(new Error('Coordinates must lie inside the current CSS viewport'), { code: 'FRAME_COORDINATES_OUT_OF_BOUNDS' });
    }
    const state = await this.request('execute_js', { tab_id: tabId, code: 'return {url:location.href,x:window.visualViewport?.pageLeft ?? scrollX,y:window.visualViewport?.pageTop ?? scrollY,width:window.visualViewport?.width ?? innerWidth,height:window.visualViewport?.height ?? innerHeight,dpr:devicePixelRatio};',
      client: this.clientLabel, visual_reason: 'Validate this coordinate action against its recorded frame geometry' }, 10_000);
    if (!resultOK(state)) throw Object.assign(new Error('Cannot validate coordinate frame geometry'), { code: 'FRAME_STATE_UNAVAILABLE' });
    const row = resultData(state).find(x => x.result !== undefined || x.value !== undefined);
    let geometry = row?.result ?? row?.value;
    if (typeof geometry === 'string') { try { geometry = JSON.parse(geometry); } catch {} }
    if (!geometry || !['x', 'y', 'width', 'height', 'dpr'].every(key => Number.isFinite(geometry[key]))
      || geometry.url !== frame.source_url || Math.abs(geometry.dpr - frame.device_scale_factor) > .01 || Math.abs(geometry.width - frame.css_rect.width) > 1
      || Math.abs(geometry.height - frame.css_rect.height) > 1 || Math.abs(geometry.x - frame.css_rect.x) > 1 || Math.abs(geometry.y - frame.css_rect.y) > 1)
      throw Object.assign(new Error('The page navigation, scroll position or viewport changed; request a fresh screenshot'), { code: 'STALE_FRAME' });
  }
  async capture(entry, tabId, timing, waitMs) {
    if (this.scheduler.halted) throw Object.assign(new Error(this.scheduler.halted), { code: 'BROWSER_HALTED', dispatched: false });
    await this.focus(tabId, timing, { drain: true });
    let recorded;
    this.publicCaptureEntry = entry; this.publicCaptureEvidence = null;
    try {
      // A navigation can replace the frame mid-capture. This only repeats the
      // observation, never the action, and every failed attempt stays recorded.
      for (let attempt = 1; !recorded; attempt++) {
        try { recorded = await this.observations.captureOnce({ operationId: entry.operation_id, seq: entry.seq, tabId, timing, waitMs }); }
        catch (error) {
          const transient = error.code === 'CAPTURE_FAILED' && !error.cleanup_pending && TRANSIENT_CAPTURE.test(error.message)
            && attempt < (/about:blank/.test(error.message) ? 8 : 5) && Date.now() + 5000 < (this.requestDeadline ?? Infinity);
          if (!transient) throw error;
          this.meta.counts.screenshot_retries++;
          (entry.capture_retries ??= []).push({ attempt, error: error.message.slice(0, 400), at: new Date().toISOString() });
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          if (FOCUS_RACE.test(error.message)) await this.focus(tabId, timing, { drain: true });
        }
      }
      delete entry.native_capture_result;
    }
    catch (error) {
      if (this.publicRelease && error.code === 'CAPTURE_FAILED' && this.publicCaptureEvidence && !error.cleanup_pending) {
        this.meta.public_native_failure = { kind: 'public_native_failure', native_result_verified: true,
          native_error: { operation_id: entry.operation_id, tool: 'capture_screenshot', response_sha256: this.publicCaptureEvidence.response_sha256,
            code: this.publicCaptureEvidence.code }, effect_unknown: entry.execution_outcome === 'unknown', missing_frame: true,
          original_fault: { code: error.code, error: error.message, seq: entry.seq } };
        this.meta.task_dispatch_halted = true;
      }
      if (error.cleanup_pending) {
        this.meta.capture_cleanup_pending = { tab_id: tabId, operation_id: entry.operation_id, native_errors: error.native_capture_errors };
        this.scheduler.halt('Native capture cleanup remains unverified for this task-owned tab');
      }
      throw error;
    } finally { this.publicCaptureEntry = null; }
    Object.assign(entry, { screenshot_path: recorded.receipt.screenshot_path, screenshot_error: null, url: recorded.receipt.source_url, frame_receipt: recorded.receipt });
    return recorded;
  }
  async record(kind, name, args, { bootstrap = false, directCapture = false } = {}) {
    // The task deadline prevents dispatch. An operation already dispatched gets
    // bounded drain time to preserve its actual outcome and post-action image.
    const context = this.gatewayContext.getStore();
    this.requestDeadline = context?.operation_deadline_epoch_ms ?? Date.now() + 295_000;
    const entry = { seq: this.seq++, operation_id: randomUUID(), kind, tool: name, args: structuredClone(args), tab_id: null,
      started_at: new Date().toISOString(), ended_at: null, ok: false, screenshot_path: null, screenshot_error: null, timing: {} };
    if (context) {
      Object.assign(entry, { request_id: context.request_id, gateway_request_id: context.gateway_request_id });
      Object.assign(entry.timing, { gateway_received: context.received, gateway_dispatched: context.dispatched,
        gateway_queue_wait_ms: context.queue_wait_ms, operation_deadline_epoch_ms: context.operation_deadline_epoch_ms });
      (context.operation_ids ??= []).push(entry.operation_id);
    }
    let result, observation;
    const research = kind === 'research_read';
    const execute = async () => {
      if (!bootstrap && !research) await this.inventory();
      let tabId = name === 'open_tab' ? null : research ? this.session.selectedTabId : this.session.resolveTarget(args);
      if (name === 'open_tab') this.session.assertCanOpen();
      if (name === 'close_tab') this.session.assertCanClose(tabId);
      if (kind === 'action' && !this.profile.potential_ui_reads?.includes(name) && this.pendingVerification.has(tabId)) throw Object.assign(new Error('The previous action outcome is unknown. Request a fresh page observation or screenshot and inspect the current state before another mutation.'), { code: 'VERIFICATION_REQUIRED' });
      if (COORDINATE_TOOLS.has(name)) await this.checkFrame(args, tabId);
      const effective = { ...args }; delete effective.frame_id;
      if (name !== 'open_tab' && !research) {
        delete effective.tabId;
        if (name === 'switch_tab') effective.tabId = tabId;
        else effective.tab_id = tabId;
      }
      if (this.profile.actions[name] || bootstrap) {
        effective.client = this.clientLabel; effective.visual_reason ||= DEFAULT_REASON;
        if (name !== 'open_tab') await this.focus(tabId, entry.timing);
      }
      if (name === 'search' && !this.publicRelease) effective.allow_web_fallback = false;
      if (name === 'close_tab') effective.allow_active = true;
      if (name === 'open_tab' || name === 'switch_tab') effective.active = true;
      if (!research && !bootstrap && Date.now() >= this.deadline) throw Object.assign(new Error('Task deadline reached before upstream dispatch'), { code: 'TASK_DEADLINE' });
      entry.tab_id = tabId; entry.effective_args = effective;
      if (!directCapture) {
        entry.timing.upstream_started = operationClock();
        try { result = await this.request(name, effective, undefined, { actorMutation: kind === 'action' }); }
        catch (error) {
          if (error.dispatched === false) throw error;
          result = errorResult('UPSTREAM_UNCERTAIN', error.message, 'unknown');
          this.scheduler.halt(`Uncertain upstream execution for ${this.taskId}: ${error.message}`);
          this.meta.uncertain_upstream = true;
          this.onFault?.({ code: 'UPSTREAM_UNCERTAIN', error: error.message, seq: entry.seq });
        }
        entry.timing.upstream_finished = operationClock();
        entry.ok = resultOK(result); entry.execution_outcome = entry.ok ? 'reported_success' : unknown(result) ? 'unknown' : 'reported_failure';
        if (kind === 'action' && entry.execution_outcome === 'unknown') this.pendingVerification.set(tabId, entry.operation_id);
        if (resultData(result).some(row => row.cleanup_pending === true || row.in_flight === true)) {
          this.meta.uncertain_upstream = true; this.scheduler.halt('Native action cleanup or execution remains in flight');
          this.onFault?.({ code: 'UPSTREAM_UNCERTAIN', error: 'Native action cleanup or execution remains in flight', seq: entry.seq });
        }
        if (this.meta.uncertain_upstream) { entry.screenshot_error = 'No further browser operation was dispatched while upstream execution remained uncertain'; return; }
        if (entry.ok && name === 'open_tab') { tabId = idFromResult(result); this.session.registerOpenedTab(tabId); this.meta.tab_id ??= tabId; }
        if (entry.ok && name === 'switch_tab') this.session.selectTab(tabId);
        if (research) { if (name === 'list_tabs') this.session.syncOwnedChildren(result); return; }
        if (name === 'close_tab') { await this.inventory(); tabId = this.session.selectedTabId; }
      }
      entry.tab_id = tabId;
      if (!tabId) throw Object.assign(new Error('No remaining task-owned tab for the observation'), { code: 'NO_OWNED_TAB' });
      observation = await this.capture(entry, tabId, entry.timing, args.wait_ms);
      if (directCapture) { result = { content: [] }; entry.ok = true; entry.execution_outcome = 'observed'; }
    };
    try {
      if (kind === 'read' || research) {
        if (research) await execute();
        else {
          await this.inventory(); const tabId = this.session.resolveTarget(args, { allowForeign: this.publicRelease }); entry.tab_id = tabId;
          const foreignRead = this.session.foreign.has(tabId);
          if (foreignRead) entry.kind = 'foreign_read';
          if (Date.now() >= this.deadline) throw Object.assign(new Error('Task deadline reached before read dispatch'), { code: 'TASK_DEADLINE' });
          entry.timing.upstream_started = operationClock();
          try { result = await this.request(name, { ...args, tab_id: tabId }); }
          catch (error) {
            if (error.dispatched === false) throw error;
            this.meta.uncertain_upstream = true; this.scheduler.halt('Upstream read completion is unverified');
            this.onFault?.({ code: 'UPSTREAM_UNCERTAIN', error: error.message, seq: entry.seq });
            result = errorResult('READ_FAILED', error.message, 'unknown');
          }
          entry.timing.upstream_finished = operationClock(); entry.ok = resultOK(result);
          entry.execution_outcome = entry.ok ? 'reported_success' : unknown(result) ? 'unknown' : 'reported_failure';
          if (resultData(result).some(row => row.cleanup_pending === true || row.in_flight === true)) {
            this.meta.uncertain_upstream = true; this.scheduler.halt('Native read cleanup or execution remains in flight');
            this.onFault?.({ code: 'UPSTREAM_UNCERTAIN', error: 'Native read cleanup or execution remains in flight', seq: entry.seq });
          }
          if (this.meta.uncertain_upstream) entry.screenshot_error = 'No capture was dispatched while upstream read completion remained unverified';
          if (foreignRead) entry.screenshot_error = 'No capture: FSB assigns this listed tab to another agent, so it cannot be brought to the foreground';
          else if (!this.meta.uncertain_upstream) observation = await this.scheduler.run(this.ownerId, () => this.capture(entry, tabId, entry.timing),
            { cleanup: true, hardDeadline: this.requestDeadline, timing: entry.timing });
        }
      } else await this.scheduler.run(this.ownerId, execute, { deadline: this.deadline, hardDeadline: this.requestDeadline, timing: entry.timing });
    } catch (error) {
      entry.error_code = error.code ?? 'HARNESS_ERROR';
      if (!result) result = errorResult(entry.error_code, error.message);
      entry.error = error.message;
      // A read that ran but whose tab turned out foreign has no frame to export.
      if (error.code === 'PUBLIC_TAB_NOT_CONTROLLABLE' && entry.timing.upstream_started && kind === 'read') entry.kind = 'foreign_read';
      if (!entry.timing.upstream_started && !entry.timing.capture_started) entry.kind = 'denied';
      if (entry.timing.capture_started || /CAPTURE|FRAME_HASH|FOREGROUND|OWNED_INVENTORY|NO_OWNED_TAB/.test(entry.error_code)) {
        entry.screenshot_error = error.message; this.meta.counts.screenshot_errors++;
        this.meta.fault = { code: entry.error_code, error: error.message, seq: entry.seq };
        if (!this.meta.public_native_failure || this.meta.public_native_failure.native_error.operation_id !== entry.operation_id) {
          this.scheduler.halt(`Browser ownership or evidence verification failed for ${this.taskId}: ${entry.error_code}`);
          this.onFault?.(this.meta.fault);
        }
      }
      if (entry.error_code === 'BROWSER_QUEUE_TIMEOUT') this.meta.queue_expiries = (this.meta.queue_expiries ?? 0) + 1;
    }
    entry.error ??= resultOK(result) ? null : JSON.stringify(resultData(result));
    entry.result_text = resultData(result).map(x => JSON.stringify(x)).join('\n');
    if (context && kind === 'action' && entry.execution_outcome && entry.tab_id) {
      (context.affected_tabs ??= new Map()).set(entry.tab_id, entry.operation_id);
      if (context.signal.aborted) this.cancelGatewayRequest(context);
    }
    if (observation) {
      entry.timing.prepared_for_emission = operationClock();
      if ((['read', 'capture'].includes(kind) || this.profile.potential_ui_reads?.includes(name)) && entry.ok) this.verificationObservations.set(entry.operation_id, observation.receipt.tab_id);
      if (context && !bootstrap) (context.returned_observations ??= []).push(structuredClone(observation.receipt));
      result = { ...result, content: [...(result?.content ?? []).filter(x => x.type !== 'image'),
        { type: 'text', text: JSON.stringify({ observation: observation.receipt }) }, observation.image] };
    }
    if (this.meta.public_native_failure?.native_error.operation_id === entry.operation_id) {
      result = { ...result, isError: true, content: [...(result?.content ?? []),
        ...(entry.native_capture_result?.content ?? []), { type: 'text', text: JSON.stringify({ success: false,
          code: 'PUBLIC_NATIVE_OBSERVATION_UNAVAILABLE', missing_frame: true, original_fault: this.meta.public_native_failure.original_fault }) }] };
    }
    entry.ended_at = new Date().toISOString();
    await appendFile(path.join(this.rawDir, 'steps.jsonl'), JSON.stringify(entry) + '\n'); await this.saveMeta();
    return { result, entry };
  }
  async bootstrap() {
    this.boot ??= (async () => {
      if (this.publicRelease) await this.preparePublicRelease();
      const readyUntil = Math.min(this.deadline, Date.now() + 10_000); let ready = false, lastError;
      while (Date.now() < readyUntil && !ready) {
        try { await this.inventory(); ready = true; }
        catch (error) { if (error.dispatched === false) throw error; lastError = error; if (Date.now() < readyUntil) await new Promise(resolve => setTimeout(resolve, 250)); }
      }
      if (!ready) throw new Error('Scoped FSB connection did not become ready: ' + lastError?.message);
      const { entry } = await this.record('bootstrap', 'open_tab', { url: this.startUrl, active: true, visual_reason: 'Open the benchmark starting page', client: this.clientLabel }, { bootstrap: true });
      if (!entry.ok || !entry.screenshot_path) throw Object.assign(new Error('Benchmark bootstrap failed: ' + (entry.error ?? entry.screenshot_error)), { code: entry.error_code });
    })();
    return this.boot;
  }
  async handle(method, params = {}, context) {
    if (context) return this.gatewayContext.run(context, () => this.handle(method, params));
    await this.ready;
    if (method === 'initialize') {
      const result = await this.metadataRequest(method, params); return { ...result, capabilities: { tools: {} } };
    }
    if (method === 'tools/list') {
      const tools = []; let cursor;
      do { const page = await this.metadataRequest(method, cursor ? { cursor } : {}); tools.push(...page.tools ?? []); cursor = page.nextCursor; } while (cursor);
      for (const name of this.allowedTools) if (!tools.some(t => t.name === name)) throw new Error(`Installed FSB is missing profile tool ${name}`);
      if (this.publicRelease) {
        const receipt = publicCatalogReceipt(tools);
        if ((this.expectedPublicCatalog && this.expectedPublicCatalog.source_catalog_sha256 !== receipt.source_catalog_sha256)
            || (this.meta.public_catalog && this.meta.public_catalog.source_catalog_sha256 !== receipt.source_catalog_sha256)) {
          this.scheduler.halt('Public registered tool catalog changed'); throw new Error('Public registered tool catalog differs from its frozen receipt');
        }
        this.meta.public_catalog = receipt;
        await writeFile(path.join(this.rawDir, 'public-tools.json'), JSON.stringify({ tools }, null, 2) + '\n'); await this.saveMeta();
      }
      return { tools: tools.filter(t => this.allowedTools.includes(t.name)).map(tool => actorToolSchema(tool, this.profile)) };
    }
    if (method === 'resources/list') return { resources: [] };
    if (method === 'resources/templates/list') return { resourceTemplates: [] };
    if (method === 'prompts/list') return { prompts: [] };
    if (method === 'ping') return {};
    if (method !== 'tools/call') throw new Error(`Method ${method} is disabled`);
    const name = params.name, args = { ...(params.arguments ?? {}) };
    if (this.meta.task_dispatch_halted) return errorResult('PUBLIC_NATIVE_OBSERVATION_UNAVAILABLE', 'This task stopped after a native capture failure; no later tool was dispatched');
    try { this.scheduler.assertCanDispatch(this.ownerId, this.deadline); }
    catch (error) { return errorResult(error.code, error.message); }
    const accounting = this.gatewayContext.getStore()?.accounting ?? this.accountToolAttempt(name);
    if (accounting.limit) { this.onLimit?.(); return errorResult('ACTION_LIMIT', '120 mutating/UI tool-call attempts exhausted'); }
    let classification;
    try { classification = classifyTool(name, this.profile); }
    catch (error) {
      this.meta.counts.denied++; this.onDenied?.(name);
      await appendFile(path.join(this.rawDir, 'denied-tools.jsonl'), JSON.stringify({ at: new Date().toISOString(), tool: name, args,
        error: error.message, budget_policy: 'Unknown or excluded tool attempts conservatively consume the UI budget', execution_outcome: 'not_executed' }) + '\n');
      await this.saveMeta(); return errorResult(error.code, error.message);
    }
    if (this.profile.actions[name]) {
      args.client = this.clientLabel; args.visual_reason ||= DEFAULT_REASON;
    }
    await this.bootstrap();
    if (Date.now() >= this.deadline) return errorResult('TASK_DEADLINE', 'Task deadline reached');
    if (name === 'execute_js') {
      const violation = checkJavascriptPolicy(args.code);
      if (violation) {
        await appendFile(path.join(this.rawDir, 'policy-violations.jsonl'), JSON.stringify({ at: new Date().toISOString(), tool: name, args, error: violation }) + '\n');
        await this.saveMeta(); return errorResult('JAVASCRIPT_POLICY', violation);
      }
    }
    if (name === 'capture_screenshot' && Object.keys(args).some(key => !['tab_id', 'wait_ms'].includes(key))) return errorResult('CAPTURE_PROFILE', 'Use current viewport capture without crop or device emulation');
    if (name === 'capture_screenshot' && args.wait_ms !== undefined
      && (!Number.isFinite(args.wait_ms) || args.wait_ms < 0 || args.wait_ms > 5000))
      return errorResult('INVALID_SCREENSHOT_ARGUMENTS', 'wait_ms must be a finite number from0 through5000; no capture was dispatched');
    const kind = this.profile.actions[name] ? 'action' : classification === 'research_read' ? 'research_read' : classification === 'capture' ? 'capture' : 'read';
    return (await this.record(kind, name, args, { directCapture: classification === 'capture' })).result;
  }
  async close({ closeTab = true } = {}) {
    if (this.publicRelease) return this.closePublic({ closeTab });
    this.closing ??= (async () => {
      this.scheduler.cancelOwner(this.ownerId);
      const cleanup = { started_at: new Date().toISOString(), scope: 'same task upstream agent', closes: [], lists: [], ok: false };
      try {
        this.cleanupInProgress = true;
        this.requestDeadline = Date.now() + 295_000;
        if (this.meta.capture_cleanup_pending || this.meta.uncertain_upstream) throw new Error('Native operation cleanup is still unverified; no further focus/close operation was dispatched');
        if (closeTab && this.boot) await this.scheduler.run(this.ownerId, async () => {
          for (let round = 0; round < 3; round++) {
            const { rows } = await this.inventory(); cleanup.lists.push({ at: new Date().toISOString(), tab_ids: rows.map(t => t.id) });
            if (!rows.length) { cleanup.ok = true; break; }
            for (const tab of rows) {
              const result = await this.request('close_tab', { tab_id: tab.id, allow_active: true, visual_reason: 'Close only this finished benchmark task-owned tab', client: this.clientLabel }, 40_000);
              cleanup.closes.push({ tab_id: tab.id, ok: resultOK(result), result: resultData(result) });
              if (!resultOK(result)) throw new Error('Owned tab close failed');
            }
          }
          if (!cleanup.ok) { const { rows } = await this.inventory(); cleanup.ok = rows.length === 0; }
          if (!cleanup.ok) throw new Error('Owned tab absence could not be verified');
        }, { cleanup: true });
        else { cleanup.ok = true; cleanup.not_applicable_no_browser_dispatch = !this.boot; }
      } catch (error) { cleanup.error = error.message; this.scheduler.halt('Unverified task-owned cleanup: ' + error.message); }
      finally {
        cleanup.ended_at = new Date().toISOString(); this.meta.cleanup_ok = cleanup.ok; this.meta.cleanup_error = cleanup.error ?? null;
        this.meta.child_cleanup = cleanup; this.meta.ended_at = cleanup.ended_at;
        await writeFile(path.join(this.rawDir, 'childcleanup.json'), JSON.stringify(cleanup, null, 2) + '\n'); await this.saveMeta(); await this.upstream.close();
      }
    })();
    return this.closing;
  }
  async closePublic({ closeTab = true } = {}) {
    this.closing ??= (async () => {
      this.scheduler.cancelOwner(this.ownerId);
      const cleanup = { started_at: new Date().toISOString(), public_release: true,
        scope: 'Public guard continuity with exact task/guard close acknowledgements; no private registry-drain claim',
        closes: [], lists: [], ok: false };
      let health, finalClient;
      try {
        this.cleanupInProgress = true; this.requestDeadline = Date.now() + 295_000;
        if (this.meta.capture_cleanup_pending || this.meta.uncertain_upstream) throw new Error('Uncertain native work forbids further public focus/close calls');
        if (this.meta.public_guard?.ok) await this.scheduler.run(this.ownerId, async () => {
          if (closeTab) {
            const closedIds = new Set();
            for (let round = 0; round < 3; round++) {
              const { rows } = await this.inventory(); cleanup.lists.push({ at: new Date().toISOString(), tab_ids: rows.map(row => row.id) });
              if (!rows.length) break;
              for (const tab of rows) {
                if (closedIds.has(tab.id)) throw new Error('A closed public task tab reappeared; it was not closed again');
                closedIds.add(tab.id);
                const result = await this.request('close_tab', { tab_id: tab.id, allow_active: true,
                  visual_reason: 'Close only this public benchmark task-owned tab', client: this.clientLabel }, 40_000);
                const data = resultData(result), row = data[0];
                const id = row?.tab_id ?? row?.tabId ?? row?.id;
                const verified = resultOK(result) && data.length === 1 && row?.success === true && row?.closed === true && id === tab.id;
                const foreign = !verified && !resultOK(result) ? foreignOwnershipText(result) : null;
                cleanup.closes.push({ tab_id: tab.id, ok: verified, ...(foreign ? { foreign_owned: true } : {}), result: data });
                if (foreign) {
                  this.session.markForeign(tab.id, foreign); this.upstream.markForeign?.(tab.id);
                  (this.meta.public_foreign_tabs ??= []).push({ tab_id: tab.id, stage: 'cleanup_close', native_error: foreign, at: new Date().toISOString() });
                  continue;
                }
                if (!verified) {
                  // FSB can time out closing a renderer-hung page. The harness then
                  // closes that exact Chrome tab itself and requires its absence.
                  const fallback = await this.closeTabs([tab.id]).catch(error => ({ ok: false, error: error.message }));
                  cleanup.closes.at(-1).osascript_fallback = fallback;
                  const { rows: after } = await this.inventory();
                  if (!fallback.ok || !fallback.closed?.includes(tab.id) || after.some(row => row.id === tab.id))
                    throw new Error('Exact public task-tab close acknowledgement is missing and the exact-ID fallback was not verified');
                  cleanup.closes.at(-1).ok = true; cleanup.closes.at(-1).method = 'osascript_exact_tab_id_after_unacknowledged_close';
                }
              }
            }
          }
          await this.checkPublicAttachment();
          cleanup.public_guard_drain = await this.upstream.verifyTaskDrain();
          if (cleanup.public_guard_drain?.ok !== true) throw new Error('Public guard-only drain was not verified');
          if (this.meta.public_native_failure && !this.scheduler.halted && !(this.meta.queue_expiries > 0)) {
            await this.checkPublicAttachment();
            const raw = await this.upstream.captureGuardHealth();
            const { inspectPng } = await import('./png.mjs');
            const image = raw?.image, bytes = image?.mimeType === 'image/png' && typeof image.data === 'string' ? Buffer.from(image.data, 'base64') : Buffer.alloc(0);
            const png = inspectPng(bytes), hash = digest(bytes);
            if (raw?.ok !== true || raw.read_verified !== true || !png.ok || image.data !== bytes.toString('base64')
                || raw.sha256 !== hash || raw.byte_length !== bytes.length || raw.output_width !== png.width || raw.output_height !== png.height
                || raw.metadata?.sha256 !== hash || raw.metadata?.byte_length !== bytes.length
                || raw.metadata?.output_width !== png.width || raw.metadata?.output_height !== png.height
                || raw.guard_tab_id !== this.upstream.getGuardId()) throw new Error('Independent public guard image/metadata did not verify');
            const pngPath = path.join(this.rawDir, 'public-health.png'); await writeFile(pngPath, bytes, { flag: 'wx' });
            health = { ...raw, image: undefined, guard_id: raw.guard_tab_id, not_actor_frame: true, native_metadata_verified: true,
              png: { path: pngPath, bytes: bytes.length, sha256: hash, width: png.width, height: png.height } };
            const data = JSON.stringify(health, null, 2) + '\n', file = path.join(this.rawDir, 'public-health.json');
            await writeFile(file, data, { flag: 'wx' });
            this.meta.public_health_evidence = { path: file, bytes: Buffer.byteLength(data), sha256: digest(data) };
          }
          await this.checkPublicAttachment();
          cleanup.public_guard_disposal = await this.upstream.disposeGuard();
          if (cleanup.public_guard_disposal?.ok !== true || cleanup.public_guard_disposal.closed !== true) throw new Error('Exact public guard close was not acknowledged');
          cleanup.ok = true;
        }, { cleanup: true });
        else if (!this.publicPrepared && !this.boot) { cleanup.ok = true; cleanup.not_applicable_no_browser_dispatch = true; }
        else throw new Error('Public guard setup was not verified; original task-scope cleanup is unknown');
      } catch (error) {
        cleanup.error = error.message; this.scheduler.halt('Public task cleanup/health remains unverified: ' + error.message);
      } finally {
        try { finalClient = await this.upstream.close(); }
        catch (error) { cleanup.error ??= error.message; }
        cleanup.public_client_shutdown = finalClient;
        if (this.session.foreign.size) {
          // FSB refuses to close these task popups, so the harness closes exactly
          // these Chrome tab IDs itself; the outcome is recorded either way.
          cleanup.foreign_tabs = [...this.session.foreign.values()];
          cleanup.foreign_tab_closure = await this.closeTabs([...this.session.foreign.keys()]).catch(error => ({ ok: false, error: error.message }));
        }
        if (!finalClient || finalClient.cleanup_ok !== true || finalClient.client_closed !== true) {
          cleanup.ok = false; cleanup.error ??= 'Public raw client or guard shutdown was not verified';
          this.scheduler.halt(cleanup.error);
        }
        cleanup.ended_at = new Date().toISOString(); this.meta.cleanup_ok = cleanup.ok; this.meta.cleanup_error = cleanup.error ?? null;
        cleanup.cleanup_ok = cleanup.ok;
        this.meta.child_cleanup = cleanup; this.meta.ended_at = cleanup.ended_at;
        const data = JSON.stringify(cleanup, null, 2) + '\n', file = path.join(this.rawDir, 'childcleanup.json');
        await writeFile(file, data);
        if (cleanup.ok && health && this.meta.public_native_failure && !this.meta.uncertain_upstream
            && !(this.meta.queue_expiries > 0) && !this.scheduler.halted) {
          this.meta.public_disposition = { version: 1, ...this.meta.public_native_failure,
            cleanup_verified: true, health_verified: true,
            cleanup_evidence: { path: file, bytes: Buffer.byteLength(data), sha256: digest(data) },
            health_evidence: this.meta.public_health_evidence };
        }
        await this.saveMeta();
      }
    })();
    return this.closing;
  }
}
