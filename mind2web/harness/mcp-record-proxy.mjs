import { mkdir, appendFile, writeFile, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioClient } from './mcp-client.mjs';
import { inspectPng } from './png.mjs';
import { DEFAULT_ALLOWLIST_PATH } from './v2-writer.mjs';

export const DEFAULT_REASON = 'Perform the requested browser action';
export function resultData(result) {
  return (result?.content ?? []).filter(c => c.type === 'text').map(c => {
    try { return JSON.parse(c.text); } catch { return { text: c.text }; }
  });
}
export function resultOK(result) {
  return !!result && !result.isError && !resultData(result).some(d => d.success === false || d.error);
}
function toolError(message) { return { isError: true, content: [{ type: 'text', text: message }] }; }

export class RecordingProxy {
  constructor({ command, rawDir, startUrl, allowlist, env, clientLabel = 'Claude', maxActions = Infinity, onLimit, onDenied }) {
    this.rawDir = path.resolve(rawDir);
    this.startUrl = new URL(startUrl).href;
    this.allowlist = allowlist;
    if (!['Claude', 'Codex'].includes(clientLabel)) throw new Error('Unsupported benchmark client label');
    this.clientLabel = clientLabel;
    this.maxActions = maxActions;
    this.onLimit = onLimit;
    this.onDenied = onDenied;
    this.upstream = new StdioClient(command, { env });
    this.seq = 0;
    this.tabId = null;
    this.meta = { start_url: this.startUrl, tab_id: null, allowlist_version: allowlist.version, fsb_server_cmd: command, client: clientLabel,
      default_visual_reason: DEFAULT_REASON, counts: { actions: 0, reads: 0, denied: 0, screenshot_errors: 0, screenshot_retries: 0 }, started_at: new Date().toISOString() };
    this.ready = mkdir(path.join(this.rawDir, 'shots'), { recursive: true });
  }
  async saveMeta() { await writeFile(path.join(this.rawDir, 'proxy-meta.json'), `${JSON.stringify(this.meta, null, 2)}\n`); }
  async screenshot(seq) {
    const attempts = [];
    const delays = [0, 300, 1000, 2500];
    for (const [index, delay] of delays.entries()) {
      if (delay) { this.meta.counts.screenshot_retries++; await new Promise(resolve => setTimeout(resolve, delay)); }
      const started_at = new Date().toISOString();
      try {
        const result = await this.upstream.request('tools/call', { name: 'capture_screenshot', arguments: { tab_id: this.tabId } });
        if (!resultOK(result)) throw new Error(JSON.stringify(resultData(result)));
        const img = result.content?.find(c => c.type === 'image' && c.mimeType === 'image/png');
        if (!img) throw new Error('No inline PNG returned');
        const bytes = Buffer.from(img.data, 'base64');
        const check = inspectPng(bytes);
        if (!check.ok) throw new Error(check.error);
        const target = path.join(this.rawDir, 'shots', `${String(seq).padStart(4, '0')}.png`);
        await writeFile(target, bytes);
        const data = resultData(result);
        const url = data.map(d => d.source_url ?? d.metadata?.source_url).find(Boolean) ?? null;
        attempts.push({ attempt: index + 1, started_at, ok: true, url });
        return { screenshot_path: target, screenshot_error: null, screenshot_attempts: attempts, url };
      } catch (err) {
        attempts.push({ attempt: index + 1, started_at, ok: false, error: err.message });
        // A navigation can replace the main frame between the action and capture.
        const transient = /frame.*(?:removed|detached|not found)|no frame with given id|execution context.*(?:destroyed|not found)|cannot find context/i.test(err.message);
        if (!transient || index === delays.length - 1) {
          this.meta.counts.screenshot_errors++;
          return { screenshot_path: null, screenshot_error: err.message, screenshot_attempts: attempts, url: null };
        }
      }
    }
  }
  async record(kind, tool, args, { capture = false } = {}) {
    await this.ready;
    const seq = this.seq++;
    const started_at = new Date().toISOString();
    let result;
    try { result = await this.upstream.request('tools/call', { name: tool, arguments: args }); }
    catch (err) { result = toolError(err.message); }
    const data = resultData(result);
    if (kind === 'bootstrap' && resultOK(result)) {
      this.tabId = data.map(d => d.tab_id ?? d.tabId ?? d.tab?.id).find(Number.isInteger) ?? null;
      this.meta.tab_id = this.tabId;
    }
    const shot = capture && this.tabId !== null ? await this.screenshot(seq) : { screenshot_path: null, screenshot_error: capture ? 'No owned tab' : null, url: null };
    const entry = { seq, kind, tool, args, ok: resultOK(result), error: resultOK(result) ? null : JSON.stringify(data).slice(0, 4000),
      result_text: data.map(d => JSON.stringify(d)).join('\n').slice(0, 4000), tab_id: this.tabId,
      ...shot, started_at, ended_at: new Date().toISOString() };
    if (!entry.url) entry.url = data.map(d => d.change_report?.url?.after ?? d.url ?? d.currentUrl).find(v => typeof v === 'string') ?? null;
    if (kind === 'action') this.meta.counts.actions++;
    if (kind === 'read') this.meta.counts.reads++;
    await appendFile(path.join(this.rawDir, 'steps.jsonl'), `${JSON.stringify(entry)}\n`);
    await this.saveMeta();
    return { result, entry };
  }
  async bootstrap() {
    if (!this.boot) this.boot = this.record('bootstrap', 'open_tab', {
      url: this.startUrl, active: true, visual_reason: 'Open the benchmark start page', client: this.clientLabel,
    }, { capture: true }).then(({ entry }) => {
      if (!entry.ok || this.tabId === null || !entry.screenshot_path) throw new Error('Benchmark bootstrap failed: ' + (entry.error ?? entry.screenshot_error));
    });
    return this.boot;
  }
  async handle(method, params = {}) {
    await this.ready;
    if (method === 'initialize') {
      const r = await this.upstream.request(method, params);
      return { ...r, capabilities: { tools: {} } };
    }
    if (method === 'tools/list') {
      // Consume upstream pagination, then return one complete, restricted list.
      const tools = [];
      let cursor;
      do {
        const page = await this.upstream.request(method, cursor ? { cursor } : {});
        tools.push(...(page.tools ?? []));
        cursor = page.nextCursor;
      } while (cursor);
      const allowed = new Set([...Object.keys(this.allowlist.actions), ...this.allowlist.reads]);
      const filtered = tools.filter(t => allowed.has(t.name)).map(t => {
        const inputSchema = structuredClone(t.inputSchema);
        delete inputSchema.properties?.client;
        delete inputSchema.properties?.tab_id;
        if (inputSchema.required) inputSchema.required = inputSchema.required.filter(k => !['client', 'tab_id'].includes(k));
        return { ...t, inputSchema };
      });
      if ([...allowed].some(name => !filtered.some(t => t.name === name))) throw new Error('FSB server is missing required benchmark tools');
      return { tools: filtered };
    }
    if (method === 'resources/list') return { resources: [] };
    if (method === 'resources/templates/list') return { resourceTemplates: [] };
    if (method === 'prompts/list') return { prompts: [] };
    if (method === 'ping') return {};
    if (method !== 'tools/call') throw Object.assign(new Error(`Method ${method} is disabled`), { rpcError: { code: -32601, message: `Method ${method} is disabled` } });
    const name = params.name;
    const action = Object.hasOwn(this.allowlist.actions, name);
    if (!action && !this.allowlist.reads.includes(name)) {
      this.meta.counts.denied++;
      const now = new Date().toISOString();
      await appendFile(path.join(this.rawDir, 'steps.jsonl'), `${JSON.stringify({ seq: this.seq++, kind: 'denied', tool: name, args: params.arguments ?? {}, ok: false, error: 'Tool is disabled', tab_id: this.tabId, url: null, screenshot_path: null, screenshot_error: null, started_at: now, ended_at: now })}\n`);
      await this.saveMeta();
      this.onDenied?.(name);
      return toolError(`Tool ${name} is disabled in this benchmark`);
    }
    await this.bootstrap();
    if (action && this.meta.counts.actions >= this.maxActions) {
      this.meta.action_limit_reached = true;
      await this.saveMeta();
      this.onLimit?.();
      return toolError('Benchmark action limit reached');
    }
    const args = { ...(params.arguments ?? {}), tab_id: this.tabId };
    if (action) { args.client = this.clientLabel; args.visual_reason ||= DEFAULT_REASON; }
    return (await this.record(action ? 'action' : 'read', name, args, { capture: true })).result;
  }
  async close({ closeTab = false } = {}) {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      await this.ready;
      if (closeTab && this.tabId !== null) {
        try {
          const result = await this.upstream.request('tools/call', { name: 'close_tab', arguments: {
            tab_id: this.tabId, allow_active: true, visual_reason: 'Close the temporary benchmark-owned tab', client: this.clientLabel,
          } });
          this.meta.cleanup_ok = resultOK(result);
          if (!this.meta.cleanup_ok) this.meta.cleanup_error = JSON.stringify(resultData(result));
        } catch (err) { this.meta.cleanup_ok = false; this.meta.cleanup_error = err.message; }
      }
      this.meta.ended_at = new Date().toISOString();
      try { await this.saveMeta(); }
      finally { await this.upstream.close(); }
    })();
    return this.closing;
  }
}

