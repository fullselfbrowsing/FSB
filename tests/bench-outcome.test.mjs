// Phase 66 claim-blind outcome evaluation (D-17): success comes only from the
// request log, final URL, DOM markers and live-page text, never from what the
// agent or FSB claims.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHECK_KINDS,
  evaluateOutcome,
  normalizeFinalUrl,
  stripRunPrefix,
} from '../scripts/bench/lib/outcome.mjs';

const TOKEN = 'tok12345';
const PAGE_TEXT = 'Quarterly ledger: invoice INV-2291 is overdue by 41 days';

function coreTask(checks) {
  return { id: 'core-sample', version: 1, set: 'core', success: { all: checks } };
}

function liveTask(checks) {
  return { id: 'live-sample', version: 1, set: 'live', success: { all: checks } };
}

function coreEvidence(overrides = {}) {
  return {
    requests: [
      { t: 1, method: 'GET', path: '/fixtures/checklist/index.html', query: {}, bodyType: 'none', body: null },
      {
        t: 2,
        method: 'POST',
        path: '/api/checklist/save',
        query: {},
        bodyType: 'json',
        body: { checked: ['alpha', 'delta'], meta: { by: 'bench-client', at: 3 } },
      },
    ],
    finalUrl: `http://127.0.0.1:5000/r/${TOKEN}/fixtures/checklist/saved.html?view=done&tab=2`,
    markers: { 'saved-count': '2' },
    text: null,
    ...overrides,
  };
}

function kinds(result) {
  return result.checks.map((c) => [c.kind, c.pass]);
}

test('CHECK_KINDS is the frozen list of four kinds', () => {
  assert.deepEqual([...CHECK_KINDS], ['request', 'finalUrl', 'marker', 'text']);
  assert.ok(Object.isFrozen(CHECK_KINDS));
});

test('stripRunPrefix and normalizeFinalUrl remove only the run prefix', () => {
  assert.equal(stripRunPrefix('/r/tok12345/api/x', 'tok12345'), '/api/x');
  assert.equal(stripRunPrefix('/r/other999/api/x', 'tok12345'), '/r/other999/api/x');
  assert.equal(stripRunPrefix('/r/tok123456/api/x', 'tok12345'), '/r/tok123456/api/x');
  assert.equal(stripRunPrefix('/api/x', 'tok12345'), '/api/x');
  assert.deepEqual(
    normalizeFinalUrl('http://127.0.0.1:5000/r/tok12345/fixtures/a/index.html?view=done', 'tok12345'),
    { path: '/fixtures/a/index.html', query: { view: 'done' } },
  );
  assert.equal(normalizeFinalUrl(null, TOKEN), null);
  assert.equal(normalizeFinalUrl('not a url', TOKEN), null);
});

test('request checks match method case-insensitively, path exactly and count exactly', () => {
  const ev = coreEvidence();
  const ok = evaluateOutcome(coreTask([{ kind: 'request', method: 'post', path: '/api/checklist/save', count: 1 }]), ev, { token: TOKEN });
  assert.equal(ok.pass, true);
  assert.deepEqual(ok.checks[0].detail, { matched: 1, expected: 1 });

  const trailingSlash = evaluateOutcome(coreTask([{ kind: 'request', method: 'POST', path: '/api/checklist/save/', count: 1 }]), ev);
  assert.equal(trailingSlash.pass, false);
  const prefixOnly = evaluateOutcome(coreTask([{ kind: 'request', method: 'POST', path: '/api/checklist', count: 1 }]), ev);
  assert.equal(prefixOnly.pass, false);
  const wrongMethod = evaluateOutcome(coreTask([{ kind: 'request', method: 'PUT', path: '/api/checklist/save', count: 1 }]), ev);
  assert.equal(wrongMethod.pass, false);

  const twice = evaluateOutcome(coreTask([{ kind: 'request', method: 'POST', path: '/api/checklist/save', count: 2 }]), ev);
  assert.equal(twice.pass, false, 'count is exact, not a minimum');
  assert.deepEqual(twice.checks[0].detail, { matched: 1, expected: 2 });
});

test('count: 0 passes only when no request matches', () => {
  const absent = evaluateOutcome(coreTask([{ kind: 'request', method: 'DELETE', path: '/api/checklist/save', count: 0 }]), coreEvidence());
  assert.equal(absent.pass, true);
  const present = evaluateOutcome(coreTask([{ kind: 'request', method: 'POST', path: '/api/checklist/save', count: 0 }]), coreEvidence());
  assert.equal(present.pass, false);
  const emptyLog = evaluateOutcome(coreTask([{ kind: 'request', method: 'POST', path: '/api/checklist/save', count: 0 }]), coreEvidence({ requests: [] }));
  assert.equal(emptyLog.pass, true);
});

