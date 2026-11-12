import { createServer } from 'node:http';
import { access, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { crc32, deflateSync } from 'node:zlib';
import path from 'node:path';
import { codexArguments, CODEX_MODEL_CATALOG, tomlValue } from './driver-codex.mjs';
import { ManualRecordingProxy } from './manual-recording-proxy.mjs';
import { startTaskGateway } from './task-gateway.mjs';
import { ALLOWED_TOOLS, profileFor, toolsForProfile, publicCatalogReceipt } from './browser-manual-profile.mjs';
import { inspectPng, PNG_SIGNATURE } from './png.mjs';
import { runCommand } from './proc.mjs';

export const CODEX_IMAGE_CONTRACT_PIN = Object.freeze({
  version: 'codex-cli 0.160.1',
  sha256: '09fa44fdc37a5fc70dc1ace31235f90468a2e193d0e85f7552eab068ea2582be',
});
const FIXTURE_CALL = 'image-contract-call';
const ERROR_FIXTURE_CALL = 'image-contract-error-call';
const FIXTURE_ERROR = 'IMAGE_CONTRACT_KNOWN_READ_ERROR';
const FIXTURE_URL = 'https://image-contract.invalid/';
const DUMMY_KEY = 'om2w-local-image-contract-only';
const MAX_HTTP_BYTES = 48 * 1024 * 1024;
const STOP_MESSAGE = 'Local image contract complete; no inference was performed.';
const CATALOG_RECEIPT = CODEX_MODEL_CATALOG.replace(/\.json$/, '.receipt.json');
const require = createRequire(import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, code, message) => {
  if (!condition) throw Object.assign(new Error(message), { code });
};
const reply = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const header = Buffer.alloc(4), trailer = Buffer.alloc(4);
  header.writeUInt32BE(data.length); trailer.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, trailer]);
}

// Real RGB pixel entropy prevents a tiny solid-color fixture from missing the
// CLI's large-event and image-preparation paths. The seed is deliberately fixed.
export function generateContractPng(width = 3024, height = 1610) {
  check(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width * height <= 5_000_000,
    'INVALID_FIXTURE_DIMENSIONS', 'Fixture dimensions must be positive and at most five million pixels');
  const stride = width * 3 + 1, pixels = Buffer.allocUnsafe(stride * height);
  let random = 0x6d2b79f5;
  for (let y = 0; y < height; y++) {
    const start = y * stride; pixels[start] = 0;
    for (let x = 1; x < stride; x++) {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      pixels[start + x] = random >>> 24;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels, { level: 1 })), pngChunk('IEND', Buffer.alloc(0))]);
}

export function codexRequestToolSurface(request, allowed = ALLOWED_TOOLS) {
  const namespaces = [...(request.tools ?? []), ...(request.input ?? []).flatMap(item => item.type === 'additional_tools' ? item.tools ?? [] : [])];
  const fsb = namespaces.filter(item => item.type === 'namespace' && item.name === 'mcp__fsb').flatMap(item => item.tools ?? []);
  const names = fsb.map(tool => tool.name).sort();
  return { names, count: names.length, schema_sha256: sha256(Buffer.from(JSON.stringify(fsb))),
    missing: allowed.filter(name => !names.includes(name)), unexpected: names.filter(name => !allowed.includes(name)),
    namespaces: namespaces.filter(item => item.type === 'namespace').map(item => item.name).sort() };
}

export function verifyCodexRequestSettings(request, { model, effort }) {
  check(request.model === model, 'CONTRACT_MODEL', 'The local model request changed the requested model');
  check(request.reasoning?.effort === effort, 'CONTRACT_EFFORT', 'The local model request changed or omitted the requested reasoning effort');
}

