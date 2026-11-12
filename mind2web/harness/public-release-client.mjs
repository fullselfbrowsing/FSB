import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { inspectPng } from './png.mjs';

const CREDENTIAL_FIELDS = new Set([
  'ownershipToken', 'ownershipTokens', 'ownership_token', 'ownership_tokens', 'ownedBindings',
  'includeOwnedBindings', 'ownedScopeDrained', 'connectionId', 'connection_id',
]);
const IDENTITY_FIELDS = ['agentId', 'agent_id', 'requestingAgentId'];
export const PUBLIC_RELEASE_ADAPTER_VERSION = 'public-release-guard-v1';
const LIMITATION = 'The stock public MCP client may internally re-register and retry after AGENT_NOT_REGISTERED. '
  + 'This wrapper never retries a call. Guard presence verifies causal guard continuity, not an unexposed agent identity or private registry drain.';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function problem(code, message) { return Object.assign(new Error(message), { code }); }
function objectRows(result) {
  if (!Array.isArray(result?.content)) return [];
  return result.content.flatMap(block => {
    if (block?.type !== 'text' || typeof block.text !== 'string') return [];
    try { const value = JSON.parse(block.text); return plain(value) ? [value] : []; } catch { return []; }
  });
}
function successful(result) {
  return !!result && result.isError !== true && !objectRows(result).some(row => row.success === false || row.error);
}
function tabId(row) {
  const values = [row?.id, row?.tabId, row?.tab_id].filter(value => value !== undefined);
  if (!values.length || values.some(value => !Number.isSafeInteger(value) || value <= 0 || value !== values[0]))
    throw problem('PUBLIC_INVENTORY_INVALID', 'Public inventory contains an invalid or conflicting tab ID');
  return values[0];
}

