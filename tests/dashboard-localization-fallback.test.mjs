import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const angularRequire = createRequire(
  pathToFileURL(path.join(ROOT, 'showcase', 'angular', 'package.json')),
);

// Angular's partially compiled packages need the JIT compiler when the component
// is imported directly through tsx instead of the Angular build pipeline.
await import(pathToFileURL(angularRequire.resolve('@angular/compiler')).href);

const componentUrl = pathToFileURL(path.join(
  ROOT,
  'showcase',
  'angular',
  'src',
  'app',
  'pages',
  'dashboard',
  'dashboard-page.component.ts',
));
const { DashboardPageComponent } = await import(componentUrl.href);

const originalWindow = globalThis.window;
globalThis.window = {};

try {
  assert.equal(globalThis.window.FSBDashboardRuntimeState, undefined);

  const dashboard = Object.create(DashboardPageComponent.prototype);
  dashboard.dashboardCopy = {
    phasePlanning: 'PLAN',
    phaseWorking: 'WORK',
    progressPerformingAction: 'BROWSER ACTION',
    progressTaskCompleted: 'TASK COMPLETE',
    taskErrorMissing: 'TASK MISSING',
    taskErrorAlreadyRunning: 'TASK RUNNING',
    taskErrorNoUsableTab: 'NO USABLE TAB',
    taskCouldNotStart: 'START FAILED',
    restrictedChromeInternalPage: 'CHROME INTERNAL',
    restrictedChromeExtensionPage: 'CHROME EXTENSION',
    restrictedEdgeInternalPage: 'EDGE INTERNAL',
    restrictedBrowserInternalPage: 'BROWSER INTERNAL',
    restrictedLocalFile: 'LOCAL FILE',
    restrictedPageType: 'RESTRICTED PAGE',
    restrictedNoActiveTab: 'NO ACTIVE TAB',
    newTab: 'NEW TAB',
    previewStreamingLabel: 'STREAMING',
  };

  assert.equal(dashboard.translateTaskPhase('planning'), 'PLAN');
  assert.equal(dashboard.translateTaskPhase(''), 'WORK');
  assert.equal(dashboard.translateTaskPhase('constructor'), 'constructor');
  assert.equal(dashboard.translateTaskPhase('__proto__'), '__proto__');

  for (const detail of [
    'Opening the billing portal',
    'Waiting for the confirmation email',
    'Clicking "Sign in"',
    'Typing "secret" into password',
    'Selecting "Premium"',
    'constructor',
    '__proto__',
  ]) {
    assert.equal(
      dashboard.translateTaskAction(detail),
      detail,
      `producer-owned action should round-trip: ${detail}`,
    );
  }
  assert.equal(
    dashboard.translateTaskAction('Step 2/10: Opening the billing portal'),
    '2/10: Opening the billing portal',
  );
  assert.equal(dashboard.translateTaskAction('Task completed'), 'TASK COMPLETE');
  for (const action of [
    'Clicking element',
    'Entering text',
    'Submitting',
    'Opening page',
    'Scrolling',
    'Reading content',
    'Inspecting page',
    'Selecting option',
    'Selecting text',
    'Toggling checkbox',
    'Hovering',
    'Focusing field',
    'Clearing field',
    'Waiting for element',
    'Double-clicking',
    'Right-clicking',
    'Going back',
    'Going forward',
    'Refreshing',
    'Moving cursor',
    'Pressing key',
    'Solving captcha',
    'Opening new tab',
    'Switching tab',
    'Closing tab',
    'Checking tabs',
    'Signing in...',
  ]) {
    assert.equal(
      dashboard.translateTaskAction(action),
      'BROWSER ACTION',
      `package-owned action should use generic copy: ${action}`,
    );
  }

  assert.equal(
    dashboard.translateTaskError('constructor', 'Provider failure detail', 'Fallback failure'),
    'Provider failure detail',
  );
  assert.equal(
    dashboard.translateTaskError('__proto__', 'Provider failure detail', 'Fallback failure'),
    'Provider failure detail',
  );
  assert.equal(
    dashboard.translateTaskError('dashboard_task_missing', 'No task provided', 'Fallback failure'),
    'TASK MISSING',
  );
  assert.equal(
    dashboard.translateTaskError('', 'No task provided', 'Fallback failure'),
    'TASK MISSING',
  );

  assert.equal(dashboard.translateRestrictedPageType('constructor'), 'constructor');
  assert.equal(dashboard.translateRestrictedPageType('__proto__'), '__proto__');
  assert.equal(dashboard.translateRestrictedPageType('new-tab'), 'NEW TAB');

  assert.equal(dashboard.translateStreamState('constructor'), 'constructor');
  assert.equal(dashboard.translateStreamState('__proto__'), '__proto__');
  assert.equal(dashboard.translateStreamState('streaming'), 'STREAMING');

  console.log('dashboard localization fallback tests passed');
} finally {
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
}
