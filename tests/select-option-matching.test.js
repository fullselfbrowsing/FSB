'use strict';

// select_option: which option a request names, and what the tool reports.
//
// MCP hosts and the autopilot have one parameter for the option, `value`, and
// usually fill it with the text they can see. When a select's option values
// differ from their text (<option value="3">5-9</option>), assigning that
// text to select.value matches nothing: the select went blank and the tool
// still answered success.
//
// Loads the real option resolution, the real verification utilities and the
// real selectOption tool from extension/content/actions.js into a vm context
// with a stand-in select, and checks that:
//   - a request resolves by option value, then visible text, then text or
//     label with letter case ignored, the last only when one option matches;
//   - a request that names no single option changes nothing, sends no event
//     and lists what the select offers;
//   - success is reported only when the select holds the chosen option after
//     the page settled, with that option's text and value;
//   - the index and text parameters, and a list of fallback selectors, work.
//
// Node 20 compatible; binds no port.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const actionsSource = fs.readFileSync(path.join(repoRoot, 'extension/content/actions.js'), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = actionsSource.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = actionsSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return actionsSource.slice(start, end);
}

const verificationSource = sliceBetween('// ACTION VERIFICATION UTILITIES', 'function diagnoseElementFailure(');
const resolutionSource = sliceBetween('// SELECT OPTION RESOLUTION', '// STABILITY PROFILES');
const toolSource = sliceBetween('  selectOption: async (params) => {', '  // Check/uncheck checkbox or radio with verification');

// A stand-in for a native select. Assigning to value or selectedIndex behaves
// as the DOM does: a value no option has, or a position outside the list,
// leaves nothing selected (selectedIndex -1).
function makeSelect(specs, { selectedIndex = 0, multiple = false } = {}) {
  const chosen = new Set(selectedIndex >= 0 ? [selectedIndex] : []);
  const select = {
    tagName: 'SELECT',
    multiple,
    isConnected: true,
    className: '',
    innerText: '',
    events: [],
    valueWrites: [],
    getAttribute: () => null,
  };
  select.options = specs.map((spec, index) => {
    const option = {
      text: spec.text,
      value: spec.value !== undefined ? spec.value : spec.text,
      label: spec.label !== undefined ? spec.label : spec.text,
    };
    Object.defineProperty(option, 'selected', {
      get: () => chosen.has(index),
      set: (on) => {
        if (!multiple) chosen.clear();
        if (on) chosen.add(index); else chosen.delete(index);
      },
    });
    return option;
  });
  Object.defineProperty(select, 'selectedIndex', {
    get: () => (chosen.size > 0 ? Math.min(...chosen) : -1),
    set: (index) => {
      chosen.clear();
      if (Number.isInteger(index) && index >= 0 && index < select.options.length) chosen.add(index);
    },
  });
  Object.defineProperty(select, 'value', {
    get: () => (select.selectedIndex >= 0 ? select.options[select.selectedIndex].value : ''),
    set: (value) => {
      select.valueWrites.push(value);
      select.selectedIndex = select.options.findIndex((option) => option.value === String(value));
    },
  });
  select.dispatchEvent = (event) => { select.events.push(event.type); return true; };
  return select;
}

// The select the defect was reported on.
const AGE_OPTIONS = [
  { value: '0', text: 'Select an option' },
  { value: '1', text: '0-1' },
  { value: '2', text: '2-4' },
  { value: '3', text: '5-9' },
  { value: '4', text: '10+' },
];

