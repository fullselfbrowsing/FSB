import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { BENCH_ROOT, runCommand } from './proc.mjs';
import { claudeArguments, claudeEnvironment, claudeMcpConfig, TOOL_PREFIX, MAX_MCP_OUTPUT_TOKENS } from './driver-claude-manual.mjs';
import { imageContractProxyClass, loadImageContractCatalog } from './codex-image-contract.mjs';
import { startTaskGateway } from './task-gateway.mjs';
import { profileFor, toolsForProfile, actorPrompt, ALLOWED_TOOLS } from './browser-manual-profile.mjs';
import { inspectPng, PNG_SIGNATURE } from './png.mjs';
import { MODEL, EFFORT, CLAUDE_CLI, CLAUDE_CLI_PIN } from './model-family.mjs';

const FIXTURE_URL = 'https://image-contract.invalid/';
const FIXTURE_ERROR = 'IMAGE_CONTRACT_KNOWN_READ_ERROR';
const DUMMY_KEY = 'om2w-local-image-contract-only';
const MAX_HTTP_BYTES = 48 * 1024 * 1024;
// About 45k tokens: above Claude Code's default inline limit, below the configured one.
const LARGE_READ_CHARS = 180_000;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, code, message) => { if (!condition) throw Object.assign(new Error(message), { code }); };
const reply = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), header = Buffer.alloc(4), trailer = Buffer.alloc(4);
  header.writeUInt32BE(data.length); trailer.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, trailer]);
}

// A screenshot-sized PNG: an incompressible noise band (so the CLI's resize and
// transcode path runs on realistic bytes) above eight flat color blocks whose
// colors the delivered image must preserve.
export const CONTRACT_BLOCKS = Object.freeze([[230, 40, 40], [40, 200, 60], [40, 70, 230], [240, 200, 30],
  [200, 40, 200], [30, 200, 210], [250, 250, 250], [20, 20, 20]].map((color, index) => Object.freeze({
  color, x: 96 + (index % 4) * 720, y: 520 + Math.floor(index / 4) * 520, width: 600, height: 420 })));
