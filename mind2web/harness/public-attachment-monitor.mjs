import { spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const problem = () => Object.assign(new Error('Public extension attachment changed or monitoring is unverified'), { code: 'PUBLIC_ATTACHMENT_CHANGED' });
// The installed extension's identity. connectedAt changes on every WebSocket
// reconnect of the same install, so it is recorded but never latched.
export const ATTACHMENT_IDENTITY = Object.freeze(['extensionId', 'extensionVersion', 'installInstanceId']);
export const attachmentIdentity = attachment => attachment && Object.fromEntries(ATTACHMENT_IDENTITY.map(key => [key, attachment[key]]));

/** Read-only stock CLI observations. Raw diagnostic output is never exposed or saved. */
export class PublicAttachmentMonitor {
  constructor({ command, expected, intervalMs = 500, maxAgeMs = 5000, reconnectGraceMs = 60_000, now = Date.now, spawnProcess = spawn }) {
    if (!Array.isArray(command) || command.length !== 3 || command[2] !== 'stdio' || !expected
        || !Number.isFinite(maxAgeMs) || maxAgeMs < intervalMs) throw new Error('Invalid public attachment monitor options');
    this.expected = attachmentIdentity(expected); this.now = now; this.maxAgeMs = maxAgeMs; this.latest = null;
    this.reconnectGraceMs = Math.max(maxAgeMs, reconnectGraceMs); this.connectedAt = expected.connectedAt ?? null;
    this.waiters = new Set(); this.fault = null; this.closed = false; this.pending = '';
    this.stats = { interval_ms: intervalMs, max_observation_age_ms: maxAgeMs, reconnect_grace_ms: this.reconnectGraceMs,
      disconnected_observations: 0, reconnects: [], updates: 0, stderr_bytes_discarded: 0,
      raw_diagnostics_recorded: false, model_calls: 0, browser_mutations: 0 };
    this.child = spawnProcess(command[0], [command[1], 'status', '--watch', '--json', '--interval', String(intervalMs)], { stdio: ['ignore', 'pipe', 'pipe'] });
    this.finished = new Promise(resolve => this.child.once('close', resolve));
    this.child.once('error', () => this.fail());
    this.child.once('close', () => { if (!this.closed) this.fail(); });
    this.child.stderr.on('data', bytes => { this.stats.stderr_bytes_discarded += bytes.length; });
    this.child.stdout.on('data', bytes => this.consume(bytes));
  }
  fail() {
    this.fault ??= problem();
    for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.reject(this.fault); }
    this.waiters.clear();
  }
  consume(bytes) {
    if (this.closed || this.fault) return;
    this.pending += bytes;
    if (this.pending.length > 2_000_000) return this.fail();
    const lines = this.pending.split('\n'); this.pending = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let value; try { value = JSON.parse(line); } catch { this.fail(); return; }
      const source = value.extensionAttachment;
      if (value.extensionConnected !== true || !source) {
        // A disconnected observation holds dispatch until the same install reconnects.
        this.latest = null; this.stats.disconnected_observations++; continue;
      }
      const attachment = attachmentIdentity(source);
      if (!isDeepStrictEqual(attachment, this.expected)) { this.fail(); return; }
      if (source.connectedAt !== this.connectedAt) {
        this.stats.reconnects.push({ observed_at: new Date(this.now()).toISOString(), previous_connected_at: this.connectedAt, connected_at: source.connectedAt });
        this.connectedAt = source.connectedAt;
      }
      const at = this.now(); this.latest = { at, attachment, connectedAt: source.connectedAt }; this.stats.updates++;
      this.stats.first_observed_at ??= new Date(at).toISOString(); this.stats.last_observed_at = new Date(at).toISOString();
      for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.resolve({ ok: true }); }
      this.waiters.clear();
    }
  }
  async beforeDispatch({ timeoutMs = this.reconnectGraceMs } = {}) {
    if (this.closed || this.fault) throw this.fault ?? problem();
    if (this.latest && this.now() - this.latest.at >= 0 && this.now() - this.latest.at <= this.maxAgeMs) return { ok: true };
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      waiter.timer = setTimeout(() => { this.waiters.delete(waiter); this.fail(); reject(this.fault); }, timeoutMs);
      this.waiters.add(waiter);
    });
  }
  async close() {
    if (this.closed) return this.receipt;
    this.closed = true;
    for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.reject(problem()); }
    this.waiters.clear(); this.child.kill('SIGTERM');
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 2500);
    const code = await this.finished.finally(() => clearTimeout(timer));
    this.receipt = { ...this.stats, attachment: this.expected, continuity_ok: !this.fault,
      monitor_closed: true, exit_code: code, ended_at: new Date(this.now()).toISOString(),
      limitations: 'Connection continuity is observed at the stated interval, not atomically attested for every native operation. The public owned-tab checks remain authoritative for dispatch.' };
    return this.receipt;
  }
}
