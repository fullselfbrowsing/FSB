'use strict';

/**
 * Phase 67 -- a loopback fake Jev upstream for the gateway, router and shadow
 * harness tests.
 *
 * Hand-written from documented response shapes; loopback only; no real network.
 * Shapes follow .planning/research/JEV-REFERENCE.md and 67-RESEARCH.md
 * (Patterns 5 and 6): a response is {model, answers, usage:{input_tokens,
 * output_tokens}}; OpenRouter adds top-level id and provider, usage.cost (USD)
 * and a dated model; OpenRouter errors are {error:{code, message}} and a
 * non-streaming provider failure may arrive as HTTP 200 carrying only `error`.
 *
 * The server binds 127.0.0.1 on port 0 (an ephemeral port), never a fixed
 * port. CommonJS so ESM tests can load it through createRequire.
 *
 * startFakeUpstream(options) resolves to {url, port, requests, setMode, close}:
 *   - url: http://127.0.0.1:<port>/v1/systemone
 *   - requests: one {method, path, headers, body, rawBody} per request received
 *     (body is the parsed JSON or null)
 *   - setMode(partial): merge new options; a new `mode` restarts the echo cycle
 *   - close(): closes the server and every open socket, hanging ones included
 *
 * Options: mode, status, errorBody, errorCode, errorMessage, answersFn, model,
 * usage, delayMs, top, noul, extra.
 * Modes:
 *   - 'ok-direct': 200 {model, answers, usage}; model 'jev-1.13.0', usage
 *     {input_tokens:392, output_tokens:65}, no cost
 *   - 'ok-openrouter': 200 {id, provider, model, answers, usage}; model
 *     'typesafe/jev-1.13-20260917', usage.cost 0.0000165
 *   - 'error-200': 200 {error:{code, message}} (or errorBody when given)
 *   - 'status': `status` (default 500) with `errorBody` (a string is sent as is)
 *   - 'hang': records the request and never responds
 *   - 'echo': cycles 400, 401, 500 and a 200 error envelope; every body repeats
 *     the Authorization header and the raw request body
 *   - 'garbage': 200 with a non-JSON body
 *   - 'answersFn': 200 {model, answers: answersFn(parsedBody), usage}
 * In the ok and answersFn modes, `model: null` or `usage: null` omits that
 * field, `top`/`noul` tune synthesizeAnswers, and `extra` merges additional
 * top-level keys into the body.
 */

const http = require('http');

const HOST = '127.0.0.1';
const UPSTREAM_PATH = '/v1/systemone';
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

const MODES = Object.freeze(['ok-direct', 'ok-openrouter', 'error-200', 'status', 'hang', 'echo', 'garbage', 'answersFn']);
const DIRECT_MODEL = 'jev-1.13.0';
const OPENROUTER_MODEL = 'typesafe/jev-1.13-20260917';
const DIRECT_USAGE = Object.freeze({ input_tokens: 392, output_tokens: 65 });
const OPENROUTER_USAGE = Object.freeze({ input_tokens: 392, output_tokens: 65, cost: 0.0000165 });
// Distinct markers so tests can prove these envelope extras are never copied.
const OPENROUTER_ID = 'gen-FAKEID-0001';
const OPENROUTER_PROVIDER = 'FAKEPROVIDER-TypeSafe';
const ECHO_STATUSES = Object.freeze([400, 401, 500, 200]);

/**
 * Answer every asked question validly. Choice: the first criteria key gets
 * `top`, the rest share 1 - top evenly; confidence = (n*max - 1)/(n - 1)
 * clamped to [0, 1]. The probability map is written in reverse criteria
 * order, as the real upstream returns it in its own order. Noul: `noul`.
 */
function synthesizeAnswers(questions, { top = 0.9, noul = 0.5 } = {}) {
  const answers = {};
  if (!questions || typeof questions !== 'object') return answers;
  for (const key of Object.keys(questions)) {
    const question = questions[key];
    if (!question || typeof question !== 'object') continue;
    if (question.type === 'choice') {
      const keys = Object.keys(question.criteria && typeof question.criteria === 'object' ? question.criteria : {});
      const n = keys.length;
      if (n === 0) continue;
      const probabilities = {};
      if (n === 1) {
        probabilities[keys[0]] = 1;
        answers[key] = { type: 'choice', choice: keys[0], confidence: 1, probabilities };
        continue;
      }
      const rest = (1 - top) / (n - 1);
      for (let index = n - 1; index >= 0; index -= 1) probabilities[keys[index]] = index === 0 ? top : rest;
      let choice = keys[0];
      for (const option of keys) if (probabilities[option] > probabilities[choice]) choice = option;
      const confidence = Math.min(1, Math.max(0, (n * probabilities[choice] - 1) / (n - 1)));
      answers[key] = { type: 'choice', choice, confidence, probabilities };
    } else if (question.type === 'noul') {
      answers[key] = { type: 'noul', noul };
    }
  }
  return answers;
}