export async function serveProxy(options) {
  const proxy = new RecordingProxy(options);
  const lines = createInterface({ input: process.stdin });
  let queue = Promise.resolve();
  const send = msg => process.stdout.write(`${JSON.stringify(msg)}\n`);
  // Forward progress only. Other notifications can advertise hidden surfaces.
  proxy.upstream.onNotification = msg => { if (msg.method === 'notifications/progress') send(msg); };
  lines.on('line', line => {
    let msg;
    try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return; }
    if (msg.id === undefined) {
      if (msg.method === 'notifications/initialized') proxy.upstream.notify(msg.method, msg.params);
      return;
    }
    queue = queue.then(async () => {
      try { send({ jsonrpc: '2.0', id: msg.id, result: await proxy.handle(msg.method, msg.params) }); }
      catch (err) { send({ jsonrpc: '2.0', id: msg.id, error: err.rpcError ?? { code: -32603, message: err.message } }); }
    });
  });
  const close = async () => { lines.close(); await queue; await proxy.close(); };
  process.once('SIGTERM', () => { void proxy.close().finally(() => process.exit(0)); });
  process.once('SIGINT', () => { void proxy.close().finally(() => process.exit(130)); });
  await new Promise(resolve => lines.once('close', resolve));
  await close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const split = process.argv.indexOf('--');
  if (split < 0 || !process.env.OM2W_RAW_DIR || !process.env.OM2W_START_URL) {
    console.error('Set OM2W_RAW_DIR and OM2W_START_URL; pass the upstream command after --'); process.exit(2);
  }
  try {
    const allowlist = JSON.parse(await readFile(process.env.OM2W_ALLOWLIST ?? DEFAULT_ALLOWLIST_PATH, 'utf8'));
    await serveProxy({ command: process.argv.slice(split + 1), rawDir: process.env.OM2W_RAW_DIR, startUrl: process.env.OM2W_START_URL, allowlist });
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
