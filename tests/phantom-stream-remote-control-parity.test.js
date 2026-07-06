'use strict';

/**
 * Phase 24 Plan 04 -- PhantomStream remote-control parity.
 *
 * Verifies ws-client.js accepts package remote-control frames, keeps legacy
 * dashboard frames compatible, validates through PhantomStream helpers, and
 * preserves content-free ownership/debugger state reporting.
 *
 * Run: node tests/phantom-stream-remote-control-parity.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const wsClientSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ws', 'ws-client.js'), 'utf8');
const protocolEntrySource = fs.readFileSync(path.join(repoRoot, 'extension', 'ws', 'phantom-stream-protocol-entry.js'), 'utf8');
const protocolBundleSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ws', 'phantom-stream-protocol.js'), 'utf8');
const staticDashboardSource = fs.readFileSync(path.join(repoRoot, 'showcase', 'js', 'dashboard.js'), 'utf8');
const angularDashboardSource = fs.readFileSync(
  path.join(repoRoot, 'showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.ts'),
  'utf8'
);

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

(async () => {
  console.log('\n--- package protocol helpers ---');
  const protocol = await import('@full-self-browsing/phantom-stream/protocol');

  ok(protocol.REMOTE_CONTROL.REQUEST === 'dash:ps-control-request',
    'REMOTE_CONTROL.REQUEST matches package wire type');
  ok(protocol.REMOTE_CONTROL.CLICK === 'dash:ps-control-click',
    'REMOTE_CONTROL.CLICK matches package wire type');
  ok(protocol.REMOTE_CONTROL.TEXT === 'dash:ps-control-text',
    'REMOTE_CONTROL.TEXT matches package wire type');
  ok(protocol.REMOTE_CONTROL.STATE === 'ext:ps-control-state',
    'REMOTE_CONTROL.STATE matches package wire type');
  ok(protocol.REMOTE_CONTROL_STATE.ACTIVE === 'active',
    'REMOTE_CONTROL_STATE.ACTIVE is exported');

  const click = protocol.validateRemoteControlMessage(protocol.REMOTE_CONTROL.CLICK, {
    x: 12,
    y: 34,
    button: 'left',
    clickCount: 1,
    modifiers: 0,
  });
  ok(click.ok === true && click.action.kind === 'click' && click.action.x === 12,
    'package validates click payloads');

  const badClick = protocol.validateRemoteControlMessage(protocol.REMOTE_CONTROL.CLICK, { x: -1, y: 1 });
  ok(badClick.ok === false && badClick.error === 'remote-coordinate-invalid',
    'package rejects stale/out-of-bounds negative coordinates');

  const text = protocol.validateRemoteControlMessage(protocol.REMOTE_CONTROL.TEXT, { text: 'secret typed value' });
  ok(text.ok === true && text.action.kind === 'text',
    'package validates text payloads');
  const summary = protocol.summarizeRemoteControlAction(protocol.REMOTE_CONTROL.TEXT, { text: 'secret typed value' });
  ok(summary.kind === 'text' && summary.chars === 18,
    'text summaries report character count');
  ok(!JSON.stringify(summary).includes('secret typed value'),
    'text summaries never include typed content');

  const key = protocol.validateRemoteControlMessage(protocol.REMOTE_CONTROL.KEY, { event: 'down', key: 'Enter' });
  ok(key.ok === true && key.action.event === 'down',
    'package validates key payloads');

  const scroll = protocol.validateRemoteControlMessage(protocol.REMOTE_CONTROL.SCROLL, { x: 10, y: 20, deltaX: 0, deltaY: 120 });
  ok(scroll.ok === true && scroll.action.kind === 'scroll',
    'package validates scroll payloads');

  const stateEvent = protocol.createRemoteControlStateEvent(protocol.REMOTE_CONTROL_STATE.ACTIVE, 'ready', {
    counts: { accepted: 2, rejected: 1, 'bad key': 5 },
  });
  ok(stateEvent.state === 'active' && stateEvent.reason === 'ready',
    'package creates state events');
  ok(stateEvent.counts.accepted === 2 && !Object.prototype.hasOwnProperty.call(stateEvent.counts, 'bad key'),
    'state event counts are sanitized');

  console.log('\n--- bundled bridge ---');
  ok(protocolEntrySource.includes('REMOTE_CONTROL'),
    'protocol bundle entry imports REMOTE_CONTROL');
  ok(protocolEntrySource.includes('REMOTE_CONTROL_STATE'),
    'protocol bundle entry imports REMOTE_CONTROL_STATE');
  ok(protocolEntrySource.includes('summarizeRemoteControlAction'),
    'protocol bundle entry imports summarizeRemoteControlAction');
  ok(protocolEntrySource.includes('validateRemoteControlMessage'),
    'protocol bundle entry imports validateRemoteControlMessage');
  ok(protocolEntrySource.includes('createRemoteControlStateEvent'),
    'protocol bundle entry imports createRemoteControlStateEvent');

  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(protocolBundleSource, sandbox, { filename: 'extension/ws/phantom-stream-protocol.js' });
  ok(sandbox.FSBPhantomStreamProtocol.REMOTE_CONTROL.CLICK === protocol.REMOTE_CONTROL.CLICK,
    'generated bundle exposes REMOTE_CONTROL constants');
  ok(typeof sandbox.FSBPhantomStreamProtocol.validateRemoteControlMessage === 'function',
    'generated bundle exposes validateRemoteControlMessage');
  ok(typeof sandbox.FSBPhantomStreamProtocol.summarizeRemoteControlAction === 'function',
    'generated bundle exposes summarizeRemoteControlAction');
  ok(typeof sandbox.FSBPhantomStreamProtocol.createRemoteControlStateEvent === 'function',
    'generated bundle exposes createRemoteControlStateEvent');

  console.log('\n--- ws-client source contract ---');
  ok(wsClientSource.includes('FSB_PHANTOMSTREAM_REMOTE_CONTROL_FALLBACK'),
    'ws-client defines remote-control fallback constants');
  ok(wsClientSource.includes('getFSBRemoteControlTypes'),
    'ws-client resolves REMOTE_CONTROL constants from protocol bridge');
  ok(wsClientSource.includes('getFSBRemoteControlStateTypes'),
    'ws-client resolves REMOTE_CONTROL_STATE constants from protocol bridge');
  ok(wsClientSource.includes('protocol.validateRemoteControlMessage'),
    'ws-client validates remote-control payloads through package helper');
  ok(wsClientSource.includes('protocol.summarizeRemoteControlAction'),
    'ws-client summarizes remote-control actions through package helper');
  ok(wsClientSource.includes('protocol.createRemoteControlStateEvent'),
    'ws-client creates PhantomStream remote-control state events through package helper');
  [
    'REQUEST',
    'STOP',
    'CLICK',
    'TEXT',
    'KEY',
    'SCROLL',
  ].forEach((keyName) => {
    ok(wsClientSource.includes('case remoteControlTypes.' + keyName),
      'ws-client handles remoteControlTypes.' + keyName + ' in _handleMessage');
  });
  [
    'dash:remote-control-start',
    'dash:remote-control-stop',
    'dash:remote-click',
    'dash:remote-key',
    'dash:remote-scroll',
  ].forEach((legacyType) => {
    ok(wsClientSource.includes("case '" + legacyType + "'"),
      'ws-client keeps legacy case for ' + legacyType);
  });
  ok(wsClientSource.includes('handlePhantomRemoteControl(msg.type, msg.payload)'),
    'legacy and package cases route through the shared PhantomStream remote-control dispatcher');
  ok(wsClientSource.includes("wsInstance.send('ext:remote-control-state'"),
    'ws-client preserves FSB legacy remote-control state broadcast');
  ok(wsClientSource.includes('remoteControlTypes.STATE'),
    'ws-client emits PhantomStream REMOTE_CONTROL.STATE side channel');
  ok(wsClientSource.includes("'debugger-blocked'") && wsClientSource.includes("'external-debugger'"),
    'ws-client reports external debugger ownership');
  ok(wsClientSource.includes("'retarget-required'"),
    'ws-client reports retarget-required dispatch failures');
  ok(wsClientSource.includes("'no-tab'"),
    'ws-client reports no-tab remote-control failures');
  ok(wsClientSource.includes("attachErr.message.includes('Another debugger is already attached')"),
    'ws-client detects debugger contention explicitly');

  console.log('\n--- dashboard source contract ---');
  ok(staticDashboardSource.includes('mapPointToViewport') && angularDashboardSource.includes('mapPointToViewport'),
    'static and Angular dashboards map remote points through the PhantomStream viewer');
  ok(staticDashboardSource.includes('shouldAcceptPreviewMessage(payload,') && angularDashboardSource.includes('shouldAcceptPreviewMessage(payload,'),
    'static and Angular dashboards keep stale stream/session rejection gates');
  ok(staticDashboardSource.includes("type: 'dash:remote-click'") && angularDashboardSource.includes("type: 'dash:remote-click'"),
    'static and Angular dashboards keep legacy remote click frames for compatibility');
  ok(staticDashboardSource.includes("type: 'dash:remote-scroll'") && angularDashboardSource.includes("type: 'dash:remote-scroll'"),
    'static and Angular dashboards keep legacy remote scroll frames for compatibility');
  ok(staticDashboardSource.includes('ext:remote-control-state') && angularDashboardSource.includes('ext:remote-control-state'),
    'static and Angular dashboards keep FSB remote-control state listener');
  ok(staticDashboardSource.includes('ext:ps-control-state') && angularDashboardSource.includes('ext:ps-control-state'),
    'static and Angular dashboards accept PhantomStream remote-control state listener');
  ok(staticDashboardSource.includes("case 'active':") && angularDashboardSource.includes("case 'active':"),
    'static and Angular dashboards normalize PhantomStream active remote-control state');
  ok(staticDashboardSource.includes('dash:ps-control-request') && angularDashboardSource.includes('dash:ps-control-request'),
    'static and Angular dashboards emit PhantomStream remote-control request frames');

  console.log('\nPhantomStream remote-control parity: ' + passed + ' PASS / 0 FAIL');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
