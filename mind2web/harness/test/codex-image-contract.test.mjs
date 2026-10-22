import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateContractPng, inspectCodexImageRequest, codexRequestToolSurface, verifyCodexRequestSettings, verifyCodexImageContract,
  loadImageContractCatalog, imageContractSourcePins, imageContractFixtureUpstream, imageContractProxyClass } from '../codex-image-contract.mjs';
import { inspectPng, encodeSolidPng } from '../png.mjs';
import { ALLOWED_TOOLS, PUBLIC_ALLOWED_TOOLS, PUBLIC_PROFILE_ID } from '../browser-manual-profile.mjs';
import { startTaskGateway } from '../task-gateway.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const small = generateContractPng(64, 32);
const frame = png => {
  const { width, height } = inspectPng(png);
  return { frame_id: 'recorded-frame', operation_id: 'recorded-operation', tab_id: 51,
    sha256: hash(png), byte_length: png.length, output_width: width, output_height: height, model_image_detail: 'original' };
};
const request = (png = small) => ({ input: [{ type: 'function_call_output', call_id: 'image-contract-call', output: [
  { type: 'input_text', text: JSON.stringify({ observation: frame(png) }) },
  { type: 'input_image', image_url: 'data:image/png;base64,' + png.toString('base64') },
] }] });
async function directory(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'codex-image-contract-test-'));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}

test('the default fixture contains deterministic valid RGB pixels above1MiB at3024x1610', () => {
  const first = generateContractPng(), second = generateContractPng();
  assert.deepEqual(inspectPng(first), { ok: true, error: null, width: 3024, height: 1610 });
  assert.ok(first.length > 1024 * 1024 && first.length < 16 * 1024 * 1024);
  assert.equal(first[24], 8); assert.equal(first[25], 2); assert.ok(first.equals(second));
  assert.throws(() => generateContractPng(0, 2), { code: 'INVALID_FIXTURE_DIMENSIONS' });
  assert.throws(() => generateContractPng(5000, 5000), { code: 'INVALID_FIXTURE_DIMENSIONS' });
});

test('native exact bytes and production observation receipt are verified without requiring the event image', () => {
  const actual = inspectCodexImageRequest(request(), small);
  assert.equal(actual.native_image, true); assert.equal(actual.mime_type, 'image/png'); assert.equal(actual.sha256, hash(small));
  assert.equal(actual.bytes, small.length); assert.equal(actual.width, 64); assert.equal(actual.height, 32);
  assert.equal(actual.frame.operation_id, 'recorded-operation');
});

test('serialized image JSON in text and an unrelated call cannot satisfy native delivery', () => {
  const flat = request(); flat.input[0].output = [{ type: 'input_text', text: JSON.stringify(flat.input[0].output) }];
  assert.throws(() => inspectCodexImageRequest(flat, small), { code: 'NATIVE_IMAGE_MISSING' });
  const wrongCall = request(); wrongCall.input[0].call_id = 'unrelated-call';
  assert.throws(() => inspectCodexImageRequest(wrongCall, small), { code: 'NATIVE_IMAGE_MISSING' });
  const duplicate = request(); duplicate.input[0].output.push(duplicate.input[0].output[1]);
  assert.throws(() => inspectCodexImageRequest(duplicate, small), { code: 'NATIVE_IMAGE_MISSING' });
});

test('resizing, recompression/substitution and non-PNG or incomplete encodings fail closed', () => {
  const resized = request(generateContractPng(32, 16));
  assert.throws(() => inspectCodexImageRequest(resized, small), { code: 'NATIVE_IMAGE_DIMENSIONS' });
  const substituted = request(encodeSolidPng(64, 32));
  assert.throws(() => inspectCodexImageRequest(substituted, small), { code: 'NATIVE_IMAGE_BYTES' });
  const jpeg = request(); jpeg.input[0].output[1].image_url = jpeg.input[0].output[1].image_url.replace('image/png', 'image/jpeg');
  assert.throws(() => inspectCodexImageRequest(jpeg, small), { code: 'NATIVE_IMAGE_MIME' });
  const truncated = request(); truncated.input[0].output[1].image_url = truncated.input[0].output[1].image_url.slice(0, -8);
  assert.throws(() => inspectCodexImageRequest(truncated, small), error => ['NATIVE_IMAGE_ENCODING', 'NATIVE_IMAGE_INVALID'].includes(error.code));
});

