/**
 * Safari upload_file: native file read -> DataTransfer -> input.files
 *
 * Chrome sets a file input with CDP DOM.setFileInputFiles, handing the browser
 * process an absolute path. Safari has no CDP, so the container app reads the
 * bytes -- only inside a folder the user granted -- and a content script sets
 * them on the input.
 *
 * The property this file exists to protect: THE DENYLIST STILL GATES FIRST.
 * The folder grant in the app is a SECOND, independent constraint. If the
 * Safari branch ever ran before the sensitive-path gate, a denied path could
 * reach the native host, and no other test would notice.
 *
 * Run: node tests/upload-file-safari-native.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const BACKGROUND = path.join(ROOT, 'extension', 'background.js');
const ACTIONS = path.join(ROOT, 'extension', 'content', 'actions.js');
const FILE_READ_SERVICE = path.join(ROOT, 'safari', 'FSB', 'Shared', 'FileReadService.swift');
const GRANTED_ROOTS = path.join(ROOT, 'safari', 'FSB', 'Shared', 'GrantedRoots.swift');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) { passAssert(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

// --- extract executeUploadFile verbatim (same anchors as the chokepoint test)
function executeUploadFileSource() {
  const src = fs.readFileSync(BACKGROUND, 'utf8');
  const start = src.indexOf('async function executeUploadFile');
  const end = src.indexOf('/**\n * Direct CDP tool dispatcher', start);
  if (start < 0 || end <= start) throw new Error('could not extract executeUploadFile');
  // Chrome upload attaches through the shared helper, which lives above the
  // function. The slice has to carry it or the Chrome path throws before CDP.
  const attachStart = src.indexOf('function isCdpDebuggerContention(');
  const attachEnd = src.indexOf('async function runLegacyCdpMessageWithLease(', attachStart);
  if (attachStart < 0 || attachEnd <= attachStart) throw new Error('could not extract attachFsbDebugger');
  return src.slice(attachStart, attachEnd) + src.slice(start, end);
}

const OK_DENYLIST = {
  isAbsolutePath: (p) => p.startsWith('/'),
  classify: () => ({ denied: false }),
  basenameOf: (p) => p.split('/').pop(),
  isDenied: () => ({ denied: false })
};

function buildHarness(opts = {}) {
  const calls = { attach: 0, sendCommand: 0, audit: [], log: [], readFile: [], tabMessages: [], injected: [], order: [] };
  const context = {
    console: { log() {}, warn() {}, error() {} },
    URL,
    automationLogger: {
      logActionExecution(_s, action, phase, details) { calls.log.push({ action, phase, details }); }
    },
    chrome: {
      tabs: {
        async get(tabId) { return { id: tabId, url: 'https://example.test/upload' }; },
        async sendMessage(tabId, msg, options) {
          calls.tabMessages.push({ tabId, msg, options });
          calls.order.push('send');
          if (typeof opts.tabReply === 'function') return opts.tabReply(msg);
          return { success: true };
        }
      },
      debugger: {
        async attach() { calls.attach += 1; },
        async sendCommand(_t, method) {
          calls.sendCommand += 1;
          if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
          if (method === 'DOM.querySelector') return { nodeId: 2 };
          if (method === 'DOM.describeNode') return { node: { nodeName: 'INPUT', attributes: ['type', 'file'] } };
          return {};
        },
        async detach() {}
      }
    },
    FsbAuditLog: { append(rec) { calls.audit.push(rec); } },
    FsbUploadPathDenylist: opts.denylist === undefined ? OK_DENYLIST : opts.denylist,
    keyboardEmulator: null
  };
  if (opts.inject !== false) {
    context.ensureContentScriptInjected = async (tabId) => {
      calls.injected.push(tabId);
      calls.order.push('inject');
      if (typeof opts.inject === 'function') return opts.inject(tabId);
      return true;
    };
  }
  if (opts.platform !== undefined) context.FsbPlatform = opts.platform;
  if (opts.reader !== undefined) {
    context.FsbNativeFileReader = opts.reader === null ? undefined : opts.reader;
  } else {
    context.FsbNativeFileReader = {
      async readFile(p) {
        calls.readFile.push(p);
        return { ok: true, name: p.split('/').pop(), mime: 'text/plain', size: 3, dataB64: 'YWJj' };
      }
    };
  }
  context.globalThis = context;

  vm.runInNewContext(
    executeUploadFileSource() + '\nthis.__executeUploadFile = executeUploadFile;',
    context, { filename: 'background-upload-slice.js' }
  );
  return { executeUploadFile: context.__executeUploadFile, calls };
}

const SAFARI = { caps: { cdp: false, trustedInput: false } };

(async function run() {
  let createDomFileInputTools;
  let createFileInput;

  console.log('\n=== 1. THE DENYLIST STILL GATES FIRST on Safari ===');
  {
    const denied = { ...OK_DENYLIST, classify: () => ({ denied: true, reason: 'ssh-key' }) };
    const { executeUploadFile, calls } = buildHarness({ platform: SAFARI, denylist: denied });
    const res = await executeUploadFile(7, '#f', '/Users/me/.ssh/id_rsa');
    passAssertEqual(res.success, false, 'denied path fails');
    passAssertEqual(res.reason, 'ssh-key', 'denylist reason propagates');
    passAssertEqual(calls.readFile.length, 0, 'native host was NEVER asked to read a denied path');
    passAssertEqual(calls.tabMessages.length, 0, 'no content-script dispatch');
    passAssertEqual(calls.attach, 0, 'no CDP attach either');
  }
  {
    const { executeUploadFile, calls } = buildHarness({ platform: SAFARI, denylist: undefined, reader: undefined });
    const res = await executeUploadFile(7, '#f', 'relative/path.txt');
    passAssertEqual(res.success, false, 'non-absolute path fails');
    passAssertEqual(calls.readFile.length, 0, 'native host never sees a relative path');
  }
  {
    // Fail-closed: a missing denylist module must still block on Safari.
    const { executeUploadFile, calls } = buildHarness({ platform: SAFARI, denylist: null });
    const res = await executeUploadFile(7, '#f', '/tmp/a.txt');
    passAssertEqual(res.reason, 'denylist-unavailable', 'missing denylist blocks (fail closed)');
    passAssertEqual(calls.readFile.length, 0, 'native host not reached without a working denylist');
  }

  console.log('\n=== 2. CHROME REGRESSION GUARD ===');
  {
    const { executeUploadFile, calls } = buildHarness({ platform: undefined });
    const res = await executeUploadFile(7, '#f', '/tmp/a.txt');
    passAssertEqual(res.success, true, 'Chrome path still succeeds');
    passAssertEqual(res.method, 'cdp_set_file_input', 'Chrome still uses CDP');
    passAssert(calls.sendCommand > 0, 'CDP commands issued');
    passAssertEqual(calls.readFile.length, 0, 'native reader NEVER touched on Chrome');
    passAssertEqual(calls.tabMessages.length, 0, 'no content-script dispatch on Chrome');
  }

  console.log('\n=== 3. Safari success path ===');
  {
    const { executeUploadFile, calls } = buildHarness({ platform: SAFARI });
    const res = await executeUploadFile(7, '#drop', '/Users/me/Downloads/report.pdf');
    passAssertEqual(res.success, true, 'succeeds');
    passAssertEqual(res.method, 'dom_set_file_input', 'reports the DOM method');
    passAssertEqual(res.file, 'report.pdf', 'returns basename only, never the path');
    passAssertEqual(res.trusted, false, 'trusted:false -- isTrusted-gated sites will still refuse');
    passAssertEqual(res.degraded, true, 'degraded:true');
    passAssertEqual(calls.attach, 0, 'no CDP attach on Safari');
    passAssertEqual(calls.readFile[0], '/Users/me/Downloads/report.pdf', 'native read requested');
    passAssertEqual(calls.tabMessages.length, 1, 'one content-script dispatch');
    passAssertEqual(calls.tabMessages[0].msg.tool, 'domSetFileInput', 'routed to domSetFileInput');
    passAssertEqual(calls.tabMessages[0].msg.params.dataB64, 'YWJj', 'bytes forwarded as base64');
    passAssertEqual(calls.tabMessages[0].options && calls.tabMessages[0].options.frameId, 0,
      'sent to the main frame only (frameId 0)');
    passAssertEqual(calls.order.join(','), 'inject,send',
      'content script injected before the file is sent (a fresh or reloaded tab has none yet)');

    const logged = JSON.stringify(calls.log) + JSON.stringify(calls.audit);
    passAssert(!logged.includes('/Users/me/Downloads/report.pdf'),
      'the absolute path appears in NO log or audit record');
    passAssert(logged.includes('report.pdf'), 'basename is logged');
    const success = calls.audit.find((a) => a.outcome === 'success');
    passAssert(!!success, 'success is audited');
    passAssert(success && success.path === undefined, 'audit record has no path field');
  }

  console.log('\n=== 3b. injection failure and a lost reply are not retried ===');
  {
    const { executeUploadFile, calls } = buildHarness({
      platform: SAFARI,
      inject: () => { throw new Error('Cannot access contents of the page'); }
    });
    const res = await executeUploadFile(7, '#f', '/Users/me/Downloads/report.pdf');
    passAssertEqual(res.success, false, 'an uninjectable page fails');
    passAssert(/Cannot access contents of the page/.test(res.error), 'injection error is surfaced');
    passAssertEqual(calls.tabMessages.length, 0, 'nothing sent when injection fails');
  }
  {
    // A retry after a lost reply would set the file twice and fire change twice.
    const { executeUploadFile, calls } = buildHarness({
      platform: SAFARI,
      tabReply: () => { throw new Error('Receiving end does not exist.'); }
    });
    const res = await executeUploadFile(7, '#f', '/Users/me/Downloads/report.pdf');
    passAssertEqual(res.success, false, 'a failed send is reported');
    passAssertEqual(calls.tabMessages.length, 1, 'sent exactly once (no retry, no double upload)');
  }
  {
    // The chokepoint test harnesses slice this function without the injector.
    const { executeUploadFile, calls } = buildHarness({ platform: SAFARI, inject: false });
    const res = await executeUploadFile(7, '#f', '/Users/me/Downloads/report.pdf');
    passAssertEqual(res.success, true, 'still works where ensureContentScriptInjected is undefined');
    passAssertEqual(calls.tabMessages.length, 1, 'still dispatched once');
  }
  {
    const { executeUploadFile, calls } = buildHarness({ platform: undefined });
    await executeUploadFile(7, '#f', '/tmp/a.txt');
    passAssertEqual(calls.injected.length, 0, 'Chrome (CDP) path never injects a content script');
  }

  console.log('\n=== 4. native read refusals are typed and audited ===');
  for (const [reason, note] of [
    ['no_granted_folders', 'no folder granted yet'],
    ['outside_granted_folders', 'file outside every granted folder'],
    ['file_too_large', 'file over the size bound']
  ]) {
    const reader = { async readFile() { return { ok: false, reason, message: 'because ' + reason }; } };
    const { executeUploadFile, calls } = buildHarness({ platform: SAFARI, reader });
    const res = await executeUploadFile(7, '#f', '/Users/me/Downloads/x.bin');
    passAssertEqual(res.success, false, `${note}: fails`);
    passAssertEqual(res.reason, reason, `${note}: reason is typed`);
    passAssert(/because /.test(res.error), `${note}: actionable message surfaced`);
    passAssert(calls.audit.some((a) => a.consentDecision === reason), `${note}: audited with the reason`);
    passAssertEqual(calls.tabMessages.length, 0, `${note}: nothing dispatched to the page`);
  }
  {
    const { executeUploadFile, calls } = buildHarness({ platform: SAFARI, reader: null });
    const res = await executeUploadFile(7, '#f', '/tmp/a.txt');
    passAssertEqual(res.reason, 'native-reader-unavailable', 'missing reader module blocks');
    passAssertEqual(calls.tabMessages.length, 0, 'nothing dispatched');
  }

  console.log('\n=== 5. the page refusing the file is a failure, not a silent success ===');
  {
    const { executeUploadFile, calls } = buildHarness({
      platform: SAFARI,
      tabReply: () => ({ success: false, error: 'no input for /Users/me/Downloads/report.pdf' })
    });
    const res = await executeUploadFile(7, '#f', '/Users/me/Downloads/report.pdf');
    passAssertEqual(res.success, false, 'reports failure');
    passAssert(!res.error.includes('/Users/me/Downloads/report.pdf'),
      'the absolute path is redacted out of the error');
    passAssert(res.error.includes('report.pdf'), 'redacted to basename');
    passAssert(!JSON.stringify(calls.log).includes('/Users/me/Downloads/report.pdf'),
      'path absent from logs on the failure path too');
  }

  // --- content-script tool ---------------------------------------------------
  console.log('\n=== 6. domSetFileInput content tool ===');
  {
    const src = fs.readFileSync(ACTIONS, 'utf8');
    const i0 = src.indexOf('  const FSB_UNTRUSTED_NOTE');
    const i1 = src.indexOf('  // =========================================================================\n  // VAULT FILL', i0);
    if (i0 < 0 || i1 < 0) throw new Error('could not extract the actions.js fallback block');
    const BLOCK = src.slice(i0, i1);

    class Ev { constructor(t, i) { this.type = t; Object.assign(this, i || {}); } }
    function makeInput(type) {
      return { tagName: 'INPUT', type, files: null, events: [],
               dispatchEvent(e) { this.events.push(e.type); return true; },
               querySelector() { return null; }, focus() {} };
    }
    function env(target) {
      const tools = {};
      const win = { innerWidth: 800, innerHeight: 600, screenX: 0, screenY: 0,
                    PointerEvent: Ev, MouseEvent: Ev, WheelEvent: Ev, DragEvent: Ev,
                    getComputedStyle: () => ({ overflowY: 'visible', overflowX: 'visible' }) };
      const doc = { body: {}, documentElement: {}, scrollingElement: {}, activeElement: null,
                    elementFromPoint: () => null, querySelector: () => target, execCommand: () => true };
      const fn = new Function(
        'tools', 'window', 'document', 'MouseEvent', 'PointerEvent', 'WheelEvent', 'DragEvent',
        'Event', 'DataTransfer', 'File', 'atob', 'FSB', 'waitForStability',
        BLOCK + '\nreturn tools;'
      );
      class DT { constructor() { this._f = []; this.items = { add: (f) => this._f.push(f) }; }
                 get files() { return this._f; } }
      class F { constructor(parts, name, o) { this.parts = parts; this.name = name; this.type = (o||{}).type;
                                              this.size = parts[0] ? parts[0].length : 0; } }
      return fn(tools, win, doc, Ev, Ev, Ev, Ev, Ev, DT, F,
                (s) => {
                  // Browser atob throws on malformed input; Node's Buffer does
                  // not. Mimic the browser so the stub cannot mask a real bug.
                  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
                    throw new Error('InvalidCharacterError');
                  }
                  return Buffer.from(s, 'base64').toString('binary');
                },
                { elementCache: new Map() }, async () => {});
    }
    createDomFileInputTools = env;
    createFileInput = makeInput;

    // "abc"
    const input = makeInput('file');
    const tools = env(input);
    const r = await tools.domSetFileInput({ selector: '#f', name: 'a.txt', mime: 'text/plain', dataB64: 'YWJj' });
    passAssertEqual(r.success, true, 'succeeds on a real file input');
    passAssertEqual(r.trusted, false, 'trusted:false');
    passAssertEqual(r.degraded, true, 'degraded:true');
    passAssertEqual(r.size, 3, 'decoded 3 bytes from base64');
    passAssert(Array.isArray(input.files) && input.files.length === 1, 'input.files set via DataTransfer');
    passAssertEqual(input.files[0].name, 'a.txt', 'File carries the name');
    passAssertEqual(input.files[0].type, 'text/plain', 'File carries the MIME type');
    passAssert(input.events.includes('input') && input.events.includes('change'),
      'fires input AND change (frameworks listen for one or the other)');

    // dropzone that WRAPS a hidden input -- mirrors the CDP descent behaviour
    const hidden = makeInput('file');
    const zone = { tagName: 'DIV', events: [], dispatchEvent() {}, querySelector: () => hidden };
    const r2 = await env(zone).domSetFileInput({ selector: '#zone', name: 'b.bin', dataB64: 'YWJj' });
    passAssertEqual(r2.success, true, 'descends into a container holding an input[type=file]');
    passAssert(Array.isArray(hidden.files) && hidden.files.length === 1, 'the wrapped input got the file');

    const notAnInput = { tagName: 'DIV', querySelector: () => null, dispatchEvent() {} };
    const r3 = await env(notAnInput).domSetFileInput({ selector: '#x', dataB64: 'YWJj' });
    passAssertEqual(r3.success, false, 'a non-file element fails explicitly');
    passAssert(/input type="file"/.test(r3.error), 'error explains what was expected');

    const r4 = await env(makeInput('file')).domSetFileInput({ selector: '#f', dataB64: '!!!not base64!!!' });
    passAssertEqual(r4.success, false, 'invalid base64 is rejected');

    const r5 = await env(makeInput('file')).domSetFileInput({ selector: '#f' });
    passAssertEqual(r5.success, false, 'missing data is rejected');
  }

  console.log('\n=== 7. native-file-reader chunk assembly ===');
  {
    const swift = fs.readFileSync(FILE_READ_SERVICE, 'utf8');
    const chunkMatch = swift.match(/static let chunkBytes\s*=\s*(\d+)\s*\*\s*1024/);
    passAssert(!!chunkMatch, 'reads the native chunk size from FileReadService.swift');
    const chunkBytes = chunkMatch ? Number(chunkMatch[1]) * 1024 : 0;
    passAssertEqual(chunkBytes % 3, 0,
      'every full native chunk is divisible by 3 so independently encoded base64 has no padding');
    passAssert(!/\.mappedIfSafe/.test(swift),
      'beginRead copies the file eagerly; a read handle never depends on a mapping');

    const original = Buffer.alloc(chunkBytes * 2 + 17);
    for (let i = 0; i < original.length; i += 1) original[i] = i % 251;
    const encodedParts = [];
    for (let offset = 0; offset < original.length; offset += chunkBytes) {
      encodedParts.push(original.subarray(offset, offset + chunkBytes).toString('base64'));
    }

    const sent = [];
    globalThis.chrome = {
      runtime: {
        sendNativeMessage: async (_app, msg) => {
          sent.push(msg);
          if (msg.t === 'readFile') {
            return {
              ok: true,
              token: 'tk',
              name: 'big.bin',
              mime: 'application/octet-stream',
              size: original.length,
              chunks: encodedParts.length,
              chunkBytes
            };
          }
          if (msg.t === 'readChunk') {
            return {
              ok: true,
              i: msg.i,
              last: msg.i === encodedParts.length - 1,
              data: encodedParts[msg.i]
            };
          }
          return { ok: true };
        }
      }
    };
    delete require.cache[require.resolve('../extension/utils/native-file-reader.js')];
    const reader = require('../extension/utils/native-file-reader.js');
    const out = await reader.readFile('/Users/me/Downloads/big.bin');
    passAssertEqual(out.ok, true, 'read succeeds');
    passAssertEqual(out.name, 'big.bin', 'name from the host');
    passAssert(encodedParts.slice(0, -1).every((part) => !part.includes('=')),
      'no full native chunk contains base64 padding');
    passAssert(out.dataB64 === original.toString('base64'),
      'independently encoded chunks concatenate to canonical base64');
    passAssert(Buffer.from(out.dataB64, 'base64').equals(original),
      'assembled base64 round-trips byte-for-byte');
    passAssertEqual(sent.filter((m) => m.t === 'readChunk').length, encodedParts.length,
      'fetched every native chunk exactly once');
    passAssertEqual(sent.filter((m) => m.t === 'readRelease').length, 0,
      'a fully drained read sends no readRelease (the host freed it on the last chunk)');

    const input = createFileInput('file');
    const applied = await createDomFileInputTools(input).domSetFileInput({
      selector: '#f', name: 'big.bin', mime: 'application/octet-stream', dataB64: out.dataB64
    });
    passAssertEqual(applied.success, true, 'domSetFileInput accepts the multi-chunk base64');
    passAssertEqual(input.files[0].size, original.length, 'DOM File preserves the full multi-chunk size');
  }
  {
    globalThis.chrome = { runtime: { sendNativeMessage: async () => ({ ok: false, reason: 'outside_granted_folders' }) } };
    delete require.cache[require.resolve('../extension/utils/native-file-reader.js')];
    const reader = require('../extension/utils/native-file-reader.js');
    const out = await reader.readFile('/etc/hosts');
    passAssertEqual(out.ok, false, 'refusal surfaces as ok:false, never a throw');
    passAssertEqual(out.reason, 'outside_granted_folders', 'reason preserved');
    passAssert(/grant the folder/i.test(out.message), 'message tells the user what to do');
  }
  {
    // A host over-reporting its own bounds must not be trusted.
    globalThis.chrome = { runtime: { sendNativeMessage: async (_a, m) =>
      (m.t === 'readFile' ? { ok: true, token: 't', name: 'x', size: 1 << 30, chunks: 99999 } : { ok: true }) } };
    delete require.cache[require.resolve('../extension/utils/native-file-reader.js')];
    const reader = require('../extension/utils/native-file-reader.js');
    const out = await reader.readFile('/Users/me/Downloads/huge');
    passAssertEqual(out.ok, false, 'oversized read refused client-side too');
    passAssertEqual(out.reason, 'file_too_large', 'typed as file_too_large');
  }
  // A failed chunk read must hand the handle back. The host only frees it on
  // the chunk marked `last`, so otherwise up to 32 MB sits there until its TTL
  // and every retry pins another copy.
  for (const [label, chunkReply] of [
    ['a rejected readChunk', () => Promise.reject(new Error('host gone'))],
    ['a not-ok readChunk', () => Promise.resolve({ ok: false, reason: 'unknown_token' })],
    ['a host that never marks the last chunk', () => Promise.resolve({ ok: true, data: 'QUJD', last: false })]
  ]) {
    const sent = [];
    globalThis.chrome = { runtime: { sendNativeMessage: (_a, m) => {
      sent.push(m);
      if (m.t === 'readFile') return Promise.resolve({ ok: true, token: 'tk2', name: 'x', size: 6, chunks: 2 });
      if (m.t === 'readChunk') return chunkReply();
      return Promise.resolve({ ok: true });
    } } };
    delete require.cache[require.resolve('../extension/utils/native-file-reader.js')];
    const reader = require('../extension/utils/native-file-reader.js');
    await reader.readFile('/Users/me/Downloads/x');
    const releases = sent.filter((m) => m.t === 'readRelease');
    passAssert(releases.length === 1 && releases[0].token === 'tk2', `${label} releases the host handle`);
  }
  {
    globalThis.chrome = { runtime: {} };
    delete require.cache[require.resolve('../extension/utils/native-file-reader.js')];
    const reader = require('../extension/utils/native-file-reader.js');
    const out = await reader.readFile('/tmp/x');
    passAssertEqual(out.ok, false, 'no native messaging -> ok:false');
    passAssertEqual(out.reason, 'native_unavailable', 'typed as native_unavailable');
    passAssert(/companion app/i.test(out.message), 'message names the companion app');
  }

  // The denylist gate in section 1 only ever sees the REQUESTED path. A link
  // inside a granted folder can be called notes.txt and name ~/.ssh/id_rsa.
  console.log('\n=== 8. a symlink in a granted folder cannot launder a secret ===');
  {
    const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, '');
    const roots = stripComments(fs.readFileSync(GRANTED_ROOTS, 'utf8'));
    const fnAt = roots.indexOf('static func rootContaining(');
    const fn = fnAt >= 0 ? roots.slice(fnAt, roots.indexOf('\n    }\n', fnAt)) : '';
    const accessAt = fn.indexOf('resolve(data)');
    const targetAt = fn.indexOf('URL(fileURLWithPath: path).resolvingSymlinksInPath()');
    // Before access starts the sandbox hides the link, and
    // resolvingSymlinksInPath returns it unresolved -- which IS contained.
    passAssert(accessAt >= 0 && targetAt > accessAt,
      'rootContaining resolves the target only after the root\'s security-scoped access starts');

    const service = stripComments(fs.readFileSync(FILE_READ_SERVICE, 'utf8'));
    const beginAt = service.indexOf('func beginRead(');
    const begin = beginAt >= 0 ? service.slice(beginAt, service.indexOf('func readChunk(', beginAt)) : '';
    passAssert(begin.length > 0 && !/resolvingSymlinksInPath/.test(begin),
      'beginRead never re-resolves the path the containment check approved');
    passAssert(/let url = match\.target/.test(begin), 'beginRead reads the containment check\'s own target');
    passAssert(/"resolvedPath": url\.path/.test(begin), 'beginRead reports the resolved path back');
  }

  const realDenylist = require('../extension/utils/upload-path-denylist.js');
  function loadReader(sendNativeMessage) {
    globalThis.chrome = { runtime: { sendNativeMessage } };
    delete require.cache[require.resolve('../extension/utils/native-file-reader.js')];
    return require('../extension/utils/native-file-reader.js');
  }
  function hostResolvingTo(resolvedPath, sent) {
    return async (_app, msg) => {
      sent.push(msg);
      if (msg.t === 'readFile') {
        const opened = { ok: true, token: 'tk3', name: 'id_rsa', mime: 'text/plain', size: 3, chunks: 1 };
        if (resolvedPath !== undefined) opened.resolvedPath = resolvedPath;
        return opened;
      }
      if (msg.t === 'readChunk') return { ok: true, i: msg.i, last: true, data: 'YWJj' };
      return { ok: true };
    };
  }
  const chunksFetched = (sent) => sent.filter((m) => m.t === 'readChunk').length;
  const released = (sent) => sent.some((m) => m.t === 'readRelease' && m.token === 'tk3');

  {
    const sent = [];
    const screened = [];
    const reader = loadReader(hostResolvingTo('/Users/me/.ssh/id_rsa', sent));
    const out = await reader.readFile('/Users/me/Downloads/notes.txt', {
      screenResolvedPath: (p) => { screened.push(p); return realDenylist.classify(p); }
    });
    passAssertEqual(screened[0], '/Users/me/.ssh/id_rsa', 'the screen sees the host-resolved path, not the requested one');
    passAssertEqual(out.ok, false, 'a link to a secret is refused');
    passAssertEqual(out.reason, 'sensitive-directory', 'refused with the denylist\'s own reason token');
    passAssertEqual(chunksFetched(sent), 0, 'no chunk is fetched for a refused file');
    passAssert(released(sent), 'the host handle is released');
    passAssert(!out.message.includes('.ssh'), 'the resolved path is not echoed into the message');
  }
  {
    const sent = [];
    const reader = loadReader(hostResolvingTo('/Users/me/Downloads/notes.txt', sent));
    const out = await reader.readFile('/Users/me/Downloads/notes.txt', {
      screenResolvedPath: (p) => realDenylist.classify(p)
    });
    passAssertEqual(out.ok, true, 'a clean resolved path reads normally');
    passAssertEqual(chunksFetched(sent), 1, 'and fetches its chunk');
  }
  for (const [label, resolvedPath, screen, reason] of [
    ['a host that reports no resolved path', undefined, () => ({ denied: false }), 'unverified_path'],
    ['a screen that throws', '/Users/me/Downloads/notes.txt', () => { throw new Error('boom'); }, 'denylist-error']
  ]) {
    const sent = [];
    const reader = loadReader(hostResolvingTo(resolvedPath, sent));
    const out = await reader.readFile('/Users/me/Downloads/notes.txt', { screenResolvedPath: screen });
    passAssertEqual(out.reason, reason, `${label} fails closed`);
    passAssertEqual(chunksFetched(sent), 0, `${label}: no chunk fetched`);
    passAssert(released(sent), `${label}: handle released`);
  }
  {
    const sent = [];
    const reader = loadReader(hostResolvingTo('/Users/me/.ssh/id_rsa', sent));
    const { executeUploadFile, calls } = buildHarness({ platform: SAFARI, denylist: realDenylist, reader });
    const res = await executeUploadFile(7, '#f', '/Users/me/Downloads/notes.txt');
    passAssertEqual(res.success, false, 'executeUploadFile refuses a granted-folder link to ~/.ssh');
    passAssertEqual(res.reason, 'sensitive-directory', 'reason is the denylist token');
    passAssertEqual(chunksFetched(sent), 0, 'no bytes leave the host');
    passAssertEqual(calls.tabMessages.length, 0, 'nothing reaches the page');
    passAssert(calls.audit.some((a) => a.outcome === 'blocked' && a.consentDecision === 'sensitive-directory'),
      'audited as a block');
    const recorded = JSON.stringify(res) + JSON.stringify(calls.log) + JSON.stringify(calls.audit);
    passAssert(!recorded.includes('/Users/me/.ssh'), 'the resolved path stays out of the result, logs and audit');
  }
  {
    // The private screenshot exception has to reach the re-check too, or every
    // attested screenshot upload would now be refused on the second pass.
    const shot = '/Users/me/.fsb/screenshots/fsb-screenshot-1712345678901-1234abcd-1234-4abc-8def-1234567890ab.png';
    const sent = [];
    const reader = loadReader(hostResolvingTo(shot, sent));
    const { executeUploadFile } = buildHarness({ platform: SAFARI, denylist: realDenylist, reader });
    const res = await executeUploadFile(7, '#f', shot, { allowManagedScreenshot: true });
    passAssertEqual(res.success, true, 'an attested managed screenshot still uploads');
  }

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