// One content-script context per test. `page` maps selectors to elements;
// `afterChange` runs while the tool waits for the page to settle, which is
// where a page's own change handler would act.
function load({ page = {}, readiness = { ready: true, scrolled: false }, afterChange = null } = {}) {
  const calls = { readiness: 0, settles: 0, records: [] };
  const sandbox = {
    window: { location: { href: 'https://forms.example.test/form' } },
    document: {
      body: { innerText: 'stable page text' },
      activeElement: { tagName: 'BODY' },
      querySelector: () => null,
      querySelectorAll: () => ({ length: 40 }),
    },
    FSB: {
      getClassName: (el) => (el && typeof el.className === 'string' ? el.className : ''),
      querySelectorWithShadow: (selector) => page[selector] || null,
      smartEnsureReady: async () => { calls.readiness += 1; return readiness; },
    },
    Event: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    CSS: { escape: (value) => String(value) },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    waitForPageStability: async () => { calls.settles += 1; if (afterChange) afterChange(); },
    actionRecorder: { record: (id, tool, params, data) => { calls.records.push(data); } },
    captureElementDetails: () => ({}),
    generateDiagnostic: () => null,
    buildFailureReport: (action, selector, element, error) => ({ success: false, action, error, reason: error }),
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${verificationSource}\n${resolutionSource}\n`
      + `globalThis.__select = { resolveSelectOption, selectOption: ({${toolSource}}).selectOption };`,
    sandbox,
    { filename: 'actions.js#selectOption' }
  );
  return { ...sandbox.__select, calls, page };
}

function ageForm(options) {
  const select = makeSelect(AGE_OPTIONS, options);
  return { select, ...load({ page: { '#select-menu': select } }) };
}

// A refusal leaves the select as it was and tells the page nothing.
function assertUntouched(select, selectedIndex) {
  assert.equal(select.selectedIndex, selectedIndex, 'the selection is unchanged');
  assert.deepEqual(select.events, [], 'no event was sent');
  assert.deepEqual(select.valueWrites, [], 'select.value was never assigned');
}

test('an option value selects that option and reports its text and value', async () => {
  const { select, selectOption } = ageForm();
  const result = await selectOption({ selector: '#select-menu', value: '3' });
  assert.equal(result.success, true, result.error);
  assert.equal(select.selectedIndex, 3);
  assert.equal(result.selected, '5-9');
  assert.equal(result.selectedValue, '3');
  assert.equal(result.matchedBy, 'value');
  assert.equal(result.hadEffect, true);
  assert.equal(result.verification.verified, true);
  assert.deepEqual(select.events, ['change'], 'one change event, as before');
});

test('visible text selects the option when the values differ from the text', async () => {
  const { select, selectOption } = ageForm();
  const result = await selectOption({ selector: '#select-menu', value: '5-9' });
  assert.equal(result.success, true, result.error);
  assert.equal(select.selectedIndex, 3);
  assert.equal(select.value, '3');
  assert.equal(result.selected, '5-9');
  assert.equal(result.selectedValue, '3');
  assert.equal(result.matchedBy, 'text');
  assert.deepEqual(select.events, ['change']);
});

test('the reported failure: text passed as value no longer blanks the select', async () => {
  // What the tool used to do: assign the request to select.value. No option
  // has the value "5-9", so the select ends with nothing selected.
  const before = makeSelect(AGE_OPTIONS);
  before.value = '5-9';
  assert.equal(before.selectedIndex, -1, 'the stand-in blanks like the DOM does');

  for (const text of ['0-1', '2-4', '5-9', '10+']) {
    const { select, selectOption } = ageForm();
    const result = await selectOption({ selector: '#select-menu', value: text });
    assert.equal(result.success, true, result.error);
    assert.notEqual(select.selectedIndex, -1, 'never blank');
    assert.equal(select.options[select.selectedIndex].text, text);
    assert.equal(result.selected, text);
    assert.deepEqual(select.valueWrites, [], 'the request is never assigned to select.value');
  }
});

test('an option value wins over another option with that text', async () => {
  const select = makeSelect([{ value: '2', text: '1' }, { value: '1', text: '2' }, { value: '0', text: 'none' }], { selectedIndex: 2 });
  const { selectOption } = load({ page: { '#rank': select } });
  const result = await selectOption({ selector: '#rank', value: '1' });
  assert.equal(result.success, true, result.error);
  assert.equal(select.selectedIndex, 1);
  assert.equal(result.selected, '2');
  assert.equal(result.selectedValue, '1');
});

test('text compares trimmed and with whitespace collapsed', async () => {
  const select = makeSelect([{ value: '', text: 'Choose' }, { value: 'ny', text: 'New York' }, { value: 'sf', text: 'San   Francisco' }]);
  const { selectOption } = load({ page: { '#city': select } });
  const first = await selectOption({ selector: '#city', value: '  New York ' });
  assert.equal(first.success, true, first.error);
  assert.equal(select.selectedIndex, 1);
  assert.equal(first.selected, 'New York');
  const second = await selectOption({ selector: '#city', value: 'San Francisco' });
  assert.equal(second.success, true, second.error);
  assert.equal(select.selectedIndex, 2);
});

test('text that differs only in letter case selects the one option it matches', async () => {
  const { select, selectOption } = ageForm({ selectedIndex: 2 });
  const result = await selectOption({ selector: '#select-menu', value: 'select AN option' });
  assert.equal(result.success, true, result.error);
  assert.equal(select.selectedIndex, 0);
  assert.equal(result.selected, 'Select an option');
  assert.equal(result.selectedValue, '0');
  assert.equal(result.matchedBy, 'text-ignoring-case');
});

test('a label attribute matches with letter case ignored when it is the only match', async () => {
  const select = makeSelect([{ value: '', text: 'State' }, { value: 'ca', text: 'CA', label: 'California' }, { value: 'co', text: 'CO', label: 'Colorado' }]);
  const { selectOption } = load({ page: { '#state': select } });
  const result = await selectOption({ selector: '#state', value: 'california' });
  assert.equal(result.success, true, result.error);
  assert.equal(select.selectedIndex, 1);
  assert.equal(result.selectedValue, 'ca');
});

test('a letter-case match on several options is refused and changes nothing', async () => {
  const select = makeSelect([{ value: '', text: 'Size' }, { value: 's1', text: 'Small' }, { value: 's2', text: 'SMALL' }, { value: 'l', text: 'Large' }], { selectedIndex: 3 });
  const { selectOption, calls } = load({ page: { '#size': select } });
  const result = await selectOption({ selector: '#size', value: 'small' });
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'OPTION_AMBIGUOUS');
  assert.equal(result.mayHaveExecuted, false);
  assert.match(result.error, /matches 2 options/);
  assert.match(result.error, /"Small" \(value "s1"\), "SMALL" \(value "s2"\)/);
  assert.match(result.error, /Nothing was changed/);
  assertUntouched(select, 3);
  assert.equal(calls.readiness, 0, 'the page is not scrolled for a refused request');

  // The exact text, or the value, still picks one of them.
  const exact = await selectOption({ selector: '#size', value: 'SMALL' });
  assert.equal(exact.success, true, exact.error);
  assert.equal(select.selectedIndex, 2);
});

test('a request no option matches is refused, lists the options and leaves the select alone', async () => {
  const { select, selectOption, calls } = ageForm({ selectedIndex: 2 });
  const result = await selectOption({ selector: '#select-menu', value: '5 to 9' });
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'OPTION_NOT_FOUND');
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mayHaveExecuted, false);
  assert.equal(result.selector, '#select-menu');
  assert.match(result.error, /No option matches "5 to 9"/);
  assert.match(result.error, /Nothing was changed/);
  assert.ok(result.error.includes('Available options (5): "Select an option", "0-1", "2-4", "5-9", "10+".'), result.error);
  assertUntouched(select, 2);
  assert.equal(calls.readiness, 0);
  assert.equal(calls.settles, 0);
  assert.equal(calls.records.length, 1);
  assert.equal(calls.records[0].success, false);
});

test('a refusal never reads as a missing element or a timeout to the MCP error mapper', async () => {
  // The MCP server classifies a failure by these substrings of its message;
  // any of them would replace the option list with unrelated advice.
  const { selectOption } = ageForm();
  const refusals = [
    await selectOption({ selector: '#select-menu', value: 'eleven' }),
    await selectOption({ selector: '#select-menu', index: 9 }),
    await selectOption({ selector: '#select-menu' }),
  ];
  for (const refusal of refusals) {
    assert.equal(refusal.success, false);
    assert.doesNotMatch(refusal.error, /not found|no tab|timeout|timed out|stale/i);
  }
});

test('a long option list is capped at twelve and the rest are counted', async () => {
  const specs = Array.from({ length: 15 }, (_, index) => ({ value: String(index), text: `Team ${index + 1}` }));
  const select = makeSelect(specs);
  const { selectOption } = load({ page: { '#team': select } });
  const result = await selectOption({ selector: '#team', value: 'Team 99' });
  assert.equal(result.success, false);
  assert.match(result.error, /Available options \(15\): /);
  assert.ok(result.error.includes('"Team 12", and 3 more.'), result.error);
  assert.equal(result.error.includes('"Team 13"'), false);
  assertUntouched(select, 0);
});

test('a very long option text is shortened in the list', async () => {
  const select = makeSelect([{ value: 'a', text: 'A'.repeat(300) }, { value: 'b', text: 'Short' }]);
  const { selectOption } = load({ page: { '#long': select } });
  const result = await selectOption({ selector: '#long', value: 'missing' });
  assert.ok(result.error.includes(`"${'A'.repeat(80)}..."`), 'clipped to 80 characters');
  assert.ok(result.error.length < 400, `message stays short (${result.error.length})`);
});

test('an index selects that position and one outside the list is refused', async () => {
  const { select, selectOption } = ageForm();
  const byIndex = await selectOption({ selector: '#select-menu', index: 4 });
  assert.equal(byIndex.success, true, byIndex.error);
  assert.equal(select.selectedIndex, 4);
  assert.equal(byIndex.selected, '10+');
  assert.equal(byIndex.selectedValue, '4');
  assert.equal(byIndex.matchedBy, 'index');

  for (const index of [5, 99, -1, 1.5, 'two', NaN]) {
    const fresh = ageForm({ selectedIndex: 1 });
    const result = await fresh.selectOption({ selector: '#select-menu', index });
    assert.equal(result.success, false, `index ${String(index)}`);
    assert.equal(result.errorCode, 'OPTION_NOT_FOUND');
    assert.match(result.error, /this select has 5 options \(positions 0 to 4\)/);
    assertUntouched(fresh.select, 1);
  }

  const numeric = ageForm();
  assert.equal((await numeric.selectOption({ selector: '#select-menu', index: '2' })).success, true);
  assert.equal(numeric.select.selectedIndex, 2);
});

test('the text parameter matches visible text and is refused when nothing matches', async () => {
  const { select, selectOption } = ageForm();
  const result = await selectOption({ selector: '#select-menu', text: '2-4' });
  assert.equal(result.success, true, result.error);
  assert.equal(select.selectedIndex, 2);
  assert.equal(result.selectedValue, '2');

  // A text request is not tried as an option value.
  const asValue = ageForm({ selectedIndex: 4 });
  const refused = await asValue.selectOption({ selector: '#select-menu', text: '3' });
  assert.equal(refused.success, false);
  assert.equal(refused.errorCode, 'OPTION_NOT_FOUND');
  assertUntouched(asValue.select, 4);
});

test('a text request adds to a multiple select; a value request replaces its selection', async () => {
  const specs = [{ value: 'r', text: 'Red' }, { value: 'g', text: 'Green' }, { value: 'b', text: 'Blue' }];
  const added = makeSelect(specs, { multiple: true });
  const first = load({ page: { '#colors': added } });
  const addResult = await first.selectOption({ selector: '#colors', text: 'Blue' });
  assert.equal(addResult.success, true, addResult.error);
  assert.deepEqual(added.options.map((option) => option.selected), [true, false, true]);

  const replaced = makeSelect(specs, { multiple: true });
  const second = load({ page: { '#colors': replaced } });
  const replaceResult = await second.selectOption({ selector: '#colors', value: 'Blue' });
  assert.equal(replaceResult.success, true, replaceResult.error);
  assert.deepEqual(replaced.options.map((option) => option.selected), [false, false, true]);
});

test('a request with no option named is refused', async () => {
  const { select, selectOption } = ageForm({ selectedIndex: 3 });
  for (const params of [{ selector: '#select-menu' }, { selector: '#select-menu', value: null }]) {
    const result = await selectOption(params);
    assert.equal(result.success, false);
    assert.match(result.error, /No option was named/);
    assert.match(result.error, /Available options \(5\)/);
  }
  assertUntouched(select, 3);
});

test('an option that is already selected succeeds without a change event', async () => {
  const { select, selectOption, calls } = ageForm({ selectedIndex: 3 });
  const result = await selectOption({ selector: '#select-menu', value: '5-9' });
  assert.equal(result.success, true, result.error);
  assert.equal(result.alreadyInState, true);
  assert.equal(result.selected, '5-9');
  assert.equal(result.selectedValue, '3');
  assert.equal(select.selectedIndex, 3);
  assert.deepEqual(select.events, []);
  assert.equal(calls.settles, 0);
});

test('options that share a value are told apart by their text', async () => {
  const select = makeSelect([{ value: 'x', text: 'Morning' }, { value: 'x', text: 'Evening' }]);
  const { selectOption } = load({ page: { '#slot': select } });
  const result = await selectOption({ selector: '#slot', value: 'Evening' });
  assert.equal(result.success, true, result.error);
  assert.equal(select.selectedIndex, 1);
  assert.equal(result.selected, 'Evening');
  assert.equal(result.verification.verified, true);
});

test('success is not reported when the page puts the select back', async () => {
  const select = makeSelect(AGE_OPTIONS);
  const { selectOption } = load({ page: { '#select-menu': select }, afterChange: () => { select.selectedIndex = 0; } });
  const result = await selectOption({ selector: '#select-menu', value: '5-9' });
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'OPTION_NOT_KEPT');
  assert.match(result.error, /did not keep it\. It now shows "Select an option"\./);
  assert.deepEqual(select.events, ['change']);
});

test('success is not reported when the page leaves the select blank', async () => {
  const select = makeSelect(AGE_OPTIONS);
  const { selectOption } = load({ page: { '#select-menu': select }, afterChange: () => { select.selectedIndex = -1; } });
  const result = await selectOption({ selector: '#select-menu', value: '3' });
  assert.equal(result.success, false);
  assert.match(result.error, /It now shows no option\./);
});

test('a select the page replaced is judged by the replacement', async () => {
  const original = makeSelect(AGE_OPTIONS);
  const page = { '#select-menu': original };
  const kept = load({ page, afterChange: () => { original.isConnected = false; page['#select-menu'] = makeSelect(AGE_OPTIONS, { selectedIndex: 3 }); } });
  const keptResult = await kept.selectOption({ selector: '#select-menu', value: '5-9' });
  assert.equal(keptResult.success, true, keptResult.error);
  assert.equal(keptResult.selected, '5-9');

  const first = makeSelect(AGE_OPTIONS);
  const resetPage = { '#select-menu': first };
  const reset = load({ page: resetPage, afterChange: () => { first.isConnected = false; resetPage['#select-menu'] = makeSelect(AGE_OPTIONS); } });
  const resetResult = await reset.selectOption({ selector: '#select-menu', value: '5-9' });
  assert.equal(resetResult.success, false);
  assert.equal(resetResult.errorCode, 'OPTION_NOT_KEPT');
});

test('a select that leaves the page after the change reports an unknown outcome', async () => {
  const select = makeSelect(AGE_OPTIONS);
  const page = { '#select-menu': select };
  const { selectOption } = load({ page, afterChange: () => { select.isConnected = false; delete page['#select-menu']; } });
  const result = await selectOption({ selector: '#select-menu', value: '5-9' });
  assert.equal(result.success, false);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.mayHaveExecuted, true);
  assert.match(result.error, /left the page/);
});

test('a target that is missing or not a select fails as before', async () => {
  const { selectOption } = load({ page: { '#name': { tagName: 'INPUT', isConnected: true } } });
  for (const selector of ['#missing', '#name']) {
    const result = await selectOption({ selector, value: 'x' });
    assert.equal(result.success, false);
    assert.equal(result.error, `Select element not found with selector: ${selector}`);
  }
});

test('a select that is not ready is not changed', async () => {
  const select = makeSelect(AGE_OPTIONS);
  const { selectOption } = load({ page: { '#select-menu': select }, readiness: { ready: false, failureReason: 'obscured by overlay' } });
  const result = await selectOption({ selector: '#select-menu', value: '5-9' });
  assert.equal(result.success, false);
  assert.equal(result.error, 'Element not ready: obscured by overlay');
  assertUntouched(select, 0);
});

test('fallback selectors still reach the select', async () => {
  const select = makeSelect(AGE_OPTIONS);
  const { selectOption } = load({ page: { 'select[name="age"]': select } });
  const result = await selectOption({ selectors: ['#gone', 'select[name="age"]'], value: '10+' });
  assert.equal(result.success, true, result.error);
  assert.equal(result.selector, 'select[name="age"]');
  assert.equal(result.selectorIndex, 1);
  assert.equal(result.usedFallback, true);
  assert.equal(select.selectedIndex, 4);
});

test('a non-string value is compared as text', async () => {
  const { select, selectOption } = ageForm();
  const result = await selectOption({ selector: '#select-menu', value: 4 });
  assert.equal(result.success, true, result.error);
  assert.equal(select.selectedIndex, 4);
  assert.equal(result.matchedBy, 'value');
});

test('resolving an option does not touch the select', () => {
  const { select, resolveSelectOption } = ageForm({ selectedIndex: 1 });
  const found = resolveSelectOption(select, { value: '10+' });
  assert.equal(found.choice.index, 4);
  assert.equal(found.choice.value, '4');
  assert.equal(found.requestedBy, 'value');
  assert.equal(resolveSelectOption(select, { value: 'nope' }).choice, undefined);
  assertUntouched(select, 1);

  const empty = resolveSelectOption(makeSelect([], { selectedIndex: -1 }), { value: 'x' });
  assert.equal(empty.errorCode, 'OPTION_NOT_FOUND');
  assert.match(empty.error, /This select has no options\./);
});