test('missing request evidence fails closed, even for count: 0', () => {
  const result = evaluateOutcome(coreTask([{ kind: 'request', method: 'POST', path: '/api/checklist/save', count: 0 }]), coreEvidence({ requests: undefined }));
  assert.equal(result.pass, false);
});

test('jsonEquals compares canonical JSON: key order is ignored, array order is not', () => {
  const ev = coreEvidence();
  const reordered = evaluateOutcome(coreTask([{
    kind: 'request', method: 'POST', path: '/api/checklist/save', count: 1,
    jsonEquals: { meta: { at: 3, by: 'bench-client' }, checked: ['alpha', 'delta'] },
  }]), ev);
  assert.equal(reordered.pass, true);
  const arrayOrder = evaluateOutcome(coreTask([{
    kind: 'request', method: 'POST', path: '/api/checklist/save', count: 1,
    jsonEquals: { checked: ['delta', 'alpha'], meta: { by: 'bench-client', at: 3 } },
  }]), ev);
  assert.equal(arrayOrder.pass, false);
  assert.deepEqual(arrayOrder.checks[0].detail, { matched: 0, expected: 1 });
  const extraKey = evaluateOutcome(coreTask([{
    kind: 'request', method: 'POST', path: '/api/checklist/save', count: 1,
    jsonEquals: { checked: ['alpha', 'delta'], meta: { by: 'bench-client', at: 3 }, extra: true },
  }]), ev);
  assert.equal(extraKey.pass, false);
});

test('finalUrl checks use the normalized URL for core tasks and the absolute URL for live tasks', () => {
  const ev = coreEvidence();
  const path = evaluateOutcome(coreTask([{ kind: 'finalUrl', pathEquals: '/fixtures/checklist/saved.html' }]), ev, { token: TOKEN });
  assert.equal(path.pass, true);
  const wrongPath = evaluateOutcome(coreTask([{ kind: 'finalUrl', pathEquals: '/fixtures/checklist/index.html' }]), ev, { token: TOKEN });
  assert.equal(wrongPath.pass, false);
  const query = evaluateOutcome(coreTask([{ kind: 'finalUrl', pathEquals: '/fixtures/checklist/saved.html', queryIncludes: { view: 'done' } }]), ev, { token: TOKEN });
  assert.equal(query.pass, true);
  const wrongQuery = evaluateOutcome(coreTask([{ kind: 'finalUrl', queryIncludes: { view: 'draft' } }]), ev, { token: TOKEN });
  assert.equal(wrongQuery.pass, false);
  const missingKey = evaluateOutcome(coreTask([{ kind: 'finalUrl', queryIncludes: { page: '1' } }]), ev, { token: TOKEN });
  assert.equal(missingKey.pass, false);
  const noFinalUrl = evaluateOutcome(coreTask([{ kind: 'finalUrl', pathEquals: '/fixtures/checklist/saved.html' }]), coreEvidence({ finalUrl: null }), { token: TOKEN });
  assert.equal(noFinalUrl.pass, false);

  const liveEv = { requests: [], finalUrl: 'https://full-selfbrowsing.com/about?ref=bench', markers: {}, text: PAGE_TEXT };
  const live = evaluateOutcome(liveTask([{ kind: 'finalUrl', urlIncludes: 'full-selfbrowsing.com/about' }]), liveEv);
  assert.equal(live.pass, true);
  const liveMiss = evaluateOutcome(liveTask([{ kind: 'finalUrl', urlIncludes: 'full-selfbrowsing.com/privacy' }]), liveEv);
  assert.equal(liveMiss.pass, false);
});

test('marker checks require an exact string match', () => {
  const pass = evaluateOutcome(coreTask([{ kind: 'marker', name: 'saved-count', equals: '2' }]), coreEvidence());
  assert.equal(pass.pass, true);
  const wrong = evaluateOutcome(coreTask([{ kind: 'marker', name: 'saved-count', equals: '4' }]), coreEvidence());
  assert.equal(wrong.pass, false);
  const missing = evaluateOutcome(coreTask([{ kind: 'marker', name: 'not-there', equals: '2' }]), coreEvidence());
  assert.equal(missing.pass, false);
  const inherited = evaluateOutcome(coreTask([{ kind: 'marker', name: 'toString', equals: 'x' }]), coreEvidence());
  assert.equal(inherited.pass, false);
});

