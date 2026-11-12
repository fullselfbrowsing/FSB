import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { generateClaudeContractPng, CONTRACT_BLOCKS, verifyClaudeImageContract } from '../claude-image-contract.mjs';
import { claudeToolViolation, MAX_MCP_OUTPUT_TOKENS, TOOL_PREFIX } from '../driver-claude-manual.mjs';
import { ALLOWED_TOOLS } from '../browser-manual-profile.mjs';
import { inspectPng } from '../png.mjs';
import { MODEL, EFFORT } from '../model-family.mjs';

const MiB = 1024 * 1024;
const fixture = generateClaudeContractPng();

// Reads 8-bit RGB pixels from the fixture's unfiltered scanlines.
function rgbReader(png) {
  const parts = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('latin1', offset + 4, offset + 8);
    if (type === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const { width } = inspectPng(png), raw = inflateSync(Buffer.concat(parts)), stride = width * 3 + 1;
  return (x, y) => {
    assert.equal(raw[y * stride], 0, `Scanline ${y} must be unfiltered`);
    const start = y * stride + 1 + x * 3; return [raw[start], raw[start + 1], raw[start + 2]];
  };
}

test('the Claude contract fixture is a deterministic valid 3024x1610 RGB PNG between 1 and 8 MiB', () => {
  assert.deepEqual(inspectPng(fixture), { ok: true, error: null, width: 3024, height: 1610 });
  assert.ok(fixture.length > MiB && fixture.length < 8 * MiB, `${fixture.length} bytes`);
  assert.equal(fixture[24], 8, 'bit depth'); assert.equal(fixture[25], 2, 'RGB color type');
  assert.ok(generateClaudeContractPng().equals(fixture), 'Byte-identical across generations');
});

test('every contract block is painted in its exact color below an incompressible noise band', () => {
  const pixel = rgbReader(fixture), gray = [128, 128, 128];
  assert.ok(Object.isFrozen(CONTRACT_BLOCKS) && CONTRACT_BLOCKS.every(Object.isFrozen));
  assert.equal(CONTRACT_BLOCKS.length, 8);
  assert.equal(new Set(CONTRACT_BLOCKS.map(block => block.color.join())).size, 8, 'Block colors are distinct');
  for (const block of CONTRACT_BLOCKS) {
    assert.ok(block.y >= 300 && block.x + block.width <= 3024 && block.y + block.height <= 1610, 'Inside the image and below the noise band');
    for (const [x, y] of [[block.x, block.y], [block.x + block.width - 1, block.y + block.height - 1],
      [block.x + block.width / 2, block.y + block.height / 2]]) assert.deepEqual(pixel(x, y), block.color, `${block.color} at ${x},${y}`);
    assert.deepEqual(pixel(block.x - 1, block.y), gray, 'Blocks sit on the gray field');
  }
  for (const y of [0, 299]) {
    const noise = new Set(Array.from({ length: 3024 }, (_, x) => pixel(x, y).join()));
    assert.ok(noise.size > 2900, `Noise row ${y} has ${noise.size} distinct colors`);
  }
  assert.ok(Array.from({ length: 3024 }, (_, x) => pixel(x, 300)).every(rgb => rgb.join() === gray.join()), 'The noise band ends at row 300');
});

test('the pinned Claude CLI delivers the recorded observation to a local fake Messages API through the production arguments',
  { skip: process.env.OM2W_TEST_CLAUDE_CLI === '1' ? false
    : 'Set OM2W_TEST_CLAUDE_CLI=1 to run the pinned CLI against the local fake Messages API (dummy key, no inference)', timeout: 300_000 },
  async t => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'claude-image-contract-test-'));
    const receipt = await verifyClaudeImageContract({ outputDir });
    assert.equal(receipt.ok, true, `Contract failed; evidence kept in ${outputDir}: ${JSON.stringify(receipt.error)}`);
    t.after(() => rm(outputDir, { recursive: true, force: true }));
    assert.equal(receipt.checks.success_image_delivered, true);
    assert.equal(receipt.checks.large_result_inline, true); assert.equal(receipt.checks.error_text_delivered, true);
    assert.equal(receipt.real_model_calls, 0); assert.equal(receipt.local_provider.real_inference, false);
    assert.match(receipt.local_provider.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(receipt.model, MODEL); assert.equal(receipt.effort, EFFORT);
    assert.deepEqual(receipt.tool_surface, { count: ALLOWED_TOOLS.length, missing: [], unexpected: [] });
    assert.equal(receipt.max_mcp_output_tokens, MAX_MCP_OUTPUT_TOKENS);
    assert.deepEqual(receipt.cleanup, { gateway_closed: true, fixture_upstream_closed: true, remaining_fixture_tabs: 0, local_http_closed: true });
    // The real CLI's own stream must pass the policy the production driver applies to it.
    const events = (await readFile(path.join(outputDir, 'stream.jsonl'), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
    const init = events.find(event => event.type === 'system' && event.subtype === 'init');
    assert.ok(init, 'The CLI streams an init event');
    assert.deepEqual([...init.tools].sort(), ALLOWED_TOOLS.map(name => TOOL_PREFIX + name).sort());
    assert.deepEqual(init.mcp_servers.map(({ name, status }) => ({ name, status })), [{ name: 'fsb', status: 'connected' }]);
    assert.deepEqual(events.map(event => claudeToolViolation(event, ALLOWED_TOOLS)).filter(Boolean), []);
    t.diagnostic(`CLI ${init.claude_code_version}: ${init.tools.length} tools, permissionMode=${init.permissionMode}, apiKeySource=${init.apiKeySource}, `
      + `${receipt.requests.length} local requests, delivered ${receipt.delivered.success.width}x${receipt.delivered.success.height} ${receipt.delivered.success.media_type}`);
  });