test('receipt hash, dimensions and original-detail provenance must agree with the model image', () => {
  for (const change of [value => { value.sha256 = '0'.repeat(64); }, value => { value.byte_length++; },
    value => { value.output_width--; }, value => { delete value.model_image_detail; }]) {
    const input = request(), receipt = frame(small); change(receipt);
    input.input[0].output[0].text = JSON.stringify({ observation: receipt });
    assert.throws(() => inspectCodexImageRequest(input, small), { code: 'FRAME_RECEIPT_MISMATCH' });
  }
  const missing = request(); missing.input[0].output.shift();
  assert.throws(() => inspectCodexImageRequest(missing, small), { code: 'FRAME_RECEIPT_MISSING' });
});

test('the isError call needs its own native image, receipt and original completed error content', () => {
  const value = request(), output = value.input[0]; output.call_id = 'error-call';
  const options = { callId: 'error-call', errorCode: 'KNOWN_READ_ERROR' };
  assert.throws(() => inspectCodexImageRequest(value, small, options), { code: 'NATIVE_ERROR_RESULT_MISSING' });
  output.output.unshift({ type: 'input_text', text: JSON.stringify({ success: false, code: 'KNOWN_READ_ERROR', error: 'Completed known fixture error' }) });
  assert.equal(inspectCodexImageRequest(value, small, options).native_image, true);
  assert.throws(() => inspectCodexImageRequest(value, small, { ...options, callId: 'successful-call' }), { code: 'NATIVE_IMAGE_MISSING' });
});

test('the full46-tool namespace is derived from actual native additional_tools input', () => {
  const value = { input: [{ type: 'additional_tools', tools: [
    { type: 'namespace', name: 'functions', tools: [{ name: 'exec' }] },
    { type: 'namespace', name: 'mcp__fsb', tools: ALLOWED_TOOLS.map(name => ({ type: 'function', name })) },
  ] }] };
  const surface = codexRequestToolSurface(value);
  assert.equal(surface.count, 46); assert.deepEqual(surface.names, [...ALLOWED_TOOLS].sort());
  assert.deepEqual(surface.missing, []); assert.deepEqual(surface.unexpected, []);
  value.input[0].tools[1].tools.pop(); value.input[0].tools[1].tools.push({ name: 'vault' });
  const bad = codexRequestToolSurface(value); assert.equal(bad.missing.length, 1); assert.deepEqual(bad.unexpected, ['vault']);
});

test('both actual model and reasoning effort must match, including on the follow-up request', () => {
  const expected = { model: 'gpt-6.1-sol', effort: 'medium' };
  verifyCodexRequestSettings({ model: expected.model, reasoning: { effort: expected.effort } }, expected);
  assert.throws(() => verifyCodexRequestSettings({ model: 'other-model', reasoning: { effort: 'medium' } }, expected), { code: 'CONTRACT_MODEL' });
  for (const reasoning of [undefined, {}, { effort: 'low' }])
    assert.throws(() => verifyCodexRequestSettings({ model: expected.model, reasoning }, expected), { code: 'CONTRACT_EFFORT' });
});

test('an unpinned executable never starts a gateway or model request and keeps its failed receipt', async t => {
  const outputDir = await directory(t), receipt = await verifyCodexImageContract({ outputDir, command: process.execPath });
  assert.equal(receipt.ok, false); assert.equal(receipt.error.code, 'CLI_BINARY_MISMATCH');
  assert.equal(receipt.request_summaries.length, 0); assert.deepEqual(receipt.fixture_calls, []);
  assert.equal(receipt.real_browser_calls, 0); assert.equal(receipt.real_model_calls, 0);
  assert.deepEqual((await readdir(outputDir)).sort(), ['receipt.json']);
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'receipt.json'))), receipt);
});

test('existing evidence is never overwritten and an already cancelled canary makes no CLI call', async t => {
  const outputDir = await directory(t); await writeFile(path.join(outputDir, 'preserve.txt'), 'saved evidence');
  await assert.rejects(verifyCodexImageContract({ outputDir }), { code: 'CONTRACT_OUTPUT_EXISTS' });
  assert.equal(await readFile(path.join(outputDir, 'preserve.txt'), 'utf8'), 'saved evidence');
  const cancelledDir = path.join(outputDir, 'cancelled'), controller = new AbortController(); controller.abort();
  const receipt = await verifyCodexImageContract({ outputDir: cancelledDir, signal: controller.signal });
  assert.equal(receipt.error.code, 'CONTRACT_CANCELLED'); assert.deepEqual(receipt.cli, {}); assert.equal(receipt.cleanup.local_http_closed, true);
});

