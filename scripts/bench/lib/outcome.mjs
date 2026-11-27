/**
 * Phase 66 claim-blind outcome evaluation (D-17).
 *
 * A run passes only on evidence that neither FSB nor the agent under test
 * controls: the fixture server's request log, the final URL and DOM markers
 * read after the timed window, and (live tasks only) the page text. Agent
 * claims -- run_task status, complete_task, a Claude result -- are stored
 * beside the evidence as `claimed` and are never read here.
 *
 * Evidence: { requests: [{ t, method, path, query, bodyType, body }],
 *             finalUrl, markers: { <name>: <string> }, text }
 * Request paths arrive with the /r/<token> run prefix already removed.
 *
 * Check details hold counts and booleans only (or a fixed error label),
 * never page text, URLs or request bodies, so results can be committed.
 */

export const CHECK_KINDS = Object.freeze(['request', 'finalUrl', 'marker', 'text']);

const INVALID_CHECK = 'invalid check';

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid() {
  return { pass: false, detail: { error: INVALID_CHECK } };
}

// Canonical JSON for jsonEquals: object keys sorted at every depth, undefined
// and function values dropped, array order kept, cycles rejected. Same rules
// as stableJson in extension/utils/mcp-lattice-journal.js.
function canonical(value) {
  const seen = new Set();
  const normalize = (node) => {
    if (node === null || typeof node !== 'object') return node;
    if (seen.has(node)) throw new TypeError('Circular value cannot be compared');
    seen.add(node);
    let out;
    if (Array.isArray(node)) {
      out = node.map(normalize);
    } else {
      out = {};
      for (const key of Object.keys(node).sort()) {
        const child = node[key];
        if (child !== undefined && typeof child !== 'function') out[key] = normalize(child);
      }
    }
    seen.delete(node);
    return out;
  };
  return JSON.stringify(normalize(value === undefined ? null : value));
}

function sameJson(a, b) {
  try {
    return canonical(a) === canonical(b);
  } catch {
    return false;
  }
}

// Removes a leading /r/<token> run prefix; any other path is returned as is.
export function stripRunPrefix(pathname, token) {
  if (typeof pathname !== 'string' || typeof token !== 'string' || !token) return pathname;
  const prefix = `/r/${token}`;
  if (pathname === prefix) return '/';
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}

// { path, query } for a final URL with the run prefix removed; the first
// value wins for a repeated query key. Null for a missing or unparseable URL.
export function normalizeFinalUrl(url, token) {
  if (typeof url !== 'string' || !url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const entries = [];
  const seen = new Set();
  for (const [key, value] of parsed.searchParams) {
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push([key, value]);
  }
  return { path: stripRunPrefix(parsed.pathname, token), query: Object.fromEntries(entries) };
}

// Passes when exactly `count` requests share the method (case-insensitive),
// the path (exact) and, when jsonEquals is present, a canonically equal body.
function checkRequest(check, requests) {
  if (typeof check.method !== 'string' || !check.method || typeof check.path !== 'string' || !check.path
    || !Number.isInteger(check.count) || check.count < 0) {
    return invalid();
  }
  // No request log is not the same as an empty one: fail closed.
  if (!Array.isArray(requests)) return { pass: false, detail: { error: 'no request evidence' } };
  const method = check.method.toUpperCase();
  const compareBody = hasOwn(check, 'jsonEquals');
  let matched = 0;
  for (const request of requests) {
    if (!isPlainObject(request)) continue;
    if (typeof request.method !== 'string' || request.method.toUpperCase() !== method) continue;
    if (request.path !== check.path) continue;
    if (compareBody && !sameJson(request.body, check.jsonEquals)) continue;
    matched += 1;
  }
  return { pass: matched === check.count, detail: { matched, expected: check.count } };
}

function checkFinalUrl(check, finalUrl, token) {
  const wantsPath = hasOwn(check, 'pathEquals');
  const wantsQuery = hasOwn(check, 'queryIncludes');
  const wantsUrl = hasOwn(check, 'urlIncludes');
  if ((!wantsPath && !wantsQuery && !wantsUrl)
    || (wantsPath && typeof check.pathEquals !== 'string')
    || (wantsQuery && (!isPlainObject(check.queryIncludes) || Object.keys(check.queryIncludes).length === 0))
    || (wantsUrl && (typeof check.urlIncludes !== 'string' || !check.urlIncludes))) {
    return invalid();
  }
  const normalized = normalizeFinalUrl(finalUrl, token);
  const detail = {};
  if (wantsPath) detail.pathMatched = !!normalized && normalized.path === check.pathEquals;
  if (wantsQuery) {
    detail.queryMatched = !!normalized && Object.keys(check.queryIncludes).every((key) => (
      hasOwn(normalized.query, key) && normalized.query[key] === String(check.queryIncludes[key])
    ));
  }
  if (wantsUrl) detail.urlMatched = typeof finalUrl === 'string' && finalUrl.includes(check.urlIncludes);
  return { pass: Object.values(detail).every(Boolean), detail };
}

function checkMarker(check, markers) {
  if (typeof check.name !== 'string' || !check.name || typeof check.equals !== 'string') return invalid();
  const present = isPlainObject(markers) && hasOwn(markers, check.name) && typeof markers[check.name] === 'string';
  const matched = present && markers[check.name] === check.equals;
  return { pass: matched, detail: { present, matched } };
}

function checkText(check, text) {
  if (typeof check.includes !== 'string' || !check.includes) return invalid();
  const matched = typeof text === 'string' && text.includes(check.includes);
  return { pass: matched, detail: { matched } };
}

// Returns { pass, checks: [{ kind, pass, detail }] }. Every check in
// task.success.all must pass, and a task with no checks fails. Options:
// { token } is the run token whose /r/<token> prefix core final URLs carry.
export function evaluateOutcome(task, evidence, options) {
  const checks = task && isPlainObject(task.success) && Array.isArray(task.success.all) ? task.success.all : [];
  const token = task && task.set !== 'live' && options && typeof options.token === 'string' ? options.token : null;
  // Read exactly these four fields; never enumerate or spread the evidence.
  const source = evidence !== null && typeof evidence === 'object' ? evidence : {};
  const requests = source.requests;
  const finalUrl = source.finalUrl;
  const markers = source.markers;
  const text = source.text;

  const results = checks.map((check) => {
    if (!isPlainObject(check)) return { kind: null, ...invalid() };
    let outcome;
    switch (check.kind) {
      case 'request': outcome = checkRequest(check, requests); break;
      case 'finalUrl': outcome = checkFinalUrl(check, finalUrl, token); break;
      case 'marker': outcome = checkMarker(check, markers); break;
      case 'text': outcome = checkText(check, text); break;
      default: outcome = { pass: false, detail: { error: 'unknown check kind' } };
    }
    return { kind: check.kind, pass: outcome.pass, detail: outcome.detail };
  });
  return { pass: results.length > 0 && results.every((c) => c.pass), checks: results };
}
