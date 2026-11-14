/**
 * Phase 67 recorded fake-upstream answers for the offline shadow run (D-26).
 *
 * The committed file scripts/bench/shadow/answers/fake-upstream.json holds one
 * compact answer per seed record, for exactly the kinds that record asks:
 *   Choice (operation, target): {pick, top}
 *   Noul (completion, stuck, risk): {p}
 *
 * A test fake upstream answers the gateway from this file. It cannot see the
 * record id, only the upstream body the gateway built, so answers are looked
 * up by the SHA-256 of the canonical JSON of that body's `state`
 * (buildAnswerLookup runs each record request through the server's own
 * buildUpstreamBody to get the same state the gateway sends).
 *
 * expandAnswer turns a compact answer into a raw upstream answer that the
 * server's validateAnswers accepts: the pick gets `top`, the other offered
 * options share 1 - top equally, and confidence is (n x top - 1) / (n - 1)
 * clamped to [0, 1], the same rule as tests/fixtures/jev-fake-upstream.js.
 *
 * Nothing here touches the network, the clock or the environment. The only
 * filesystem read is loadRecordedAnswers(file).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { canonicalJson, sha256Hex } = require('../../../../showcase/server/src/jev/canonical-json.js');
const { buildUpstreamBody } = require('../../../../showcase/server/src/jev/instrument.js');

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const RECORDED_ANSWERS_PATH = path.resolve(MODULE_DIR, '..', 'answers', 'fake-upstream.json');

const CHOICE_KINDS = Object.freeze(['operation', 'target']);
const NOUL_KINDS = Object.freeze(['completion', 'stuck', 'risk']);
const KINDS = Object.freeze([...CHOICE_KINDS, ...NOUL_KINDS]);
const TOP_KEYS = Object.freeze(['schemaVersion', 'note', 'servedModel', 'answers']);
const RECORD_ID_PATTERN = /^shadow-[a-z0-9-]+-\d{2}$/;
const MODEL_PATTERN = /^[\x21-\x7e]{1,128}$/;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isUnit = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const quote = (value) => JSON.stringify(String(value)).slice(0, 60);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function sameKeys(obj, keys) {
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every((key) => hasOwn(obj, key));
}

// --- Expansion -------------------------------------------------------------------

/**
 * The raw upstream answer for one asked question. Throws a TypeError when the
 * compact answer does not fit the question: a pick that is not offered, a top
 * below 1/n or above 1, or a Choice answer for a Noul question (and back).
 */
export function expandAnswer(question, compact) {
  if (!isPlainObject(question)) throw new TypeError('recorded answers: question must be an object');
  if (!isPlainObject(compact)) throw new TypeError('recorded answers: compact answer must be an object');
  if (question.type === 'noul') {
    if (!sameKeys(compact, ['p'])) throw new TypeError('recorded answers: a noul answer is exactly {p}');
    if (!isUnit(compact.p)) throw new TypeError('recorded answers: p must be a number in [0, 1]');
    return { type: 'noul', noul: compact.p };
  }
  if (question.type !== 'choice') throw new TypeError('recorded answers: unknown question type');
  if (!sameKeys(compact, ['pick', 'top'])) throw new TypeError('recorded answers: a choice answer is exactly {pick, top}');
  const offered = isPlainObject(question.criteria) ? Object.keys(question.criteria) : [];
  const n = offered.length;
  if (n === 0) throw new TypeError('recorded answers: the question offers no option');
  if (typeof compact.pick !== 'string' || !offered.includes(compact.pick)) {
    throw new TypeError(`recorded answers: pick ${quote(compact.pick)} is not offered`);
  }
  if (!isUnit(compact.top)) throw new TypeError('recorded answers: top must be a number in [0, 1]');
  if (compact.top < 1 / n) throw new TypeError('recorded answers: top must be at least 1/n so the pick is the argmax');
  const probabilities = {};
  if (n === 1) {
    probabilities[offered[0]] = 1;
    return { type: 'choice', choice: compact.pick, confidence: 1, probabilities };
  }
  const rest = (1 - compact.top) / (n - 1);
  for (const key of offered) probabilities[key] = key === compact.pick ? compact.top : rest;
  const confidence = Math.min(1, Math.max(0, (n * compact.top - 1) / (n - 1)));
  return { type: 'choice', choice: compact.pick, confidence, probabilities };
}

// --- The committed file ----------------------------------------------------------

