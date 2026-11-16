'use strict';

/**
 * Phase 67 (JEV-03, D-10, D-11, D-18, D-19, D-20) -- the exact-key Jev
 * request validator.
 *
 * Deny-by-default at every nesting level: one unknown, missing, duplicated or
 * out-of-bounds field rejects the whole request as invalid_request. The
 * server rejects; it never strips or repairs. Client-supplied questions,
 * instructions, criteria or model are unknown keys (D-10), and an element has
 * no value slot (D-18). Only after the whole shape passes does a secret in the
 * goal yield sensitive_goal (D-19).
 *
 * The result is {ok:true, request} (the same object, unmodified) or
 * {ok:false, reason}. A rejection never carries the offending value or field
 * name (D-22). All lengths are counted in code points.
 *
 * A body whose v is 2 is a bind request and is held to the bind rules
 * instead: exactly {v, kinds:['bind'], target, page:{origin, title, path?},
 * candidates:[{id, role, label, context?}]} with ids c1..cN in order, and a
 * secret in the target gives sensitive_goal.
 *
 * MIRROR: extension/ai/jev-state.js ports these rules in the same order, and
 * tests/fixtures/jev-request-cases.js is the shared case list both validators
 * must agree on.
 */

const { CONTRACT } = require('./contract');
const { matchesSecret } = require('./scrubber');

const { KEYS, CAPS, KINDS, OPERATIONS, SCHEMA_VERSION } = CONTRACT;

// Non-global regexes: .test() on them carries no lastIndex state.
const ELEMENT_ID_RE = new RegExp(CONTRACT.ELEMENT_ID_PATTERN);
// Scheme, host (bracketed IPv6 or a DNS/IPv4 host) and an optional port.
// Nothing after the authority: no path, query or fragment (D-20).
const ORIGIN_RE = /^https?:\/\/(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]+)(:[0-9]{1,5})?$/;

function codePointLength(s) {
  return Array.from(s).length;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Plain object whose own keys are all allowed and include every required key. */
function hasExactKeys(obj, allowed, required) {
  if (!isPlainObject(obj)) return false;
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return false;
  }
  for (const key of required) {
    if (!hasOwn(obj, key)) return false;
  }
  return true;
}

function isStringWithin(value, maxCodePoints) {
  return typeof value === 'string' && codePointLength(value) <= maxCodePoints;
}

function isUniqueArray(list) {
  return new Set(list).size === list.length;
}

/** Array (possibly empty) of unique members of `vocabulary`. */
function isUniqueSubset(list, vocabulary) {
  return Array.isArray(list) && isUniqueArray(list) && list.every((item) => vocabulary.includes(item));
}

function isElementId(value) {
  return typeof value === 'string' && ELEMENT_ID_RE.test(value);
}

function validKinds(kinds) {
  return Array.isArray(kinds) && kinds.length > 0 && isUniqueSubset(kinds, KINDS);
}

function validGoal(goal) {
  return typeof goal === 'string' && goal.trim().length > 0 && codePointLength(goal) <= CAPS.goalChars;
}

function validPage(page) {
  if (!hasExactKeys(page, KEYS.page, KEYS.page)) return false;
  const { origin, path, title, text } = page;
  if (!isStringWithin(origin, CAPS.originChars) || !ORIGIN_RE.test(origin)) return false;
  if (!isStringWithin(path, CAPS.pathChars) || !path.startsWith('/')) return false;
  if (path.includes('?') || path.includes('#')) return false;
  if (!isStringWithin(title, CAPS.titleChars)) return false;
  if (!isStringWithin(text, CAPS.textChars)) return false;
  return true;
}

function validElement(element, seenIds) {
  if (!hasExactKeys(element, KEYS.element, KEYS.element)) return false;
  const { id, role, label, ops } = element;
  if (!isElementId(id) || seenIds.has(id)) return false;
  seenIds.add(id);
  if (!isStringWithin(role, CAPS.roleChars) || role.length === 0) return false;
  if (!isStringWithin(label, CAPS.labelChars)) return false;
  if (!isUniqueSubset(ops, OPERATIONS) || ops.length === 0 || ops.length > CAPS.opsPerElement) return false;
  return true;
}

function validElements(elements, seenIds) {
  if (!Array.isArray(elements) || elements.length > CAPS.elements) return false;
  return elements.every((element) => validElement(element, seenIds));
}

function validRecentAction(action) {
  if (!hasExactKeys(action, KEYS.recentAction, KEYS.recentAction)) return false;
  if (!OPERATIONS.includes(action.op)) return false;
  if (action.targetId !== null && !isElementId(action.targetId)) return false;
  return typeof action.changed === 'boolean';
}

function validRecentActions(actions) {
  if (!Array.isArray(actions) || actions.length > CAPS.recentActions) return false;
  return actions.every(validRecentAction);
}

function validProposedAction(action, elementIds) {
  if (!hasExactKeys(action, KEYS.proposedAction, KEYS.proposedAction)) return false;
  if (!OPERATIONS.includes(action.op)) return false;
  return action.targetId === null || (typeof action.targetId === 'string' && elementIds.has(action.targetId));
}

