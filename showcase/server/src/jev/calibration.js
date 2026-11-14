'use strict';

/**
 * Phase 67 (JEV-05, JEV-07) -- Jev calibration profiles (D-25, D-28).
 *
 * The server owns the calibration profile. A profile is a versioned JSON file
 * in ./profiles/, keyed by the pinned model and INSTRUMENT_HASH, so V3 can
 * recalibrate without a Chrome Web Store release. Phase 67 ships only the
 * explicit UNCALIBRATED profile (profiles/uncalibrated.json): every threshold
 * is null, every meetsThreshold is false and calibration.status is
 * 'uncalibrated', so no Jev decision acts and no Jev flag contributes.
 *
 * Served-model checks (D-25):
 *   - a served model is in the pinned family when it equals the pin or is the
 *     pin followed by '-' and 8 digits (a dated OpenRouter snapshot such as
 *     typesafe/jev-1.13-20260917 satisfies the typesafe/jev-1.13 pin);
 *   - a served model outside the family gives 'uncalibrated';
 *   - a served model inside the family that differs from the profile's
 *     snapshot gives 'snapshot_changed';
 *   - there is never an alias fallback and never a switch to another model.
 * Thresholds are reported, and can be met, only when the status is
 * 'calibrated'. Otherwise every threshold is null and every meetsThreshold
 * false, an invariant the extension policy relies on.
 *
 * Threshold direction: Choice kinds and the stuck and risk Nouls meet their
 * threshold at or above it; completion vetoes "done" at or below it
 * (CONTRACT.NOUL_DIRECTION). This matches scripts/bench/shadow/lib/select.mjs
 * toProfileThresholds, which writes completion as 1 - t.
 *
 * Fault handling: selectProfile, applyCalibration, calibrationStatus and
 * servedModelInFamily never trap errors. An exception raised while reading
 * their inputs reaches the caller unchanged and is never turned into
 * UNCALIBRATED_PROFILE or an 'uncalibrated' result; the router's outer
 * handler owns faults (67-09). loadProfiles is the only function here that
 * traps errors, one file at a time, and it never throws. Nothing in this
 * module logs.
 */

const fs = require('fs');
const path = require('path');

const { CONTRACT } = require('./contract');
const { INSTRUMENT_HASH } = require('./instrument');

const PROFILES_DIR = path.join(__dirname, 'profiles');

const PROFILE_KEYS = ['schemaVersion', 'profileId', 'status', 'note', 'model', 'snapshot', 'instrumentVersion',
  'instrumentHash', 'thresholds'];
const PROFILE_STATUSES = ['uncalibrated', 'calibrated'];
const MAX_PROFILE_FILE_BYTES = 64 * 1024;
const MAX_NOTE_CHARS = 2000;
// model, snapshot and instrumentVersion: 1-128 printable ASCII characters, no
// spaces. profileId is the same character class, bounded by
// CONTRACT.CAPS.profileIdChars (64), the bound the extension enforces on every
// ok response's calibration.profileId.
const TOKEN_RE = /^[\x21-\x7e]{1,128}$/;
const PROFILE_ID_MAX_CHARS = CONTRACT.CAPS.profileIdChars;
const HASH_RE = /^[0-9a-f]{64}$/;
const SNAPSHOT_SUFFIX_RE = /^-[0-9]{8}$/;

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * True when servedModel is the pin itself or the pin plus '-' and exactly 8
 * digits. Compared literally (no regex is built from the pin).
 */
function servedModelInFamily(servedModel, pin) {
  if (typeof servedModel !== 'string' || typeof pin !== 'string' || pin.length === 0) return false;
  if (servedModel === pin) return true;
  return servedModel.length === pin.length + 9
    && servedModel.startsWith(pin)
    && SNAPSHOT_SUFFIX_RE.test(servedModel.slice(pin.length));
}

/**
 * Exact-key profile validator. Returns {ok, errors}; errors are fixed
 * descriptions that never echo a key or value from the profile.
 */