test('text checks report {matched} only and never echo the page text', () => {
  const liveEv = { requests: [], finalUrl: 'https://example.test/ledger', markers: {}, text: PAGE_TEXT };
  const hit = evaluateOutcome(liveTask([{ kind: 'text', includes: 'INV-2291' }]), liveEv);
  assert.equal(hit.pass, true);
  assert.deepEqual(hit.checks[0].detail, { matched: true });
  const miss = evaluateOutcome(liveTask([{ kind: 'text', includes: 'inv-2291' }]), liveEv);
  assert.equal(miss.pass, false, 'text matching is case-sensitive');
  assert.deepEqual(miss.checks[0].detail, { matched: false });
  for (const result of [hit, miss]) {
    const json = JSON.stringify(result);
    assert.ok(!json.includes(PAGE_TEXT), 'page text leaked into the result');
    assert.ok(!json.includes('overdue'), 'page text fragment leaked into the result');
  }
});

test('details carry counts and booleans, never request bodies or URLs', () => {
  const result = evaluateOutcome(coreTask([
    { kind: 'request', method: 'POST', path: '/api/checklist/save', count: 1, jsonEquals: { checked: ['alpha', 'delta'], meta: { by: 'bench-client', at: 3 } } },
    { kind: 'finalUrl', pathEquals: '/fixtures/checklist/saved.html', queryIncludes: { view: 'done' } },
    { kind: 'marker', name: 'saved-count', equals: '2' },
  ]), coreEvidence(), { token: TOKEN });
  assert.equal(result.pass, true);
  const details = JSON.stringify(result.checks.map((c) => c.detail));
  assert.ok(!details.includes('bench-client'), 'request body leaked');
  assert.ok(!details.includes('127.0.0.1'), 'final URL leaked');
  for (const check of result.checks) {
    for (const value of Object.values(check.detail)) {
      assert.ok(typeof value === 'number' || typeof value === 'boolean', `detail value ${value} is not a count or boolean`);
    }
  }
});

test('an agent claim of success never passes a run whose checks fail', () => {
  const ev = coreEvidence({ claimed: { status: 'completed', complete_task: true } });
  const result = evaluateOutcome(coreTask([{ kind: 'request', method: 'POST', path: '/api/checklist/submit', count: 1 }]), ev);
  assert.equal(result.pass, false);
});

test('evaluateOutcome never reads the claimed field (a Proxy throws on any access to it)', () => {
  const target = coreEvidence({ claimed: { status: 'completed', complete_task: true } });
  const touched = [];
  const guarded = new Proxy(target, {
    get(obj, key, receiver) {
      if (key === 'claimed') { touched.push('get'); throw new Error('evaluator read evidence.claimed'); }
      return Reflect.get(obj, key, receiver);
    },
    has(obj, key) {
      if (key === 'claimed') { touched.push('has'); throw new Error('evaluator probed evidence.claimed'); }
      return Reflect.has(obj, key);
    },
    getOwnPropertyDescriptor(obj, key) {
      if (key === 'claimed') { touched.push('descriptor'); throw new Error('evaluator inspected evidence.claimed'); }
      return Reflect.getOwnPropertyDescriptor(obj, key);
    },
    ownKeys() {
      touched.push('ownKeys');
      throw new Error('evaluator enumerated the evidence object');
    },
  });
  assert.throws(() => guarded.claimed, /evidence\.claimed/, 'the Proxy trap itself must work');
  touched.length = 0;

  const passing = evaluateOutcome(coreTask([
    { kind: 'request', method: 'POST', path: '/api/checklist/save', count: 1 },
    { kind: 'finalUrl', pathEquals: '/fixtures/checklist/saved.html' },
    { kind: 'marker', name: 'saved-count', equals: '2' },
    { kind: 'text', includes: 'anything' },
  ]), guarded, { token: TOKEN });
  assert.deepEqual(kinds(passing), [['request', true], ['finalUrl', true], ['marker', true], ['text', false]]);
  assert.equal(passing.pass, false);
  assert.deepEqual(touched, []);

  const allPass = evaluateOutcome(coreTask([{ kind: 'marker', name: 'saved-count', equals: '2' }]), guarded);
  assert.equal(allPass.pass, true);
  assert.deepEqual(touched, []);
});

test('an unknown check kind fails with an error detail, and a task with no checks fails', () => {
  const unknown = evaluateOutcome(coreTask([
    { kind: 'marker', name: 'saved-count', equals: '2' },
    { kind: 'agentSaysDone' },
  ]), coreEvidence());
  assert.equal(unknown.pass, false);
  assert.deepEqual(unknown.checks[1], { kind: 'agentSaysDone', pass: false, detail: { error: 'unknown check kind' } });

  const none = evaluateOutcome(coreTask([]), coreEvidence());
  assert.deepEqual(none, { pass: false, checks: [] });
  const noSuccess = evaluateOutcome({ id: 'no-success', set: 'core' }, coreEvidence());
  assert.equal(noSuccess.pass, false);
});