/** True when the whole request shape passes; checks run in the documented order. */
function validShape(body) {
  if (!isPlainObject(body)) return false;
  for (const key of Object.keys(body)) {
    if (!KEYS.request.includes(key)) return false;
  }
  for (const key of KEYS.requestRequired) {
    if (!hasOwn(body, key)) return false;
  }
  if (body.v !== SCHEMA_VERSION) return false;
  if (!validKinds(body.kinds)) return false;
  if (!validGoal(body.goal)) return false;
  if (!validPage(body.page)) return false;
  const elementIds = new Set();
  if (!validElements(body.elements, elementIds)) return false;
  if (!validRecentActions(body.recentActions)) return false;
  if (!isUniqueSubset(body.offeredOps, OPERATIONS)) return false;

  // Cross-field rules.
  const kinds = body.kinds;
  if (kinds.includes('operation') && body.offeredOps.length === 0) return false;
  if (kinds.includes('target') && body.elements.length === 0) return false;
  const hasProposedAction = hasOwn(body, 'proposedAction');
  if (hasProposedAction !== kinds.includes('risk')) return false;
  if (hasProposedAction && !validProposedAction(body.proposedAction, elementIds)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Request version 2: the bind decision
// ---------------------------------------------------------------------------

const BIND_CAPS = CONTRACT.BIND_CAPS;
const BIND_CANDIDATE_ID_RE = new RegExp(CONTRACT.BIND_CANDIDATE_ID_PATTERN);

function validBindKinds(kinds) {
  return Array.isArray(kinds) && kinds.length === CONTRACT.BIND_KINDS.length
    && kinds.every((kind, index) => kind === CONTRACT.BIND_KINDS[index]);
}

function validTarget(target) {
  return typeof target === 'string' && target.trim().length > 0 && codePointLength(target) <= BIND_CAPS.targetChars;
}

/** origin and title are required; path is optional and never carries a query or fragment. */
function validBindPage(page) {
  if (!hasExactKeys(page, KEYS.bindPage, KEYS.bindPageRequired)) return false;
  const { origin, title } = page;
  if (!isStringWithin(origin, BIND_CAPS.originChars) || !ORIGIN_RE.test(origin)) return false;
  if (!isStringWithin(title, BIND_CAPS.titleChars)) return false;
  if (hasOwn(page, 'path')) {
    const { path } = page;
    if (!isStringWithin(path, BIND_CAPS.pathChars) || !path.startsWith('/')) return false;
    if (path.includes('?') || path.includes('#')) return false;
  }
  return true;
}

/** The candidate at `index` is numbered c<index + 1>; context is optional. */
function validCandidate(candidate, index) {
  if (!hasExactKeys(candidate, KEYS.bindCandidate, KEYS.bindCandidateRequired)) return false;
  const { id, role, label } = candidate;
  if (typeof id !== 'string' || !BIND_CANDIDATE_ID_RE.test(id) || id !== `c${index + 1}`) return false;
  if (!isStringWithin(role, BIND_CAPS.roleChars) || role.length === 0) return false;
  if (!isStringWithin(label, BIND_CAPS.labelChars)) return false;
  if (hasOwn(candidate, 'context') && !isStringWithin(candidate.context, BIND_CAPS.contextChars)) return false;
  return true;
}

function validCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > BIND_CAPS.candidates) return false;
  return candidates.every(validCandidate);
}

/** True when the whole version 2 shape passes. */
function validBindShape(body) {
  if (!hasExactKeys(body, KEYS.bindRequest, KEYS.bindRequest)) return false;
  if (body.v !== CONTRACT.BIND_SCHEMA_VERSION) return false;
  if (!validBindKinds(body.kinds)) return false;
  if (!validTarget(body.target)) return false;
  if (!validBindPage(body.page)) return false;
  return validCandidates(body.candidates);
}

function isBindVersion(body) {
  return isPlainObject(body) && body.v === CONTRACT.BIND_SCHEMA_VERSION;
}

/**
 * Validate one parsed request body. The schema version picks the rule set: a
 * body whose v is 2 is held to the bind rules, anything else to version 1's.
 * A secret in the goal (version 1) or the target (version 2) gives
 * sensitive_goal, only after the whole shape passes.
 * @returns {{ok:true, request:object}|{ok:false, reason:'invalid_request'|'sensitive_goal'}}
 */
function validateRequest(body) {
  if (isBindVersion(body)) {
    if (!validBindShape(body)) return { ok: false, reason: 'invalid_request' };
    if (matchesSecret(body.target)) return { ok: false, reason: 'sensitive_goal' };
    return { ok: true, request: body };
  }
  if (!validShape(body)) return { ok: false, reason: 'invalid_request' };
  if (matchesSecret(body.goal)) return { ok: false, reason: 'sensitive_goal' };
  return { ok: true, request: body };
}

module.exports = { validateRequest, codePointLength };