export function inspectCodexImageRequest(request, png, { callId = FIXTURE_CALL, errorCode } = {}) {
  const outputs = (request.input ?? []).filter(item => item.type === 'function_call_output' && item.call_id === callId);
  check(outputs.length === 1 && Array.isArray(outputs[0].output), 'NATIVE_IMAGE_MISSING', 'Expected exactly one structured tool output for the fixture call');
  const content = outputs[0].output, images = content.filter(item => item.type === 'input_image');
  check(images.length === 1, 'NATIVE_IMAGE_MISSING', 'The model request must contain one native input_image, not image JSON embedded in text');
  const image = images[0], match = /^data:(image\/png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.image_url ?? '');
  check(match, 'NATIVE_IMAGE_MIME', 'The outgoing image must be an inline PNG data URL');
  const bytes = Buffer.from(match[2], 'base64');
  check(bytes.toString('base64') === match[2], 'NATIVE_IMAGE_ENCODING', 'The outgoing image base64 must be complete and canonical');
  const dimensions = inspectPng(bytes);
  check(dimensions.ok, 'NATIVE_IMAGE_INVALID', 'The outgoing image is not a complete valid PNG');
  const source = inspectPng(png);
  check(source.ok && dimensions.width === source.width && dimensions.height === source.height,
    'NATIVE_IMAGE_DIMENSIONS', 'The CLI resized the model image');
  check(bytes.equals(png), 'NATIVE_IMAGE_BYTES', 'The outgoing PNG bytes differ from the production recorder image');
  const structuredText = content.filter(item => item.type === 'input_text').flatMap(item => { try { return [JSON.parse(item.text)]; } catch { return []; } });
  if (errorCode) check(structuredText.some(row => row.success === false && row.code === errorCode),
    'NATIVE_ERROR_RESULT_MISSING', 'The follow-up request must retain the actual completed error alongside its native PNG');
  const observations = structuredText.flatMap(value => value.observation ? [value.observation] : []);
  check(observations.length === 1, 'FRAME_RECEIPT_MISSING', 'The native image needs its production observation receipt in the same tool output');
  const frame = observations[0];
  check(frame.sha256 === sha256(png) && frame.byte_length === png.length && frame.output_width === source.width
    && frame.output_height === source.height && frame.model_image_detail === 'original',
  'FRAME_RECEIPT_MISMATCH', 'The production frame receipt must identify the exact original PNG');
  return { native_image: true, mime_type: match[1], sha256: sha256(bytes), bytes: bytes.length,
    width: dimensions.width, height: dimensions.height, detail: image.detail ?? null, frame };
}

async function executable(command, env) {
  check(typeof command === 'string' && command.length > 0, 'INVALID_CLI_COMMAND', 'A CLI executable is required');
  const candidates = command.includes(path.sep) ? [path.resolve(command)] : (env.PATH ?? '').split(path.delimiter).map(dir => path.join(dir, command));
  for (const file of candidates) {
    try { await access(file, constants.X_OK); if ((await stat(file)).isFile()) return await realpath(file); } catch {}
  }
  throw Object.assign(new Error('The configured Codex executable was not found'), { code: 'CLI_NOT_FOUND' });
}

async function pinnedFile(input, code) {
  const descriptor = typeof input === 'string' ? { path: input } : input;
  check(descriptor && typeof descriptor.path === 'string' && path.isAbsolute(descriptor.path), code, 'Public evidence requires an absolute source file');
  const state = await lstat(descriptor.path);
  check(state.isFile() && !state.isSymbolicLink(), code, 'Public schema evidence must be a regular source file');
  const bytes = await readFile(descriptor.path), actual = { path: descriptor.path, bytes: bytes.length, sha256: sha256(bytes) };
  check((descriptor.sha256 === undefined || descriptor.sha256 === actual.sha256)
    && (descriptor.bytes === undefined || descriptor.bytes === actual.bytes), code, 'Public source bytes differ from their pinned descriptor');
  return { descriptor: actual, bytes };
}

export async function loadImageContractCatalog({ publicRelease = false, publicPins, catalogFile } = {}) {
  const profile = profileFor(publicRelease), allowed = toolsForProfile(profile);
  if (!publicRelease) return { profile, allowed, tools: require('../../extension/ai/tool-definitions.js').TOOL_REGISTRY };
  const provided = catalogFile ?? publicPins?.catalog;
  check(provided, 'PUBLIC_CATALOG_REQUIRED', 'Public image contract needs the actual registered tools/list catalog');
  const explicitPath = typeof provided === 'string' ? provided : provided.path;
  check(!publicPins?.catalog?.path || publicPins.catalog.path === explicitPath,
    'PUBLIC_CATALOG_BINDING_MISMATCH', 'The explicit public catalog differs from publicPins.catalog');
  const { descriptor, bytes } = await pinnedFile(publicPins?.catalog ?? provided, 'PUBLIC_CATALOG_CHANGED');
  const document = JSON.parse(bytes), tools = Array.isArray(document) ? document : document?.tools;
  check(Array.isArray(tools) && tools.every(tool => tool && typeof tool.name === 'string' && typeof tool.description === 'string'
    && tool.inputSchema?.type === 'object' && tool.inputSchema.properties && typeof tool.inputSchema.properties === 'object'
    && !Array.isArray(tool.inputSchema.properties)), 'PUBLIC_CATALOG_INVALID', 'Public catalog must contain actual tool schemas, not a name-only registry summary');
  const receipt = publicCatalogReceipt(tools);
  return { profile, allowed, tools, descriptor, receipt };
}