async function guardServer() {
  const marker = `public-fsb-guard-${randomUUID()}`, route = `/${randomUUID()}`;
  const html = Buffer.from('<!doctype html><html><head><meta charset="utf-8"><title>FSB benchmark ownership guard</title>'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#fff;color:#111;font:24px sans-serif">'
    + `<main id="public-release-guard">${marker}</main><p>Temporary benchmark ownership guard.</p></body></html>`);
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== route) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length,
      'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", connection: 'close' });
    response.end(html);
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
  server.maxConnections = 4;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}${route}`, marker,
    close: () => new Promise((resolve, reject) => {
      server.closeAllConnections(); server.close(error => error ? reject(error) : resolve());
    }) };
}

/**
 * External adapter for an unchanged public MCP stdio client. Construct the raw
 * StdioClient with stderr:null: native debug output is not an evidence channel.
 * The caller holds its global foreground lease for guard setup, health and
 * disposal, and restricts every actor target to its explicit causal task IDs.
 */
export class PublicReleaseClient {
  #raw; #serverFactory; #server; #guardId = null; #marker; #guardUrl; #originalIdentity = null; #foreign = new Set();
  #secrets = new Set(); #tail = Promise.resolve(); #initialized = false; #openRequested = false;
  #prepared = false; #closeAttempted = false; #disposed = false; #closed = false; #fault = null;
  #lastInventory = null; #drain = null; #continuityChecks = 0; #clock; #clientLabel; #closeReceipt;
  #notification;

  constructor(rawClient, { createGuardServer = guardServer, now = () => new Date().toISOString(), clientLabel = 'Claude' } = {}) {
    if (!rawClient || typeof rawClient.request !== 'function' || typeof rawClient.close !== 'function')
      throw new TypeError('A raw public MCP client with request and close methods is required');
    if (!['Codex', 'Claude'].includes(clientLabel)) throw new TypeError('Unsupported public MCP client label');
    this.#raw = rawClient; this.#serverFactory = createGuardServer; this.#clock = now; this.#clientLabel = clientLabel;
    this.#raw.onNotification = message => this.#notification?.(this.#sanitize(message));
  }
  #serial(operation) {
    const next = this.#tail.then(operation, operation); this.#tail = next.catch(() => {}); return next;
  }
  #assertUsable() {
    if (this.#closed) throw problem('PUBLIC_CLIENT_CLOSED', 'Public MCP client is closed');
    if (this.#fault) throw problem(this.#fault.code, this.#fault.message);
    if (this.#disposed || this.#closeAttempted) throw problem('PUBLIC_GUARD_DISPOSED', 'No further public calls are allowed after guard disposal starts');
  }
  #fail(code, message) { this.#fault ??= { code, message, at: this.#clock() }; throw problem(code, message); }
  #collect(value) {
    if (Array.isArray(value)) { value.forEach(item => this.#collect(item)); return; }
    if (!plain(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (CREDENTIAL_FIELDS.has(key)) {
        const remember = entry => {
          if (typeof entry === 'string' && entry) this.#secrets.add(entry);
          else if (Array.isArray(entry)) entry.forEach(remember);
          else if (plain(entry)) Object.values(entry).forEach(remember);
        };
        remember(item);
      } else this.#collect(item);
    }
  }
  #text(value) {
    let result = value;
    for (const secret of this.#secrets) result = result.split(secret).join('[redacted ownership credential]');
    return result;
  }
  #redact(value) {
    if (typeof value === 'string') return this.#text(value);
    if (Array.isArray(value)) return value.map(item => this.#redact(item));
    if (!plain(value)) return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !CREDENTIAL_FIELDS.has(key))
      .map(([key, item]) => [key, key === 'data' && value.type === 'image' ? item : this.#redact(item)]));
  }
  #sanitize(result) {
    const texts = (result?.content ?? []).filter(block => block?.type === 'text' && typeof block.text === 'string')
      .map(block => { try { return JSON.parse(block.text); } catch { return null; } });
    this.#collect(result); texts.forEach(row => this.#collect(row));
    const sanitized = this.#redact(result);
    if (Array.isArray(sanitized?.content)) sanitized.content = sanitized.content.map(block => {
      if (block?.type !== 'text' || typeof block.text !== 'string') return block;
      try { return { ...block, text: JSON.stringify(this.#redact(JSON.parse(block.text))) }; }
      catch { return { ...block, text: this.#text(block.text) }; }
    });
    return sanitized;
  }
  #checkIdentity(result) {
    for (const row of objectRows(result)) for (const key of IDENTITY_FIELDS) {
      const identity = row[key];
      if (identity === undefined || identity === null) continue;
      if (typeof identity !== 'string' || !identity) this.#fail('PUBLIC_SCOPE_IDENTITY_CHANGED', 'Public response has an invalid scope identity');
      if (this.#originalIdentity !== null && identity !== this.#originalIdentity)
        this.#fail('PUBLIC_SCOPE_IDENTITY_CHANGED', 'Public response changed the observed original scope identity');
      this.#originalIdentity ??= identity;
    }
  }
  async #request(method, params, options) {
    let result;
    try { result = await this.#raw.request(method, params, options); }
    catch { this.#fail('PUBLIC_TRANSPORT_UNCERTAIN', 'Public MCP request did not return a settled response; it was not retried'); }
    // Credentials are retained only in this object's private memory and removed
    // before any result is returned to proxy journals or the actor.
    result = this.#sanitize(result); this.#checkIdentity(result);
    if (method === 'initialize') this.#initialized = true;
    return result;
  }
  async #inventory({ initial = false } = {}) {
    const result = await this.#request('tools/call', { name: 'list_tabs', arguments: {} }, { timeoutMs: 10_000 });
    const blocks = result?.content;
    if (!successful(result) || !Array.isArray(blocks) || !blocks.length || blocks.some(block => block?.type !== 'text'))
      this.#fail('PUBLIC_INVENTORY_INVALID', 'Public scoped inventory was not a successful structured response');
    const rows = objectRows(result), inventories = rows.filter(row => Array.isArray(row.tabs));
    if (rows.length !== blocks.length || inventories.length !== 1 || inventories[0].success !== true)
      this.#fail('PUBLIC_INVENTORY_INVALID', 'Public scoped inventory is malformed or ambiguous');
    const row = inventories[0]; let ids;
    try { ids = row.tabs.map(tabId); }
    catch { this.#fail('PUBLIC_INVENTORY_INVALID', 'Public scoped inventory contains malformed tab IDs'); }
    if (new Set(ids).size !== ids.length || (row.totalTabs !== undefined && row.totalTabs !== ids.length)
      || (row.activeTabId !== undefined && row.activeTabId !== null && !ids.includes(row.activeTabId)))
      this.#fail('PUBLIC_INVENTORY_INVALID', 'Public scoped inventory has duplicate tabs or inconsistent counts');
    if (initial ? ids.length !== 0 : this.#guardId === null || ids.filter(id => id === this.#guardId).length !== 1)
      this.#fail(initial ? 'PUBLIC_INITIAL_SCOPE_NOT_EMPTY' : 'PUBLIC_GUARD_MISSING', initial
        ? 'A fresh public client must not adopt any existing tab' : 'The original causal guard is absent from public scoped inventory');
    this.#continuityChecks++;
    this.#lastInventory = { at: this.#clock(), tab_ids: ids, scope_identity_observed: this.#originalIdentity !== null,
      continuity_check: this.#continuityChecks };
    return { result, row, ids, receipt: structuredClone(this.#lastInventory) };
  }
  // A fresh stdio server needs a moment to join the bridge hub as a relay; until
  // then the read-only inventory reports the extension as not attached.
  async #awaitAttachment({ timeoutMs = 15_000, intervalMs = 250 } = {}) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const result = await this.#request('tools/call', { name: 'list_tabs', arguments: {} }, { timeoutMs: 10_000 });
      if (successful(result)) return;
      const text = (result?.content ?? []).map(block => block?.text ?? '').join('\n');
      if (!/extension attachment|extension is not attached|not attached to ws:|extension_not_connected/i.test(text) || Date.now() >= until)
        this.#fail('PUBLIC_INVENTORY_INVALID', 'Public scoped inventory was not a successful structured response');
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  async initialize() {
    return this.#serial(async () => {
      this.#assertUsable();
      let result;
      try { result = typeof this.#raw.initialize === 'function' ? await this.#raw.initialize()
        : await this.#raw.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'om2w-public-wrapper', version: '1' } }); }
      catch { this.#fail('PUBLIC_TRANSPORT_UNCERTAIN', 'Public MCP initialization did not settle; it was not retried'); }
      this.#initialized = true; return this.#sanitize(result);
    });
  }
  async prepareGuard() {
    return this.#serial(async () => {
      this.#assertUsable();
      if (this.#prepared) return this.#guardReceipt();
      if (!this.#initialized) throw problem('PUBLIC_NOT_INITIALIZED', 'Initialize the public MCP client before preparing its guard');
      await this.#awaitAttachment();
      await this.#inventory({ initial: true });
      this.#server = await this.#serverFactory(); this.#marker = this.#server.marker; this.#guardUrl = this.#server.url;
      const url = new URL(this.#guardUrl);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || typeof this.#marker !== 'string' || !this.#marker || typeof this.#server.close !== 'function')
        this.#fail('PUBLIC_GUARD_SERVER_INVALID', 'Guard evidence server must be a bounded local HTTP fixture');
      this.#openRequested = true;
      const result = await this.#request('tools/call', { name: 'open_tab', arguments: { url: this.#guardUrl, active: false,
        client: this.#clientLabel, visual_reason: 'Keep this temporary benchmark ownership guard separate from task tabs' } }, { timeoutMs: 40_000 });
      const opened = objectRows(result).filter(row => row.tabId !== undefined || row.tab_id !== undefined || row.id !== undefined);
      if (!successful(result) || opened.length !== 1) this.#fail('PUBLIC_GUARD_OPEN_UNVERIFIED', 'Public guard open did not return one verified causal tab; it was not retried');
      try { this.#guardId = tabId(opened[0]); } catch { this.#fail('PUBLIC_GUARD_OPEN_UNVERIFIED', 'Public guard open returned an invalid tab ID'); }
      // The public open_tab reports the new tab before it navigates, so its URL
      // is still about:blank; the guard page itself is verified by the health check.
      if (opened[0].url !== undefined && ![this.#guardUrl, 'about:blank', ''].includes(opened[0].url))
        this.#fail('PUBLIC_GUARD_OPEN_UNVERIFIED', 'Public guard open returned an unexpected source URL');
      const inventory = await this.#inventory();
      if (inventory.ids.length !== 1) this.#fail('PUBLIC_GUARD_OPEN_UNVERIFIED', 'Fresh guard setup unexpectedly contains additional tabs');
      this.#prepared = true; return this.#guardReceipt();
    });
  }
  #guardReceipt() {
    return { ok: true, adapter_version: PUBLIC_RELEASE_ADAPTER_VERSION, method: 'public_guard_presence', guard_tab_id: this.#guardId,
      source_url: this.#guardUrl,
      inventory: structuredClone(this.#lastInventory), scope_identity_observed: this.#originalIdentity !== null,
      limitations: [LIMITATION] };
  }
  getGuardId() { return this.#guardId; }
  set onNotification(callback) { this.#notification = callback; }
  get onNotification() { return this.#notification; }
  notify(method, params) {
    if (!['notifications/initialized', 'notifications/cancelled'].includes(method))
      throw problem('PUBLIC_NOTIFICATION_DISABLED', 'Only MCP initialization and cancellation notifications are allowed');
    if (!this.#closed) this.#raw.notify?.(method, params);
  }
  async request(method, params, options) {
    return this.#serial(async () => {
      this.#assertUsable();
      if (method !== 'tools/call') return this.#request(method, params, options);
      if (!this.#prepared) throw problem('PUBLIC_GUARD_NOT_PREPARED', 'Prepare the private guard before task tools');
      const args = params?.arguments ?? {};
      if (args.tab_id === this.#guardId || args.tabId === this.#guardId)
        throw problem('PUBLIC_GUARD_PROTECTED', 'The private ownership guard cannot be targeted by actor tools');
      if (params?.name === 'list_tabs') {
        const { result, row } = await this.#inventory();
        const filtered = { ...row, tabs: row.tabs.filter(tab => tabId(tab) !== this.#guardId) };
        filtered.totalTabs = filtered.tabs.length;
        if (filtered.activeTabId === this.#guardId) filtered.activeTabId = null;
        if (filtered.selectedTabId === this.#guardId) filtered.selectedTabId = null;
        return { ...result, content: result.content.map(block => {
          try { return Array.isArray(JSON.parse(block.text)?.tabs) ? { ...block, text: JSON.stringify(filtered) } : block; }
          catch { return block; }
        }) };
      }
      await this.#inventory(); this.#drain = null;
      const result = await this.#request(method, params, options);
      await this.#inventory(); return result;
    });
  }
  /** A listed task popup that the product assigns to another agent; drain checks exclude it. */
  markForeign(id) { if (Number.isInteger(id) && id !== this.#guardId) this.#foreign.add(id); }
  #remainingTaskTabs(ids) { return ids.filter(id => id !== this.#guardId && !this.#foreign.has(id)); }
  async verifyTaskDrain() {
    return this.#serial(async () => {
      this.#assertUsable();
      if (!this.#prepared) throw problem('PUBLIC_GUARD_NOT_PREPARED', 'Guard setup was not completed');
      const inventory = await this.#inventory();
      if (this.#remainingTaskTabs(inventory.ids).length) throw problem('PUBLIC_TASK_DRAIN_INCOMPLETE', 'Public scoped inventory still contains task tabs');
      this.#drain = { ok: true, adapter_version: PUBLIC_RELEASE_ADAPTER_VERSION, method: 'public_guard_only_inventory', guard_tab_id: this.#guardId,
        task_tab_ids: [], foreign_tab_ids: [...this.#foreign].filter(id => inventory.ids.includes(id)), inventory: inventory.receipt, at: this.#clock(), limitations: [LIMITATION] };
      return structuredClone(this.#drain);
    });
  }
  async captureGuardHealth() {
    return this.#serial(async () => {
      this.#assertUsable();
      if (!this.#prepared) throw problem('PUBLIC_GUARD_NOT_PREPARED', 'Guard setup was not completed');
      const before = await this.#inventory();
      if (this.#remainingTaskTabs(before.ids).length) throw problem('PUBLIC_TASK_DRAIN_INCOMPLETE', 'Independent guard health requires all task tabs already disposed');
      const startedAt = this.#clock();
      const focused = await this.#request('tools/call', { name: 'switch_tab', arguments: { tabId: this.#guardId, active: true,
        client: this.#clientLabel, visual_reason: 'Inspect only the temporary independent benchmark guard fixture' } }, { timeoutMs: 15_000 });
      if (!successful(focused)) this.#fail('PUBLIC_GUARD_HEALTH_FAILED', 'Public guard focus failed; it was not retried');
      const read = await this.#request('tools/call', { name: 'get_text', arguments: { tab_id: this.#guardId, selector: '#public-release-guard' } }, { timeoutMs: 30_000 });
      if (!successful(read) || read.content?.length !== 1 || objectRows(read).length !== 1
        || objectRows(read)[0].success !== true || objectRows(read)[0].text !== this.#marker)
        this.#fail('PUBLIC_GUARD_HEALTH_FAILED', 'Public guard visible fixture text was not verified');
      const result = await this.#request('tools/call', { name: 'capture_screenshot', arguments: { tab_id: this.#guardId,
        mode: 'viewport', device_mode: 'current', wait_ms: 250 } }, { timeoutMs: 45_000 });
      const images = result?.content?.filter(block => block.type === 'image') ?? [], rows = objectRows(result);
      const metadata = rows.find(row => row.capture_id !== undefined);
      const image = images[0];
      if (!successful(result) || result.content?.length !== 2 || rows.length !== 1 || images.length !== 1
        || image.mimeType !== 'image/png' || typeof image.data !== 'string' || !metadata)
        this.#fail('PUBLIC_GUARD_HEALTH_FAILED', 'Public guard did not return one native PNG with capture metadata');
      const bytes = Buffer.from(image.data, 'base64'), png = inspectPng(bytes);
      if (bytes.toString('base64') !== image.data || !png.ok || png.width < 100 || png.height < 100 || metadata.sha256 !== sha256(bytes)
        || metadata.byte_length !== bytes.length || metadata.output_width !== png.width || metadata.output_height !== png.height
        || metadata.source_url !== this.#guardUrl || !metadata.capture_id || !Number.isFinite(Date.parse(metadata.timestamp))
        || metadata.mode !== 'viewport' || metadata.effective_emulation?.device_mode !== 'current')
        this.#fail('PUBLIC_GUARD_HEALTH_FAILED', 'Public guard native PNG bytes, source or capture identity did not verify');
      const after = await this.#inventory();
      if (this.#remainingTaskTabs(after.ids).length) this.#fail('PUBLIC_GUARD_HEALTH_FAILED', 'Independent guard health unexpectedly contains task tabs');
      this.#drain = null;
      return { ok: true, adapter_version: PUBLIC_RELEASE_ADAPTER_VERSION, method: 'public_guard_native_capture', guard_tab_id: this.#guardId, started_at: startedAt,
        ended_at: this.#clock(), image, metadata, sha256: sha256(bytes), byte_length: bytes.length,
        output_width: png.width, output_height: png.height, read_verified: true, before_inventory: before.receipt,
        after_inventory: after.receipt, model_calls: 0, task_actions_replayed: 0,
        limitations: [LIMITATION, 'A healthy guard does not establish why a task failed or attest to private native cleanup state.'] };
    });
  }
  async disposeGuard() {
    return this.#serial(async () => {
      this.#assertUsable();
      if (!this.#prepared) throw problem('PUBLIC_GUARD_NOT_PREPARED', 'Guard setup was not completed');
      const prior = await this.#inventory();
      if (this.#remainingTaskTabs(prior.ids).length) throw problem('PUBLIC_TASK_DRAIN_INCOMPLETE', 'Task tabs remain; the private guard was not closed');
      this.#closeAttempted = true;
      const result = await this.#request('tools/call', { name: 'close_tab', arguments: { tab_id: this.#guardId, allow_active: true,
        client: this.#clientLabel, visual_reason: 'Dispose this exact temporary benchmark guard after verified task-tab drain' } }, { timeoutMs: 40_000 });
      const rows = objectRows(result), row = rows.find(item => item.closed === true);
      let closedId;
      try { closedId = tabId(row); } catch { /* The unknown close remains unverified and is never retried. */ }
      if (!successful(result) || result.content?.length !== 1 || rows.length !== 1 || !row || row.success !== true || closedId !== this.#guardId)
        this.#fail('PUBLIC_GUARD_CLOSE_UNVERIFIED', 'The exact public guard close was not acknowledged; it will not be retried');
      this.#disposed = true;
      this.#closeReceipt = { ok: true, adapter_version: PUBLIC_RELEASE_ADAPTER_VERSION, method: 'public_exact_guard_close_ack_after_guard_only_inventory',
        guard_tab_id: this.#guardId, closed: true, at: this.#clock(), prior_inventory: prior.receipt,
        scope_identity_observed: this.#originalIdentity !== null, post_close_inventory_requested: false,
        private_registry_drain_attested: false, limitations: [LIMITATION,
          'Cleanup uses the stock exact close acknowledgment after guard-only inventory; public close awaits chrome.tabs.remove. No post-close list or agent re-registration is used.'] };
      return structuredClone(this.#closeReceipt);
    });
  }
  async close() {
    return this.#serial(async () => {
      if (this.#closed) return this.#finalReceipt();
      this.#closed = true; let clientClosed = false, serverClosed = !this.#server;
      try { await this.#raw.close(); clientClosed = true; }
      catch { this.#fault ??= { code: 'PUBLIC_CLIENT_CLOSE_UNVERIFIED', message: 'Public MCP client shutdown was not verified', at: this.#clock() }; }
      try { if (this.#server) await this.#server.close(); serverClosed = true; }
      catch { this.#fault ??= { code: 'PUBLIC_GUARD_SERVER_CLOSE_UNVERIFIED', message: 'Local guard server shutdown was not verified', at: this.#clock() }; }
      this.#closeReceipt = { ...(this.#closeReceipt ?? {}), client_closed: clientClosed, guard_server_closed: serverClosed };
      return this.#finalReceipt();
    });
  }
  #finalReceipt() {
    return { ...structuredClone(this.#closeReceipt ?? {}), adapter_version: PUBLIC_RELEASE_ADAPTER_VERSION,
      cleanup_ok: !this.#fault && (!this.#openRequested || this.#disposed)
      && this.#closeReceipt?.client_closed === true && this.#closeReceipt?.guard_server_closed === true,
      guard_prepared: this.#prepared, guard_close_attempted: this.#closeAttempted, guard_disposed: this.#disposed,
      no_guard_open_requested: !this.#openRequested, ...(this.#fault ? { fault: { ...this.#fault } } : {}), limitations: [LIMITATION] };
  }
}
