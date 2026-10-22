import { readFile, readdir, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { BENCH_ROOT } from './proc.mjs';
import { hashTree } from './fingerprint.mjs';
import { sourceFingerprint } from './manual-runner.mjs';
import { CLAUDE_CLI } from './model-family.mjs';
import { attachmentIdentity } from './public-attachment-monitor.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => readFile(file, 'utf8').then(JSON.parse);
const stable = value => JSON.stringify(value && typeof value === 'object' ? Array.isArray(value)
  ? value.map(item => JSON.parse(stable(item))) : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(stable(value[key]))])) : value);
export async function fileDescriptor(file) {
  const bytes = await readFile(file);
  return { path: path.resolve(file), bytes: bytes.length, sha256: hash(bytes) };
}

export async function verifyPublicPins(pins) {
  if (!pins || pins.extension_id !== 'badgafnfchcihdfnjneklogedcdkmjfk' || pins.extension_version !== '0.9.92'
      || pins.mcp_version !== '0.11.2' || !Array.isArray(pins.files) || !pins.files.length
      || !pins.attachment || !pins.extension_archive || !pins.mcp_receipt || !pins.catalog || !pins.source_binding) throw new Error('Complete public release provenance pins are required');
  for (const item of pins.files) if (stable(await fileDescriptor(item.path)) !== stable(item)) throw new Error('Public provenance file changed');
  for (const item of [pins.extension_archive, pins.mcp_receipt, pins.catalog, pins.source_binding]) {
    if (!pins.files.some(file => stable(file) === stable(item))) throw new Error('Public provenance reference is outside the frozen file list');
  }
  const binding = await json(pins.source_binding.path);
  if (binding.extension_id !== pins.extension_id || binding.version !== pins.extension_version || binding.source !== 'Chrome Web Store'
      || binding.normal_install_observed !== true || binding.installed_bytes_modified !== false
      || binding.experimental_product_patches_loaded !== false || stable(binding.attachment) !== stable(pins.attachment)
      || !Array.isArray(binding.ui_evidence) || binding.ui_evidence.length !== 2) throw new Error('Public source binding is incomplete');
  for (const item of binding.ui_evidence) if (!pins.files.some(file => stable(file) === stable(item))) throw new Error('Public Web Store UI proof is outside frozen evidence');
  return true;
}