export async function imageContractSourcePins({ publicRelease = false, publicPins, catalogFile } = {}) {
  const files = ['codex-image-contract.mjs', 'driver-codex.mjs', 'manual-recording-proxy.mjs', 'observation-recorder.mjs',
    'task-gateway.mjs', 'mcp-task-stdio.mjs', 'browser-manual-profile.mjs', 'browser-scheduler.mjs', 'owned-task-session.mjs', 'png.mjs'];
  if (publicRelease) files.push('public-release-client.mjs', 'mcp-client.mjs', 'mcp-record-proxy.mjs', 'driver-codex-manual.mjs', 'public-disposition.mjs', 'proc.mjs');
  const out = {};
  for (const name of files) out[name] = sha256(await readFile(new URL(name, import.meta.url)));
  out['config/codex-model-catalog.json'] = sha256(await readFile(CODEX_MODEL_CATALOG));
  out['config/codex-model-catalog.receipt.json'] = sha256(await readFile(CATALOG_RECEIPT));
  out['config/codex-tool-isolation.json'] = sha256(await readFile(new URL('../config/codex-tool-isolation.json', import.meta.url)));
  if (publicRelease) {
    const catalog = await loadImageContractCatalog({ publicRelease, publicPins, catalogFile });
    out['public/registered-tool-catalog.json'] = catalog.descriptor.sha256;
    for (const key of ['source_binding', 'mcp_receipt']) if (publicPins?.[key]) {
      const source = await pinnedFile(publicPins[key], 'PUBLIC_SOURCE_CHANGED'); out[`public/${key}.json`] = source.descriptor.sha256;
    }
  } else out['extension/ai/tool-definitions.js'] = sha256(await readFile(new URL('../../extension/ai/tool-definitions.js', import.meta.url)));
  return out;
}

export function imageContractProxyClass(publicRelease = false) {
  if (!publicRelease) return ManualRecordingProxy;
  // This canary has no public browser transport. Apply only the production
  // public actor profile to its synthetic upstream; never create a guard tab.
  return class PublicProfileImageContractProxy extends ManualRecordingProxy {
    constructor(options) {
      super({ ...options, public_release: false, publicRelease: false });
      this.profile = profileFor(true); this.allowedTools = toolsForProfile(this.profile); this.meta.profile = this.profile.id;
      this.meta.synthetic_public_profile_only = true;
    }
  };
}