test('a hung diagnostic child is killed and its local gateway/server close before returning a failed canary', async t => {
  const dir = await directory(t), command = path.join(dir, 'fake-codex.mjs'), outputDir = path.join(dir, 'evidence');
  await writeFile(command, `#!/usr/bin/env node\nimport {writeFileSync} from 'node:fs';\nif(process.argv.includes('--version')){console.log('fake-codex');}else{writeFileSync('child.pid',String(process.pid));setInterval(()=>{},1000);}\n`);
  await chmod(command, 0o755);
  const started = Date.now(), receipt = await verifyCodexImageContract({ outputDir, command, timeoutMs: 3500,
    expectedVersion: 'fake-codex', expectedBinarySha256: hash(await readFile(command)) });
  assert.equal(receipt.ok, false); assert.equal(receipt.error.code, 'CONTRACT_TIMEOUT'); assert.ok(Date.now() - started < 6000);
  assert.equal(receipt.cli.timed_out, true); assert.equal(receipt.cleanup.gateway_closed, true);
  assert.equal(receipt.cleanup.fixture_upstream_closed, true); assert.equal(receipt.cleanup.local_http_closed, true);
  assert.equal(receipt.cleanup.remaining_fixture_tabs, 0);
  const pid = Number(await readFile(path.join(outputDir, 'child.pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
});

async function publicCatalog(t) {
  const dir = await directory(t), file = path.join(dir, 'registered-public-tools.json');
  const tools = PUBLIC_ALLOWED_TOOLS.map(name => ({ name, description: `Public registered schema fixture for ${name}`,
    inputSchema: { type: 'object', properties: { tab_id: { type: 'number' }, client: { type: 'string' },
      ...(name === 'read_page' ? { full: { type: 'boolean' } } : {}),
      ...(name === 'search' ? { query: { type: 'string' } } : {}) }, required: [] } }));
  const bytes = Buffer.from(JSON.stringify({ tools }) + '\n'); await writeFile(file, bytes);
  return { dir, file, tools, pins: { catalog: { path: file, bytes: bytes.length, sha256: hash(bytes) } } };
}

test('public surface uses the exact44 selected names while the default remains46', () => {
  const request = { tools: [{ type: 'namespace', name: 'mcp__fsb', tools: PUBLIC_ALLOWED_TOOLS.map(name => ({ name })) }] };
  const publicSurface = codexRequestToolSurface(request, PUBLIC_ALLOWED_TOOLS);
  assert.equal(publicSurface.count, 44); assert.deepEqual(publicSurface.missing, []); assert.deepEqual(publicSurface.unexpected, []);
  assert.deepEqual(codexRequestToolSurface(request).missing.sort(), ['wait_for_element', 'wait_for_stable']);
});

test('public image catalog comes from pinned actual schemas and refuses summaries or changed source bytes', async t => {
  const f = await publicCatalog(t);
  const loaded = await loadImageContractCatalog({ publicRelease: true, publicPins: f.pins });
  assert.equal(loaded.profile.id, PUBLIC_PROFILE_ID); assert.equal(loaded.allowed.length, 44);
  assert.deepEqual(loaded.tools, f.tools); assert.equal(loaded.descriptor.sha256, f.pins.catalog.sha256);
  await assert.rejects(loadImageContractCatalog({ publicRelease: true }), { code: 'PUBLIC_CATALOG_REQUIRED' });
  await assert.rejects(loadImageContractCatalog({ publicRelease: true, publicPins: f.pins, catalogFile: path.join(f.dir, 'other.json') }), { code: 'PUBLIC_CATALOG_BINDING_MISMATCH' });
  await writeFile(f.file, JSON.stringify({ tools: f.tools.slice(1) }));
  await assert.rejects(loadImageContractCatalog({ publicRelease: true, publicPins: f.pins }), { code: 'PUBLIC_CATALOG_CHANGED' });
  await assert.rejects(loadImageContractCatalog({ publicRelease: true, catalogFile: f.file }), /missing frozen profile tool/);
  await writeFile(f.file, JSON.stringify({ tools: PUBLIC_ALLOWED_TOOLS }));
  await assert.rejects(loadImageContractCatalog({ publicRelease: true, catalogFile: f.file }), { code: 'PUBLIC_CATALOG_INVALID' });
});

test('public source inventory pins public catalog and wrapper bytes without an experimental extension schema dependency', async t => {
  const f = await publicCatalog(t);
  const binding = path.join(f.dir, 'public-source-binding.json'); await writeFile(binding, '{"kind":"test-only-source-receipt"}\n');
  const data = await readFile(binding); f.pins.source_binding = { path: binding, sha256: hash(data), bytes: data.length };
  const pins = await imageContractSourcePins({ publicRelease: true, publicPins: f.pins });
  assert.equal(pins['public/registered-tool-catalog.json'], f.pins.catalog.sha256);
  assert.equal(pins['public/source_binding.json'], f.pins.source_binding.sha256);
  assert.equal('extension/ai/tool-definitions.js' in pins, false);
  for (const name of ['public-release-client.mjs', 'mcp-client.mjs', 'manual-recording-proxy.mjs', 'public-disposition.mjs',
    'observation-recorder.mjs', 'task-gateway.mjs', 'browser-manual-profile.mjs', 'driver-codex.mjs']) assert.match(pins[name], /^[a-f0-9]{64}$/);
  await writeFile(binding, '{}\n');
  await assert.rejects(imageContractSourcePins({ publicRelease: true, publicPins: f.pins }), { code: 'PUBLIC_SOURCE_CHANGED' });
  const legacy = await imageContractSourcePins(); assert.match(legacy['extension/ai/tool-definitions.js'], /^[a-f0-9]{64}$/);
  assert.equal('public/registered-tool-catalog.json' in legacy, false);
});

test('synthetic public gateway exercises the public44 schema and native success/error frames without creating a guard', async t => {
  const f = await publicCatalog(t), loaded = await loadImageContractCatalog({ publicRelease: true, publicPins: f.pins });
  const png = generateContractPng(128, 110), dimensions = inspectPng(png), upstream = imageContractFixtureUpstream(png, dimensions, loaded.tools);
  const gateway = await startTaskGateway({ ProxyClass: imageContractProxyClass(true), upstream, command: ['never-run-a-native-client'],
    rawDir: path.join(f.dir, 'gateway'), startUrl: 'https://image-contract.invalid/', taskId: 'public-image-contract', deadline: Date.now() + 30_000 });
  t.after(() => gateway.close()); await gateway.initialize();
  assert.equal(gateway.proxy.upstream, upstream, 'The fake upstream must never be wrapped in PublicReleaseClient');
  assert.equal(gateway.proxy.publicRelease, false, 'Only the public actor profile is applied to this synthetic transport');
  assert.equal(gateway.proxy.profile.id, PUBLIC_PROFILE_ID);
  const catalog = await gateway.proxy.handle('tools/list');
  assert.deepEqual(catalog.tools.map(tool => tool.name).sort(), [...PUBLIC_ALLOWED_TOOLS].sort());
  assert.match(catalog.tools.find(tool => tool.name === 'search').description, /Public registered schema fixture/);
  assert.equal('allow_web_fallback' in catalog.tools.find(tool => tool.name === 'search').inputSchema.properties, false);
  for (const expectedError of [false, true]) {
    const result = await gateway.proxy.handle('tools/call', { name: 'read_page', arguments: {} });
    assert.equal(result.isError === true, expectedError);
    const image = result.content.find(block => block.type === 'image');
    assert.deepEqual(Buffer.from(image.data, 'base64'), png); assert.equal(image._meta['codex/imageDetail'], 'original');
    await gateway.proxy.noteEmitted(result);
  }
  assert.equal(gateway.proxy.meta.counts.actions, 2, 'Public read_page attempts consume the UI budget');
  assert.equal(upstream.calls.filter(name => name === 'open_tab').length, 1, 'Only the synthetic task tab is opened; there is no guard setup');
  assert.equal(upstream.calls.filter(name => name === 'capture_screenshot').length, 3);
  await gateway.close(); assert.equal(upstream.closed, true); assert.equal(upstream.tabs.size, 0);
});

test('public catalog rejection preserves a failed contract receipt before any CLI or gateway work', async t => {
  const outputDir = await directory(t);
  const receipt = await verifyCodexImageContract({ outputDir, publicRelease: true, command: 'not-a-real-command' });
  assert.equal(receipt.ok, false); assert.equal(receipt.error.code, 'PUBLIC_CATALOG_REQUIRED');
  assert.equal(receipt.profile, PUBLIC_PROFILE_ID); assert.equal(receipt.guard_adapter_instantiated, false);
  assert.equal(receipt.synthetic_public_profile_only, true); assert.deepEqual(receipt.cli, {});
  assert.deepEqual(receipt.fixture_calls, []); assert.equal(receipt.real_model_calls, 0); assert.equal(receipt.real_browser_calls, 0);
});
