'use strict';

/**
 * execute_js awaits a returned Promise.
 *
 * Runs the real _handleExecuteJS body from extension/ws/mcp-bridge-client.js
 * with a chrome.scripting.executeScript stub that behaves like Chrome: it
 * calls the injected function and, only when the function returns a native
 * Promise, waits for it before reporting the result.
 *
 * Covers: synchronous scripts keep their exact result shapes and are still
 * answered synchronously by the injected function; a returned Promise is
 * awaited and its value serialised the same way; a rejection takes the shape
 * of a thrown exception; a Promise that does not settle within 10 s comes
 * back as an unknown outcome; a page that replaced window.Promise still gets
 * its Promise awaited.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { isPromise } = require('util').types;

let passed = 0;
let failed = 0;
function check(condition, message) {
  if (condition) {
    passed++;
    console.log('  PASS:', message);
  } else {
    failed++;
    console.error('  FAIL:', message);
  }
}
function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const BRIDGE_PATH = path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js');
const source = fs.readFileSync(BRIDGE_PATH, 'utf8');

function extractMethod(name) {
  const start = source.indexOf(`\n  async ${name}(`);
  if (start < 0) throw new Error(`${name} not found in mcp-bridge-client.js`);
  const end = source.indexOf('\n  }\n', start);
  if (end < 0) throw new Error(`${name} has no closing brace`);
  return source.slice(start + 1, end + 4);
}

// Builds a page realm and a handler bound to it. `promiseOverride` replaces
// the realm's global Promise the way zone.js does; `fastTimeout` makes the
// 10 s settle wait fire at once.
function loadHandler({ fastTimeout = false, promiseOverride = null } = {}) {
  const injected = [];
  const delays = [];
  const context = {
    setTimeout(fn, ms) {
      delays.push(ms);
      return setTimeout(fn, fastTimeout && ms === 10000 ? 0 : ms);
    },
    clearTimeout(timer) { clearTimeout(timer); },
    chrome: {
      scripting: {
        async executeScript({ target, world, func, args }) {
          const returned = func(...args);
          injected.push({ target, world, args, returned });
          // Chrome waits only for a real Promise; anything else is the result.
          const result = isPromise(returned) ? await returned : returned;
          return [{ result }];
        },
      },
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  if (promiseOverride) vm.runInContext(promiseOverride, context);
  const handler = vm.runInContext(`({${extractMethod('_handleExecuteJS')}})`, context)._handleExecuteJS;
  const run = (code) => handler.call({}, { id: 5 }, { code });
  return { run, injected, delays };
}

async function run() {
  console.log('\n--- synchronous scripts keep today\'s result shapes ---');
  {
    const { run: exec, injected } = loadHandler();
    const cases = [
      ['return 1 + 1', { success: true, result: '2', tool: 'execute_js' }],
      ['return "hello"', { success: true, result: 'hello', tool: 'execute_js' }],
      ['return { a: 1, b: [2, 3] }', { success: true, result: '{"a":1,"b":[2,3]}', tool: 'execute_js' }],
      ['return null', { success: true, result: 'null', tool: 'execute_js' }],
      ['let x = 1;', { success: true, result: 'undefined', tool: 'execute_js' }],
      ['const o = {}; o.self = o; return o', { success: true, result: '[object Object]', tool: 'execute_js' }],
      ['return { then: 5 }', { success: true, result: '{"then":5}', tool: 'execute_js' }],
      ['throw new Error("boom")', { success: false, error: 'boom' }],
      ['throw "plain"', { success: false, error: 'plain' }],
    ];
    for (const [code, expected] of cases) {
      const result = await exec(code);
      check(same(result, expected), `${code} -> ${JSON.stringify(expected)}`);
    }
    check(injected.every(({ returned }) => !isPromise(returned) && typeof (returned && returned.then) !== 'function'),
      'the injected function answers every synchronous script synchronously, not with a Promise');
    check(injected.every(({ world, target }) => world === 'MAIN' && target.tabId === 5),
      'scripts still run in the MAIN world of the target tab');
    const syntax = await exec('return (');
    check(syntax.success === false && typeof syntax.error === 'string' && syntax.error.length > 0,
      'a syntax error is still reported as an error');
  }

  console.log('\n--- a returned Promise is awaited ---');
  {
    const { run: exec, injected } = loadHandler();
    check(same(await exec('return Promise.resolve(42)'), { success: true, result: '42', tool: 'execute_js' }),
      'Promise.resolve(42) -> "42"');
    check(same(await exec('return new Promise(r => setTimeout(() => r({ x: 1 }), 5))'),
      { success: true, result: '{"x":1}', tool: 'execute_js' }),
    'a Promise that settles later -> its serialised value');
    check(same(await exec('return (async () => { await null; return "done"; })()'),
      { success: true, result: 'done', tool: 'execute_js' }),
    'an async IIFE -> its value');
    check(same(await exec('return Promise.resolve(undefined)'), { success: true, result: 'undefined', tool: 'execute_js' }),
      'a Promise of undefined serialises like a synchronous undefined');
    check(isPromise(injected[0].returned), 'the injected function hands Chrome a native Promise to wait on');
  }

  console.log('\n--- a rejection looks like a thrown exception ---');
  {
    const { run: exec } = loadHandler();
    const thrown = await exec('throw new Error("nope")');
    const rejected = await exec('return Promise.reject(new Error("nope"))');
    check(same(rejected, thrown) && same(rejected, { success: false, error: 'nope' }),
      'Promise.reject(new Error("nope")) matches throw new Error("nope")');
    check(same(await exec('return Promise.reject("plain")'), await exec('throw "plain"')),
      'a rejection with a string matches a thrown string');
    check(same(await exec('return Promise.reject()'), { success: false, error: 'undefined' }),
      'a rejection with no reason still reports an error');
  }

  console.log('\n--- a Promise that never settles stops after 10 s ---');
  {
    const { run: exec, delays } = loadHandler({ fastTimeout: true });
    const result = await exec('return new Promise(() => {})');
    check(delays.includes(10000), 'the settle wait is 10,000 ms');
    check(result.success === false && result.outcome === 'unknown' && result.mayHaveExecuted === true,
      'the result is an unknown outcome that may have executed');
    check(result.errorCode === 'ACTION_RESPONSE_TIMEOUT', 'the result carries ACTION_RESPONSE_TIMEOUT');
    check(/did not settle within 10 s/.test(result.error || ''), 'the error says the Promise did not settle within 10 s');
  }

  console.log('\n--- a page that replaced window.Promise ---');
  {
    const zoneLike = `
      (() => {
        const NativePromise = Promise;
        class PagePromise {
          constructor(executor) { this.inner = new NativePromise(executor); }
          then(onFulfilled, onRejected) { return this.inner.then(onFulfilled, onRejected); }
        }
        globalThis.Promise = PagePromise;
      })();
    `;
    const { run: exec, injected } = loadHandler({ promiseOverride: zoneLike });
    const result = await exec('return new Promise(r => setTimeout(() => r(7), 5))');
    check(same(result, { success: true, result: '7', tool: 'execute_js' }),
      'a non-native page Promise is still awaited');
    check(isPromise(injected[0].returned), 'Chrome still receives a native Promise');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: harness error:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