export function imageContractFixtureUpstream(png, dimensions, tools) {
  const tabs = new Map(), calls = []; let selected, captures = 0, reads = 0, closed = false;
  return {
    calls, tabs, get closed() { return closed; },
    async request(method, params = {}) {
      if (method === 'initialize') return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'local-image-contract-fixture', version: '1' } };
      if (method === 'tools/list') return { tools };
      if (method !== 'tools/call') return {};
      const name = params.name, args = params.arguments ?? {}, id = args.tab_id ?? args.tabId;
      calls.push(name);
      if (name === 'list_tabs') return reply({ success: true, tabs: [...tabs.values()] });
      if (name === 'open_tab') { const tab = { id: 51, url: args.url, title: 'Local fixture', windowId: 1 }; tabs.set(tab.id, tab); selected = tab.id; return reply({ success: true, tabId: tab.id }); }
      check(tabs.has(id), 'FIXTURE_TAB_OWNERSHIP', 'The fixture received an unowned tab');
      if (name === 'switch_tab') { selected = id; return reply({ success: true, tabId: id }); }
      if (name === 'close_tab') { tabs.delete(id); return reply({ success: true, tabId: id }); }
      if (name === 'capture_screenshot') {
        check(selected === id, 'FIXTURE_FOREGROUND', 'The captured fixture tab was not selected');
        return { content: [{ type: 'text', text: JSON.stringify({ capture_id: `local-capture-${++captures}`, source_url: tabs.get(id).url,
          timestamp: new Date().toISOString(), mode: 'viewport', css_rect: { x: 0, y: 0, width: dimensions.width / 2, height: dimensions.height / 2 },
          output_width: dimensions.width, output_height: dimensions.height, byte_length: png.length, sha256: sha256(png),
          effective_emulation: { device_mode: 'current', device_scale_factor: 2 } }) },
        // No original-detail metadata is supplied by this double. The actual
        // production ObservationRecorder must add it to the actor response.
        { type: 'image', mimeType: 'image/png', data: png.toString('base64') }] };
      }
      check(name === 'read_page', 'UNEXPECTED_FIXTURE_TOOL', 'The local provider may request only its fixture reads');
      if (++reads === 2) return { ...reply({ success: false, code: FIXTURE_ERROR, error: 'Completed deterministic fixture read failure' }), isError: true };
      check(reads === 1, 'UNEXPECTED_FIXTURE_TOOL', 'The local provider may request exactly one successful and one failed fixture read');
      return reply({ success: true, content: 'Deterministic local image contract state' });
    },
    notify() {}, async close() { closed = true; },
  };
}