export function generateClaudeContractPng(width = 3024, height = 1610, noiseRows = 300) {
  const stride = width * 3 + 1, pixels = Buffer.alloc(stride * height, 128);
  let random = 0x6d2b79f5;
  for (let y = 0; y < height; y++) {
    const start = y * stride; pixels[start] = 0;
    for (let x = 0; x < width; x++) {
      let rgb = null;
      if (y < noiseRows) {
        random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
        rgb = [random >>> 24, (random >>> 16) & 255, (random >>> 8) & 255];
      } else rgb = CONTRACT_BLOCKS.find(b => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height)?.color ?? [128, 128, 128];
      pixels.set(rgb, start + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

function fixtureUpstream(png, dimensions, tools) {
  const tabs = new Map(), calls = []; let selected, captures = 0, reads = 0, closed = false;
  return {
    calls, tabs, get closed() { return closed; },
    async request(method, params = {}) {
      if (method === 'initialize') return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'local-claude-image-contract', version: '1' } };
      if (method === 'tools/list') return { tools };
      if (method !== 'tools/call') return {};
      const name = params.name, args = params.arguments ?? {}, id = args.tab_id ?? args.tabId;
      calls.push(name);
      if (name === 'list_tabs') return reply({ success: true, tabs: [...tabs.values()] });
      if (name === 'open_tab') { const tab = { id: 61, url: args.url, title: 'Local fixture', windowId: 1 }; tabs.set(tab.id, tab); selected = tab.id; return reply({ success: true, tabId: tab.id }); }
      check(tabs.has(id), 'FIXTURE_TAB_OWNERSHIP', 'The fixture received an unowned tab');
      if (name === 'switch_tab') { selected = id; return reply({ success: true, tabId: id }); }
      if (name === 'close_tab') { tabs.delete(id); return reply({ success: true, tabId: id }); }
      if (name === 'capture_screenshot') {
        check(selected === id, 'FIXTURE_FOREGROUND', 'The captured fixture tab was not selected');
        return { content: [{ type: 'text', text: JSON.stringify({ capture_id: `local-capture-${++captures}`, source_url: tabs.get(id).url,
          timestamp: new Date().toISOString(), mode: 'viewport', css_rect: { x: 0, y: 0, width: dimensions.width / 2, height: dimensions.height / 2 },
          output_width: dimensions.width, output_height: dimensions.height, byte_length: png.length, sha256: sha256(png),
          effective_emulation: { device_mode: 'current', device_scale_factor: 2 } }) },
        { type: 'image', mimeType: 'image/png', data: png.toString('base64') }] };
      }
      check(name === 'read_page', 'UNEXPECTED_FIXTURE_TOOL', 'The local provider may request only its fixture reads');
      if (++reads === 2) return { ...reply({ success: false, code: FIXTURE_ERROR, error: 'Completed deterministic fixture read failure' }), isError: true };
      check(reads === 1, 'UNEXPECTED_FIXTURE_TOOL', 'The local provider may request exactly one successful and one failed fixture read');
      return reply({ success: true, content: 'Contract page. ' + 'x'.repeat(LARGE_READ_CHARS) + ' END_OF_CONTRACT_PAGE' });
    },
    notify() {}, async close() { closed = true; },
  };
}

function sse(response, model, blocks, stopReason) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const emit = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  emit('message_start', { message: { id: 'msg_contract_' + sha256(Buffer.from(String(Math.random()))).slice(0, 12), type: 'message', role: 'assistant',
    model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } });
  blocks.forEach((block, index) => {
    if (block.type === 'tool_use') {
      emit('content_block_start', { index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } });
      emit('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
    } else {
      emit('content_block_start', { index, content_block: { type: 'text', text: '' } });
      emit('content_block_delta', { index, delta: { type: 'text_delta', text: block.text } });
    }
    emit('content_block_stop', { index });
  });
  emit('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 1 } });
  emit('message_stop', {});
  response.end();
}

function imageSize(bytes) {
  const png = inspectPng(bytes);
  if (png.ok) return png;
  for (let i = 2; i + 9 < bytes.length;) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc2) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return null;
}
// Mirrors the API's accounting closely enough for the CLI's inline-size decision:
// text by characters, images by pixel area rather than encoded bytes.
function estimateTokens(request) {
  let chars = JSON.stringify(request.tools ?? []).length, images = 0;
  const visit = content => {
    if (typeof content === 'string') { chars += content.length; return; }
    for (const block of content ?? []) {
      if (block.type === 'text') chars += block.text.length;
      else if (block.type === 'image') {
        const size = imageSize(Buffer.from(block.source?.data ?? '', 'base64'));
        images += size ? Math.ceil(size.width * size.height / 750) : 1600;
      } else if (block.type === 'tool_result') visit(block.content);
      else chars += JSON.stringify(block).length;
    }
  };
  for (const message of request.messages ?? []) visit(message.content);
  return Math.ceil(chars / 4) + images;
}

function toolResult(request, id) {
  const results = (request.messages ?? []).flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter(block => block.type === 'tool_result' && block.tool_use_id === id);
  check(results.length === 1, 'TOOL_RESULT_MISSING', `Expected exactly one tool_result for ${id}`);
  return results[0];
}

/** Inspect the delivered image with the judge environment's Pillow; compare block colors to the source. */
async function inspectDelivered(bytes, source, outputDir, name) {
  const file = path.join(outputDir, name);
  await writeFile(file, bytes, { flag: 'wx' });
  const script = `import json,sys\nfrom PIL import Image\nimage=Image.open(sys.argv[1]);fmt=image.format;image=image.convert('RGB')\n`
    + `spec=json.loads(sys.argv[2]);sx=image.width/spec['width'];sy=image.height/spec['height'];errors=[]\n`
    + `for b in spec['blocks']:\n cx=int((b['x']+b['width']/2)*sx);cy=int((b['y']+b['height']/2)*sy);px=[image.getpixel((cx+dx,cy+dy)) for dx in range(-4,5) for dy in range(-4,5)]\n`
    + ` mean=[sum(p[i] for p in px)/len(px) for i in range(3)];errors.append(max(abs(mean[i]-b['color'][i]) for i in range(3)))\n`
    + `print(json.dumps({'format':fmt,'width':image.width,'height':image.height,'block_errors':errors,'max_block_error':max(errors)}))\n`;
  const spec = JSON.stringify({ width: source.width, height: source.height, blocks: CONTRACT_BLOCKS });
  const result = await runCommand(path.join(BENCH_ROOT, 'judge/.venv/bin/python'), ['-I', '-c', script, file, spec], { timeoutMs: 30_000 });
  check(result.code === 0, 'IMAGE_DECODE_FAILED', 'Pillow could not decode the delivered image: ' + result.stderr.slice(-400));
  return { path: file, bytes: bytes.length, sha256: sha256(bytes), ...JSON.parse(result.stdout) };
}

/** Local-only delivery canary: production recorder and CLI arguments, a fake Messages API, no inference or browser. */
export async function verifyClaudeImageContract({ outputDir, command = CLAUDE_CLI, model = MODEL, effort = EFFORT, timeoutMs = 120_000,
  expectedBinarySha256 = CLAUDE_CLI_PIN.sha256, expectedVersion = CLAUDE_CLI_PIN.version, env = process.env, signal,
  publicRelease = false, publicPins, catalogFile } = {}) {
  check(outputDir && Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300_000, 'INVALID_CONTRACT_OPTIONS', 'A fresh output directory and a bounded deadline are required');
  outputDir = path.resolve(outputDir); await mkdir(outputDir, { recursive: true });
  check((await readdir(outputDir)).length === 0, 'CONTRACT_OUTPUT_EXISTS', 'Contract evidence directory must be empty; prior evidence is never overwritten');
  const started = Date.now(), controller = new AbortController();
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeoutMs);
  const receipt = { schema_version: 1, kind: 'claude_mcp_image_contract', synthetic: true, benchmark_result: false,
    profile: profileFor(publicRelease).id, ...(publicRelease ? { public_release: true, synthetic_public_profile_only: true, guard_adapter_instantiated: false } : {}),
    started_at: new Date(started).toISOString(), ok: false, real_model_calls: 0, real_browser_calls: 0, output_dir: outputDir,
    checks: {}, cli: {}, requests: [], model, effort };
  let gateway, server, upstream, failure, fixtureError, mainRequests = 0;
  const delivered = {};
  try {
    const catalog = publicRelease ? await loadImageContractCatalog({ publicRelease, publicPins, catalogFile }) : null;
    const allowed = catalog?.allowed ?? ALLOWED_TOOLS;
    if (catalog) receipt.public_tool_catalog = { source: catalog.descriptor, ...catalog.receipt };
    const binary = path.resolve(command), binaryHash = sha256(await readFile(binary));
    receipt.cli = { command: binary, sha256: binaryHash, expected_sha256: expectedBinarySha256, expected_version: expectedVersion };
    check(binaryHash === expectedBinarySha256, 'CLI_BINARY_MISMATCH', 'The CLI bytes differ from the pinned contract executable');
    const version = await runCommand(binary, ['--version'], { env: claudeEnvironment(env), cwd: outputDir, signal: controller.signal, timeoutMs: 15_000 });
    receipt.cli.version = version.stdout.trim();
    check(version.code === 0 && receipt.cli.version === expectedVersion, 'CLI_VERSION_MISMATCH', 'The CLI version differs from the pinned contract version');
    const png = generateClaudeContractPng(), dimensions = inspectPng(png);
    check(dimensions.ok && png.length > 1024 * 1024 && png.length < 8 * 1024 * 1024, 'FIXTURE_PNG_INVALID', 'The fixture must be a valid screenshot-sized PNG');
    receipt.png = { bytes: png.length, sha256: sha256(png), width: dimensions.width, height: dimensions.height,
      encoding: '8-bit RGB; 300-row xorshift32 noise band (seed 0x6d2b79f5) above eight flat color blocks; zlib level 6' };
    const tools = catalog?.tools ?? (await loadImageContractCatalog()).tools;
    upstream = fixtureUpstream(png, dimensions, tools);
    gateway = await startTaskGateway({ ProxyClass: imageContractProxyClass(publicRelease), upstream, command: ['fixture-only-no-native-client'],
      rawDir: path.join(outputDir, 'gateway'), startUrl: FIXTURE_URL, taskId: 'claude-image-contract', attemptId: 'attempt-1', deadline: started + timeoutMs });
    await gateway.initialize();
    const prompt = actorPrompt(await readFile(path.join(BENCH_ROOT, 'config/browser-manual-v2-prompt.md'), 'utf8'), publicRelease, 'claude');
    server = createServer((incoming, response) => {
      let size = 0; const chunks = [];
      incoming.on('data', part => {
        size += part.length;
        if (size > MAX_HTTP_BYTES) { fixtureError ??= Object.assign(new Error('Local provider body exceeded its bounded limit'), { code: 'CONTRACT_REQUEST_TOO_LARGE' }); incoming.destroy(); return; }
        chunks.push(part);
      });
      incoming.on('error', () => {});
      incoming.on('end', () => (async () => {
        const body = Buffer.concat(chunks), url = new URL(incoming.url, 'http://local');
        const summary = { index: receipt.requests.length, method: incoming.method, path: url.pathname, bytes: body.length, sha256: sha256(body) };
        receipt.requests.push(summary);
        check(incoming.method === 'POST' && ['/v1/messages', '/v1/messages/count_tokens'].includes(url.pathname), 'CONTRACT_HTTP_ROUTE', `Unexpected provider route ${incoming.method} ${url.pathname}`);
        check(incoming.headers['x-api-key'] === DUMMY_KEY && !incoming.headers.authorization, 'CONTRACT_AUTH', 'The CLI must use only the dummy local credential');
        const request = JSON.parse(body.toString('utf8'));
        if (url.pathname.endsWith('/count_tokens')) {
          response.writeHead(200, { 'content-type': 'application/json' });
          return response.end(JSON.stringify({ input_tokens: estimateTokens(request) }));
        }
        summary.model = request.model; summary.effort = request.output_config?.effort ?? null;
        const mcpTools = (request.tools ?? []).map(tool => tool.name);
        if (!mcpTools.some(name => name.startsWith(TOOL_PREFIX))) { sse(response, request.model, [{ type: 'text', text: 'ok' }], 'end_turn'); return; }
        check(request.model === model && summary.effort === effort, 'CONTRACT_MODEL', 'The main request changed the model or effort');
        mainRequests++;
        if (mainRequests === 1) {
          const names = [...mcpTools].sort(), expected = allowed.map(name => TOOL_PREFIX + name).sort();
          receipt.tool_surface = { count: names.length, missing: expected.filter(name => !names.includes(name)), unexpected: names.filter(name => !expected.includes(name)) };
          check(!receipt.tool_surface.missing.length && !receipt.tool_surface.unexpected.length, 'CONTRACT_TOOL_SURFACE', 'The request must expose exactly the FSB actor profile');
          const system = (Array.isArray(request.system) ? request.system : [{ text: String(request.system ?? '') }]).map(block => block.text ?? '').join('\n');
          check(system.includes(prompt.trim()), 'CONTRACT_SYSTEM_PROMPT', 'The request system prompt must contain the frozen actor prompt');
          receipt.system_prompt = { blocks: Array.isArray(request.system) ? request.system.length : 1, contains_actor_prompt: true };
          return sse(response, request.model, [{ type: 'tool_use', id: 'toolu_contract_1', name: TOOL_PREFIX + 'read_page', input: {} }], 'tool_use');
        }
        if (mainRequests === 2) {
          const result = toolResult(request, 'toolu_contract_1');
          check(!result.is_error && Array.isArray(result.content), 'NATIVE_RESULT_SHAPE', 'A successful observation must arrive as structured content, not a file preview');
          const texts = result.content.filter(block => block.type === 'text').map(block => block.text), images = result.content.filter(block => block.type === 'image');
          check(texts.some(text => text.includes('END_OF_CONTRACT_PAGE') && text.length > LARGE_READ_CHARS), 'LARGE_RESULT_TRUNCATED', 'The large read result must arrive inline and complete');
          const receipts = texts.flatMap(text => { try { const row = JSON.parse(text); return row.observation ? [row.observation] : []; } catch { return []; } });
          check(receipts.length === 1 && receipts[0].sha256 === sha256(png), 'FRAME_RECEIPT_MISSING', 'The observation receipt must identify the exact recorded PNG');
          check(images.length === 1 && images[0].source?.type === 'base64', 'NATIVE_IMAGE_MISSING', 'The model request must contain one native image block');
          const bytes = Buffer.from(images[0].source.data, 'base64');
          delivered.success = { media_type: images[0].source.media_type, frame: receipts[0],
            ...await inspectDelivered(bytes, dimensions, outputDir, 'delivered-success.' + (images[0].source.media_type === 'image/png' ? 'png' : 'jpg')) };
          const ratio = dimensions.width / dimensions.height, seen = delivered.success.width / delivered.success.height;
          check(Math.max(delivered.success.width, delivered.success.height) <= 2000 && Math.abs(seen - ratio) / ratio < 0.01,
            'NATIVE_IMAGE_GEOMETRY', 'The delivered image must keep the source aspect ratio within the CLI size limit');
          check(delivered.success.max_block_error <= 16, 'NATIVE_IMAGE_CONTENT', 'The delivered image must preserve the source block colors');
          return sse(response, request.model, [{ type: 'tool_use', id: 'toolu_contract_2', name: TOOL_PREFIX + 'read_page', input: {} }], 'tool_use');
        }
        check(mainRequests === 3, 'CONTRACT_EXTRA_REQUEST', 'The canary needs exactly three main model requests');
        const result = toolResult(request, 'toolu_contract_2');
        check(result.is_error === true, 'ERROR_RESULT_SHAPE', 'A completed tool failure must reach the model as is_error');
        const text = typeof result.content === 'string' ? result.content
          : (result.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
        const images = Array.isArray(result.content) ? result.content.filter(block => block.type === 'image') : [];
        check(text.includes(FIXTURE_ERROR) && text.includes('"observation"'), 'ERROR_RESULT_TEXT', 'The error text and its observation receipt must reach the model');
        delivered.error = { image_blocks: images.length, text_chars: text.length,
          note: images.length ? 'The CLI forwarded the failed observation image' : 'The CLI forwards only joined text for is_error tool results; the failed observation image is recorded but not shown to the model' };
        sse(response, request.model, [{ type: 'text', text: 'Local image contract complete.' }], 'end_turn');
      })().catch(error => {
        fixtureError ??= error;
        if (!response.headersSent) response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Local image contract rejected the request' } }));
      }));
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    receipt.local_provider = { origin, real_inference: false };
    const promptPath = path.join(outputDir, 'instructions.md'), mcpConfigPath = path.join(outputDir, 'mcp.json');
    await writeFile(promptPath, prompt, { flag: 'wx' });
    await writeFile(mcpConfigPath, JSON.stringify(claudeMcpConfig(gateway.socketPath)), { flag: 'wx' });
    const args = claudeArguments({ model, effort, mcpConfigPath, promptPath, allowed });
    await gateway.proxy.bootstrap();
    receipt.cli.production_args_sha256 = sha256(Buffer.from(JSON.stringify(args.map(arg => arg === mcpConfigPath || arg === promptPath ? '<path>' : arg))));
    let stdout = '';
    const execution = await runCommand(binary, args, { cwd: outputDir, signal: controller.signal, timeoutMs: Math.max(1000, started + timeoutMs - Date.now()),
      env: claudeEnvironment(env, { extra: { ANTHROPIC_BASE_URL: origin, ANTHROPIC_API_KEY: DUMMY_KEY } }),
      input: 'Starting website: https://image-contract.invalid/\nTask: Perform the two local fixture reads.\n' });
    stdout = execution.stdout;
    await writeFile(path.join(outputDir, 'stream.jsonl'), stdout, { flag: 'wx' });
    const events = stdout.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const result = events.findLast(event => event.type === 'result');
    receipt.cli = { ...receipt.cli, exit_code: execution.code, timed_out: execution.timedOut ?? false, stderr_bytes: Buffer.byteLength(execution.stderr ?? ''),
      result_subtype: result?.subtype ?? null, init_tools: events.find(event => event.subtype === 'init')?.tools?.length ?? null };
    if (fixtureError) throw fixtureError;
    check(!execution.timedOut && !controller.signal.aborted, 'CONTRACT_TIMEOUT', 'The CLI image contract did not settle before its deadline');
    check(execution.code === 0 && result?.subtype === 'success' && result.result === 'Local image contract complete.', 'CONTRACT_EXIT', 'The CLI must finish the canary normally');
    check(mainRequests === 3 && delivered.success && delivered.error, 'CONTRACT_INCOMPLETE', 'Both the successful and the failed observation must reach the model requests');
    const steps = (await readFile(path.join(outputDir, 'gateway/steps.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    const reads = steps.filter(row => row.tool === 'read_page');
    check(reads.length === 2 && reads[0].ok === true && reads[1].ok === false, 'PRODUCTION_STEPS', 'The recorder must log one successful and one failed read');
    for (const row of reads) check((await readFile(row.screenshot_path)).equals(png), 'RECORDED_PNG_MISMATCH', 'Saved observations must be the exact source PNG');
    check(reads[0].frame_receipt?.frame_id === delivered.success.frame.frame_id, 'PRODUCTION_FRAME_LINK', 'The delivered receipt must be the recorded success frame');
    check(sha256(await readFile(binary)) === binaryHash, 'CONTRACT_SOURCE_CHANGED', 'The pinned CLI changed during the contract');
    receipt.delivered = delivered;
    receipt.checks = { pinned_cli: true, exact_tool_surface: true, actor_system_prompt: true, model_and_effort: true,
      large_result_inline: true, success_image_delivered: true, image_geometry_and_colors: true, error_text_delivered: true,
      recorded_png_exact: true, dummy_credential_only: true };
    receipt.max_mcp_output_tokens = MAX_MCP_OUTPUT_TOKENS;
  } catch (error) { failure = error; }
  finally {
    try { await gateway?.close(); } catch (error) { failure ??= error; }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    receipt.cleanup = { gateway_closed: !gateway || gateway.proxy.meta.cleanup_ok === true, fixture_upstream_closed: !upstream || upstream.closed,
      remaining_fixture_tabs: upstream?.tabs.size ?? 0, local_http_closed: !server || !server.listening };
    if (gateway && (!receipt.cleanup.gateway_closed || !receipt.cleanup.fixture_upstream_closed || receipt.cleanup.remaining_fixture_tabs))
      failure ??= Object.assign(new Error('Local image contract cleanup was not verified'), { code: 'CONTRACT_CLEANUP' });
    receipt.fixture_calls = upstream?.calls ?? [];
    receipt.ok = !failure;
    if (failure) receipt.error = { code: failure.code ?? 'CLAUDE_IMAGE_CONTRACT_FAILED', message: failure.message };
    receipt.completed_at = new Date().toISOString(); receipt.elapsed_ms = Date.now() - started;
    receipt.limitations = 'Synthetic delivery proof through the production recorder and CLI arguments against a local Messages API with an API-key transport; the production run uses subscription OAuth. Not model perception, live Chrome health or benchmark success.';
    await writeFile(path.join(outputDir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  }
  return receipt;
}
