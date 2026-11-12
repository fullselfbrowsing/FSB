import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { killGroup } from './proc.mjs';

export class CDP {
  constructor(ws) {
    this.ws = ws; this.nextId = 0; this.pending = new Map(); this.listeners = new Set();
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const request = this.pending.get(msg.id);
        if (!request) return;
        this.pending.delete(msg.id); clearTimeout(request.timer);
        if (msg.error) request.reject(new Error(msg.error.message)); else request.resolve(msg.result);
      } else for (const fn of this.listeners) fn(msg);
    });
    ws.addEventListener('close', () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('CDP disconnected')); } this.pending.clear(); });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error('CDP connection timed out')); }, 10_000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { this.ws.close(); }
}
export async function launchChrome({ chromePath, extensionDir, userDataDir, extraArgs = [] }) {
  await mkdir(userDataDir, { recursive: true });
  const args = [`--user-data-dir=${userDataDir}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    '--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--password-store=basic', '--lang=en-US', '--window-size=1366,900', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
  if (extensionDir) args.push(`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`);
  args.push(...extraArgs, 'about:blank');
  const child = spawn(chromePath, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
  let launchError;
  child.on('error', err => { launchError = err; });
  try {
    for (let i = 0; i < 300; i++) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error('Chrome exited during startup: ' + stderr);
      try {
        const [port, endpoint] = (await readFile(path.join(userDataDir, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
        const cdp = await CDP.connect(`ws://127.0.0.1:${port}${endpoint}`);
        const version = await cdp.send('Browser.getVersion');
        return { child, cdp, version, close: async () => {
          cdp.close(); killGroup(child);
          if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
            const timer = setTimeout(() => { killGroup(child, 'SIGKILL'); resolve(); }, 2000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
          });
        } };
      } catch (err) { if (i === 299) throw new Error('Chrome startup timed out: ' + stderr + '\n' + err.message); }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (err) { killGroup(child, 'SIGKILL'); throw err; }
}
export async function seedExtensionStorage(cdp, pairingCode, expectedOrigin) {
  for (let i = 0; i < 100; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
    if (target) {
      if (expectedOrigin && !target.url.startsWith(expectedOrigin + '/')) throw new Error('FSB extension ID differs from the existing bridge pairing; use a dedicated, preconfigured rig');
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      const result = await cdp.send('Runtime.evaluate', { expression: `(async () => {
        await chrome.storage.local.set({fsbTelemetryOptOut:true,serverUrl:'http://127.0.0.1:9',captchaSolverEnabled:false});
        await chrome.storage.session.set({fsbMcpBridgePairing:{pairingCode:${JSON.stringify(pairingCode)},storedAt:Date.now()}});
        if (typeof mcpBridgeClient !== 'undefined') await mcpBridgeClient.reloadPairingAndReconnect();
        return true;
      })()`, awaitPromise: true, returnByValue: true }, sessionId);
      if (result.exceptionDetails) throw new Error('Could not seed extension storage');
      await cdp.send('Target.detachFromTarget', { sessionId });
      return target.url.split('/')[2];
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('FSB extension service worker not found');
}
export async function dismissDialogs(cdp) {
  cdp.listeners.add(msg => {
    if (msg.method === 'Target.attachedToTarget' && msg.params.targetInfo.type === 'page') {
      void cdp.send('Page.enable', {}, msg.params.sessionId).catch(() => {});
    }
    if (msg.method === 'Page.javascriptDialogOpening') void cdp.send('Page.handleJavaScriptDialog', { accept: false }, msg.sessionId).catch(() => {});
  });
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
}
export async function closeTaskTabs(cdp) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  for (const target of targetInfos.filter(t => t.type === 'page')) await cdp.send('Target.closeTarget', { targetId: target.targetId });
}
