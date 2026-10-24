/**
 * execute_js on pages that enforce Trusted Types.
 *
 * execute_js runs the caller's code with new Function(code) in the page's MAIN
 * world. Under require-trusted-types-for 'script' (YouTube, among others) a
 * plain string is refused: "Refused to evaluate a string as JavaScript because
 * this document requires a 'Trusted Type' assignment." The page function now
 * routes the code through a Trusted Types policy it creates once per page.
 *
 * Real enforcement only exists in a browser; this was run in WebKit (Safari
 * 26.5's engine) with a YouTube-style header and with trusted-types 'none'.
 * Here the same function, cut from extension/ws/mcp-bridge-client.js, is run
 * in a VM with a fake trustedTypes to lock the wiring:
 *   1. without trustedTypes the plain path is unchanged;
 *   2. the policy is named fsb-execute-js, created once, and handed the code;
 *   3. a policy the page refuses falls back to the plain string;
 *   4. a Trusted Types refusal carries a hint saying why.
 *
 * Run: node tests/execute-js-trusted-types.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) { passAssert(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
const start = src.indexOf('func: (userCode) => {');
const end = src.indexOf('\n        },\n        args: [code],', start);
const FN_SOURCE = start >= 0 && end > start ? src.slice(start + 'func: '.length, end + '\n        }'.length) : null;

function pageFunction(globals) {
  const context = vm.createContext(Object.assign({}, globals));
  return vm.runInContext(`(${FN_SOURCE})`, context);
}

passAssert(!!FN_SOURCE, 'execute_js page function found in mcp-bridge-client.js');

console.log('\n=== 1. no Trusted Types API: unchanged ===');
{
  const run = pageFunction({});
  passAssertEqual(run('return 6 * 7').value, '42', 'returns the value');
  passAssertEqual(run('return { a: 1 }').value, '{"a":1}', 'objects are JSON');
  passAssertEqual(run('throw new Error("boom")').error, 'boom', 'errors are reported');
}

console.log('\n=== 2. the code goes through one cached policy ===');
{
  const created = [];
  const scripts = [];
  const trustedTypes = {
    createPolicy(name, rules) {
      created.push(name);
      return {
        createScript(code) {
          scripts.push(code);
          const value = rules.createScript(code);
          return { toString() { return value; } };
        }
      };
    }
  };
  const run = pageFunction({ trustedTypes });
  passAssertEqual(run('return 6 * 7').value, '42', 'a TrustedScript body runs');
  passAssertEqual(run('return 1 + 1').value, '2', 'and again');
  passAssertEqual(created.length, 1, 'the policy is created once per page');
  passAssertEqual(created[0], 'fsb-execute-js', 'under the fsb-execute-js name');
  passAssertEqual(scripts[0], 'return 6 * 7', 'createScript receives the caller\'s code unchanged');
}

console.log('\n=== 3. a refused policy falls back to the plain string ===');
{
  const trustedTypes = { createPolicy() { throw new TypeError('Policy "fsb-execute-js" disallowed.'); } };
  const run = pageFunction({ trustedTypes });
  passAssertEqual(run('return 6 * 7').value, '42', 'still runs where strings are allowed');
}

console.log('\n=== 4. a Trusted Types refusal says why ===');
{
  const run = pageFunction({});
  const res = run('throw new EvalError("Refused to evaluate a string as JavaScript because this document requires a \'Trusted Type\' assignment.")');
  passAssert(/did not allow FSB to create a policy/.test(res.error || ''), 'the refusal carries the hint');
  passAssert(/Refused to evaluate/.test(res.error || ''), 'and keeps the browser\'s own message');
}

console.log('\n---');
console.log('passed:', passed, 'failed:', failed);
if (failed > 0) process.exit(1);
