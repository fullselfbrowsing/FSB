/**
 * Phase 67 / JEV-05, JEV-07 -- Jev calibration profiles (D-25, D-28).
 *
 * Covers showcase/server/src/jev/calibration.js and the shipped
 * showcase/server/src/jev/profiles/uncalibrated.json:
 *
 *   - the explicit UNCALIBRATED default: every threshold null, every
 *     meetsThreshold false, calibration.status 'uncalibrated';
 *   - the served-model family check (a dated OpenRouter snapshot satisfies its
 *     pin; aliases and other versions never do);
 *   - selectProfile keyed by (pin, INSTRUMENT_HASH), and calibrationStatus
 *     giving calibrated / snapshot_changed / uncalibrated;
 *   - threshold direction (Choice and stuck/risk act at or above, completion
 *     vetoes at or below) and the null/false invariant when not calibrated;
 *   - validateProfile and loadProfiles (per-file failures are skipped, it
 *     never throws);
 *   - the throw contract 67-09 relies on: selectProfile and applyCalibration
 *     never catch, so a fault in their inputs reaches the caller unchanged.
 *
 * Run: node tests/jev-calibration-profile.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JEV_DIR = path.join(ROOT, 'showcase', 'server', 'src', 'jev');
const PROFILES = path.join(JEV_DIR, 'profiles');

const { CONTRACT } = require(path.join(JEV_DIR, 'contract.js'));
const { INSTRUMENT_HASH, INSTRUMENT_VERSION } = require(path.join(JEV_DIR, 'instrument.js'));

const PIN_DIRECT = 'jev-1.13.0';
const PIN_OPENROUTER = 'typesafe/jev-1.13';
const SNAPSHOT = 'typesafe/jev-1.13-20260917';
const UNCALIBRATED_NOTE = 'Explicit UNCALIBRATED default (D-28). No Jev decision acts and no Jev flag contributes '
  + 'until a V3-calibrated profile for the deployed pin and INSTRUMENT_HASH is committed beside this file.';

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label}${detail === undefined ? '' : ` -- ${detail}`}`); }
}
function deepEqual(a, b) {
  try { assert.deepStrictEqual(a, b); return true; } catch (_e) { return false; }
}
function show(value) {
  return JSON.stringify(value);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function isDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  return Object.keys(value).every((key) => isDeepFrozen(value[key]));
}
// Returns {threw:true, error} or {threw:false, value}.
function attempt(fn) {
  try { return { threw: false, value: fn() }; } catch (error) { return { threw: true, error }; }
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function calibratedProfile(overrides) {
  return Object.assign({
    schemaVersion: 1,
    profileId: 'typesafe-jev-1.13-20260917-test',
    status: 'calibrated',
    note: 'Synthetic test profile.',
    model: PIN_OPENROUTER,
    snapshot: SNAPSHOT,
    instrumentVersion: INSTRUMENT_VERSION,
    instrumentHash: INSTRUMENT_HASH,
    thresholds: { operation: 0.9, target: 0.85, completion: 0.2, stuck: 0.8, risk: 0.6 },
  }, overrides || {});
}

function directProfile() {
  return calibratedProfile({ profileId: 'jev-1.13.0-test', model: PIN_DIRECT, snapshot: PIN_DIRECT });
}

function answers(values) {
  const v = Object.assign({ operation: 0.9, target: 0.85, completion: 0.2, stuck: 0.8, risk: 0.6 }, values || {});
  return {
    operation: {
      type: 'choice', choice: 'click', confidence: v.operation,
      probabilities: { click: 0.93, scroll: 0.04, none_of_the_above: 0.03 },
    },
    target: {
      type: 'choice', choice: 'e1', confidence: v.target,
      probabilities: { e0: 0.05, e1: 0.9, none_of_the_above: 0.05 },
    },
    completion: { type: 'noul', noul: v.completion },
    stuck: { type: 'noul', noul: v.stuck },
    risk: { type: 'noul', noul: v.risk },
  };
}

function loadModule() {
  try {
    return require(path.join(JEV_DIR, 'calibration.js'));
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
function shippedProfileSection(cal) {
  console.log('\n[the shipped UNCALIBRATED profile (D-28)]');
  const files = fs.readdirSync(PROFILES).sort();
  check('profiles/ holds only uncalibrated.json (no calibrated profile ships in Phase 67)',
    deepEqual(files, ['uncalibrated.json']), show(files));
  const raw = JSON.parse(fs.readFileSync(path.join(PROFILES, 'uncalibrated.json'), 'utf8'));
  check('the file has exactly the profile keys',
    deepEqual(Object.keys(raw), ['schemaVersion', 'profileId', 'status', 'note', 'model', 'snapshot',
      'instrumentVersion', 'instrumentHash', 'thresholds']), show(Object.keys(raw)));
  check('schemaVersion 1, profileId uncalibrated-v1, status uncalibrated',
    raw.schemaVersion === 1 && raw.profileId === 'uncalibrated-v1' && raw.status === 'uncalibrated');
  check('the note is the D-28 text', raw.note === UNCALIBRATED_NOTE, raw.note);
  check('model, snapshot, instrumentVersion and instrumentHash are null',
    raw.model === null && raw.snapshot === null && raw.instrumentVersion === null && raw.instrumentHash === null);
  check('every threshold is null',
    deepEqual(raw.thresholds, { operation: null, target: null, completion: null, stuck: null, risk: null }));
  check('UNCALIBRATED_PROFILE deep-equals the file', deepEqual(cal.UNCALIBRATED_PROFILE, raw));
  check('UNCALIBRATED_PROFILE is deep-frozen', isDeepFrozen(cal.UNCALIBRATED_PROFILE));
  check('validateProfile accepts it', deepEqual(cal.validateProfile(raw), { ok: true, errors: [] }));
  check('PROFILES_DIR is the profiles directory', cal.PROFILES_DIR === PROFILES);
}

function uncalibratedDecisionsSection(cal) {
  console.log('\n[applyCalibration under UNCALIBRATED]');
  for (const pin of [PIN_DIRECT, PIN_OPENROUTER]) {
    const served = pin === PIN_DIRECT ? PIN_DIRECT : SNAPSHOT;
    const result = cal.applyCalibration({
      profile: cal.UNCALIBRATED_PROFILE, configuredModel: pin, servedModel: served,
      answers: answers({ operation: 1, target: 1, completion: 0, stuck: 1, risk: 1 }), kinds: CONTRACT.KINDS.slice(),
    });
    check(`${pin}: calibration is {status:'uncalibrated', profileId:'uncalibrated-v1'}`,
      deepEqual(result.calibration, { status: 'uncalibrated', profileId: 'uncalibrated-v1' }), show(result.calibration));
    check(`${pin}: result keys are calibration, decisions`, deepEqual(Object.keys(result), ['calibration', 'decisions']));
    check(`${pin}: decisions exist for exactly the requested kinds`,
      deepEqual(Object.keys(result.decisions), CONTRACT.KINDS));
    check(`${pin}: every threshold is null and every meetsThreshold false, even at the extremes`,
      Object.values(result.decisions).every((d) => d.threshold === null && d.meetsThreshold === false));
  }
}

function familySection(cal) {
  console.log('\n[servedModelInFamily (D-25)]');
  const f = cal.servedModelInFamily;
  check("('typesafe/jev-1.13-20260917', 'typesafe/jev-1.13') is true", f(SNAPSHOT, PIN_OPENROUTER) === true);
  check("('typesafe/jev-1.13', 'typesafe/jev-1.13') is true", f(PIN_OPENROUTER, PIN_OPENROUTER) === true);
  check("('typesafe/jev-1.14', 'typesafe/jev-1.13') is false", f('typesafe/jev-1.14', PIN_OPENROUTER) === false);
  check("('typesafe/jev-1.13-2026', 'typesafe/jev-1.13') is false", f('typesafe/jev-1.13-2026', PIN_OPENROUTER) === false);
  check("('typesafe/jev-1.13-202609170', 'typesafe/jev-1.13') is false (9 digits)",
    f('typesafe/jev-1.13-202609170', PIN_OPENROUTER) === false);
  check("('typesafe/jev-1.13-2026091x', 'typesafe/jev-1.13') is false", f('typesafe/jev-1.13-2026091x', PIN_OPENROUTER) === false);
  check("('typesafe/jev-1.13.1', 'typesafe/jev-1.13') is false", f('typesafe/jev-1.13.1', PIN_OPENROUTER) === false);
  check("('typesafe/jev-1.130-20260917', 'typesafe/jev-1.13') is false", f('typesafe/jev-1.130-20260917', PIN_OPENROUTER) === false);
  check("('jev-1.13.0', 'jev-1.13.0') is true", f(PIN_DIRECT, PIN_DIRECT) === true);
  check("('jev-1.13.0-x', 'jev-1.13.0') is false", f('jev-1.13.0-x', PIN_DIRECT) === false);
  check("('jev-1.13.0-20261101', 'jev-1.13.0') is true", f('jev-1.13.0-20261101', PIN_DIRECT) === true);
  check("('JEV-1.13.0', 'jev-1.13.0') is false (case-sensitive)", f('JEV-1.13.0', PIN_DIRECT) === false);
  check("a regex-looking pin is matched literally", f('jevX1.13.0', 'jev.1.13.0') === false);
  for (const alias of ['jev-latest', 'jev-preview', 'typesafe/jev-latest', '~typesafe/jev-latest']) {
    check(`alias ${alias} is never in either pinned family`, f(alias, PIN_DIRECT) === false && f(alias, PIN_OPENROUTER) === false);
  }
  for (const bad of [null, undefined, 42, {}, ['jev-1.13.0'], true]) {
    check(`non-string served model ${show(bad)} is false`, f(bad, PIN_DIRECT) === false);
  }
  check('a non-string or empty pin is false', f(PIN_DIRECT, null) === false && f('', '') === false && f(PIN_DIRECT, 42) === false);
}

function selectionSection(cal) {
  console.log('\n[selectProfile and calibrationStatus on a synthetic calibrated profile]');
  const U = cal.UNCALIBRATED_PROFILE;
  const profile = calibratedProfile();
  check('the synthetic calibrated profile is valid', cal.validateProfile(profile).ok === true,
    show(cal.validateProfile(profile).errors));
  const key = { model: PIN_OPENROUTER, instrumentHash: INSTRUMENT_HASH };
  check('selectProfile returns the calibrated profile for its pin and INSTRUMENT_HASH',
    cal.selectProfile([U, profile], key) === profile);
  check('selectProfile works without the UNCALIBRATED entry in the list', cal.selectProfile([profile], key) === profile);
  check('a different configured pin gets UNCALIBRATED',
    cal.selectProfile([U, profile], { model: 'typesafe/jev-1.14', instrumentHash: INSTRUMENT_HASH }) === U);
  check('a profile whose instrumentHash differs is never selected',
    cal.selectProfile([U, calibratedProfile({ instrumentHash: '0'.repeat(64) })], key) === U);
  check('a different instrumentHash argument gets UNCALIBRATED',
    cal.selectProfile([U, profile], { model: PIN_OPENROUTER, instrumentHash: 'f'.repeat(64) }) === U);
  check('two calibrated profiles for the same pin and hash fail closed to UNCALIBRATED',
    cal.selectProfile([U, profile, calibratedProfile({ profileId: 'second', snapshot: 'typesafe/jev-1.13-20261001' })], key) === U);
  const invalid = calibratedProfile();
  delete invalid.note;
  check('an invalid calibrated-looking profile is never selected', cal.selectProfile([U, invalid], key) === U);
  check('an uncalibrated profile naming the pin is never selected',
    cal.selectProfile([calibratedProfile({ status: 'uncalibrated', thresholds: { operation: null, target: null, completion: null, stuck: null, risk: null } })], key) === U);
  check('an empty or non-array list gets UNCALIBRATED',
    cal.selectProfile([], key) === U && cal.selectProfile(null, key) === U && cal.selectProfile({}, key) === U);
  check('a missing model gets UNCALIBRATED', cal.selectProfile([profile], { instrumentHash: INSTRUMENT_HASH }) === U);

  const status = (servedModel, p, configuredModel) => cal.calibrationStatus({
    profile: p || profile, configuredModel: configuredModel || PIN_OPENROUTER, servedModel,
  });
  check('served snapshot equal to the profile -> calibrated', status(SNAPSHOT) === 'calibrated');
  check("served 'typesafe/jev-1.13-20261001' -> snapshot_changed", status('typesafe/jev-1.13-20261001') === 'snapshot_changed');
  check("served bare pin 'typesafe/jev-1.13' -> snapshot_changed", status(PIN_OPENROUTER) === 'snapshot_changed');
  check("served 'typesafe/jev-1.14-20261014' -> uncalibrated", status('typesafe/jev-1.14-20261014') === 'uncalibrated');
  check("served alias 'typesafe/jev-latest' -> uncalibrated", status('typesafe/jev-latest') === 'uncalibrated');
  check('served null -> uncalibrated', status(null) === 'uncalibrated');
  check('a configured pin other than the profile model -> uncalibrated',
    status(SNAPSHOT, profile, 'typesafe/jev-1.14') === 'uncalibrated');
  check('a profile whose instrumentHash differs -> uncalibrated',
    status(SNAPSHOT, calibratedProfile({ instrumentHash: '0'.repeat(64) })) === 'uncalibrated');
  check('the UNCALIBRATED profile -> uncalibrated whatever is served',
    status(SNAPSHOT, U) === 'uncalibrated' && status(PIN_DIRECT, U, PIN_DIRECT) === 'uncalibrated');

  const direct = directProfile();
  check('direct route: served jev-1.13.0 -> calibrated', status(PIN_DIRECT, direct, PIN_DIRECT) === 'calibrated');
  check('direct route: served jev-1.13.0-20261101 -> snapshot_changed',
    status('jev-1.13.0-20261101', direct, PIN_DIRECT) === 'snapshot_changed');
  check('direct route: served jev-1.14.0 -> uncalibrated', status('jev-1.14.0', direct, PIN_DIRECT) === 'uncalibrated');
}

function thresholdSection(cal) {
  console.log('\n[threshold direction when calibrated]');
  const profile = calibratedProfile();
  const run = (values, kinds, p) => cal.applyCalibration({
    profile: p || profile, configuredModel: PIN_OPENROUTER, servedModel: SNAPSHOT, answers: answers(values), kinds,
  });
  const atCut = run({}, CONTRACT.KINDS.slice());
  check('calibration is {status:calibrated, profileId}',
    deepEqual(atCut.calibration, { status: 'calibrated', profileId: profile.profileId }));
  check('every kind meets its threshold exactly at the cut', Object.values(atCut.decisions).every((d) => d.meetsThreshold === true));
  check('thresholds are copied from the profile',
    CONTRACT.KINDS.every((k) => atCut.decisions[k].threshold === profile.thresholds[k]));
  check('operation: confidence 0.8999 < 0.9 does not meet', run({ operation: 0.8999 }, ['operation']).decisions.operation.meetsThreshold === false);
  check('target: confidence 0.84 < 0.85 does not meet', run({ target: 0.84 }, ['target']).decisions.target.meetsThreshold === false);
  check('target: confidence 1 meets', run({ target: 1 }, ['target']).decisions.target.meetsThreshold === true);
  check('completion vetoes when low: p 0.05 <= 0.2 meets', run({ completion: 0.05 }, ['completion']).decisions.completion.meetsThreshold === true);
  check('completion: p 0.2001 > 0.2 does not meet', run({ completion: 0.2001 }, ['completion']).decisions.completion.meetsThreshold === false);
  check('completion: p 0.99 does not meet', run({ completion: 0.99 }, ['completion']).decisions.completion.meetsThreshold === false);
  check('stuck flags when high: p 0.95 meets, 0.7999 does not',
    run({ stuck: 0.95 }, ['stuck']).decisions.stuck.meetsThreshold === true
      && run({ stuck: 0.7999 }, ['stuck']).decisions.stuck.meetsThreshold === false);
  check('risk flags when high: p 0.6 meets, 0.5999 does not',
    run({ risk: 0.6 }, ['risk']).decisions.risk.meetsThreshold === true
      && run({ risk: 0.5999 }, ['risk']).decisions.risk.meetsThreshold === false);
  const partial = calibratedProfile({ thresholds: { operation: 0.9, target: null, completion: 0.2, stuck: null, risk: null } });
  const partialResult = run({ target: 1, stuck: 1, risk: 1 }, CONTRACT.KINDS.slice(), partial);
  check('a null threshold gives threshold null and meetsThreshold false even at the extreme',
    ['target', 'stuck', 'risk'].every((k) => partialResult.decisions[k].threshold === null && partialResult.decisions[k].meetsThreshold === false));
  check('the kinds that are calibrated still act', partialResult.decisions.operation.meetsThreshold === true);

  const subset = run({}, ['completion', 'risk']);
  check('decisions hold exactly the requested kinds', deepEqual(Object.keys(subset.decisions), ['completion', 'risk']));
  check('a Choice decision has exactly the D-15 keys',
    deepEqual(Object.keys(atCut.decisions.operation), CONTRACT.KEYS.choiceDecision));
  check('a Noul decision has exactly the D-15 keys',
    deepEqual(Object.keys(atCut.decisions.risk), CONTRACT.KEYS.noulDecision));
  check('choice, confidence and p are copied from the answers',
    atCut.decisions.operation.choice === 'click' && atCut.decisions.operation.confidence === 0.9
      && atCut.decisions.completion.p === 0.2);
  const input = answers();
  const before = clone(input);
  const fresh = cal.applyCalibration({
    profile, configuredModel: PIN_OPENROUTER, servedModel: SNAPSHOT, answers: input, kinds: ['operation', 'target'],
  });
  check('probabilities are a fresh plain object with the same entries',
    fresh.decisions.operation.probabilities !== input.operation.probabilities
      && Object.getPrototypeOf(fresh.decisions.operation.probabilities) === Object.prototype
      && deepEqual(fresh.decisions.operation.probabilities, input.operation.probabilities));
  check('the answers are not mutated', deepEqual(input, before));
}

function invariantSection(cal) {
  console.log('\n[not calibrated -> every threshold null, every meetsThreshold false]');
  const profile = calibratedProfile();
  const cases = [
    { name: 'snapshot_changed', profile, servedModel: 'typesafe/jev-1.13-20261001', status: 'snapshot_changed' },
    { name: 'foreign model', profile, servedModel: 'typesafe/jev-1.14-20261014', status: 'uncalibrated' },
    { name: 'UNCALIBRATED profile', profile: cal.UNCALIBRATED_PROFILE, servedModel: SNAPSHOT, status: 'uncalibrated' },
  ];
  const rand = mulberry32(6703);
  for (const c of cases) {
    let violations = 0;
    let statusOk = true;
    for (let i = 0; i < 200; i += 1) {
      const values = { operation: rand(), target: rand(), completion: rand(), stuck: rand(), risk: rand() };
      if (i === 0) Object.assign(values, { operation: 1, target: 1, completion: 0, stuck: 1, risk: 1 });
      const result = cal.applyCalibration({
        profile: c.profile, configuredModel: PIN_OPENROUTER, servedModel: c.servedModel, answers: answers(values),
        kinds: CONTRACT.KINDS.slice(),
      });
      if (result.calibration.status !== c.status) statusOk = false;
      if (!Object.values(result.decisions).every((d) => d.threshold === null && d.meetsThreshold === false)) violations += 1;
    }
    check(`${c.name}: status is ${c.status}`, statusOk);
    check(`${c.name}: 200 seeded answers never carry a threshold or meet it`, violations === 0, `${violations} violations`);
  }
}

function validateSection(cal) {
  console.log('\n[validateProfile]');
  const v = cal.validateProfile;
  const nullThresholds = { operation: null, target: null, completion: null, stuck: null, risk: null };
  const accepted = [
    ['UNCALIBRATED', cal.UNCALIBRATED_PROFILE],
    ['calibrated OpenRouter profile', calibratedProfile()],
    ['calibrated direct profile', directProfile()],
    ['calibrated with some null thresholds', calibratedProfile({ thresholds: { operation: 0.9, target: null, completion: null, stuck: null, risk: null } })],
    ['thresholds at 0 and 1', calibratedProfile({ thresholds: { operation: 1, target: 0, completion: 0, stuck: 1, risk: 0.5 } })],
    ['calibrated with a snapshot equal to the pin', calibratedProfile({ snapshot: PIN_OPENROUTER })],
  ];
  for (const [name, profile] of accepted) {
    const result = v(profile);
    check(`accepts ${name}`, deepEqual(result, { ok: true, errors: [] }), show(result));
  }

  const withThreshold = (kind, value) => {
    const p = calibratedProfile();
    p.thresholds = Object.assign({}, p.thresholds, { [kind]: value });
    return p;
  };
  const without = (key) => {
    const p = calibratedProfile();
    delete p[key];
    return p;
  };
  const protoText = JSON.stringify(calibratedProfile()).replace(/^\{/, '{"__proto__":{"status":"calibrated"},');
  const rejected = [
    ['null', null],
    ['an array', []],
    ['a string', 'profile'],
    ['a number', 42],
    ['an unknown key', calibratedProfile({ MARKERKEY: 1 })],
    ['a missing note', without('note')],
    ['a missing thresholds', without('thresholds')],
    ['an own __proto__ key', JSON.parse(protoText)],
    ['schemaVersion 2', calibratedProfile({ schemaVersion: 2 })],
    ["schemaVersion '1'", calibratedProfile({ schemaVersion: '1' })],
    ['an unknown status', calibratedProfile({ status: 'MARKERSTATUS' })],
    ['an empty profileId', calibratedProfile({ profileId: '' })],
    ['a profileId with a space', calibratedProfile({ profileId: 'has space' })],
    ['a 129-character profileId', calibratedProfile({ profileId: 'p'.repeat(129) })],
    ['a 65-character profileId (over CONTRACT.CAPS.profileIdChars)', calibratedProfile({ profileId: 'p'.repeat(65) })],
    ['a non-string profileId', calibratedProfile({ profileId: 7 })],
    ['a non-string note', calibratedProfile({ note: null })],
    ['an over-long note', calibratedProfile({ note: 'n'.repeat(2001) })],
    ["'calibrated' with all-null thresholds", calibratedProfile({ thresholds: nullThresholds })],
    ['a threshold above 1', withThreshold('operation', 1.01)],
    ['a threshold below 0', withThreshold('risk', -0.01)],
    ['a NaN threshold', withThreshold('stuck', Number.NaN)],
    ['an infinite threshold', withThreshold('target', Number.POSITIVE_INFINITY)],
    ['a string threshold', withThreshold('completion', '0.5')],
    ['a boolean threshold', withThreshold('completion', true)],
    ['an unknown threshold key', calibratedProfile({ thresholds: Object.assign({}, calibratedProfile().thresholds, { score: 0.5 }) })],
    ['a missing threshold key', calibratedProfile({ thresholds: { operation: 0.9, target: 0.85, completion: 0.2, stuck: 0.8 } })],
    ['null thresholds', calibratedProfile({ thresholds: null })],
    ['array thresholds', calibratedProfile({ thresholds: [0.9] })],
    ["'uncalibrated' with a non-null threshold",
      Object.assign(clone(cal.UNCALIBRATED_PROFILE), { thresholds: Object.assign({}, nullThresholds, { risk: 0.5 }) })],
    ["'uncalibrated' with a non-string model", Object.assign(clone(cal.UNCALIBRATED_PROFILE), { model: 42 })],
    ['calibrated without a model', calibratedProfile({ model: null })],
    ['calibrated without a snapshot', calibratedProfile({ snapshot: null })],
    ['calibrated with a snapshot outside the pinned family', calibratedProfile({ snapshot: 'typesafe/jev-1.14-20261014' })],
    ['calibrated without an instrumentVersion', calibratedProfile({ instrumentVersion: null })],
    ['calibrated with a short instrumentHash', calibratedProfile({ instrumentHash: 'abc' })],
    ['calibrated with an uppercase instrumentHash', calibratedProfile({ instrumentHash: INSTRUMENT_HASH.toUpperCase() })],
    ['calibrated with a model containing a space', calibratedProfile({ model: 'typesafe jev', snapshot: 'typesafe jev' })],
  ];
  for (const [name, profile] of rejected) {
    const result = v(profile);
    check(`rejects ${name}`, result && result.ok === false && Array.isArray(result.errors) && result.errors.length > 0
      && deepEqual(Object.keys(result), ['ok', 'errors']), show(result));
  }
  const echoed = [v(calibratedProfile({ MARKERKEY: 1 })), v(calibratedProfile({ status: 'MARKERSTATUS' }))]
    .some((r) => r.errors.some((e) => /MARKER/.test(e)));
  check('errors never echo profile keys or values', !echoed);
  const atCap = v(calibratedProfile({ profileId: 'p'.repeat(CONTRACT.CAPS.profileIdChars) }));
  check(`accepts a profileId of exactly CONTRACT.CAPS.profileIdChars (${CONTRACT.CAPS.profileIdChars}) characters`,
    atCap && atCap.ok === true, show(atCap));
}

function loadSection(cal) {
  console.log('\n[loadProfiles]');
  const U = cal.UNCALIBRATED_PROFILE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-profiles-'));
  const good = calibratedProfile();
  try {
    fs.writeFileSync(path.join(dir, 'a-malformed.json'), '{ not json MARKERBODY');
    fs.writeFileSync(path.join(dir, 'b-calibrated.json'), JSON.stringify(good, null, 2));
    fs.writeFileSync(path.join(dir, 'c-invalid.json'), JSON.stringify(calibratedProfile({
      profileId: 'invalid', thresholds: { operation: null, target: null, completion: null, stuck: null, risk: null },
    })));
    fs.writeFileSync(path.join(dir, 'd-duplicate-id.json'), JSON.stringify(calibratedProfile({ snapshot: 'typesafe/jev-1.13-20261001' })));
    fs.writeFileSync(path.join(dir, 'e-proto.json'),
      JSON.stringify(calibratedProfile({ profileId: 'proto' })).replace(/^\{/, '{"__proto__":{},'));
    fs.writeFileSync(path.join(dir, 'g-uncalibrated-copy.json'), JSON.stringify(U));
    fs.writeFileSync(path.join(dir, 'h-array.json'), '[]');
    fs.writeFileSync(path.join(dir, 'i-oversized.json'),
      JSON.stringify(calibratedProfile({ profileId: 'oversized' })) + ' '.repeat(70 * 1024));
    fs.writeFileSync(path.join(dir, 'readme.txt'), JSON.stringify(calibratedProfile({ profileId: 'txt' })));
    fs.mkdirSync(path.join(dir, 'f-directory.json'));

    const captured = [];
    const saved = { log: console.log, warn: console.warn, error: console.error };
    console.log = (...args) => { captured.push(args.join(' ')); };
    console.warn = console.log;
    console.error = console.log;
    let result;
    try {
      result = attempt(() => cal.loadProfiles(dir));
    } finally {
      console.log = saved.log;
      console.warn = saved.warn;
      console.error = saved.error;
    }
    check('loadProfiles never throws on a directory with bad files', result.threw === false);
    const list = result.threw ? [] : result.value;
    check('it returns UNCALIBRATED first plus the one valid calibrated profile',
      list.length === 2 && list[0] === U && deepEqual(list[1], good), show(list.map((p) => p.profileId)));
    check('a loaded profile is deep-frozen', list.length === 2 && isDeepFrozen(list[1]));
    check('loadProfiles writes nothing to the console', captured.length === 0, show(captured));
    check('the loaded calibrated profile is selectable',
      cal.selectProfile(list, { model: PIN_OPENROUTER, instrumentHash: INSTRUMENT_HASH }) === list[1]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const missing = attempt(() => cal.loadProfiles(path.join(os.tmpdir(), 'jev-profiles-missing-dir-6703')));
  check('a missing directory gives [UNCALIBRATED]', !missing.threw && missing.value.length === 1 && missing.value[0] === U);
  const fileNotDir = attempt(() => cal.loadProfiles(__filename));
  check('a file path gives [UNCALIBRATED]', !fileNotDir.threw && fileNotDir.value.length === 1 && fileNotDir.value[0] === U);
  const nonString = attempt(() => cal.loadProfiles(42));
  check('a non-string directory gives [UNCALIBRATED]', !nonString.threw && nonString.value.length === 1);
  const shipped = attempt(() => cal.loadProfiles());
  check('the shipped directory gives exactly [UNCALIBRATED]',
    !shipped.threw && shipped.value.length === 1 && shipped.value[0] === U);
  check('selection over the shipped profiles is UNCALIBRATED for both pins',
    !shipped.threw
      && cal.selectProfile(shipped.value, { model: PIN_DIRECT, instrumentHash: INSTRUMENT_HASH }) === U
      && cal.selectProfile(shipped.value, { model: PIN_OPENROUTER, instrumentHash: INSTRUMENT_HASH }) === U);
}

function faultSection(cal) {
  console.log('\n[throw contract: selectProfile and applyCalibration never catch (67-09 seam)]');
  const fault = new Error('profiles-fault');
  const throwingList = new Proxy([], { get() { throw fault; } });
  const s = attempt(() => cal.selectProfile(throwingList, { model: PIN_DIRECT, instrumentHash: INSTRUMENT_HASH }));
  check('selectProfile over a throwing Proxy rethrows exactly the injected error', s.threw === true && s.error === fault,
    s.threw ? 'threw another value' : 'returned a profile');
  assert.throws(
    () => cal.selectProfile(throwingList, { model: PIN_DIRECT, instrumentHash: INSTRUMENT_HASH }),
    (e) => e === fault,
  );

  const throwingElement = [Object.defineProperty({}, 'status', { enumerable: true, get() { throw fault; } })];
  const s2 = attempt(() => cal.selectProfile(throwingElement, { model: PIN_DIRECT, instrumentHash: INSTRUMENT_HASH }));
  check('selectProfile rethrows a fault raised while reading a profile', s2.threw === true && s2.error === fault);

  const throwingAnswers = {};
  Object.defineProperty(throwingAnswers, 'completion', { enumerable: true, get() { throw fault; } });
  const a = attempt(() => cal.applyCalibration({
    profile: cal.UNCALIBRATED_PROFILE, configuredModel: PIN_DIRECT, servedModel: PIN_DIRECT,
    answers: throwingAnswers, kinds: ['completion'],
  }));
  check('applyCalibration over a throwing answers getter rethrows exactly the injected error',
    a.threw === true && a.error === fault, a.threw ? 'threw another value' : 'returned a result');
  assert.throws(
    () => cal.applyCalibration({
      profile: cal.UNCALIBRATED_PROFILE, configuredModel: PIN_DIRECT, servedModel: PIN_DIRECT,
      answers: throwingAnswers, kinds: ['completion'],
    }),
    (e) => e === fault,
  );

  const throwingProfile = Object.assign({}, calibratedProfile());
  Object.defineProperty(throwingProfile, 'model', { enumerable: true, get() { throw fault; } });
  const c = attempt(() => cal.calibrationStatus({ profile: throwingProfile, configuredModel: PIN_OPENROUTER, servedModel: SNAPSHOT }));
  check('calibrationStatus rethrows a fault raised while reading the profile', c.threw === true && c.error === fault);

  const wrongType = attempt(() => cal.applyCalibration({
    profile: cal.UNCALIBRATED_PROFILE, configuredModel: PIN_DIRECT, servedModel: PIN_DIRECT,
    answers: { operation: { type: 'noul', noul: 0.5 } }, kinds: ['operation'],
  }));
  check('an answer of the wrong primitive throws a TypeError (never a silent UNCALIBRATED)',
    wrongType.threw === true && wrongType.error instanceof TypeError);
  const missingAnswer = attempt(() => cal.applyCalibration({
    profile: cal.UNCALIBRATED_PROFILE, configuredModel: PIN_DIRECT, servedModel: PIN_DIRECT, answers: {}, kinds: ['risk'],
  }));
  check('a missing answer throws a TypeError', missingAnswer.threw === true && missingAnswer.error instanceof TypeError);

  const after = cal.selectProfile([cal.UNCALIBRATED_PROFILE, directProfile()], { model: PIN_DIRECT, instrumentHash: INSTRUMENT_HASH });
  check('selectProfile still returns normal results afterwards', after.profileId === 'jev-1.13.0-test');
  const afterApply = cal.applyCalibration({
    profile: after, configuredModel: PIN_DIRECT, servedModel: PIN_DIRECT, answers: answers(), kinds: ['completion'],
  });
  check('applyCalibration still returns normal results afterwards',
    afterApply.calibration.status === 'calibrated' && afterApply.decisions.completion.meetsThreshold === true);

  for (const name of ['selectProfile', 'applyCalibration', 'calibrationStatus', 'servedModelInFamily']) {
    check(`${name} contains no catch (comments included)`, !/\bcatch\b/.test(cal[name].toString()));
  }
}

function main() {
  console.log('--- jev-calibration-profile (JEV-05, JEV-07) ---');
  const cal = loadModule();
  if (!cal) {
    check('showcase/server/src/jev/calibration.js loads', false);
    console.log(`\n=== jev-calibration-profile results: ${passed} passed, ${failed} failed ===`);
    process.exit(1);
  }
  shippedProfileSection(cal);
  uncalibratedDecisionsSection(cal);
  familySection(cal);
  selectionSection(cal);
  thresholdSection(cal);
  invariantSection(cal);
  validateSection(cal);
  loadSection(cal);
  faultSection(cal);
  console.log(`\n=== jev-calibration-profile results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