/** Published CLI diagnostics are read-only. Raw diagnostics and stderr are never recorded. */
export async function observePublicAttachment(serverCommand, { timeoutMs = 15_000 } = {}) {
  const child = spawn(serverCommand[0], [serverCommand[1], 'status', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderrBytes = 0, exceeded = false, timedOut = false, killTimer;
  const stop = () => { child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'), 2500); };
  const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
  child.stdout.on('data', bytes => {
    if (stdout.length + bytes.length > 2_000_000) { exceeded = true; stop(); }
    else stdout += bytes;
  });
  child.stderr.on('data', bytes => { stderrBytes += bytes.length; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }).finally(() => { clearTimeout(timer); clearTimeout(killTimer); });
  if (code !== 0 || exceeded || timedOut) throw new Error('Public extension attachment observation failed');
  let diagnostics; try { diagnostics = JSON.parse(stdout); } catch { throw new Error('Public extension attachment diagnostics are malformed'); }
  const attachment = diagnostics.extensionAttachment;
  if (diagnostics.extensionConnected !== true || !attachment || !['extensionId', 'extensionVersion', 'installInstanceId', 'connectedAt'].every(key => typeof attachment[key] === 'string' && attachment[key])) throw new Error('No authoritative public extension attachment');
  return { attachment: Object.fromEntries(['extensionId', 'extensionVersion', 'installInstanceId', 'connectedAt'].map(key => [key, attachment[key]])),
    stderr_bytes_discarded: stderrBytes };
}

async function inventory(root) {
  const rows = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Public installed package contains an unexpected symlink');
      if (entry.isDirectory()) { if (entry.name !== '_metadata') await visit(file); }
      else if (entry.isFile()) {
        const bytes = await readFile(file);
        rows.push({ path: path.relative(root, file).split(path.sep).join('/'), bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  await visit(root);
  rows.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  // The archive used Python's Unicode code-point ordering for relative paths.
  rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { files: rows.length, bytes: rows.reduce((sum, row) => sum + row.bytes, 0), sha256: hash(stable(rows)) };
}

async function verifyPublishedPackage(root, receipt) {
  const rows = await json(path.resolve(receipt.published_file_inventory.path));
  for (const row of rows) {
    if (!row.path.startsWith('package/') || row.path.includes('/../')) throw new Error('Unsafe published package inventory');
    const file = path.join(root, row.path.slice('package/'.length));
    if (!(await lstat(file)).isFile()) throw new Error('Published package file is missing or not regular');
    const bytes = await readFile(file);
    if (bytes.length !== row.bytes || hash(bytes) !== row.sha256) throw new Error('Published MCP package bytes changed');
  }
  return { files: rows.length, inventory_sha256: receipt.published_file_inventory.sha256 };
}

export async function capturePublicSources({ serverCommand, extensionDir, publicPins }) {
  await verifyPublicPins(publicPins);
  const archive = await json(publicPins.extension_archive.path), mcp = await json(publicPins.mcp_receipt.path);
  const entry = await realpath(serverCommand[1]), runtimeRoot = path.dirname(path.dirname(entry));
  if (runtimeRoot !== await realpath(mcp.package_root) || mcp.version !== publicPins.mcp_version
      || entry !== await realpath(path.join(mcp.package_root, 'build/index.js'))
      || hash(await readFile(path.resolve(mcp.tarball.path))) !== mcp.tarball.sha256
      || hash(await readFile(path.resolve(mcp.published_file_inventory.path))) !== mcp.published_file_inventory.sha256) throw new Error('Public MCP command is not the archived published package');
  const published = await verifyPublishedPackage(runtimeRoot, mcp);
  const candidates = archive.candidate_paths.filter(candidate => candidate.version === publicPins.extension_version && candidate.archived);
  if (!candidates.length || !candidates.some(candidate => path.resolve(candidate.source_path) === path.resolve(extensionDir))) throw new Error('Public extension path is not an archived Web Store package');
  const chromeRoot = path.join(homedir(), 'Library/Application Support/Google/Chrome');
  for (const profile of (await readdir(chromeRoot, { withFileTypes: true })).filter(entry => entry.isDirectory() && (entry.name === 'Default' || /^Profile \d+$/.test(entry.name)))) {
    const extensions = path.join(chromeRoot, profile.name, 'Extensions', publicPins.extension_id);
    const versions = await readdir(extensions).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const version of versions) {
      const candidatePath = path.join(extensions, version);
      const manifest = await json(path.join(candidatePath, 'manifest.json'));
      if (manifest.version === publicPins.extension_version && !candidates.some(candidate => candidate.source_path === candidatePath)) throw new Error('A new public extension candidate requires source binding again');
    }
  }
  const installed = [];
  for (const candidate of candidates) {
    const current = await inventory(candidate.source_path);
    if (current.sha256 !== candidate.content_without_store_metadata_sha256) throw new Error('Public extension installed content changed');
    installed.push({ path: candidate.source_path, content_sha256: current.sha256, files: current.files, bytes: current.bytes });
  }
  if (new Set(installed.map(candidate => candidate.content_sha256)).size !== 1) throw new Error('Same-ID public extension candidates differ');
  // A momentary WebSocket reconnect of the same install should not fail a checkpoint.
  let observed;
  for (let attempt = 1; !observed; attempt++) {
    try { observed = await observePublicAttachment(serverCommand); }
    catch (error) { if (attempt >= 6) throw error; await new Promise(resolve => setTimeout(resolve, 5000)); }
  }
  if (stable(attachmentIdentity(observed.attachment)) !== stable(attachmentIdentity(publicPins.attachment))) throw new Error('Public extension install changed; checkpoint and regate');
  const nativeRoot = path.join(homedir(), '.fsb/native-host/runtime/package');
  const fingerprintOptions = { serverCommand, extensionDir, publicRelease: true, publicPins };
  const fingerprints = await sourceFingerprint(fingerprintOptions);
  return { public_release: true, fingerprints, extension: { id: publicPins.extension_id, version: publicPins.extension_version,
    source: 'Chrome Web Store', installed_candidates: installed, attachment: attachmentIdentity(observed.attachment),
    binding_method: 'Normal Web Store runtime identity and version, with identical non-metadata source content across every archived same-ID installed candidate. Exact Chrome profile path and in-memory bytecode are not attested.' },
    public_client: { package_root: runtimeRoot, version: mcp.version, published_at: mcp.published_at,
      tarball_sha256: mcp.tarball.sha256, ...published, modified: false },
    installed_native_transport: { package_dir: nativeRoot,
      build_sha256: await hashTree(path.join(nativeRoot, 'build'), () => true),
      ai_sha256: await hashTree(path.join(nativeRoot, 'ai'), () => true),
      dependencies_sha256: await hashTree(path.join(nativeRoot, 'node_modules'), () => true) },
    toolchain: { claude: await fileDescriptor(CLAUDE_CLI),
      node: await fileDescriptor(await realpath(process.execPath)), node_version: process.version,
      fsb_node: await fileDescriptor(await realpath(serverCommand[0])) },
    files: [...publicPins.files, await fileDescriptor(path.join(BENCH_ROOT, 'config/browser-manual-public-v1.json'))] };
}
