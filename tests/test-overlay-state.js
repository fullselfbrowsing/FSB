/**
 * Tests for overlay state normalization and stale-message handling.
 * Run: node tests/test-overlay-state.js
 */

const overlayStateUtils = require('../extension/utils/overlay-state.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

console.log('\n--- buildOverlayState generic automation ---');

const genericState = overlayStateUtils.buildOverlayState({
  phase: 'analyzing',
  taskName: 'Find the pricing page and summarize it',
  iteration: 3,
  maxIterations: 20
}, null);

assertEqual(genericState.lifecycle, 'running', 'generic lifecycle is running');
assertEqual(genericState.phase, 'analyzing', 'generic phase remains analyzing');
assertEqual(genericState.progress.mode, 'indeterminate', 'generic automation is indeterminate');

console.log('\n--- trigger watch mode is additive ---');

const triggerWatchBaseInput = {
  phase: 'analyzing',
  taskName: 'Watch the price field',
  iteration: 1,
  maxIterations: 20
};
const triggerWatchControl = overlayStateUtils.buildOverlayState(triggerWatchBaseInput, null);
const triggerWatchState = overlayStateUtils.buildOverlayState({
  ...triggerWatchBaseInput,
  mode: 'trigger-watch'
}, null);

assertEqual(triggerWatchState.mode, 'trigger-watch', 'trigger-watch mode passes through');
assert(!Object.prototype.hasOwnProperty.call(triggerWatchControl, 'mode'), 'mode is absent when not supplied');
assertEqual(triggerWatchState.lifecycle, triggerWatchControl.lifecycle, 'trigger-watch does not alter lifecycle');
assertEqual(triggerWatchState.result, triggerWatchControl.result, 'trigger-watch does not alter result');
assertEqual(triggerWatchState.phase, triggerWatchControl.phase, 'trigger-watch does not alter phase');
assertEqual(JSON.stringify(triggerWatchState.display), JSON.stringify(triggerWatchControl.display), 'trigger-watch does not alter display');
assertEqual(JSON.stringify(triggerWatchState.progress), JSON.stringify(triggerWatchControl.progress), 'trigger-watch does not alter progress');
assertEqual(overlayStateUtils.humanizeOverlayPhase('trigger-watch'), 'Watching a trigger', 'trigger-watch label is centralized');

console.log('\n--- explicit progress wins ---');

const explicitState = overlayStateUtils.buildOverlayState({
  phase: 'acting',
  progressPercent: 42,
  statusText: 'Clicking submit'
}, null);

assertEqual(explicitState.progress.mode, 'determinate', 'explicit progress is determinate');
assertEqual(explicitState.progress.percent, 42, 'explicit progress percent is preserved');
// Phase 230: pill shows phase wording instead of percent during run; numeric percent preserved on .percent for the bar.
assertEqual(explicitState.progress.label, 'Acting…', 'Phase 230: explicit progress label shows phase wording with ellipsis (was percent)');

console.log('\n--- multi-site progress uses completed companies ---');

const multiSiteState = overlayStateUtils.buildOverlayState({
  phase: 'analyzing',
  taskSummary: 'Job search: 3/4 companies'
}, {
  multiSite: {
    companyList: ['A', 'B', 'C', 'D'],
    currentIndex: 2
  }
});

assertEqual(multiSiteState.progress.mode, 'determinate', 'multi-site progress is determinate');
assertEqual(multiSiteState.progress.percent, 50, 'multi-site percent uses completed companies only');
assertEqual(multiSiteState.progress.label, '3/4 companies', 'multi-site label shows current company');

console.log('\n--- sheets progress uses rows, formatting is indeterminate ---');

const sheetsDataEntryState = overlayStateUtils.buildOverlayState({
  phase: 'sheets-entry'
}, {
  sheetsData: {
    totalRows: 10,
    rowsWritten: 3
  }
});

assertEqual(sheetsDataEntryState.progress.mode, 'determinate', 'sheets data entry is determinate');
assertEqual(sheetsDataEntryState.progress.percent, 30, 'sheets data entry uses row ratio');
assertEqual(sheetsDataEntryState.progress.label, '3/10 rows', 'sheets data entry label shows row counts');

const sheetsFormattingState = overlayStateUtils.buildOverlayState({
  phase: 'sheets-formatting'
}, {
  sheetsData: {
    totalRows: 10,
    rowsWritten: 10,
    formattingPhase: true,
    formattingComplete: false
  }
});

assertEqual(sheetsFormattingState.phase, 'writing', 'sheets formatting normalizes to writing phase');
assertEqual(sheetsFormattingState.progress.mode, 'indeterminate', 'sheets formatting is indeterminate');
assertEqual(sheetsFormattingState.progress.label, 'Formatting', 'sheets formatting uses explicit label');

console.log('\n--- final state normalization ---');

const finalState = overlayStateUtils.buildOverlayState({
  phase: 'complete',
  statusText: 'Finished successfully'
}, null);

assertEqual(finalState.lifecycle, 'final', 'complete phase maps to final lifecycle');
assertEqual(finalState.result, 'success', 'complete phase maps to success result');
assertEqual(finalState.progress.percent, 100, 'final success shows 100 percent');
assertEqual(finalState.progress.label, 'Done', 'final success uses done label');

console.log('\n--- explicit visual-session metadata pass-through ---');

const partialFinalState = overlayStateUtils.buildOverlayState({
  phase: 'complete',
  lifecycle: 'final',
  result: 'partial',
  sessionToken: 'visual_token_123',
  version: 7,
  clientLabel: 'Codex',
  display: {
    title: 'Saved draft',
    subtitle: 'Login required',
    detail: 'Sign in and send the message'
  }
}, null);

assertEqual(partialFinalState.sessionToken, 'visual_token_123', 'explicit session token passes through');
assertEqual(partialFinalState.version, 7, 'explicit version passes through');
assertEqual(partialFinalState.clientLabel, 'Codex', 'explicit client label passes through');
assertEqual(partialFinalState.lifecycle, 'final', 'explicit final lifecycle passes through');
assertEqual(partialFinalState.result, 'partial', 'explicit partial result passes through');
assertEqual(partialFinalState.progress.label, 'Partial', 'partial final state gets dedicated progress label');

const errorFinalState = overlayStateUtils.buildOverlayState({
  phase: 'error',
  lifecycle: 'final',
  result: 'error',
  statusText: 'Checkout button never appeared'
}, null);

assertEqual(errorFinalState.lifecycle, 'final', 'explicit error lifecycle stays final');
assertEqual(errorFinalState.result, 'error', 'explicit error result passes through');
assertEqual(errorFinalState.progress.label, 'Error', 'error final state gets dedicated progress label');

console.log('\n--- degraded client-owned lifecycle state ---');

const degradedWaitingState = overlayStateUtils.buildOverlayState({
  phase: 'waiting',
  lifecycle: 'running',
  sessionToken: 'visual_token_waiting',
  version: 9,
  clientLabel: 'Claude',
  statusText: 'Waiting for reconnect'
}, null);

assertEqual(degradedWaitingState.phase, 'waiting', 'degraded client-owned state keeps waiting phase');
assertEqual(degradedWaitingState.lifecycle, 'running', 'degraded client-owned state stays running until explicit clear');
assertEqual(degradedWaitingState.clientLabel, 'Claude', 'degraded client-owned state preserves trusted badge identity');
assertEqual(degradedWaitingState.progress.label, 'waiting', 'degraded client-owned raw state preserves waiting progress label');

console.log('\n--- stale message handling ---');

assert(
  overlayStateUtils.shouldApplyOverlayState(
    { sessionToken: 'current', version: 4, lifecycle: 'running' },
    { sessionToken: 'older', version: 7, lifecycle: 'cleared' }
  ) === false,
  'clear for a different session token is ignored'
);

assert(
  overlayStateUtils.shouldApplyOverlayState(
    { sessionToken: 'same', version: 4, lifecycle: 'running' },
    { sessionToken: 'same', version: 3, lifecycle: 'running' }
  ) === false,
  'older version for same token is ignored'
);

assert(
  overlayStateUtils.shouldApplyOverlayState(
    { sessionToken: 'same', version: 4, lifecycle: 'running' },
    { sessionToken: 'same', version: 5, lifecycle: 'final' }
  ) === true,
  'newer version for same token is applied'
);

assert(
  overlayStateUtils.shouldApplyOverlayState(
    { sessionToken: 'same', version: 5, lifecycle: 'final', clientLabel: 'Codex' },
    { sessionToken: 'same', version: 4, lifecycle: 'cleared' }
  ) === false,
  'older clear for same token is ignored during final freeze'
);

assert(
  overlayStateUtils.shouldApplyOverlayState(
    { sessionToken: 'same', version: 5, lifecycle: 'final', clientLabel: 'Codex' },
    { sessionToken: 'same', version: 6, lifecycle: 'cleared' }
  ) === true,
  'newer clear for same token is applied after final freeze'
);

console.log('\n--- sanitizeActionText strips CLI tool syntax ---');

assertEqual(overlayStateUtils.sanitizeActionText('click #submit-btn'), 'Clicking element', 'click maps to Clicking element');
assertEqual(overlayStateUtils.sanitizeActionText('rightClick .menu-item'), 'Clicking element', 'rightClick maps to Clicking element');
assertEqual(overlayStateUtils.sanitizeActionText('doubleClick #cell'), 'Clicking element', 'doubleClick maps to Clicking element');
assertEqual(overlayStateUtils.sanitizeActionText('hover .menu-item'), 'Hovering over element', 'hover maps to Hovering over element');
assertEqual(overlayStateUtils.sanitizeActionText('type [ref=42] "hello"'), 'Typing text', 'type maps to Typing text');
assertEqual(overlayStateUtils.sanitizeActionText('clearInput #field'), 'Clearing input', 'clearInput maps to Clearing input');
assertEqual(overlayStateUtils.sanitizeActionText('selectText #paragraph'), 'Selecting text', 'selectText maps to Selecting text');
assertEqual(overlayStateUtils.sanitizeActionText('pressEnter'), 'Pressing key', 'pressEnter maps to Pressing key');
assertEqual(overlayStateUtils.sanitizeActionText('keyPress Tab'), 'Pressing key', 'keyPress maps to Pressing key');
assertEqual(overlayStateUtils.sanitizeActionText('selectOption #dropdown value'), 'Selecting option', 'selectOption maps to Selecting option');
assertEqual(overlayStateUtils.sanitizeActionText('toggleCheckbox #agree'), 'Toggling checkbox', 'toggleCheckbox maps to Toggling checkbox');
assertEqual(overlayStateUtils.sanitizeActionText('navigate https://example.com/long/path'), 'Navigating to page', 'navigate maps to Navigating to page');
assertEqual(overlayStateUtils.sanitizeActionText('searchGoogle "wireless mouse"'), 'Searching', 'searchGoogle maps to Searching');
assertEqual(overlayStateUtils.sanitizeActionText('scroll down 500'), 'Scrolling page', 'scroll maps to Scrolling page');
assertEqual(overlayStateUtils.sanitizeActionText('waitForElement .loading'), 'Waiting for page', 'waitForElement maps to Waiting for page');
assertEqual(overlayStateUtils.sanitizeActionText('getText .result'), 'Reading page content', 'getText maps to Reading page content');
assertEqual(overlayStateUtils.sanitizeActionText('getAttribute .elem href'), 'Reading page content', 'getAttribute maps to Reading page content');
assertEqual(overlayStateUtils.sanitizeActionText('setAttribute .elem style "color:red"'), 'Updating element', 'setAttribute maps to Updating element');
assertEqual(overlayStateUtils.sanitizeActionText('moveMouse 100 200'), 'Moving cursor', 'moveMouse maps to Moving cursor');
assertEqual(overlayStateUtils.sanitizeActionText('focus #input'), 'Focusing element', 'focus maps to Focusing element');
assertEqual(overlayStateUtils.sanitizeActionText('blur #input'), 'Focusing element', 'blur maps to Focusing element');
assertEqual(overlayStateUtils.sanitizeActionText('refresh'), 'Refreshing page', 'refresh maps to Refreshing page');
assertEqual(overlayStateUtils.sanitizeActionText('goBack'), 'Going back', 'goBack maps to Going back');
assertEqual(overlayStateUtils.sanitizeActionText('goForward'), 'Going forward', 'goForward maps to Going forward');
assertEqual(overlayStateUtils.sanitizeActionText('solveCaptcha'), 'Handling verification', 'solveCaptcha maps to Handling verification');

console.log('\n--- sanitizeActionText preserves human-readable text ---');

assertEqual(overlayStateUtils.sanitizeActionText('Clicking Add to Cart'), 'Clicking Add to Cart', 'already human-readable text passes through');
assertEqual(overlayStateUtils.sanitizeActionText('Planning next step'), 'Planning next step', 'no tool prefix passes through');
assertEqual(overlayStateUtils.sanitizeActionText('Reviewing page state'), 'Reviewing page state', 'natural language passes through');

console.log('\n--- sanitizeActionText strips Step X/Y prefix ---');

assertEqual(overlayStateUtils.sanitizeActionText('Step 5/20: click #submit-btn'), 'Clicking element', 'strips Step prefix and sanitizes CLI');
assertEqual(overlayStateUtils.sanitizeActionText('Step 3/20: Clicking Add to Cart'), 'Clicking Add to Cart', 'strips Step prefix, keeps human text');

console.log('\n--- sanitizeActionText edge cases ---');

assertEqual(overlayStateUtils.sanitizeActionText(''), '', 'empty string passthrough');
assertEqual(overlayStateUtils.sanitizeActionText(null), '', 'null returns empty');
assertEqual(overlayStateUtils.sanitizeActionText(undefined), '', 'undefined returns empty');

console.log('\n--- buildOverlayDisplay sanitizes detail ---');

const displayWithCLI = overlayStateUtils.buildOverlayState({
  phase: 'acting',
  statusText: 'Step 5/20: click #submit-btn'
}, null);
assertEqual(displayWithCLI.display.detail, 'Clicking element', 'buildOverlayDisplay sanitizes CLI syntax from detail');

const displayWithHuman = overlayStateUtils.buildOverlayState({
  phase: 'acting',
  statusText: 'Clicking Add to Cart'
}, null);
assertEqual(displayWithHuman.display.detail, 'Clicking Add to Cart', 'buildOverlayDisplay preserves human-readable detail');

console.log('\n--- ETA removed from progress ---');

const etaState1 = overlayStateUtils.buildOverlayState({
  phase: 'acting',
  progressPercent: 42,
  estimatedTimeRemaining: '30s'
}, null);
assertEqual(etaState1.progress.eta, null, 'ETA is null for explicit percent progress even with estimatedTimeRemaining');

const etaState2 = overlayStateUtils.buildOverlayState({
  phase: 'planning'
}, null);
assertEqual(etaState2.progress.eta, null, 'ETA is null for indeterminate progress');

const etaStateMultisite = overlayStateUtils.buildOverlayState({
  phase: 'acting',
  estimatedTimeRemaining: '45s'
}, {
  multiSite: {
    companyList: ['A', 'B', 'C'],
    currentIndex: 1
  }
});
assertEqual(etaStateMultisite.progress.eta, null, 'ETA is null for multisite progress');

const etaStateSheets = overlayStateUtils.buildOverlayState({
  phase: 'sheets-entry',
  estimatedTimeRemaining: '60s'
}, {
  sheetsData: {
    totalRows: 10,
    rowsWritten: 3
  }
});
assertEqual(etaStateSheets.progress.eta, null, 'ETA is null for sheets progress');

console.log('\n--- progress label never shows Step X/Y ---');

const indeterminateProgress = overlayStateUtils.buildOverlayState({
  phase: 'acting'
}, null);
// Phase 230: in-progress phases get an ellipsis suffix (Acting → Acting…).
assertEqual(indeterminateProgress.progress.label, 'Acting…', 'Phase 230: indeterminate label shows phase wording with ellipsis');

const planningProgress = overlayStateUtils.buildOverlayState({
  phase: 'thinking'
}, null);
// Phase 230: 'thinking' normalizes to 'planning' which is an ellipsis phase.
assertEqual(planningProgress.progress.label, 'Planning…', 'Phase 230: thinking phase label shows Planning… with ellipsis');

console.log('\n--- multisite and sheets counters preserved ---');

const multiSiteCounter = overlayStateUtils.buildOverlayState({
  phase: 'analyzing'
}, {
  multiSite: {
    companyList: ['A', 'B', 'C', 'D', 'E'],
    currentIndex: 1
  }
});
assertEqual(multiSiteCounter.progress.label, '2/5 companies', 'multisite counter preserved');

const sheetsCounter = overlayStateUtils.buildOverlayState({
  phase: 'sheets-entry'
}, {
  sheetsData: {
    totalRows: 10,
    rowsWritten: 3
  }
});
assertEqual(sheetsCounter.progress.label, '3/10 rows', 'sheets counter preserved');

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