function validateProfile(profile) {
  if (!isPlainObject(profile)) return { ok: false, errors: ['profile must be a plain object'] };
  const errors = [];
  if (Object.keys(profile).some((key) => !PROFILE_KEYS.includes(key))) errors.push('unknown key');
  for (const key of PROFILE_KEYS) {
    if (!hasOwn(profile, key)) errors.push(`missing ${key}`);
  }
  if (errors.length > 0) return { ok: false, errors };

  if (profile.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof profile.profileId !== 'string' || !TOKEN_RE.test(profile.profileId)
    || profile.profileId.length > PROFILE_ID_MAX_CHARS) {
    errors.push(`profileId must be 1-${PROFILE_ID_MAX_CHARS} printable ASCII characters without spaces`);
  }
  if (!PROFILE_STATUSES.includes(profile.status)) errors.push('status must be uncalibrated or calibrated');
  if (typeof profile.note !== 'string' || profile.note.length > MAX_NOTE_CHARS) {
    errors.push(`note must be a string of at most ${MAX_NOTE_CHARS} characters`);
  }
  for (const key of ['model', 'snapshot', 'instrumentVersion']) {
    const value = profile[key];
    if (value !== null && !(typeof value === 'string' && TOKEN_RE.test(value))) {
      errors.push(`${key} must be null or 1-128 printable ASCII characters without spaces`);
    }
  }
  if (profile.instrumentHash !== null && !(typeof profile.instrumentHash === 'string' && HASH_RE.test(profile.instrumentHash))) {
    errors.push('instrumentHash must be null or 64 lowercase hex characters');
  }

  let nonNull = 0;
  const thresholds = profile.thresholds;
  if (!isPlainObject(thresholds)) {
    errors.push('thresholds must be an object');
  } else {
    if (Object.keys(thresholds).some((key) => !CONTRACT.KINDS.includes(key))) errors.push('unknown threshold key');
    for (const kind of CONTRACT.KINDS) {
      if (!hasOwn(thresholds, kind)) {
        errors.push(`missing threshold ${kind}`);
        continue;
      }
      const value = thresholds[kind];
      if (value === null) continue;
      nonNull += 1;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        errors.push(`threshold ${kind} must be null or a number in [0, 1]`);
      }
    }
  }

  if (profile.status === 'uncalibrated' && nonNull > 0) {
    errors.push('an uncalibrated profile must have only null thresholds');
  }
  if (profile.status === 'calibrated') {
    if (nonNull === 0) errors.push('a calibrated profile needs at least one threshold');
    if (typeof profile.model !== 'string') errors.push('a calibrated profile must name its model');
    if (typeof profile.snapshot !== 'string') {
      errors.push('a calibrated profile must name its snapshot');
    } else if (typeof profile.model === 'string' && !servedModelInFamily(profile.snapshot, profile.model)) {
      errors.push('snapshot must be in the model family');
    }
    if (typeof profile.instrumentVersion !== 'string') errors.push('a calibrated profile must name its instrumentVersion');
    if (typeof profile.instrumentHash !== 'string') errors.push('a calibrated profile must name its instrumentHash');
  }
  return { ok: errors.length === 0, errors };
}

function readUncalibratedProfile() {
  const parsed = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, 'uncalibrated.json'), 'utf8'));
  if (!validateProfile(parsed).ok || parsed.status !== 'uncalibrated') {
    throw new Error('calibration: the shipped UNCALIBRATED profile is invalid');
  }
  return deepFreeze(parsed);
}

const UNCALIBRATED_PROFILE = readUncalibratedProfile();

/**
 * Load every valid *.json profile in `dir` (default PROFILES_DIR), in file
 * name order. UNCALIBRATED_PROFILE always comes first. A file that cannot be
 * read or parsed, is over 64 KiB, fails validateProfile, or repeats an
 * earlier profileId is skipped. Never throws and never logs.
 */
function loadProfiles(dir) {
  const directory = dir === undefined ? PROFILES_DIR : dir;
  const profiles = [UNCALIBRATED_PROFILE];
  let names;
  try {
    names = fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort();
  } catch (_e) {
    return profiles;
  }
  for (const name of names) {
    let profile = null;
    try {
      const file = path.join(directory, name);
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.size <= MAX_PROFILE_FILE_BYTES) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (validateProfile(parsed).ok) profile = parsed;
      }
    } catch (_e) {
      profile = null;
    }
    if (profile === null) continue;
    if (profiles.some((existing) => existing.profileId === profile.profileId)) continue;
    profiles.push(deepFreeze(profile));
  }
  return profiles;
}

