import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Each upstream request has its own ID, independent of the downstream client.
export class StdioClient {
  constructor(command, { env = process.env, timeoutMs = 60_000, stderr = process.stderr } = {}) {
    this.pending = new Map();
    this.counter = 0;
    this.timeoutMs = timeoutMs;
    this.child = spawn(command[0], command.slice(1), { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdin.on('error', () => {});
    this.child.stderr.on('data', d => stderr?.write(d));
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      let msg;
      try { msg = JSON.parse(line); } catch { return this.fail(new Error('Upstream emitted invalid JSON')); }
      if (msg.method) {
        if (msg.id !== undefined) this.send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Server requests are disabled' } });
        else this.onNotification?.(msg);
        return;
      }
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.error) pending.reject(Object.assign(new Error(msg.error.message), { rpcError: msg.error }));
      else pending.resolve(msg.result);
    });
    this.child.on('error', err => this.fail(err));
    this.child.on('exit', () => this.fail(new Error('Upstream MCP server exited')));
  }
  fail(err) {
    this.failure = err;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
  }
  send(msg) { this.child.stdin.write(`${JSON.stringify(msg)}\n`); }
  notify(method, params) { this.send({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) }); }
  request(method, params, { timeoutMs = this.timeoutMs } = {}) {
    if (this.failure) return Promise.reject(this.failure);
    const id = `om2w-${++this.counter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.notify('notifications/cancelled', { requestId: id, reason: 'Harness timeout' });
        reject(new Error(`MCP ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }
  async initialize() {
    const result = await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'om2w-harness', version: '1' } });
    this.notify('notifications/initialized');
    return result;
  }
  async close() {
    this.fail(new Error('MCP client closed'));
    this.child.stdin.end();
    this.child.kill('SIGTERM');
    if (this.child.exitCode === null && this.child.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => { this.child.kill('SIGKILL'); resolve(); }, 1000);
        this.child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    this.lines.close();
  }
}
