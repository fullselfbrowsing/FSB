'use strict';

/**
 * Provider-neutral side-panel ownership listener regression.
 * Registry changes must refresh the active-tab ownership lock and delegated
 * snapshot. Decorative client-label and visual-session writes must not cause
 * side-panel ownership presentation work.
 *
 * Real-runtime discipline per CLAUDE.md MEMORY (no static-text grep
 * for presence; load + invoke the listener with mocked fixtures).
 *
 * Run: node tests/sidepanel-mcpvisualsession-listener.test.js
 *
 * ASCII only. No emojis.
 */

const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// --- Helpers ---------------------------------------------------------------

/**
 * Extract the chrome.storage.onChanged.addListener callback from sidepanel.js
 * source. The listener is a single arrow function inside a top-level call;
 * we capture it by grabbing the substring between `chrome.storage.onChanged.addListener((changes, area) => {`
 * and the matching `});` at the same indentation level.
 *
 * Approach: locate the addListener call, then walk forward counting braces
 * to find the closing `})` so the listener body is fully captured.
 */
function extractStorageOnChangedListenerBody(src) {
  const anchor = 'chrome.storage.onChanged.addListener((changes, area) => {';
  const startIdx = src.indexOf(anchor);
  if (startIdx === -1) return null;
  // Find the opening brace of the arrow body
  let i = startIdx + anchor.length - 1; // points to '{'
  let depth = 1;
  i++;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return null;
  // body lies between (startIdx + anchor.length) and i (exclusive of '}')
  const body = src.slice(startIdx + anchor.length, i);
  return body;
}

// --- Test environment ------------------------------------------------------

const sidepanelSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/ui/sidepanel.js'),
  'utf8'
);

console.log('\n--- provider-neutral sidepanel ownership listener ---');

// Sanity: the listener exists and we can extract its body
const listenerBody = extractStorageOnChangedListenerBody(sidepanelSrc);
ok(listenerBody !== null && listenerBody.length > 0,
   'Test 0 -- chrome.storage.onChanged.addListener body extractable from sidepanel.js');

if (!listenerBody) {
  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(1);
}

// Build a stub world for the branches under test.
let surfaceSyncCalls = 0;
let snapshotRefreshCalls = 0;
let showSidepanelProgressEnabled = false;

// Install stubs as globals so eval'd code can resolve them via lexical
// scope. The arrow-function body extracted from the source uses var/let-less
// references, so we wrap the body in a Function expression that closes
// over the explicit args we pass in.
const listenerFn = new Function(
  'changes', 'area',
  'syncActiveTabSurface', '_activeTabIdSnapshot', '_refreshSelectedDelegationSnapshot',
  'getShowProgress', 'setShowProgress',
  // The original body references `showSidepanelProgressEnabled` as a free
  // identifier. Provide a getter/setter pair and string-replace the
  // reference so the test sandbox can observe writes.
  rewriteShowProgressRefs(listenerBody)
);

function rewriteShowProgressRefs(body) {
  // Replace `showSidepanelProgressEnabled = X` with `setShowProgress(X)`
  // and `showSidepanelProgressEnabled` reads with `getShowProgress()`.
  // The listener only assigns to it; never reads. A single assignment
  // pattern handles the entire body.
  return body.replace(
    /showSidepanelProgressEnabled\s*=\s*([^;]+);/g,
    'setShowProgress($1);'
  );
}

function invoke(changes, area) {
  listenerFn(
    changes,
    area,
    function () { surfaceSyncCalls++; },
    42,
    function () { snapshotRefreshCalls++; },
    function () { return showSidepanelProgressEnabled; },
    function (v) { showSidepanelProgressEnabled = v; }
  );
}

// --- Tests -----------------------------------------------------------------

// Test 1: registry mutation refreshes the internal lock and selected snapshot.
surfaceSyncCalls = 0;
snapshotRefreshCalls = 0;
invoke({ fsbAgentRegistry: { newValue: { v: 1, records: {} } } }, 'session');
ok(surfaceSyncCalls === 1 && snapshotRefreshCalls === 1,
   'Test 1 -- registry change refreshes lock state and delegated snapshot exactly once');

// Test 2: visual-session presentation changes are ignored by the side panel.
surfaceSyncCalls = 0;
snapshotRefreshCalls = 0;
invoke({
  'mcpVisualSession:42': {
    newValue: {
      tabId: 42,
      agentId: 'agent_aaa',
      client: 'Claude',
      visualReason: 'Working',
      startedAt: Date.now(),
      lastTickAt: Date.now(),
      deadlineAt: Date.now() + 60000,
      isFinal: false,
      driver: 'mcp'
    }
  }
}, 'session');
ok(surfaceSyncCalls === 0 && snapshotRefreshCalls === 0,
   'Test 2 -- mcpVisualSession change performs no ownership presentation refresh');

// Test 3: canonical client-label changes are decorative and ignored.
surfaceSyncCalls = 0;
snapshotRefreshCalls = 0;
invoke({ fsbAgentClientLabels: { newValue: { agent_aaa: 'Claude' } } }, 'session');
ok(surfaceSyncCalls === 0 && snapshotRefreshCalls === 0,
   'Test 3 -- fsbAgentClientLabels change performs no side-panel refresh');

// Test 4: a registry mutation still refreshes once when decorative keys share
// the same storage event.
surfaceSyncCalls = 0;
snapshotRefreshCalls = 0;
invoke({
  fsbAgentRegistry: { newValue: { v: 1, records: {} } },
  fsbAgentClientLabels: { newValue: { agent_aaa: 'Claude' } },
  'mcpVisualSession:42': { newValue: { tabId: 42, client: 'Claude' } }
}, 'session');
ok(surfaceSyncCalls === 1 && snapshotRefreshCalls === 1,
   'Test 4 -- registry plus decorative changes still refresh exactly once');

// Test 5: unrelated session keys do not refresh ownership.
surfaceSyncCalls = 0;
snapshotRefreshCalls = 0;
invoke({ someOtherSessionKey: { newValue: 'whatever' } }, 'session');
ok(surfaceSyncCalls === 0 && snapshotRefreshCalls === 0,
   'Test 5 -- unrelated session-area key performs no ownership refresh');

// Test 6: a local visual-session-looking key is also ignored.
surfaceSyncCalls = 0;
snapshotRefreshCalls = 0;
invoke({ 'mcpVisualSession:42': { newValue: { tabId: 42 } } }, 'local');
ok(surfaceSyncCalls === 0 && snapshotRefreshCalls === 0,
   'Test 6 -- local mcpVisualSession key performs no ownership refresh');

// Test 7: the unrelated progress-setting branch remains intact.
surfaceSyncCalls = 0;
snapshotRefreshCalls = 0;
showSidepanelProgressEnabled = null;
invoke({ showSidepanelProgress: { newValue: false } }, 'local');
ok(showSidepanelProgressEnabled === false
    && surfaceSyncCalls === 0 && snapshotRefreshCalls === 0,
   'Test 7 -- local showSidepanelProgress still updates without ownership work');

// Test 8: non-session areas cannot trigger ownership refreshes.
surfaceSyncCalls = 0;
snapshotRefreshCalls = 0;
invoke({ 'mcpVisualSession:42': { newValue: { tabId: 42 } } }, 'sync');
invoke({ 'mcpVisualSession:42': { newValue: { tabId: 42 } } }, 'managed');
ok(surfaceSyncCalls === 0 && snapshotRefreshCalls === 0,
   'Test 8 -- sync and managed visual-session keys perform no refresh');

console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
process.exit(failed === 0 ? 0 : 1);
