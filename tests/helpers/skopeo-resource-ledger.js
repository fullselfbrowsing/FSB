'use strict';

const assert = require('assert');

const CATEGORIES = Object.freeze([
  'roots',
  'listeners',
  'observers',
  'timeouts',
  'intervals',
  'animationFrames',
  'animations',
  'focusHooks',
  'pointerSurfaces',
  'pendingRenders',
  'popoverTopLayer'
]);

const CATEGORY_SET = new Set(CATEGORIES);
let nextLedgerId = 1;

function zeroSnapshot() {
  const result = {};
  for (const category of CATEGORIES) result[category] = 0;
  return Object.freeze(result);
}

function isExactZeroSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== CATEGORIES.length) return false;
  if (keys.some((key) => !CATEGORY_SET.has(key))) return false;
  return CATEGORIES.every((category) => (
    Object.prototype.hasOwnProperty.call(value, category) &&
    typeof value[category] === 'number' &&
    Number.isFinite(value[category]) &&
    value[category] === 0
  ));
}

function assertCategoryTransition(snapshots, category, expected, message = 'resource transition') {
  if (!Array.isArray(snapshots) || !Array.isArray(expected) || snapshots.length !== expected.length) {
    throw new TypeError('assertCategoryTransition requires equally sized snapshot and expected arrays');
  }
  if (!CATEGORY_SET.has(category)) {
    throw new TypeError(`Unknown Skopeo resource category: ${String(category)}`);
  }
  const actual = snapshots.map((snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new TypeError('resource transition snapshots must be objects');
    }
    const value = snapshot[category];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TypeError(`Invalid snapshot category: ${category}`);
    }
    return value;
  });
  assert.deepStrictEqual(actual, expected, `${message}: ${category} ${expected.join(' -> ')}`);
  return Object.freeze(actual.slice());
}

function assertExactZero(snapshot, message = 'Skopeo resource snapshot must be exact zero') {
  if (!isExactZeroSnapshot(snapshot)) {
    throw new assert.AssertionError({
      message,
      actual: snapshot,
      expected: zeroSnapshot(),
      operator: 'deepStrictEqual'
    });
  }
  return snapshot;
}

class SkopeoResourceLedger {
  constructor(label = 'skopeo') {
    this.label = String(label);
    this.id = nextLedgerId++;
    this.nextHandleId = 1;
    this.handles = new Map();
  }

  acquire(category, cleanup, detail) {
    if (!CATEGORY_SET.has(category)) {
      throw new TypeError(`Unknown Skopeo resource category: ${String(category)}`);
    }
    if (cleanup !== undefined && typeof cleanup !== 'function') {
      throw new TypeError('Resource cleanup must be a function when provided');
    }

    const handle = Object.freeze({
      ledgerId: this.id,
      id: this.nextHandleId++,
      category
    });
    this.handles.set(handle, {
      cleanup: cleanup || null,
      detail: detail === undefined ? null : detail,
      released: false
    });
    return handle;
  }

  release(handle, options = {}) {
    const entry = this.handles.get(handle);
    if (!entry || !handle || handle.ledgerId !== this.id) {
      throw new TypeError('Unknown Skopeo resource handle');
    }
    if (entry.released) {
      throw new Error(`Skopeo resource already released: ${handle.category}#${handle.id}`);
    }

    entry.released = true;
    let cleanupError = null;
    if (options.cleanup !== false && entry.cleanup) {
      try {
        entry.cleanup();
      } catch (error) {
        cleanupError = error;
      }
    }
    if (cleanupError && options.suppressCleanupError !== true) throw cleanupError;
    return true;
  }

  snapshot() {
    const result = {};
    for (const category of CATEGORIES) result[category] = 0;
    for (const [handle, entry] of this.handles) {
      if (!entry.released) result[handle.category] += 1;
    }
    return Object.freeze(result);
  }

  diff(before, after = this.snapshot()) {
    if (!before || !after) throw new TypeError('diff requires snapshots');
    const result = {};
    for (const category of CATEGORIES) {
      const left = Number(before[category]);
      const right = Number(after[category]);
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        throw new TypeError(`Invalid snapshot category: ${category}`);
      }
      result[category] = right - left;
    }
    return Object.freeze(result);
  }

  releaseAll(options = {}) {
    const active = Array.from(this.handles.entries())
      .filter(([, entry]) => !entry.released)
      .reverse();
    const errors = [];
    for (const [handle] of active) {
      try {
        this.release(handle, { suppressCleanupError: false });
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length && options.suppressCleanupErrors !== true) {
      throw new AggregateError(errors, `Failed to release ${errors.length} Skopeo resource(s)`);
    }
    return this.snapshot();
  }

  assertEmpty(message = 'Skopeo resource ledger must be empty') {
    const snapshot = this.snapshot();
    const leaks = CATEGORIES.filter(category => snapshot[category] !== 0);
    if (leaks.length) {
      const detail = leaks.map(category => `${category}=${snapshot[category]}`).join(', ');
      throw new assert.AssertionError({
        message: `${message}: ${detail}`,
        actual: snapshot,
        expected: zeroSnapshot(),
        operator: 'deepStrictEqual'
      });
    }
    return snapshot;
  }
}

