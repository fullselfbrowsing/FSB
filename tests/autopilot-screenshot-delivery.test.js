'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const attachments = require('../extension/ai/screenshot-attachments.js');
const {
  UniversalProvider,
  estimateRequestTextCharacters,
  requestContainsImageData,
} = require('../extension/ai/universal-provider.js');

function toolResult(captureId, bytes = 20) {
  return {
    success: true,
    hadEffect: false,
    result: {
      success: true,
      image_data: 'aGVsbG8=',
      mime_type: 'image/png',
      metadata: {
        capture_id: captureId,
        output_width: 100,
        output_height: 50,
        byte_length: bytes,
        duration_ms: 12,
        warnings: [],
      },
    },
  };
}

test('base64 is stripped immediately and retained only in the session memory map', () => {
  const result = attachments.storeToolResult('strip-session', 'call-1', 'capture_screenshot', toolResult('cap-1'));
  assert.equal(JSON.stringify(result).includes('aGVsbG8='), false);
  assert.equal(result.result.metadata.delivery_status, 'pending_model_delivery');
  assert.equal(attachments.pending('strip-session')[0].data, 'aGVsbG8=');
});

test('OpenAI-compatible delivery appends a labeled user image after paired tool results', () => {
  const sessionId = 'openai-session';
  const result = attachments.storeToolResult(sessionId, 'call-1', 'capture_screenshot', toolResult('cap-openai'));
  const messages = [{ role: 'tool', tool_call_id: 'call-1', name: 'capture_screenshot', content: JSON.stringify(result) }];
  const outbound = attachments.attachForProvider(messages, attachments.pending(sessionId), 'openai', 'gpt-x');
  assert.equal(outbound[0].role, 'tool');
  assert.equal(outbound[1].role, 'user');
  assert.equal(outbound[1].content[1].type, 'image_url');
  assert.match(outbound[1].content[1].image_url.url, /^data:image\/png;base64,/);
});

test('multiple OpenAI-compatible screenshot calls stay after every paired tool result', () => {
  const sessionId = 'openai-multiple-session';
  const first = attachments.storeToolResult(sessionId, 'call-1', 'capture_screenshot', toolResult('cap-1'));
  const second = attachments.storeToolResult(sessionId, 'call-2', 'capture_screenshot', toolResult('cap-2'));
  const messages = [
    { role: 'tool', tool_call_id: 'call-1', name: 'capture_screenshot', content: JSON.stringify(first) },
    { role: 'tool', tool_call_id: 'call-2', name: 'capture_screenshot', content: JSON.stringify(second) },
  ];
  const outbound = attachments.attachForProvider(messages, attachments.pending(sessionId), 'openrouter', 'vision-model');
  assert.deepEqual(outbound.slice(0, 2).map((message) => message.role), ['tool', 'tool']);
  assert.equal(outbound[2].role, 'user');
  assert.equal(outbound[2].content.filter((part) => part.type === 'image_url').length, 2);
  attachments.discard(sessionId);
});