function readAll(request) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total <= MAX_REQUEST_BYTES) chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('aborted', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(response, status, body, contentType) {
  if (response.headersSent || response.destroyed) return;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  response.writeHead(status, {
    'content-type': contentType || 'application/json',
    'content-length': Buffer.byteLength(text),
  });
  response.end(text);
}

function okBody(state, parsed, defaults) {
  const body = {};
  if (defaults.id) {
    body.id = OPENROUTER_ID;
    body.provider = OPENROUTER_PROVIDER;
  }
  const model = state.model === undefined ? defaults.model : state.model;
  if (model !== null) body.model = model;
  const questions = parsed && typeof parsed === 'object' ? parsed.questions : undefined;
  body.answers = defaults.useAnswersFn
    ? state.answersFn(parsed)
    : synthesizeAnswers(questions, { top: state.top === undefined ? 0.9 : state.top, noul: state.noul === undefined ? 0.5 : state.noul });
  const usage = state.usage === undefined ? defaults.usage : state.usage;
  if (usage !== null) body.usage = usage;
  if (state.extra && typeof state.extra === 'object') Object.assign(body, state.extra);
  return body;
}

/**
 * Start the fake upstream on 127.0.0.1 and an ephemeral port.
 */
async function startFakeUpstream(options = {}) {
  const state = Object.assign({ mode: 'ok-direct' }, options);
  const requests = [];
  let echoIndex = 0;

  async function handle(request, response) {
    const rawBody = await readAll(request);
    let body = null;
    try {
      body = JSON.parse(rawBody);
    } catch (_error) {
      body = null;
    }
    requests.push({ method: request.method, path: request.url, headers: { ...request.headers }, body, rawBody });

    const mode = state.mode;
    if (mode === 'hang') return;
    if (Number.isFinite(state.delayMs) && state.delayMs > 0) await delay(state.delayMs);

    switch (mode) {
      case 'ok-direct':
        send(response, 200, okBody(state, body, { model: DIRECT_MODEL, usage: DIRECT_USAGE }));
        return;
      case 'ok-openrouter':
        send(response, 200, okBody(state, body, { model: OPENROUTER_MODEL, usage: OPENROUTER_USAGE, id: true }));
        return;
      case 'answersFn':
        if (typeof state.answersFn !== 'function') {
          send(response, 500, { error: { message: 'fake upstream: answersFn missing' } });
          return;
        }
        send(response, 200, okBody(state, body, { model: DIRECT_MODEL, usage: DIRECT_USAGE, useAnswersFn: true }));
        return;
      case 'error-200': {
        const envelope = state.errorBody !== undefined
          ? state.errorBody
          : {
            error: {
              code: state.errorCode === undefined ? 502 : state.errorCode,
              message: state.errorMessage === undefined ? 'Provider returned error' : state.errorMessage,
            },
          };
        send(response, 200, envelope);
        return;
      }
      case 'status': {
        const status = Number.isSafeInteger(state.status) ? state.status : 500;
        const errorBody = state.errorBody === undefined ? { error: { message: 'fake upstream error' } } : state.errorBody;
        send(response, status, errorBody, typeof errorBody === 'string' && !/^\s*[[{]/.test(errorBody)
          ? 'text/plain; charset=utf-8'
          : 'application/json');
        return;
      }
      case 'echo': {
        const status = ECHO_STATUSES[echoIndex % ECHO_STATUSES.length];
        echoIndex += 1;
        const authorization = request.headers.authorization || '';
        if (status === 401) {
          send(response, 401, `Unauthorized: ${authorization}\n${rawBody}`, 'text/plain; charset=utf-8');
        } else if (status === 200) {
          send(response, 200, { error: { code: 500, message: `echo ${authorization} ${rawBody}` } });
        } else {
          send(response, status, { error: { message: `echo ${authorization}`, authorization, request: rawBody } });
        }
        return;
      }
      case 'garbage':
        send(response, 200, 'this is <not> json {"model":', 'application/json');
        return;
      default:
        send(response, 500, { error: { message: 'fake upstream: unknown mode' } });
    }
  }

  const server = http.createServer((request, response) => {
    response.on('error', () => {});
    handle(request, response).catch(() => {
      if (!response.headersSent) send(response, 500, { error: { message: 'fake upstream fault' } });
      else response.destroy();
    });
  });
  server.on('clientError', (_error, socket) => {
    socket.destroy();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: 0, host: HOST }, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const port = server.address().port;

  let closing = null;
  function close() {
    if (!closing) {
      closing = new Promise((resolve) => {
        server.close(() => resolve());
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      });
    }
    return closing;
  }

  function setMode(partial) {
    if (partial && typeof partial === 'object') {
      if (Object.prototype.hasOwnProperty.call(partial, 'mode')) echoIndex = 0;
      Object.assign(state, partial);
    }
  }

  return {
    url: `http://${HOST}:${port}${UPSTREAM_PATH}`,
    port,
    requests,
    setMode,
    close,
  };
}

module.exports = {
  startFakeUpstream,
  synthesizeAnswers,
  MODES,
  DIRECT_MODEL,
  OPENROUTER_MODEL,
  DIRECT_USAGE,
  OPENROUTER_USAGE,
  OPENROUTER_ID,
  OPENROUTER_PROVIDER,
};