function runSelfTest() {
  const ledger = new SkopeoResourceLedger('self-test');
  const baseline = ledger.snapshot();
  assert.deepStrictEqual(Object.keys(baseline), CATEGORIES, 'ledger exposes exactly eleven categories');
  assert.strictEqual(isExactZeroSnapshot(baseline), true, 'ordered eleven-key zero snapshot is accepted');
  const reordered = Object.fromEntries(CATEGORIES.slice().reverse().map(category => [category, 0]));
  assert.strictEqual(isExactZeroSnapshot(reordered), true, 'exact own-key set does not depend on serialization order');
  const inherited = Object.create({ roots: 0 });
  for (const category of CATEGORIES.slice(1)) inherited[category] = 0;
  assert.strictEqual(isExactZeroSnapshot(inherited), false, 'inherited categories cannot complete a certificate');
  for (const category of CATEGORIES) {
    const missing = { ...baseline };
    delete missing[category];
    assert.strictEqual(isExactZeroSnapshot(missing), false, `missing ${category} is rejected`);
  }
  assert.strictEqual(isExactZeroSnapshot({ ...baseline, extra: 0 }), false, 'extra key is rejected');
  for (const value of [null, false, '', 0, [], { ...baseline, roots: '0' }, { ...baseline, roots: NaN },
    { ...baseline, roots: Infinity }, { ...baseline, roots: -Infinity }]) {
    assert.strictEqual(isExactZeroSnapshot(value), false, 'coercible or non-finite zero certificate is rejected');
  }
  assert.throws(() => ledger.acquire('unknown'), /Unknown Skopeo resource category/);

  let listenerCleaned = 0;
  const leakedListener = ledger.acquire('listeners', () => { listenerCleaned += 1; });
  assert.throws(() => ledger.assertEmpty('listener negative control'), /listeners=1/);
  ledger.release(leakedListener);
  assert.strictEqual(listenerCleaned, 1, 'listener cleanup runs once');
  assert.throws(() => ledger.release(leakedListener), /already released/);
  ledger.assertEmpty('listener negative control released');

  let popoverReleased = 0;
  const leakedTopLayer = ledger.acquire('popoverTopLayer', () => { popoverReleased += 1; });
  assert.strictEqual(ledger.snapshot().popoverTopLayer, 1, 'top-layer acquisition is observable');
  assert.throws(() => ledger.assertEmpty('popover negative control'), /popoverTopLayer=1/);
  ledger.release(leakedTopLayer);
  assert.strictEqual(popoverReleased, 1, 'top-layer cleanup runs once');
  ledger.assertEmpty('popover negative control released');

  const cleanupOrder = [];
  const handles = CATEGORIES.map(category => ledger.acquire(category, () => cleanupOrder.push(category)));
  assert.deepStrictEqual(
    ledger.diff(baseline, ledger.snapshot()),
    Object.freeze(Object.fromEntries(CATEGORIES.map(category => [category, 1]))),
    'all categories participate in diff accounting'
  );
  ledger.releaseAll();
  assert.deepStrictEqual(cleanupOrder, CATEGORIES.slice().reverse(), 'releaseAll uses reverse acquisition order');
  ledger.assertEmpty('releaseAll returns every category to zero');
  assert.throws(() => ledger.release(handles[0]), /already released/);

  const foreign = new SkopeoResourceLedger('foreign');
  const foreignHandle = foreign.acquire('roots');
  assert.throws(() => ledger.release(foreignHandle), /Unknown Skopeo resource handle/);
  foreign.release(foreignHandle);

  const transitionLedger = new SkopeoResourceLedger('transition-self-test');
  const transitionZero = transitionLedger.snapshot();
  const observer = transitionLedger.acquire('observers');
  const observerLive = transitionLedger.snapshot();
  transitionLedger.release(observer);
  const observerZero = transitionLedger.snapshot();
  assertCategoryTransition(
    [transitionZero, observerLive, observerZero],
    'observers',
    [0, 1, 0],
    'observer ownership is non-vacuous'
  );

  const frame = transitionLedger.acquire('animationFrames');
  const pending = transitionLedger.acquire('pendingRenders');
  const scheduled = transitionLedger.snapshot();
  assertCategoryTransition(
    [observerZero, scheduled],
    'animationFrames',
    [0, 1],
    'frame ownership is visible'
  );
  assertCategoryTransition(
    [observerZero, scheduled],
    'pendingRenders',
    [0, 1],
    'pending resolution ownership is visible'
  );
  assert.throws(
    () => transitionLedger.assertEmpty('observer/frame leak negative control'),
    /animationFrames=1, pendingRenders=1/,
    'deliberately leaked frame and pending work fail the exact-zero certificate'
  );
  transitionLedger.release(pending);
  transitionLedger.release(frame);
  assertExactZero(transitionLedger.snapshot(), 'transition self-test returns all eleven categories to zero');

  console.log('skopeo-resource-ledger self-test: PASS');
  return true;
}

module.exports = {
  CATEGORIES,
  SkopeoResourceLedger,
  zeroSnapshot,
  isExactZeroSnapshot,
  assertCategoryTransition,
  assertExactZero,
  runSelfTest
};

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
  } else {
    console.error('Run with --self-test');
    process.exitCode = 2;
  }
}
