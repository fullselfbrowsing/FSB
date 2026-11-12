/**
 * Phase 52 Plan 02 accessibility contract.
 *
 * Normal mode requires the production shell and proves exact names, roles,
 * copy, focus order/restoration, Escape reporting, live cadence, zoom,
 * forced-colors, and reduced-motion behavior. --self-test validates only the
 * local DOM/focus oracle used by those assertions.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  HOSTILE_TEXT,
  PHASE53_COPY,
  MockDocument,
  MockWindow,
  createEvent,
  createHarness
} = require('./skopeo-shell-contract.test.js');

function loadProductionApi() {
  const modulePath = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-shell.js');
  assert.ok(fs.existsSync(modulePath), 'production shell module must exist in normal mode');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function runSelfTest() {
  const document = new MockDocument({ popoverSupported: false });
  const window = new MockWindow(document);
  document.defaultView = window;
  const first = document.createElement('button');
  const second = document.createElement('button');
  document.body.appendChild(first);
  document.body.appendChild(second);
  first.focus({ preventScroll: true });
  assert.strictEqual(document.activeElement, first, 'focus oracle tracks the active element');
  assert.deepStrictEqual(first._focusCalls[0], { preventScroll: true }, 'focus oracle records preventScroll');
  const event = createEvent('keydown', { key: 'Escape', target: first });
  window.addEventListener('keydown', received => received.preventDefault());
  window.dispatchEvent(event);
  assert.strictEqual(event.defaultPrevented, true, 'keyboard oracle records consumed events');
  const text = document.createElement('span');
  text.textContent = HOSTILE_TEXT;
  document.body.appendChild(text);
  assert.strictEqual(document.querySelector('img'), null, 'accessibility text oracle does not parse hostile markup');
  console.log('skopeo-accessibility self-test: PASS');
}

function mountFixture(api, options = {}) {
  const harness = createHarness(api, options);
  const origin = harness.addHostControl(
    { left: 400, top: 300, width: 120, height: 40 },
    { id: 'host-origin', 'aria-label': 'Host origin control' }
  );
  origin.focus({ preventScroll: true });
  const prepared = harness.shell.prepareAmbient();
  assert.ok(prepared, 'fixture can prepare Ambient safely');
  assert.strictEqual(harness.shell.mountAmbient(prepared), true, 'fixture mounts Ambient');
  return { harness, origin };
}

function buttonNames(root) {
  return root.querySelectorAll('button').map(button => button.getAttribute('aria-label') || button.textContent.trim());
}

function assertAbsent(root, primitiveNames) {
  for (const name of primitiveNames) {
    assert.strictEqual(root.querySelector(`[data-skopeo-primitive="${name}"]`), null, `${name} is removed, not visually hidden`);
  }
}

function assertShadowFocus(harness, expected, label) {
  assert.strictEqual(harness.document.activeElement, harness.host(), label + ': document retargets focus to the host');
  assert.strictEqual(harness.shadow().activeElement, expected, label + ': Shadow root exposes the exact focused control');
}

function testAmbientSemantics(api) {
  const { harness, origin } = mountFixture(api);
  const shadow = harness.shadow();
  const ambient = shadow.querySelector('.skopeo-ambient');
  assert.ok(ambient, 'Ambient container exists');
  assert.strictEqual(ambient.getAttribute('role'), 'region');
  assert.strictEqual(ambient.getAttribute('aria-label'), 'Skopeo ambient HUD');
  assert.strictEqual(ambient.textContent.includes('Skopeo · Ambient'), true, 'Ambient exact visible copy is present');

  const close = shadow.querySelector('[aria-label="Turn off Skopeo"]');
  assert.strictEqual(close.localName, 'button', 'Ambient close is a native button');
  assert.strictEqual(close.getAttribute('aria-label'), 'Turn off Skopeo');
  assert.strictEqual(close.getBoundingClientRect().width || Number(close.style.width.replace('px', '')), 32, 'Ambient close has 32px geometry');

  const rail = shadow.querySelector('[data-skopeo-primitive="rail"]');
  assert.strictEqual(rail.getAttribute('role'), 'group');
  assert.strictEqual(rail.getAttribute('aria-label'), 'Skopeo ambient rail');
  assert.strictEqual(rail.querySelector('.skopeo-rail-line').getAttribute('aria-hidden'), 'true');
  assert.strictEqual(rail.querySelector('.skopeo-rail-ticks').getAttribute('aria-hidden'), 'true');
  assert.strictEqual(rail.style.pointerEvents, 'none');

  const liveRegions = shadow.querySelectorAll('[aria-live]');
  assert.strictEqual(liveRegions.length, 1, 'one and only one live region exists');
  assert.strictEqual(liveRegions[0].getAttribute('aria-live'), 'polite');
  assert.strictEqual(liveRegions[0].getAttribute('aria-atomic'), 'true');
  assert.strictEqual(liveRegions[0].textContent, 'Skopeo on. Ambient view.');
  assert.strictEqual(harness.document.activeElement, origin, 'Ambient entry does not move host focus');
  assert.strictEqual(shadow.activeElement, null, 'Ambient leaves Shadow focus empty');
  assertAbsent(shadow, ['anchor', 'chip', 'halo', 'ghost', 'gate']);

  close.click();
  assert.strictEqual(harness.calls.close.length, 1, 'visible Ambient close requests complete shutdown');
  assert.strictEqual(harness.calls.close[0].state, 'ambient');
  harness.shell.destroy('ambient-semantics');
}

function testAnchoredSemantics(api) {
  const { harness, origin } = mountFixture(api);
  assert.strictEqual(harness.shell.enableControlledFixture(harness.fixtureToken), true);
  assert.strictEqual(harness.shell.render('anchored', {}), true);
  const shadow = harness.shadow();
  assert.strictEqual(harness.document.activeElement, origin, 'Anchored entry does not steal focus');
  assert.strictEqual(shadow.activeElement, null, 'Anchored entry leaves Shadow focus empty');

  const anchor = shadow.querySelector('[data-skopeo-primitive="anchor"]');
  assert.strictEqual(anchor.localName, 'button');
  assert.strictEqual(anchor.getAttribute('aria-label'), 'Open anchor mark demo');
  assert.strictEqual(anchor.textContent.includes('Anchor demo'), true);
  const chip = shadow.querySelector('[data-skopeo-primitive="chip"]');
  assert.strictEqual(chip.localName, 'button');
  assert.strictEqual(chip.getAttribute('aria-label'), 'Open entity chip demo');
  assert.strictEqual(chip.textContent, 'Example entity · 1 note');

  const halo = shadow.querySelector('[data-skopeo-primitive="halo"]');
  assert.strictEqual(halo.getAttribute('aria-hidden'), 'true', 'visual halo is hidden from accessibility traversal');
  const anomaly = shadow.querySelector('.skopeo-anomaly-payload');
  assert.strictEqual(anomaly.getAttribute('role'), 'group');
  assert.strictEqual(anomaly.getAttribute('aria-label'), 'Anomaly signal demo');
  assert.strictEqual(anomaly.textContent, 'Anomaly demo · unusual change');
  assert.strictEqual(shadow.querySelectorAll('[data-skopeo-primitive="halo"]').length, 1, 'there is no second halo');

  const back = shadow.querySelector('[aria-label="Back to ambient Skopeo"]');
  assert.strictEqual(back.localName, 'button');
  assert.strictEqual(back.textContent, 'Back to ambient Skopeo');
  assertAbsent(shadow, ['ghost', 'gate']);
  harness.shell.destroy('anchored-semantics');
}

function testFocusedSemanticsAndOrder(api) {
  const { harness, origin } = mountFixture(api);
  harness.shell.enableControlledFixture(harness.fixtureToken);
  harness.shell.render('anchored', {});
  const anchor = harness.shadow().querySelector('[aria-label="Open anchor mark demo"]');
  anchor.focus({ preventScroll: true });
  assert.strictEqual(harness.shell.render('focused', {}), true);
  const shadow = harness.shadow();

  const focused = shadow.querySelector('.skopeo-focused-card');
  const title = shadow.querySelector('.skopeo-focused-title');
  assert.strictEqual(focused.getAttribute('role'), 'region');
  assert.strictEqual(focused.getAttribute('aria-label'), 'Skopeo focused demo');
  assert.strictEqual(title.textContent, 'Focused Skopeo demo');
  assert.strictEqual(title.getAttribute('tabindex'), '-1');
  assertShadowFocus(harness, title, 'Focused entry moves focus to its named title');
  assert.deepStrictEqual(title._focusCalls[0], { preventScroll: true }, 'Focused title uses preventScroll focus');
  assert.strictEqual(
    shadow.querySelector('.skopeo-focused-body').textContent,
    'This controlled preview demonstrates temporary ghosting. It does not read or change the page.'
  );

  const ghost = shadow.querySelector('[data-skopeo-primitive="ghost"]');
  assert.strictEqual(ghost.getAttribute('aria-hidden'), 'true');
  assert.strictEqual(ghost.style.pointerEvents, 'none');
  assert.deepStrictEqual(buttonNames(focused), [
    'Back to anchored view',
    'Open consequence preview',
    'Turn off Skopeo in this tab'
  ], 'Focused source order is back, action, turn-off');
  assert.strictEqual(shadow.querySelector('[aria-live="polite"]').textContent, 'Focused view on. Press Escape to restore the page.');
  assertAbsent(shadow, ['rail', 'halo', 'gate']);

  assert.strictEqual(harness.shell.back(), true, 'Focused back is consumed');
  assert.strictEqual(harness.host().getAttribute('data-attention'), 'anchored');
  assertShadowFocus(harness, anchor, 'Focused back restores the exact anchored origin');
  assert.deepStrictEqual(anchor._focusCalls.at(-1), { preventScroll: true });
  assert.strictEqual(origin._focusCalls.length, 1, 'host origin is not touched by one-level Focused back');
  harness.shell.destroy('focused-order');
}

function testInterstitialSemanticsAndTrap(api) {
  const { harness } = mountFixture(api);
  harness.shell.enableControlledFixture(harness.fixtureToken);
  harness.shell.render('anchored', {});
  const anchor = harness.shadow().querySelector('[aria-label="Open anchor mark demo"]');
  anchor.focus({ preventScroll: true });
  harness.shell.render('focused', {});
  const trigger = harness.shadow().querySelector('[aria-label="Open consequence preview"]');
  trigger.focus({ preventScroll: true });
  assert.strictEqual(harness.shell.render('interstitial', {}), true);
  const shadow = harness.shadow();

  const gate = shadow.querySelector('[data-skopeo-primitive="gate"]');
  assert.strictEqual(gate.getAttribute('role'), 'alertdialog');
  assert.strictEqual(gate.getAttribute('aria-modal'), 'true');
  assert.strictEqual(gate.getAttribute('aria-labelledby'), 'skopeo-gate-title');
  assert.strictEqual(gate.getAttribute('aria-describedby'), 'skopeo-gate-description');
  assert.strictEqual(shadow.querySelector('.skopeo-gate-eyebrow').textContent, 'Demo only');
  assert.strictEqual(shadow.querySelector('#skopeo-gate-title').textContent, 'Consequence preview');
  assert.strictEqual(
    shadow.querySelector('#skopeo-gate-description').textContent,
    'Continuing closes this preview. Skopeo will not act on the page.'
  );
  assert.deepStrictEqual(buttonNames(gate), [
    'Return to focused demo',
    'Continue demo',
    'Back to focused view'
  ], 'Gate source order puts safest return first and visible back last');

  const safe = shadow.querySelector('[aria-label="Return to focused demo"]');
  const proceed = shadow.querySelector('[aria-label="Continue demo"]');
  const back = shadow.querySelector('[aria-label="Back to focused view"]');
  assertShadowFocus(harness, safe, 'Gate initial focus is safest return action');
  assert.deepStrictEqual(safe._focusCalls[0], { preventScroll: true });
  const firstForward = harness.dispatchKey('Tab');
  assert.strictEqual(firstForward.defaultPrevented, false, 'forward Tab from first Gate action follows ordinary source order');
  assertShadowFocus(harness, safe, 'synthetic first-action Tab does not invent browser default traversal');
  proceed.focus({ preventScroll: true });
  const middleForward = harness.dispatchKey('Tab');
  assert.strictEqual(middleForward.defaultPrevented, false, 'forward Tab from middle Gate action follows ordinary source order');
  assertShadowFocus(harness, proceed, 'synthetic middle-action Tab remains observational only');
  back.focus({ preventScroll: true });
  const forward = harness.dispatchKey('Tab');
  assert.strictEqual(forward.defaultPrevented, true, 'Tab is trapped only while gate is visible');
  assertShadowFocus(harness, safe, 'Tab from last gate control wraps to safe action');
  safe.focus({ preventScroll: true });
  const backward = harness.dispatchKey('Tab', { shiftKey: true });
  assert.strictEqual(backward.defaultPrevented, true);
  assertShadowFocus(harness, back, 'Shift+Tab from first gate control wraps to visible back');

  assert.strictEqual(harness.shell.back(), true);
  assert.strictEqual(harness.host().getAttribute('data-attention'), 'focused');
  assertShadowFocus(harness, trigger, 'Gate back restores the focused trigger');
  const outsideTab = harness.dispatchKey('Tab');
  assert.strictEqual(outsideTab.defaultPrevented, false, 'Tab is not trapped after gate leaves DOM');
  assert.strictEqual(harness.shadow().querySelector('[role="alertdialog"]'), null, 'hidden gate is removed from traversal');
  harness.shell.destroy('gate-semantics');
}

function testLiveRegionCadence(api) {
  const { harness } = mountFixture(api);
  const live = harness.shadow().querySelector('[aria-live="polite"]');
  assert.strictEqual(live.textContent, 'Skopeo on. Ambient view.');
  harness.shell.render('ambient', { announcement: 'First queued announcement' });
  harness.advance(100);
  harness.shell.render('ambient', { announcement: 'Latest queued announcement' });
  assert.strictEqual(live.textContent, 'Skopeo on. Ambient view.', 'nonterminal live text is held during 500ms cadence');
  harness.advance(399);
  assert.strictEqual(live.textContent, 'Skopeo on. Ambient view.');
  harness.advance(1);
  assert.strictEqual(live.textContent, 'Latest queued announcement', '500ms coalescer is latest-wins');

  harness.shell.render('ambient', { announcement: 'Queued ordinary update' });
  harness.shell.render('ambient', { announcement: 'Skopeo error. Nothing was added to the page.', terminal: true });
  assert.strictEqual(live.textContent, 'Skopeo error. Nothing was added to the page.', 'terminal/error announcement bypasses coalescing');
  const destroyed = harness.shell.destroy('live-cadence');
  assert.strictEqual(destroyed.timeouts, 0, 'live-region timeout is cancelled during destroy');
  assert.strictEqual(destroyed.pendingRenders, 0, 'pending live render is released during destroy');
}

function phase53AccessibilityModel(status, contextEpoch, extras = {}) {
  return Object.assign({ status, contextEpoch }, extras);
}

function testPhase53ProjectionAccessibility(api) {
  const { harness, origin } = mountFixture(api);
  const shadow = harness.shadow();
  const live = shadow.querySelector('[aria-live="polite"]');
  const region = shadow.querySelector('.skopeo-ambient');
  const focusCallsBefore = origin._focusCalls.length;
  const exactRows = [
    [phase53AccessibilityModel('recognized', 1, { contextKind: 'configured-corpus' }), 'Skopeo · Corpus context', 'Skopeo verified the corpus context.'],
    [phase53AccessibilityModel('recognized', 2, { contextKind: 'vendor-folder' }), 'Skopeo · Vendor folder', 'Skopeo verified the vendor folder context.'],
    [phase53AccessibilityModel('recognized', 3, { contextKind: 'agreement-reading' }), 'Skopeo · Agreement view', 'Skopeo verified the agreement reading context.'],
    [phase53AccessibilityModel('recognized', 4, { contextKind: 'focused-ask' }), 'Skopeo · Focused ask', 'Skopeo verified the focused ask context.'],
    [phase53AccessibilityModel('uncertain', 5, { reason: 'context-evidence-conflict' }), 'Skopeo can’t verify this context.', 'Skopeo can’t verify this context. The page was left unchanged.'],
    [phase53AccessibilityModel('unsupported', 6, { reason: 'origin-unsupported' }), 'Skopeo doesn’t support this context.', 'Skopeo doesn’t support this context. The page was left unchanged.'],
    [phase53AccessibilityModel('no-target', 7), 'No verified target requested', 'Skopeo is staying ambient because no verified target was requested.']
  ];

  assert.strictEqual(shadow.querySelectorAll('[aria-live]').length, 1, 'Phase 53 starts with the one inherited live region');
  assert.strictEqual(live.getAttribute('aria-live'), 'polite');
  assert.strictEqual(live.getAttribute('aria-atomic'), 'true');
  for (const [model, visible, announcement] of exactRows) {
    assert.strictEqual(harness.shell.projectContext(model), true, model.status + ' projection succeeds');
    assert.strictEqual(shadow.querySelector('.skopeo-lens-label').textContent, visible, model.status + ' exact visible status');
    harness.advance(500);
    assert.strictEqual(live.textContent, announcement, model.status + ' exact polite announcement');
    assert.strictEqual(region.getAttribute('role'), 'region');
    assert.strictEqual(region.getAttribute('aria-label'), 'Skopeo ambient HUD');
    assert.strictEqual(harness.document.activeElement, origin, model.status + ' does not move host focus');
    assert.strictEqual(shadow.activeElement, null, model.status + ' creates no Shadow focus');
    assertAbsent(shadow, ['anchor', 'chip', 'halo', 'ghost', 'gate']);
    assert.strictEqual(shadow.querySelector('[role="alert"]'), null, model.status + ' is not an alert');
    assert.strictEqual(shadow.querySelector('[role="dialog"]'), null, model.status + ' is not a dialog');
    assert.strictEqual(shadow.querySelector('[role="alertdialog"]'), null, model.status + ' is not an alertdialog');
    assert.strictEqual(shadow.querySelector('[aria-modal="true"]'), null, model.status + ' is not modal');
  }

  assert.strictEqual(harness.shell.projectContext({
    status: 'recognized', contextKind: 'agreement-reading', contextEpoch: 8
  }), true);
  harness.advance(500);
  const recognizedAnnouncement = live.textContent;
  assert.strictEqual(harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation,
    contextEpoch: 8,
    semanticIdentity: { kind: 'docs-document', id: 'document-accessibility-secret' },
    bindingEpoch: 1,
    targetRect: { left: 200, top: 200, width: 80, height: 40 }
  }), true);
  const mark = shadow.querySelector('.skopeo-semantic-anchor');
  assert.ok(mark, 'certified target exposes one visible mark');
  assert.strictEqual(mark.localName, 'span', 'semantic mark is noninteractive markup');
  assert.strictEqual(mark.getAttribute('aria-hidden'), 'true');
  assert.strictEqual(mark.getAttribute('tabindex'), null);
  assert.strictEqual(mark.getAttribute('role'), null);
  assert.strictEqual(mark.style.pointerEvents, 'none');
  assert.strictEqual(region.getAttribute('aria-label'), 'Skopeo anchored HUD');
  assert.strictEqual(shadow.querySelectorAll('[aria-live]').length, 1, 'anchoring creates no second live region');
  assert.strictEqual(harness.document.activeElement, origin, 'anchoring does not move host focus');
  assert.strictEqual(origin._focusCalls.length, focusCallsBefore, 'projection paths perform no focus write');

  assert.strictEqual(harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation,
    contextEpoch: 8,
    semanticIdentity: { kind: 'docs-document', id: 'document-accessibility-secret' },
    bindingEpoch: 1,
    targetRect: { left: 300, top: 260, width: 80, height: 40 }
  }), true);
  harness.advance(500);
  assert.strictEqual(live.textContent, recognizedAnnouncement, 'same-identity geometry churn is not announced');

  assert.strictEqual(harness.shell.withdrawSemanticAnchor({
    contextEpoch: 8,
    bindingEpoch: 2,
    reason: 'geometry-unsafe'
  }), true);
  assert.strictEqual(mark.isConnected, false, 'withdrawn mark is synchronously removed, not opacity-hidden');
  assertAbsent(shadow, ['anchor', 'chip', 'halo', 'ghost', 'gate']);
  assert.strictEqual(region.getAttribute('aria-label'), 'Skopeo ambient HUD');
  assert.strictEqual(shadow.querySelector('.skopeo-lens-label').textContent, 'Skopeo can’t verify this target.');
  assert.strictEqual(live.textContent, recognizedAnnouncement, 'visual/accessibility removal precedes polite cadence');
  harness.advance(500);
  assert.strictEqual(live.textContent, 'Skopeo removed the annotation because it could not verify the target.');
  assert.strictEqual(harness.document.activeElement, origin, 'withdrawal preserves host focus');
  assert.strictEqual(origin._focusCalls.length, focusCallsBefore, 'withdrawal performs no focus write');
  assert.strictEqual(shadow.querySelectorAll('[aria-live]').length, 1, 'withdrawal keeps exactly one live region');
  assert.strictEqual(shadow.querySelector('[role="alert"]'), null);
  assert.strictEqual(shadow.querySelector('[role="dialog"]'), null);
  assert.strictEqual(shadow.querySelector('[role="alertdialog"]'), null);
  assert.strictEqual(shadow.querySelector('[aria-modal="true"]'), null);
  harness.shell.destroy('phase53-accessibility');
}

function testEscapeBoundary(api) {
  const { harness } = mountFixture(api);
  harness.shell.enableControlledFixture(harness.fixtureToken);
  harness.shell.render('anchored', {});
  harness.shadow().querySelector('[aria-label="Open anchor mark demo"]').focus({ preventScroll: true });
  harness.shell.render('focused', {});
  assert.strictEqual(harness.window.listenerCount('keydown'), 1, 'shell installs one global keydown listener, not a second kill listener');

  const repeated = harness.dispatchKey('Escape', { repeat: true });
  assert.strictEqual(repeated.defaultPrevented, false, 'repeated Escape is ignored');
  const composing = harness.dispatchKey('Escape', { isComposing: true });
  assert.strictEqual(composing.defaultPrevented, false, 'composing Escape is ignored');
  assert.strictEqual(harness.calls.escape.length, 0);

  const first = harness.dispatchKey('Escape');
  assert.strictEqual(first.defaultPrevented, true, 'applicable Escape is consumed');
  assert.strictEqual(first.propagationStopped, true, 'only the consumed Skopeo Escape stops propagation');
  assert.strictEqual(harness.host().getAttribute('data-attention'), 'anchored', 'first Escape backs one level');
  assert.strictEqual(harness.calls.escape.length, 1);
  assert.deepStrictEqual(
    { from: harness.calls.escape[0].from, to: harness.calls.escape[0].to },
    { from: 'focused', to: 'anchored' }
  );
  assert.strictEqual(typeof harness.calls.escape[0].timestamp, 'number');
  assert.strictEqual(harness.calls.kill.length, 0, 'first Escape does not locally kill');

  harness.advance(100);
  const second = harness.dispatchKey('Escape');
  assert.strictEqual(second.defaultPrevented, true);
  assert.strictEqual(harness.calls.kill.length, 1, 'second non-repeated Escape inside 600ms reports kill to runtime owner');
  assert.strictEqual(harness.calls.kill[0].reason, 'escape-double');
  assert.strictEqual(harness.calls.kill[0].state, 'anchored');
  assert.strictEqual(harness.host().getAttribute('data-attention'), 'anchored', 'shell does not race runtime by backing again on double Escape');

  const unrelated = harness.dispatchKey('Enter');
  assert.strictEqual(unrelated.defaultPrevented, false, 'unrelated host key is never suppressed');
  harness.shell.destroy('escape-boundary');
  assert.strictEqual(harness.window.listenerCount('keydown'), 0, 'destroy removes exact keyboard listener');
}

function testEscapeWindowExpiry(api) {
  const { harness } = mountFixture(api);
  harness.shell.enableControlledFixture(harness.fixtureToken);
  harness.shell.render('anchored', {});
  harness.shell.render('focused', {});
  harness.dispatchKey('Escape');
  harness.advance(601);
  harness.dispatchKey('Escape');
  assert.strictEqual(harness.calls.kill.length, 0, 'Escape after 600ms is a new one-level back, not a kill');
  assert.strictEqual(harness.host().getAttribute('data-attention'), 'ambient');
  harness.shell.destroy('escape-expiry');
}

function testFocusRestorationAndFallback(api) {
  const { harness, origin } = mountFixture(api);
  harness.shell.enableControlledFixture(harness.fixtureToken);
  harness.shell.render('anchored', {});
  const anchor = harness.shadow().querySelector('[aria-label="Open anchor mark demo"]');
  origin.focus({ preventScroll: true });
  harness.shell.render('focused', {});
  assertShadowFocus(harness, harness.shadow().querySelector('.skopeo-focused-title'), 'Focused destroy setup');
  harness.shell.destroy('focus-origin');
  assert.strictEqual(harness.document.activeElement, origin, 'destroy restores eligible host origin');
  assert.deepStrictEqual(origin._focusCalls.at(-1), { preventScroll: true });
  assert.strictEqual(harness.window.scrollX, 0);
  assert.strictEqual(harness.window.scrollY, 0);

  const detached = mountFixture(api).harness;
  const detachedOrigin = detached.document.querySelector('#host-origin');
  detached.shell.enableControlledFixture(detached.fixtureToken);
  detached.shell.render('anchored', {});
  const detachedAnchor = detached.shadow().querySelector('[aria-label="Open anchor mark demo"]');
  detachedOrigin.focus({ preventScroll: true });
  detached.shell.render('focused', {});
  detachedOrigin.remove();
  detached.shell.destroy('detached-origin');
  assert.notStrictEqual(detached.document.activeElement, detachedOrigin, 'detached origin is never focused');
  assert.notStrictEqual(detached.document.activeElement, detached.document.body, 'fallback never forces focus to body');
  assert.ok(detached.document.activeElement === detachedAnchor || detached.document.activeElement === null, 'fallback is preceding shell trigger or no forced focus');

  const disabled = mountFixture(api).harness;
  const disabledOrigin = disabled.document.querySelector('#host-origin');
  disabled.shell.enableControlledFixture(disabled.fixtureToken);
  disabled.shell.render('anchored', {});
  disabledOrigin.focus({ preventScroll: true });
  disabled.shell.render('focused', {});
  disabledOrigin.disabled = true;
  disabledOrigin.setAttribute('disabled', '');
  disabled.shell.destroy('disabled-origin');
  assert.notStrictEqual(disabled.document.activeElement, disabledOrigin, 'disabled origin is never restored');
  assert.notStrictEqual(disabled.document.activeElement, disabled.document.body);
}

function testFailedFocusPostconditionUsesFallback(api) {
  const { harness } = mountFixture(api);
  harness.shell.enableControlledFixture(harness.fixtureToken);
  harness.shell.render('anchored', {});
  const anchor = harness.shadow().querySelector('[aria-label="Open anchor mark demo"]');
  anchor.focus({ preventScroll: true });
  harness.shell.render('focused', {});
  const trigger = harness.shadow().querySelector('[aria-label="Open consequence preview"]');
  trigger.focus({ preventScroll: true });
  harness.shell.render('interstitial', {});

  trigger.focus = function (options) {
    this._focusCalls.push(options || null);
  };
  assert.strictEqual(harness.shell.back(), true, 'Gate back restores its preceding surface');
  const fallback = harness.shadow().querySelector('[aria-label="Back to anchored view"]');
  assertShadowFocus(harness, fallback, 'nonthrowing failed origin focus executes the declared fallback');
  assert.notStrictEqual(harness.document.activeElement, harness.document.body, 'failed focus postcondition never forces body');
  harness.shell.destroy('failed-focus-postcondition');
}

function testExactCopyAndStyles() {
  const sourcePath = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-shell.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const exactCopy = [
    'Skopeo · Ambient',
    'Turn off Skopeo',
    'Anchor demo',
    'Example entity · 1 note',
    'Anomaly demo · unusual change',
    'Focused Skopeo demo',
    'This controlled preview demonstrates temporary ghosting. It does not read or change the page.',
    'No page context available',
    'Skopeo will stay in ambient mode and leave the page unchanged.',
    'Skopeo can’t open this view without covering the current page control.',
    'Back to ambient Skopeo',
    'Back to anchored view',
    'Back to focused view',
    'Demo only',
    'Consequence preview',
    'Continuing closes this preview. Skopeo will not act on the page.',
    'Return to focused demo',
    'Continue demo',
    'Skopeo · Corpus context',
    'Skopeo verified the corpus context.',
    'Skopeo · Vendor folder',
    'Skopeo verified the vendor folder context.',
    'Skopeo · Agreement view',
    'Skopeo verified the agreement reading context.',
    'Skopeo · Focused ask',
    'Skopeo verified the focused ask context.',
    'Skopeo can’t verify this context.',
    'Skopeo can’t verify this context. The page was left unchanged.',
    'Skopeo doesn’t support this context.',
    'Skopeo doesn’t support this context. The page was left unchanged.',
    'Skopeo can’t verify this target.',
    'Skopeo removed the annotation because it could not verify the target.',
    'No verified target requested',
    'Skopeo is staying ambient because no verified target was requested.'
  ];
  for (const copy of exactCopy) assert.ok(source.includes(copy), `exact UI-SPEC copy present: ${copy}`);

  assert.ok(/:focus-visible\s*\{[^}]*outline:\s*2px solid #ff6b35;[^}]*outline-offset:\s*2px;/s.test(source), 'focus-visible is a 2px orange outline with 2px offset');
  assert.ok(source.includes('@media (forced-colors: active)'), 'forced-colors rule exists');
  for (const systemColor of ['Canvas', 'CanvasText', 'ButtonFace', 'ButtonText', 'Highlight']) {
    assert.ok(source.includes(systemColor), `forced-colors uses ${systemColor}`);
  }
  assert.ok(source.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion rule exists');
  assert.ok(/prefers-reduced-motion:[^)]+\)[\s\S]*transition-duration:\s*0ms/.test(source), 'reduced motion sets transition duration to zero');
  assert.ok(/prefers-reduced-motion:[^)]+\)[\s\S]*animation-duration:\s*0ms/.test(source), 'reduced motion sets animation duration to zero');
  assert.ok(source.includes('@media (max-width: 479px)'), 'narrow viewport reflow starts below 480 CSS px');
  assert.ok(source.includes('max-width: calc(100vw - 32px)'), 'surfaces remain within zoomed viewport width');
  assert.ok(source.includes('max-height: calc(100dvh - 32px)'), 'focused/gate surfaces reflow within viewport height');
  assert.ok(source.includes('flex-direction: column'), 'narrow gate actions stack vertically');
  assert.ok(source.includes('120ms'), 'entry/reposition timing is 120ms');
  assert.ok(/\.skopeo-semantic-anchor\s*\{[^}]*transition:\s*opacity 120ms ease-out;/s.test(source), 'fresh semantic mark entry is opacity-only');
  assert.strictEqual(/\.skopeo-semantic-anchor\s*\{[^}]*transition:[^;]*(?:top|left|right|bottom|transform)/s.test(source), false, 'semantic mark has no positional transition');
  assert.ok(/forced-colors:[^)]+\)[\s\S]*\.skopeo-semantic-anchor[\s\S]*Highlight/.test(source), 'forced colors preserves semantic anchor keyline');
  assert.strictEqual(/animation:\s*skopeo-halo-bloom|@keyframes skopeo-halo-bloom/.test(source), false, 'static halo has no untracked CSS animation');
  assert.ok(/\.skopeo-halo\s*\{[^}]*border:[^}]*box-shadow:[^}]*pointer-events:\s*none;/s.test(source), 'labelled halo remains a static visual primitive');
  assert.strictEqual(/animation[^;]*infinite/.test(source), false, 'shell contains no endless animation');

  const sizes = Array.from(source.matchAll(/font-size:\s*(\d+)px/g), match => Number(match[1]));
  assert.ok(sizes.length >= 4, 'all four declared type sizes are used');
  assert.deepStrictEqual(Array.from(new Set(sizes)).sort((a, b) => a - b), [11, 12, 14, 16], 'no undeclared font size exists');
  const weights = Array.from(source.matchAll(/font-weight:\s*(\d+)/g), match => Number(match[1]));
  assert.ok(weights.every(weight => weight === 400 || weight === 700), 'only weights 400 and 700 are used');
  for (const color of ['#0d0a09', '#1a1513', '#26201d', '#ff6b35', '#f6efe9', '#d2c1b4', '#a99283', '#dc2626', '#fca5a5']) {
    assert.ok(source.includes(color), `approved color token present: ${color}`);
  }
}

function runProductionContract(api) {
  testAmbientSemantics(api);
  testPhase53ProjectionAccessibility(api);
  testAnchoredSemantics(api);
  testFocusedSemanticsAndOrder(api);
  testInterstitialSemanticsAndTrap(api);
  testLiveRegionCadence(api);
  testEscapeBoundary(api);
  testEscapeWindowExpiry(api);
  testFocusRestorationAndFallback(api);
  testFailedFocusPostconditionUsesFallback(api);
  testExactCopyAndStyles();
  console.log('skopeo-accessibility: PASS');
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) runSelfTest();
  else runProductionContract(loadProductionApi());
}

module.exports = { runSelfTest, runProductionContract };
