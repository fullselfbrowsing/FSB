// Phase 71 F5 (D-07): a bench run token must not make the rendered goal look
// like a secret. Every core instruction starts with "Open {startUrl}.", and
// the run token sits inside that URL, so a token the Jev scrubber's
// high-entropy rule redacts turns every bench goal into `sensitive_goal` and
// fast mode never acts. This suite drives the real FsbJevState (67-06) with
// the real fixture server's tokens, so a weakened scrubber or token cannot
// make it pass silently. The fixture server binds port 0 only and is never
// fetched.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { startFixtureServer } from '../scripts/bench/fixture-server.mjs';
import { loadTasks, renderInstruction } from '../scripts/bench/lib/tasks.mjs';

const require = createRequire(import.meta.url);

// The fixture server's TOKEN_PATTERN (scripts/bench/fixture-server.mjs).
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const LOWERCASE_TOKEN = /^[a-z]{24}$/;
// The smallest input the real buildRequest accepts: a completion question
// needs no element and no offered operation (jev-state.js validShape).
const KINDS = Object.freeze(['completion']);
const TOKENS_PER_SERVER = 8;
const TOKENS_PER_PORT = 4;
const URL_PORTS = Object.freeze([1024, 9999, 23456, 54321, 61234, 65535]);
// The old token shape: 22 characters with upper, lower and digits, like a
// base64url token. It must trip the same buildRequest path (rule 7).
const CONTROL_TOKEN = 'Ab3dEf9hIj2kLm5nOp8qRs';
const CONTROL_PORT = 54321;

function loadJevState() {
  let mod = null;
  try {
    mod = require('../extension/ai/jev-state.js');
  } catch {
    mod = null;
  }
  if (!mod || typeof mod.buildRequest !== 'function' || typeof mod.matchesSecret !== 'function') {
    assert.fail('upstream 67-06 interface drift: FsbJevState');
  }
  return mod;
}

function coreTasks() {
  const tasks = loadTasks({ set: 'core' });
  assert.equal(tasks.length, 12, 'the frozen core set has 12 tasks');
  return tasks;
}

async function withServer(fn) {
  const server = await startFixtureServer({});
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

function inputFor(goal, url) {
  return { kinds: KINDS.slice(), goal, url, title: '', visibleText: '', elements: [], offeredOps: [] };
}

/**
 * Runs each case through matchesSecret and buildRequest. An invalid_request
 * answer means the input shape itself was refused, which proves nothing, so
 * it fails on its own message and never counts as a pass.
 */
function assertAllAccepted(jev, cases) {
  const refused = [];
  for (const { id, goal, url } of cases) {
    const result = jev.buildRequest(inputFor(goal, url));
    if (result && result.ok === false && result.reason === 'invalid_request') {
      assert.fail(`F5 input shape rejected (${id}): buildRequest answered invalid_request`);
    }
    const secret = jev.matchesSecret(goal);
    if (secret || !result || result.ok !== true) {
      refused.push(`${id}: matchesSecret=${secret} reason=${result && result.reason}`);
    }
  }
  assert.equal(refused.length, 0,
    `${refused.length} of ${cases.length} rendered core goals were refused; first: ${refused.slice(0, 3).join('; ')}`);
}

test('newRunToken gives 24 lowercase letters that match TOKEN_PATTERN and never repeat', async () => {
  await withServer(async (server) => {
    const seen = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const token = server.newRunToken();
      assert.match(token, LOWERCASE_TOKEN);
      assert.match(token, TOKEN_PATTERN);
      seen.add(token);
    }
    assert.equal(seen.size, 1000, '1,000 tokens from one server are distinct');
    for (const token of [...seen].slice(0, 20)) {
      assert.equal(server.runUrl(token, '/fixtures/sample/index.html'),
        `${server.baseUrl}/r/${token}/fixtures/sample/index.html`);
    }
  });
});

test('buildRequest accepts every rendered core goal with real fixture-server tokens and URLs', async () => {
  const jev = loadJevState();
  const tasks = coreTasks();
  await withServer(async (server) => {
    const cases = [];
    for (let i = 0; i < TOKENS_PER_SERVER; i += 1) {
      const token = server.newRunToken();
      for (const task of tasks) {
        const url = server.runUrl(token, task.startPath);
        cases.push({ id: `${task.id}#${i}`, goal: renderInstruction(task, url), url });
      }
    }
    assert.equal(cases.length, TOKENS_PER_SERVER * tasks.length);
    assertAllAccepted(jev, cases);
  });
});

test('buildRequest accepts every rendered core goal at other port shapes', async () => {
  const jev = loadJevState();
  const tasks = coreTasks();
  await withServer(async (server) => {
    const cases = [];
    for (const port of URL_PORTS) {
      for (let i = 0; i < TOKENS_PER_PORT; i += 1) {
        const token = server.newRunToken();
        for (const task of tasks) {
          const url = `http://127.0.0.1:${port}/r/${token}${task.startPath}`;
          cases.push({ id: `${task.id}@${port}#${i}`, goal: renderInstruction(task, url), url });
        }
      }
    }
    assert.equal(cases.length, URL_PORTS.length * TOKENS_PER_PORT * tasks.length);
    assertAllAccepted(jev, cases);
  });
});

test('control token is sensitive_goal through buildRequest (the same path exercises rule 7)', () => {
  const jev = loadJevState();
  const tasks = coreTasks();
  assert.match(CONTROL_TOKEN, TOKEN_PATTERN);
  let flagged = 0;
  for (const task of tasks) {
    const url = `http://127.0.0.1:${CONTROL_PORT}/r/${CONTROL_TOKEN}${task.startPath}`;
    const goal = renderInstruction(task, url);
    const result = jev.buildRequest(inputFor(goal, url));
    if (result && result.ok === false && result.reason === 'invalid_request') {
      assert.fail(`F5 input shape rejected (${task.id}): buildRequest answered invalid_request`);
    }
    if (jev.matchesSecret(goal) === true && result && result.ok === false && result.reason === 'sensitive_goal') {
      flagged += 1;
    }
  }
  assert.ok(flagged >= 1, `the old-shape control token was refused as sensitive_goal for ${flagged} of ${tasks.length} core goals`);
});