function emitToolCall(response, model, callId = FIXTURE_CALL) {
  const responseId = 'local-' + callId;
  const item = { type: 'function_call', id: callId + '-item', call_id: callId, namespace: 'mcp__fsb', name: 'read_page', arguments: '{}' };
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const emit = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  emit('response.created', { response: { id: responseId, object: 'response', model, status: 'in_progress', output: [] } });
  emit('response.output_item.added', { output_index: 0, item });
  emit('response.output_item.done', { output_index: 0, item });
  emit('response.completed', { response: { id: responseId, object: 'response', model, status: 'completed', output: [item],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
  response.end();
}

/** Local-only serialization canary. It makes no real browser or inference calls. */
export async function verifyCodexImageContract({ outputDir, command = 'codex', model = 'gpt-6.1-sol', effort = 'medium',
  timeoutMs = 45_000, expectedBinarySha256 = CODEX_IMAGE_CONTRACT_PIN.sha256, expectedVersion = CODEX_IMAGE_CONTRACT_PIN.version,
  env = process.env, signal, publicRelease = false, publicPins, catalogFile } = {}) {
  check(outputDir && Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60_000,
    'INVALID_CONTRACT_OPTIONS', 'A fresh output directory and a deadline of at most60seconds are required');
  outputDir = path.resolve(outputDir); await mkdir(outputDir, { recursive: true });
  check((await readdir(outputDir)).length === 0, 'CONTRACT_OUTPUT_EXISTS', 'Contract evidence directory must be empty; prior evidence is never overwritten');
  const started = Date.now(), deadline = started + timeoutMs, controller = new AbortController();
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeoutMs);
  const receipt = { schema_version: 1, kind: 'codex_original_png_contract', synthetic: true, benchmark_result: false,
    fixture_scenarios: ['successful_read_page', 'completed_isError_read_page'],
    profile: profileFor(publicRelease).id, ...(publicRelease ? { public_release: true, synthetic_public_profile_only: true, guard_adapter_instantiated: false } : {}),
    started_at: new Date(started).toISOString(), ok: false, real_model_calls: 0, real_browser_calls: 0,
    output_dir: outputDir, checks: {}, cli: {}, request_summaries: [], event_summaries: [] };
  let gateway, server, upstream, pins, failure, fixtureError, toolSurface, stopAcknowledged = false;
  const providerImages = {};
  const remaining = reserve => Math.max(1, deadline - Date.now() - reserve);
  const cleanEnv = Object.fromEntries(['PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SYSTEMROOT', 'USERPROFILE']
    .filter(key => typeof env[key] === 'string').map(key => [key, env[key]]));
  cleanEnv.OM2W_IMAGE_CONTRACT_API_KEY = DUMMY_KEY;
  try {
    check(!controller.signal.aborted, 'CONTRACT_CANCELLED', 'Image contract was cancelled before CLI dispatch');
    const contractCatalog = publicRelease ? await loadImageContractCatalog({ publicRelease, publicPins, catalogFile }) : null;
    const allowed = contractCatalog?.allowed ?? ALLOWED_TOOLS;
    if (contractCatalog) receipt.public_tool_catalog = { source: contractCatalog.descriptor, ...contractCatalog.receipt };
    const binary = await executable(command, env), binaryHash = sha256(await readFile(binary));
    receipt.cli = { command: binary, sha256: binaryHash, expected_sha256: expectedBinarySha256, expected_version: expectedVersion };
    check(binaryHash === expectedBinarySha256, 'CLI_BINARY_MISMATCH', 'The CLI bytes differ from the pinned image contract executable');
    const version = await runCommand(binary, ['--version'], { env: cleanEnv, cwd: outputDir, signal: controller.signal, timeoutMs: Math.min(5000, remaining(2000)) });
    receipt.cli.version = version.stdout.trim();
    check(version.code === 0 && version.stdout.trim() === expectedVersion, 'CLI_VERSION_MISMATCH', 'The CLI version differs from the pinned image contract version');
    pins = await imageContractSourcePins({ publicRelease, publicPins, catalogFile }); receipt.source_sha256 = pins;
    const catalog = JSON.parse(await readFile(CODEX_MODEL_CATALOG)), catalogReceipt = JSON.parse(await readFile(CATALOG_RECEIPT));
    check(catalogReceipt.model === model && catalogReceipt.policy_catalog_sha256 === pins['config/codex-model-catalog.json'],
      'MODEL_CATALOG_RECEIPT_MISMATCH', 'The catalog receipt must identify this exact production model policy');
    check(catalog.models?.some(row => row.slug === model && row.supports_image_detail_original === true),
      'MODEL_ORIGINAL_IMAGE_UNSUPPORTED', 'The production model catalog must support original image detail');
    receipt.model = model; receipt.effort = effort; receipt.catalog = { path: CODEX_MODEL_CATALOG, sha256: pins['config/codex-model-catalog.json'],
      receipt: { path: CATALOG_RECEIPT, sha256: pins['config/codex-model-catalog.receipt.json'] } };
    const png = generateContractPng(), dimensions = inspectPng(png);
    check(dimensions.ok && png.length > 1024 * 1024 && png.length < 16 * 1024 * 1024, 'FIXTURE_PNG_INVALID', 'The valid high-entropy RGB PNG must exceed1MiB');
    receipt.png = { path: null, bytes: png.length, sha256: sha256(png), width: dimensions.width, height: dimensions.height,
      encoding: '8bit RGB, deterministic xorshift32 seed0x6d2b79f5, filter0, zlib level1' };
    const tools = contractCatalog?.tools ?? (await loadImageContractCatalog()).tools;
    upstream = imageContractFixtureUpstream(png, dimensions, tools);
    gateway = await startTaskGateway({ ProxyClass: imageContractProxyClass(publicRelease), upstream, command: ['fixture-only-no-native-client'],
      rawDir: path.join(outputDir, 'gateway'), startUrl: FIXTURE_URL, taskId: 'codex-image-contract', attemptId: 'attempt-1', deadline });
    await gateway.initialize();
    server = createServer((incoming, response) => {
      let size = 0; const chunks = [];
      incoming.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_HTTP_BYTES) { fixtureError ??= Object.assign(new Error('Local provider body exceeded its bounded request limit'), { code: 'CONTRACT_REQUEST_TOO_LARGE' }); incoming.destroy(); return; }
        chunks.push(chunk);
      });
      incoming.on('error', () => {});
      incoming.on('end', () => {
        try {
          check(incoming.method === 'POST' && incoming.url === '/responses' && !incoming.headers['content-encoding'],
            'CONTRACT_HTTP_ROUTE', 'Only the local uncompressed Responses endpoint is allowed');
          check(incoming.headers.authorization === `Bearer ${DUMMY_KEY}`, 'CONTRACT_AUTH', 'The local fixture must use only its dummy provider credential');
          const body = Buffer.concat(chunks), request = JSON.parse(body.toString('utf8'));
          receipt.request_summaries.push({ index: receipt.request_summaries.length, bytes: body.length, sha256: sha256(body),
            model: request.model, effort: request.reasoning?.effort ?? null });
          verifyCodexRequestSettings(request, { model, effort });
          if (receipt.request_summaries.length === 1) {
            toolSurface = codexRequestToolSurface(request, allowed);
            check(toolSurface.count === allowed.length && !toolSurface.missing.length && !toolSurface.unexpected.length,
              'CONTRACT_TOOL_SURFACE', 'The actual request must expose exactly the full manual FSB tool set');
            emitToolCall(response, model); return;
          }
          if (receipt.request_summaries.length === 2) {
            providerImages.success = inspectCodexImageRequest(request, png);
            emitToolCall(response, model, ERROR_FIXTURE_CALL); return;
          }
          check(receipt.request_summaries.length === 3, 'CONTRACT_EXTRA_REQUEST', 'The local canary needs exactly two MCP calls and three model requests');
          const retainedSuccess = inspectCodexImageRequest(request, png);
          check(retainedSuccess.frame.frame_id === providerImages.success.frame.frame_id, 'CONTRACT_HISTORY_CHANGED', 'The prior successful observation changed in the follow-up request');
          providerImages.error = inspectCodexImageRequest(request, png, { callId: ERROR_FIXTURE_CALL, errorCode: FIXTURE_ERROR });
          stopAcknowledged = true;
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: { message: STOP_MESSAGE, type: 'local_image_contract_stop' } }));
        } catch (error) {
          fixtureError ??= error;
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: { message: 'Local image contract rejected the request', type: 'local_image_contract_failure' } }));
        }
      });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    receipt.local_provider = { origin, redirects: false, expected_terminal_http_status: 400, real_inference: false };
    const promptPath = path.join(outputDir, 'instructions.md'), answerPath = path.join(outputDir, 'answer.txt');
    await writeFile(promptPath, 'Synthetic local image serialization canary. Use only the supplied local fixture. No real service or benchmark task is being solved.\n', { flag: 'wx' });
    const args = codexArguments({ model, effort, socketPath: gateway.socketPath, promptPath, answerPath, allowed, toolTimeoutSeconds: 300 }).slice(0, -1);
    const config = { model_provider: 'local_image_contract', 'model_providers.local_image_contract.name': 'Local image contract fixture',
      'model_providers.local_image_contract.base_url': origin, 'model_providers.local_image_contract.wire_api': 'responses',
      'model_providers.local_image_contract.env_key': 'OM2W_IMAGE_CONTRACT_API_KEY', 'model_providers.local_image_contract.requires_openai_auth': false,
      'model_providers.local_image_contract.request_max_retries': 0, 'model_providers.local_image_contract.stream_max_retries': 0,
      'features.enable_request_compression': false, 'analytics.enabled': false, 'feedback.enabled': false };
    args.push(...Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${tomlValue(value)}`]), '-');
    receipt.cli.production_args_sha256 = sha256(Buffer.from(JSON.stringify(args)));
    const stdoutHash = createHash('sha256'), stderrHash = createHash('sha256'); let pending = '', stdoutBytes = 0, stderrBytes = 0;
    const event = line => {
      let row; try { row = JSON.parse(line); } catch { return; }
      if (row.type !== 'item.completed' || row.item?.type !== 'mcp_tool_call') return;
      receipt.event_summaries.push({ server: row.item.server, tool: row.item.tool,
        content: (row.item.result?.content ?? []).map(block => ({ type: block.type, chars: (block.text ?? block.data ?? '').length,
          truncated: block.type === 'text' && /(?:chars|bytes) truncated|truncated.*(?:chars|bytes)/.test(block.text ?? '') })) });
    };
    const execution = await runCommand(binary, args, { cwd: outputDir, env: cleanEnv, signal: controller.signal,
      input: 'Perform the one local fixture read.\n', timeoutMs: remaining(2000), capture: false,
      onStdout(chunk) {
        stdoutHash.update(chunk); stdoutBytes += Buffer.byteLength(chunk); pending += chunk;
        if (pending.length > 32 * 1024 * 1024) { fixtureError ??= Object.assign(new Error('CLI event exceeded the bounded diagnostic buffer'), { code: 'CONTRACT_EVENT_TOO_LARGE' }); pending = ''; abort(); return; }
        const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(event);
      },
      onStderr(chunk) { stderrHash.update(chunk); stderrBytes += Buffer.byteLength(chunk); },
    });
    if (pending.trim()) event(pending);
    receipt.cli = { ...receipt.cli, exit_code: execution.code, timed_out: execution.timedOut ?? false,
      stdout_bytes: stdoutBytes, stdout_sha256: stdoutHash.digest('hex'), stderr_bytes: stderrBytes, stderr_sha256: stderrHash.digest('hex'),
      expected_fixture_stop: stopAcknowledged, completed: true };
    if (fixtureError) throw fixtureError;
    check(!execution.timedOut && !controller.signal.aborted, 'CONTRACT_TIMEOUT', 'The local CLI image contract did not settle before its deadline');
    check(stopAcknowledged && receipt.request_summaries.length === 3 && providerImages.success && providerImages.error,
      'CONTRACT_INCOMPLETE', 'Both success and isError native images must reach the local follow-up model requests');
    check(execution.code === 1, 'CONTRACT_EXIT', 'The CLI must exit on the intentional local400 stop without retrying');
    const steps = (await readFile(path.join(outputDir, 'gateway/steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    for (const [scenario, image] of Object.entries(providerImages)) {
      const actor = steps.find(row => row.tool === 'read_page' && row.frame_receipt?.frame_id === image.frame.frame_id);
      check(actor && actor.ok === (scenario === 'success') && actor.frame_receipt.operation_id === image.frame.operation_id
        && actor.frame_receipt.tab_id === image.frame.tab_id, 'PRODUCTION_FRAME_LINK_MISMATCH', 'Each outgoing frame must match its actual successful or failed production read');
      check((await readFile(actor.screenshot_path)).equals(png), 'RECORDED_PNG_MISMATCH', 'The production saved PNG differs from the generated source');
      receipt.png.path ??= actor.screenshot_path;
    }
    for (const key of ['frame_id', 'operation_id', 'capture_id']) check(providerImages.success.frame[key] !== providerImages.error.frame[key],
      'CONTRACT_FRAME_REUSED', 'Success and error observations must have distinct frame, operation and capture identities');
    check(sha256(await readFile(binary)) === binaryHash && JSON.stringify(await imageContractSourcePins({ publicRelease, publicPins, catalogFile })) === JSON.stringify(pins),
      'CONTRACT_SOURCE_CHANGED', 'Pinned CLI or production source changed during the contract');
    receipt.provider_images = providerImages; receipt.tool_surface = toolSurface;
    receipt.checks = { native_image: true, original_bytes: true, original_dimensions: true, png_mime: true,
      production_frame_link: true, success_image: true, isError_image: true, distinct_observation_ids: true,
      full_manual_tool_surface: true, unchanged_sources: true };
    receipt.event_truncation = { observed: receipt.event_summaries.some(row => row.content.some(block => block.truncated)),
      scope: 'CLI event artifact only; exact original native image was independently verified in the outgoing local-provider request' };
  } catch (error) { failure = error; }
  finally {
    try { await gateway?.close(); } catch (error) { failure ??= error; }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    receipt.cleanup = { gateway_closed: !gateway || gateway.proxy.meta.cleanup_ok === true,
      fixture_upstream_closed: !upstream || upstream.closed, remaining_fixture_tabs: upstream?.tabs.size ?? 0,
      local_http_closed: !server || !server.listening, process_group_finished: receipt.cli.completed ?? false };
    if (gateway && (!receipt.cleanup.gateway_closed || !receipt.cleanup.fixture_upstream_closed || receipt.cleanup.remaining_fixture_tabs))
      failure ??= Object.assign(new Error('Local image contract cleanup was not verified'), { code: 'CONTRACT_CLEANUP' });
    receipt.fixture_calls = upstream?.calls ?? [];
    receipt.ok = !failure;
    if (failure) receipt.error = { code: failure.code ?? 'CODEX_IMAGE_CONTRACT_FAILED', message: failure.message };
    receipt.completed_at = new Date().toISOString(); receipt.elapsed_ms = Date.now() - started;
    receipt.limitations = 'Synthetic successful and completed-isError read_page serialization proof only. Not model perception, live Chrome health or benchmark success. CLI event truncation is not per-call model-payload attestation.';
    await writeFile(path.join(outputDir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  }
  return receipt;
}