test('Anthropic embeds image source in the matching tool_result block', () => {
  const sessionId = 'anthropic-session';
  const result = attachments.storeToolResult(sessionId, 'call-a', 'capture_screenshot', toolResult('cap-a'));
  const messages = [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-a', content: JSON.stringify(result) }] }];
  const outbound = attachments.attachForProvider(messages, attachments.pending(sessionId), 'anthropic', 'claude');
  const content = outbound[0].content[0].content;
  assert.equal(content[1].type, 'image');
  assert.equal(content[1].source.type, 'base64');
});

test('Gemini 3 nests inlineData while earlier Gemini uses a companion part', () => {
  const sessionId3 = 'gemini3-session';
  const result3 = attachments.storeToolResult(sessionId3, 'call-g3', 'capture_screenshot', toolResult('cap-g3'));
  const messages3 = [{ role: 'user', parts: [{ functionResponse: { id: 'call-g3', name: 'capture_screenshot', response: result3 } }] }];
  const gemini3 = attachments.attachForProvider(messages3, attachments.pending(sessionId3), 'gemini', 'gemini-3-pro');
  const functionResponse3 = gemini3[0].parts[0].functionResponse;
  assert.deepEqual(functionResponse3.response, result3);
  assert.equal(functionResponse3.parts.length, 1);
  assert.deepEqual(Object.keys(functionResponse3.parts[0]), ['inlineData']);
  assert.equal(functionResponse3.parts[0].inlineData.mimeType, 'image/png');
  assert.equal(Object.hasOwn(functionResponse3.parts[0], 'text'), false);

  const sessionId2 = 'gemini2-session';
  const result2 = attachments.storeToolResult(sessionId2, 'call-g2', 'capture_screenshot', toolResult('cap-g2'));
  const messages2 = [{ role: 'user', parts: [{ functionResponse: { id: 'call-g2', name: 'capture_screenshot', response: result2 } }] }];
  const gemini2 = attachments.attachForProvider(messages2, attachments.pending(sessionId2), 'gemini', 'gemini-2.5-flash');
  assert.ok(gemini2[0].parts[1].inlineData);
  assert.equal(gemini2[0].parts[0].functionResponse.parts, undefined);
});

test('delivery, rejection, and worker-eviction outcomes update only sanitized metadata', () => {
  const deliveredSession = 'delivered-session';
  const delivered = attachments.storeToolResult(deliveredSession, 'd1', 'capture_screenshot', toolResult('cap-delivered'));
  const deliveredMessages = [{ role: 'tool', content: JSON.stringify(delivered) }];
  attachments.markDelivered(deliveredSession, deliveredMessages);
  assert.match(deliveredMessages[0].content, /delivered_to_model/);
  assert.equal(attachments.pending(deliveredSession).length, 0);

  const rejectedSession = 'rejected-session';
  const rejected = attachments.storeToolResult(rejectedSession, 'r1', 'capture_screenshot', toolResult('cap-rejected'));
  const rejectedMessages = [{ role: 'tool', content: JSON.stringify(rejected) }];
  attachments.markRejected(rejectedSession, rejectedMessages, 'MODEL_IMAGE_INPUT_UNSUPPORTED');
  assert.match(rejectedMessages[0].content, /MODEL_IMAGE_INPUT_UNSUPPORTED/);

  const orphan = toolResult('cap-orphan');
  delete orphan.result.image_data;
  orphan.result.metadata.delivery_status = 'pending_model_delivery';
  const orphanMessages = [{ role: 'tool', content: JSON.stringify(orphan) }];
  assert.deepEqual(attachments.expireOrphans('restored-session', orphanMessages), ['cap-orphan']);
  assert.match(orphanMessages[0].content, /SCREENSHOT_ATTACHMENT_EXPIRED/);

  const terminalSession = 'terminal-session';
  attachments.storeToolResult(terminalSession, 't1', 'capture_screenshot', toolResult('cap-terminal'));
  assert.equal(attachments.discard(terminalSession).length, 1);
  assert.equal(attachments.pending(terminalSession).length, 0);
});

test('only likely 400/413/415/422 image rejections trigger text-only fallback', () => {
  assert.equal(attachments.classifyImageRejection({ status: 413, message: 'payload too large' }), 'MODEL_IMAGE_INPUT_TOO_LARGE');
  assert.equal(attachments.classifyImageRejection({ status: 400, message: 'image_url is not supported' }), 'MODEL_IMAGE_INPUT_UNSUPPORTED');
  assert.equal(attachments.classifyImageRejection({ status: 422, message: 'invalid image dimensions' }), 'MODEL_IMAGE_INPUT_TOO_LARGE');
  assert.equal(attachments.classifyImageRejection({ status: 400, message: 'invalid tool schema' }), null);
  assert.equal(attachments.classifyImageRejection({ status: 400, message: 'image request has invalid API key' }), null);
  assert.equal(attachments.classifyImageRejection({ status: 401, message: 'image auth failed' }), null);
  assert.equal(attachments.classifyImageRejection({ status: 429, message: 'image rate limit' }), null);
  assert.equal(attachments.classifyImageRejection({ status: 500, message: 'image server error' }), null);
});

test('autopilot enforces four screenshots and 25 MiB per model turn', () => {
  const countSession = 'count-limit-session';
  for (let index = 0; index < 4; index += 1) {
    const stored = attachments.storeToolResult(
      countSession,
      `count-${index}`,
      'capture_screenshot',
      toolResult(`cap-count-${index}`),
    );
    assert.equal(stored.success, true);
  }
  assert.equal(attachments.canCapture(countSession), false);
  attachments.discard(countSession);

  const byteSession = 'byte-limit-session';
  const first = attachments.storeToolResult(
    byteSession,
    'bytes-1',
    'capture_screenshot',
    toolResult('cap-bytes-1', 13 * 1024 * 1024),
  );
  const second = attachments.storeToolResult(
    byteSession,
    'bytes-2',
    'capture_screenshot',
    toolResult('cap-bytes-2', 13 * 1024 * 1024),
  );
  assert.equal(first.success, true);
  assert.equal(second.success, false);
  assert.equal(second.result.code, 'SCREENSHOT_TOO_LARGE');
  assert.equal(JSON.stringify(second).includes('aGVsbG8='), false);
  attachments.discard(byteSession);
});

test('binary-aware timeout estimation ignores base64 pixels', () => {
  const short = { messages: [{ role: 'user', content: [{ type: 'text', text: 'inspect' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }] };
  const huge = { messages: [{ role: 'user', content: [{ type: 'text', text: 'inspect' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(2_000_000)}` } }] }] };
  assert.equal(estimateRequestTextCharacters(short), estimateRequestTextCharacters(huge));

  const tinyInline = { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] };
  const hugeInline = { parts: [{ inlineData: { mimeType: 'image/png', data: 'A'.repeat(2_000_000) } }] };
  assert.equal(estimateRequestTextCharacters(tinyInline), estimateRequestTextCharacters(hugeInline));
  assert.equal(requestContainsImageData(huge), true);
  assert.equal(requestContainsImageData(hugeInline), true);
});

test('provider parameter recovery never resends an image-bearing rejection', async () => {
  const provider = new UniversalProvider({
    modelName: 'vision-test',
    modelProvider: 'openai',
    apiKey: 'test-key',
  });
  let requests = 0;
  provider.fetchWithTimeout = async () => {
    requests += 1;
    return {
      ok: false,
      status: 400,
      async text() { return 'image_url is not supported'; },
    };
  };
  await assert.rejects(
    provider.sendRequest({
      model: 'vision-test',
      messages: [{
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
      }],
    }),
    (error) => error.status === 400,
  );
  assert.equal(requests, 1);
});