/**
 * The one valid calibrated profile whose model is the configured pin and
 * whose instrumentHash matches; UNCALIBRATED_PROFILE when there is none, when
 * `profiles` is not an array, or when two profiles claim the same key (fail
 * closed). Reads its inputs without trapping errors.
 */
function selectProfile(profiles, { model, instrumentHash } = {}) {
  if (!Array.isArray(profiles)) return UNCALIBRATED_PROFILE;
  let match = null;
  let matches = 0;
  for (const profile of profiles) {
    if (!isPlainObject(profile)) continue;
    if (profile.status !== 'calibrated' || profile.model !== model || profile.instrumentHash !== instrumentHash) continue;
    if (!validateProfile(profile).ok) continue;
    match = profile;
    matches += 1;
  }
  return matches === 1 ? match : UNCALIBRATED_PROFILE;
}

/**
 * 'calibrated', 'snapshot_changed' or 'uncalibrated' for this profile, the
 * configured pin and the model the upstream reported.
 */
function calibrationStatus({ profile, configuredModel, servedModel }) {
  if (!isPlainObject(profile) || profile.status !== 'calibrated') return 'uncalibrated';
  if (typeof configuredModel !== 'string' || profile.model !== configuredModel) return 'uncalibrated';
  if (profile.instrumentHash !== INSTRUMENT_HASH) return 'uncalibrated';
  if (!servedModelInFamily(servedModel, configuredModel)) return 'uncalibrated';
  if (profile.snapshot !== null && servedModel !== profile.snapshot) return 'snapshot_changed';
  return 'calibrated';
}

function thresholdFor(profile, kind) {
  const thresholds = profile.thresholds;
  const value = thresholds !== null && typeof thresholds === 'object' ? thresholds[kind] : null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function choiceDecision(answer, threshold) {
  if (answer === null || typeof answer !== 'object' || answer.type !== 'choice') {
    throw new TypeError('calibration: expected a choice answer');
  }
  const probabilities = {};
  for (const key of Object.keys(answer.probabilities)) {
    Object.defineProperty(probabilities, key, {
      value: answer.probabilities[key], enumerable: true, writable: true, configurable: true,
    });
  }
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities,
    threshold,
    meetsThreshold: threshold !== null && answer.confidence >= threshold,
  };
}

function noulDecision(kind, answer, threshold) {
  if (answer === null || typeof answer !== 'object' || answer.type !== 'noul') {
    throw new TypeError('calibration: expected a noul answer');
  }
  const p = answer.noul;
  let meetsThreshold = false;
  if (threshold !== null) {
    meetsThreshold = CONTRACT.NOUL_DIRECTION[kind] === 'veto_when_low' ? p <= threshold : p >= threshold;
  }
  return { p, threshold, meetsThreshold };
}

/**
 * Turn validated upstream answers into the D-15 decisions for exactly the
 * requested kinds. Returns {calibration:{status, profileId}, decisions}.
 * When the status is not 'calibrated', every threshold is null and every
 * meetsThreshold false. A missing answer, an answer of the wrong primitive
 * or an unknown kind throws a TypeError.
 */
function applyCalibration({ profile, configuredModel, servedModel, answers, kinds }) {
  const status = calibrationStatus({ profile, configuredModel, servedModel });
  const calibrated = status === 'calibrated';
  const decisions = {};
  for (const kind of kinds) {
    const answer = answers[kind];
    const threshold = calibrated ? thresholdFor(profile, kind) : null;
    if (CONTRACT.CHOICE_KINDS.includes(kind)) decisions[kind] = choiceDecision(answer, threshold);
    else if (CONTRACT.NOUL_KINDS.includes(kind)) decisions[kind] = noulDecision(kind, answer, threshold);
    else throw new TypeError('calibration: unknown kind');
  }
  return { calibration: { status, profileId: profile.profileId }, decisions };
}

module.exports = {
  PROFILES_DIR,
  UNCALIBRATED_PROFILE,
  validateProfile,
  loadProfiles,
  selectProfile,
  servedModelInFamily,
  calibrationStatus,
  applyCalibration,
};
