'use strict';

/**
 * debug-sidepanel-agent-name regression test --
 * chrome.storage.onChanged listener in extension/ui/sidepanel.js must
 * also refresh the owner chip when any session-area key prefixed with
 * 'mcpVisualSession:' changes. Without this branch, the chip renders
 * once via Tier 3 (formatAgentIdForDisplay short-prefix) on the
 * fsbAgentRegistry change AND never re-renders to Tier 2 (friendly
 * client label) when recordVisualSessionTick later writes the entry,
 * because no listener observes the visual-session key family.
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

console.log('\n--- debug-sidepanel-agent-name -- mcpVisualSession listener ---');

// Sanity: the listener exists and we can extract its body
const listenerBody = extractStorageOnChangedListenerBody(sidepanelSrc);
ok(listenerBody !== null && listenerBody.length > 0,
   'Test 0 -- chrome.storage.onChanged.addListener body extractable from sidepanel.js');

if (!listenerBody) {
  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(1);
}

// Build a stub world. The listener body references several module-scope
// helpers: refreshOwnerChip (chip refresh -- what we instrument),
// showSidepanelProgressEnabled (write target for the local-area branch).
// We provide stubs that record calls and return safe defaults.

let refreshOwnerChipCalls = 0;
let showSidepanelProgressEnabled = false;

// Install stubs as globals so eval'd code can resolve them via lexical
// scope. The arrow-function body extracted from the source uses var/let-less
// references, so we wrap the body in a Function expression that closes
// over the explicit args we pass in.
const listenerFn = new Function(
  'changes', 'area',
  'refreshOwnerChip', 'getShowProgress', 'setShowProgress',
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
    function () { refreshOwnerChipCalls++; },
    function () { return showSidepanelProgressEnabled; },
    function (v) { showSidepanelProgressEnabled = v; }
  );
}

// --- Tests -----------------------------------------------------------------

// Test 1: fsbAgentRegistry mutation in session area fires the chip refresh
// (PRE-EXISTING contract — regression pin to confirm fix did not regress it)
refreshOwnerChipCalls = 0;
invoke({ fsbAgentRegistry: { newValue: { v: 1, records: {} } } }, 'session');
ok(refreshOwnerChipCalls === 1,
   'Test 1 -- fsbAgentRegistry session-area change fires refreshOwnerChip exactly once');

// Test 2: mcpVisualSession:42 mutation in session area fires the chip refresh
// (THIS IS THE FIX — fail-pin for the regression)
refreshOwnerChipCalls = 0;
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
ok(refreshOwnerChipCalls === 1,
   'Test 2 -- mcpVisualSession:<tabId> session-area change fires refreshOwnerChip exactly once');

// Test 3: BOTH keys in the SAME change record fires the chip refresh at
// MOST twice (one per branch). Important — confirms the new branch does
// not somehow gate the existing branch or vice versa.
refreshOwnerChipCalls = 0;
invoke({
  fsbAgentRegistry: { newValue: { v: 1, records: {} } },
  'mcpVisualSession:42': { newValue: { tabId: 42, client: 'Claude' } }
}, 'session');
ok(refreshOwnerChipCalls === 2,
   'Test 3 -- both fsbAgentRegistry and mcpVisualSession in one change fires refresh twice');

// Test 4: a non-related session-area key does NOT fire refresh (the loop
// must not be over-broad).
refreshOwnerChipCalls = 0;
invoke({ someOtherSessionKey: { newValue: 'whatever' } }, 'session');
ok(refreshOwnerChipCalls === 0,
   'Test 4 -- unrelated session-area key does NOT fire refreshOwnerChip');

// Test 5: a local-area change with the visual-session-prefix-looking key
// must NOT fire (visual sessions are session-area only — defense against
// false positives if a future feature reused the prefix in local).
refreshOwnerChipCalls = 0;
invoke({ 'mcpVisualSession:42': { newValue: { tabId: 42 } } }, 'local');
ok(refreshOwnerChipCalls === 0,
   'Test 5 -- mcpVisualSession key in LOCAL area does NOT fire refreshOwnerChip');

// Test 6: showSidepanelProgress local-area write still works (regression
// pin for the pre-existing branch — the new branch must not break local
// channel handling).
refreshOwnerChipCalls = 0;
showSidepanelProgressEnabled = null;
invoke({ showSidepanelProgress: { newValue: false } }, 'local');
ok(showSidepanelProgressEnabled === false && refreshOwnerChipCalls === 0,
   'Test 6 -- local-area showSidepanelProgress change still flips the flag and does NOT fire refresh');

// Test 7: multiple mcpVisualSession:<tabId> keys in one change record fire
// the refresh AT MOST ONCE (Object.keys loop has a `break`). Important
// optimisation pin -- N visual-session writes in a single change must not
// cascade into N refreshOwnerChip calls.
refreshOwnerChipCalls = 0;
invoke({
  'mcpVisualSession:42': { newValue: { tabId: 42, client: 'Claude' } },
  'mcpVisualSession:99': { newValue: { tabId: 99, client: 'OpenClaw' } },
  'mcpVisualSession:1234': { newValue: { tabId: 1234, client: 'Cursor' } }
}, 'session');
ok(refreshOwnerChipCalls === 1,
   'Test 7 -- multiple mcpVisualSession:* keys in one change fires refresh exactly once (break in loop)');

// Test 8: storage-area filter -- 'managed' / 'sync' areas must NOT fire
// the new branch even when an mcpVisualSession:<tabId> key appears.
refreshOwnerChipCalls = 0;
invoke({ 'mcpVisualSession:42': { newValue: { tabId: 42 } } }, 'sync');
ok(refreshOwnerChipCalls === 0,
   'Test 8 -- sync-area mcpVisualSession key does NOT fire (session-area only)');

refreshOwnerChipCalls = 0;
invoke({ 'mcpVisualSession:42': { newValue: { tabId: 42 } } }, 'managed');
ok(refreshOwnerChipCalls === 0,
   'Test 8b -- managed-area mcpVisualSession key does NOT fire (session-area only)');

// Test 9: null/undefined changes must not throw or fire refresh (defensive).
refreshOwnerChipCalls = 0;
try {
  invoke(null, 'session');
  invoke(undefined, 'session');
  ok(refreshOwnerChipCalls === 0, 'Test 9 -- null/undefined changes are no-ops, do not throw');
} catch (err) {
  ok(false, 'Test 9 -- null/undefined changes threw: ' + err.message);
}

console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
process.exit(failed === 0 ? 0 : 1);
