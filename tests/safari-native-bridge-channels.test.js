/**
 * Safari native host: one socket per channel.
 *
 * Safari's extension service worker cannot open a WebSocket, so the container
 * app holds the sockets: "mcp" to the MCP hub on :7225 and "relay" to the
 * dashboard relay. This builds safari/Tests/BridgeChannels/main.swift with
 * the shipped safari/FSB/Shared/*.swift and runs it against two local
 * WebSocket servers, so the real URLSession code is exercised without Safari.
 *
 * Locks:
 *   1. "mcp" and "relay" are separate coordinators; unknown channels are refused;
 *   2. both dial their own server and send the extension's Origin;
 *   3. frames never cross channels, in either direction;
 *   4. closing one channel leaves the other's socket open;
 *   5. a closed channel reopens with a fresh socket.
 *
 * macOS only (swiftc + Foundation's URLSession). Elsewhere it reports SKIP.
 *
 * Run: node tests/safari-native-bridge-channels.test.js
 */

'use strict';

const { execFileSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

if (process.platform !== 'darwin' || spawnSync('xcrun', ['--find', 'swiftc']).status !== 0) {
  console.log('SKIP: needs macOS with swiftc');
  process.exit(0);
}

const { WebSocketServer } = require(path.join(ROOT, 'mcp', 'node_modules', 'ws'));

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Asynchronous on purpose: the echo servers live in this process, and
// spawnSync would freeze the event loop that answers their handshakes.
function runHarness(binary, args) {
  return new Promise((resolve) => {
    const child = spawn(binary, args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', () => { clearTimeout(timer); resolve({ stdout, stderr }); });
  });
}

function echoServer(prefix) {
  const seen = { connections: 0, origins: [], closes: 0 };
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  wss.on('connection', (ws, req) => {
    seen.connections += 1;
    seen.origins.push(req.headers.origin || null);
    ws.on('message', (data) => ws.send(prefix + data.toString()));
    ws.on('close', () => { seen.closes += 1; });
  });
  return new Promise((resolve) => wss.on('listening', () => resolve({ wss, seen, url: `ws://127.0.0.1:${wss.address().port}` })));
}

(async function run() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-bridge-'));
  const binary = path.join(work, 'BridgeChannelsHarness');
  const shared = path.join(ROOT, 'safari', 'FSB', 'Shared');
  console.log('\n=== build the harness from the shipped Shared/*.swift ===');
  execFileSync('xcrun', ['swiftc', '-o', binary,
    path.join(shared, 'NativeFraming.swift'),
    path.join(shared, 'MCPSocketSession.swift'),
    path.join(shared, 'BridgeCoordinator.swift'),
    path.join(ROOT, 'safari', 'Tests', 'BridgeChannels', 'main.swift')], { stdio: 'inherit' });
  passAssert(fs.existsSync(binary), 'harness built');

  const mcp = await echoServer('mcp:');
  const relay = await echoServer('relay:');
  let report = null;
  try {
    const out = await runHarness(binary, [mcp.url, relay.url]);
    if (process.env.FSB_HARNESS_DEBUG) console.log('stderr:', out.stderr);
    const line = (out.stdout || '').trim().split('\n').pop();
    try { report = JSON.parse(line); } catch (_e) {
      console.error('harness output:', out.stdout, out.stderr);
    }
  } finally {
    await new Promise((r) => setTimeout(r, 300));
    mcp.wss.close();
    relay.wss.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
  passAssert(!!report, 'harness reported');
  if (process.env.FSB_HARNESS_DEBUG) console.log('report:', JSON.stringify(report));
  if (!report) process.exit(1);

  console.log('\n=== 1. channels ===');
  passAssert(report.channelsDistinct === true, 'mcp and relay are separate coordinators');
  passAssert(report.sharedIsMcp === true, 'BridgeCoordinator.shared is the mcp channel (messages without ch)');
  passAssert(report.unknownChannelRefused === true, 'an unknown channel is refused');

  console.log('\n=== 2. both dial their own server with the extension Origin ===');
  passAssert(report.mcpOpen === 'opened' && report.relayOpen === 'opened', 'both channels open');
  passAssert(mcp.seen.origins[0] && mcp.seen.origins[0].startsWith('safari-web-extension://'), 'mcp sends the Origin');
  passAssert(relay.seen.origins[0] && relay.seen.origins[0].startsWith('safari-web-extension://'), 'relay sends the Origin');

  console.log('\n=== 3. frames stay on their channel ===');
  passAssert(same(report.mcpFrames, ['mcp:ping-a']), 'mcp gets only its own echo');
  passAssert(same(report.relayFrames, ['relay:ping-b']), 'relay gets only its own echo');

  console.log('\n=== 4. closing relay leaves mcp open ===');
  passAssert(same(report.mcpAfterRelayClose, ['mcp:after-relay-close']), 'mcp still round-trips after relay closed');
  passAssert(mcp.seen.connections === 1, 'mcp never redialled');

  console.log('\n=== 5. relay reopens fresh ===');
  passAssert(report.relayReopen === 'opened' && report.relayReopenAdopted === false, 'relay dials a new socket');
  passAssert(relay.seen.connections === 2, 'the relay server saw a second connection');
  passAssert(same(report.relayAfterReopen, ['relay:ping-c']), 'and it round-trips');

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exit(1);
});