function entryErrors(id, entry, errors) {
  if (!isPlainObject(entry)) {
    errors.push(`answers.${id} must be an object`);
    return;
  }
  const kinds = Object.keys(entry);
  if (kinds.length === 0) errors.push(`answers.${id} must answer at least one kind`);
  for (const kind of kinds) {
    const label = `answers.${id}.${quote(kind).slice(1, -1)}`;
    if (!KINDS.includes(kind)) {
      errors.push(`${label} is not a Jev kind`);
      continue;
    }
    const answer = entry[kind];
    if (!isPlainObject(answer)) {
      errors.push(`${label} must be an object`);
    } else if (CHOICE_KINDS.includes(kind)) {
      if (!sameKeys(answer, ['pick', 'top'])) errors.push(`${label} must be exactly {pick, top}`);
      else if (typeof answer.pick !== 'string' || answer.pick.length === 0) errors.push(`${label}.pick must be a non-empty string`);
      else if (!(isUnit(answer.top) && answer.top > 0)) errors.push(`${label}.top must be a number in (0, 1]`);
    } else if (!sameKeys(answer, ['p'])) {
      errors.push(`${label} must be exactly {p}`);
    } else if (!isUnit(answer.p)) {
      errors.push(`${label}.p must be a number in [0, 1]`);
    }
  }
}

/** Read, validate and deep-freeze the recorded answers; one aggregated Error on any problem. */
export function loadRecordedAnswers(file = RECORDED_ANSWERS_PATH) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`recorded answers: ${file} is not readable JSON`);
  }
  const errors = [];
  if (!isPlainObject(parsed)) {
    errors.push('the file must hold an object');
  } else {
    for (const key of Object.keys(parsed)) if (!TOP_KEYS.includes(key)) errors.push(`unknown key ${quote(key)}`);
    for (const key of TOP_KEYS) if (!hasOwn(parsed, key)) errors.push(`missing key ${quote(key)}`);
    if (hasOwn(parsed, 'schemaVersion') && parsed.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (hasOwn(parsed, 'note') && !(typeof parsed.note === 'string' && parsed.note.trim().length > 0)) {
      errors.push('note must be a non-empty string');
    }
    if (hasOwn(parsed, 'servedModel') && !(typeof parsed.servedModel === 'string' && MODEL_PATTERN.test(parsed.servedModel))) {
      errors.push('servedModel must be 1-128 printable ASCII characters without spaces');
    }
    if (hasOwn(parsed, 'answers')) {
      if (!isPlainObject(parsed.answers)) {
        errors.push('answers must be an object');
      } else {
        for (const id of Object.keys(parsed.answers)) {
          if (!RECORD_ID_PATTERN.test(id)) {
            errors.push(`answers key ${quote(id)} is not a record id`);
            continue;
          }
          entryErrors(id, parsed.answers[id], errors);
        }
      }
    }
  }
  if (errors.length > 0) throw new Error(`recorded answers: ${file} is invalid: ${errors.join('; ')}`);
  return deepFreeze(parsed);
}

// --- Lookup by upstream state ----------------------------------------------------

/** The lookup key of one upstream `state`: the SHA-256 of its canonical JSON. */
export function stateKey(state) {
  return sha256Hex(canonicalJson(state));
}

/**
 * Map(stateKey -> compact answers) for these records. Each record must have a
 * recorded entry for exactly its requested kinds, and every entry must expand
 * against the questions the server builds for it. Throws on any gap, so a
 * broken answer file fails before a single request is made.
 */
export function buildAnswerLookup(records, recorded, { model } = {}) {
  if (!Array.isArray(records)) throw new TypeError('recorded answers: records must be an array');
  if (!isPlainObject(recorded) || !isPlainObject(recorded.answers)) {
    throw new TypeError('recorded answers: recorded must be a loaded answers file');
  }
  const lookup = new Map();
  for (const record of records) {
    const id = record && record.id;
    if (!hasOwn(recorded.answers, id)) throw new Error(`recorded answers: no recorded answer for ${quote(id)}`);
    const entry = recorded.answers[id];
    const asked = [...record.request.kinds].sort();
    const answered = Object.keys(entry).sort();
    if (asked.length !== answered.length || asked.some((kind, i) => kind !== answered[i])) {
      throw new Error(`recorded answers: ${quote(id)} answers kinds ${answered.join(',')} but asks ${asked.join(',')}`);
    }
    const built = buildUpstreamBody(record.request, { model });
    if (!built.ok) throw new Error(`recorded answers: ${quote(id)} does not fit the instrument byte budget`);
    for (const kind of Object.keys(built.body.questions)) {
      try {
        expandAnswer(built.body.questions[kind], entry[kind]);
      } catch (error) {
        throw new Error(`recorded answers: ${quote(id)} ${kind}: ${error.message}`);
      }
    }
    const key = stateKey(built.body.state);
    if (lookup.has(key)) throw new Error(`recorded answers: ${quote(id)} has the same upstream state as another record`);
    lookup.set(key, entry);
  }
  return lookup;
}

/**
 * The raw upstream `answers` for one parsed upstream body, or null when its
 * state is not in the lookup or a question has no recorded answer.
 */
export function answersForBody(lookup, body) {
  if (!(lookup instanceof Map) || !isPlainObject(body) || !isPlainObject(body.state) || !isPlainObject(body.questions)) {
    return null;
  }
  const entry = lookup.get(stateKey(body.state));
  if (!entry) return null;
  const answers = {};
  for (const kind of Object.keys(body.questions)) {
    if (!hasOwn(entry, kind)) return null;
    answers[kind] = expandAnswer(body.questions[kind], entry[kind]);
  }
  return answers;
}
