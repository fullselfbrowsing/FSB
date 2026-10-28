import { access, readdir, statfs } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDatasetCached, localHfToken } from './dataset.mjs';
import { runCommand, RESULTS_DIR } from './proc.mjs';

export async function findChrome() {
  const root = path.join(homedir(), '.cache/puppeteer/chrome');
  const candidates = ['/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'];
  try {
    for (const version of (await readdir(root)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      candidates.push(path.join(root, version, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    }
  } catch {}
  for (const candidate of candidates) { try { await access(candidate); return candidate; } catch {} }
  return null;
}
export async function bridgeStatus(command, run = runCommand) {
  const args = command.at(-1) === 'stdio' ? command.slice(1, -1) : command.slice(1);
  const result = await run(command[0], [...args, 'status'], { timeoutMs: 20_000 });
  return { ok: result.code === 0 && /^Ext: yes$/m.test(result.stdout), detail: result.stdout.trim() || result.stderr.trim(), code: result.code };
}

export async function preflight({ full = false, minGb = full ? 15 : 2, chromePath, datasetPath, run = runCommand, filesystem = statfs, token,
  browserMode = 'isolated', driver = 'claude', serverCommand, checkDataset = true, checkJudges = false } = {}) {
  const nativeEntry = path.join(homedir(), '.fsb/native-host/runtime/package/build/index.js');
  serverCommand ??= browserMode === 'existing' && existsSync(nativeEntry) ? [process.execPath, nativeEntry, 'stdio'] : ['npx', '-y', 'fsb-mcp-server@0.11.2', 'stdio'];
  const checks = [];
  if (browserMode === 'existing') checks.push({ name: 'extension', ...await bridgeStatus(serverCommand, run) });
  else {
    const listeners = await run('lsof', ['-nP', '-iTCP:7225', '-iTCP:7226', '-sTCP:LISTEN']);
    checks.push({ name: 'bridge_ports', ok: listeners.code === 1 && !listeners.stdout.trim(), detail: listeners.stdout.trim() || listeners.stderr.trim() || 'Ports 7225 and 7226 are free' });
  }
  try {
    const info = await filesystem(RESULTS_DIR);
    const gb = info.bavail * info.bsize / 1e9;
    checks.push({ name: 'disk', ok: gb >= minGb, detail: `${gb.toFixed(2)} GB free; ${minGb} GB required` });
  } catch (err) { checks.push({ name: 'disk', ok: false, detail: err.message }); }
  for (const command of checkJudges ? ['claude', 'codex'] : [driver === 'codex' ? 'codex' : 'claude']) {
    const r = await run(command, ['--version']);
    checks.push({ name: command, ok: r.code === 0, detail: r.stdout.trim() || r.stderr.trim() });
  }
  const chrome = browserMode === 'isolated' ? chromePath ?? await findChrome() : null;
  let chromeExists = false;
  try { if (chrome) { await access(chrome); chromeExists = true; } } catch {}
  if (browserMode === 'isolated') checks.push({ name: 'chrome_for_testing', ok: chromeExists && chrome.includes('Chrome for Testing'), detail: chrome ?? 'Install Chrome for Testing or pass --chrome <binary>' });
  token ??= await localHfToken();
  if (checkDataset) checks.push({ name: 'dataset', ok: !!datasetPath || isDatasetCached() || !!token, detail: datasetPath ?? (isDatasetCached() ? 'Pinned dataset cached' : token ? 'Local HF credentials available' : 'Accept the dataset terms and sign in with hf auth login or export HF_TOKEN') });
  return { ok: checks.every(c => c.ok), checks, chromePath: chrome };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await preflight({ full: process.argv.includes('--full'), browserMode: process.argv.includes('--existing-browser') ? 'existing' : 'isolated', driver: process.argv.includes('--codex') ? 'codex' : 'claude' });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
