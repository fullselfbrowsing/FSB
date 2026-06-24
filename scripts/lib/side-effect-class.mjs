#!/usr/bin/env node
/**
 * Phase 36 / Plan 01+03 (v1.0.0 Full App Catalog -- CGEN-02) -- the SINGLE shared
 * side-effect derivation. Imported by BOTH:
 *   - scripts/import-opentabs-catalog.mjs (EMIT time: stamps sideEffectClass)
 *   - scripts/verify-catalog-crosscheck.mjs (the GATE: re-derives + fails the build)
 *
 * WHY ONE MODULE (HI-02): previously the importer and the gate each carried their
 * own copy of the verb-map + carve-out + override table, and the two copies had
 * DIVERGED (`void`/`cancel` were destructive in the importer but only write in the
 * gate; `archive` differed; the importer's verb-prefix could not split camelCase).
 * A gate that re-derives from a DIFFERENT map than the importer is a check that can
 * silently disagree with what it is checking. Hoisting the entire derivation HERE
 * makes divergence impossible: the gate is now a true second evaluation of the SAME
 * logic over the persisted signals, so an importer mis-stamp (a different generator,
 * a hand-edit) is caught because BOTH sides agree on what the signals imply.
 *
 * Derivation priority (RESEARCH Mechanic 2):
 *   1. GraphQL/RPC carve-out (FIRST): transport in {graphql, gql, gqlRequest,
 *      persisted-query, rpc} -> the HTTP method is uninformative (always POST);
 *      classify by the OP-NAME VERB; an ambiguous GraphQL op fails-safe to WRITE;
 *      a GraphQL op is NEVER auto-classed read merely because no apiPost appears.
 *   2. Named verb helper: apiGet->read; apiPost/apiPut/apiPatch->write;
 *      apiDelete->destructive; apiVoid->write (its upstream default is POST).
 *   3. Generic api({method}): GET/HEAD->read; POST/PUT/PATCH->write; DELETE->destructive.
 *   4. Op-name verb prefix (ALWAYS computed; the cross-check partner): the read verb
 *      set and the write/destructive verb set (delete-family + void/cancel/archive
 *      -> destructive).
 *   5. Override table (highest specificity, applied LAST as an UPGRADE-only FLOOR).
 *   6. FAIL-SAFE-HIGH FLOOR (HI-01): a generic mutating-capable transport
 *      (api/apiVoid) with NO usable signal (no method, unrecognized verb) MUST NOT
 *      float at the read floor -- derive at least WRITE. A "read" declared over such
 *      an op therefore FAILS the gate.
 * deriveClass(signals) = MAX over every computed signal AND the override floor AND
 * the no-signal fail-safe-high floor (read < write < destructive).
 *
 * Wall-1 discipline: build tooling (NOT shipped to the browser); kept FREE of
 * run-string-as-code / function-from-string / dynamic-module-loader constructs in
 * code AND comments, consistent with the recipe-path guard.
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

// ---- Class lattice: read < write < destructive (fail-safe-high MAX-merge) -----
export const SIDE_EFFECT_ORDER = { read: 0, write: 1, destructive: 2 };
const BY_RANK = ['read', 'write', 'destructive'];

export function rankOf(cls) {
  const r = SIDE_EFFECT_ORDER[cls];
  return typeof r === 'number' ? r : 0; // unknown -> read floor (the MAX of real signals dominates)
}

// Return the higher-severity of two classes (the MAX in read<write<destructive).
export function maxClass(a, b) {
  return rankOf(a) >= rankOf(b) ? BY_RANK[rankOf(a)] : BY_RANK[rankOf(b)];
}

// ---- Verb sets (RESEARCH Mechanic 2; ALIGNED across importer + gate) ----------
// Read verbs: a pure data read.
export const READ_VERBS = new Set(['list', 'get', 'search', 'read', 'fetch', 'find', 'query', 'load', 'show', 'view']);
// Destructive verbs: irreversible / un-reversing mutation. The delete-family PLUS
// void/cancel/archive -- these are treated destructive CONSISTENTLY on both sides
// (HI-02 alignment: the importer formerly had void/cancel here and the gate had
// them as mere write; archive likewise differed). Voiding an invoice, cancelling a
// subscription, and archiving a record are all effectively-irreversible from the
// user's seat, so the gate floors them destructive everywhere.
export const DESTRUCTIVE_VERBS = new Set(['delete', 'remove', 'destroy', 'purge', 'drop', 'void', 'cancel', 'archive']);
// Write verbs: a reversible / additive mutation.
export const WRITE_VERBS = new Set([
  'create', 'update', 'add', 'set', 'merge', 'move', 'finalize',
  'edit', 'patch', 'put', 'post', 'refund', 'send', 'close', 'reopen',
  'complete', 'assign', 'upload', 'write', 'insert', 'replace', 'enable', 'disable',
  'rename', 'unarchive',
]);

/**
 * verbPrefix(opName) -> the leading verb TOKEN, lowercased ('' when none).
 *
 * snake_case OR camelCase aware (HI-02): the leading token is everything up to the
 * first '_' OR the first inner capital. So `create_task` -> 'create',
 * `voidInvoice` -> 'void', `archiveIssue` -> 'archive', `getCurrentUser` -> 'get',
 * `deleteCustomer` -> 'delete', `cancelSubscription` -> 'cancel'. This makes the
 * GraphQL camelCase verb signal LIVE (linear/github ops are camelCase) instead of
 * silently dead (the old `^([a-zA-Z]+)` swallowed the whole identifier).
 */
export function verbPrefix(opName) {
  const s = String(opName || '');
  // The leading token: a first letter (either case) followed by a run of LOWERCASE
  // letters, stopping at the first '_', the first inner UPPERCASE letter, or end.
  // No /i flag -- the boundary MUST be a real uppercase letter so `voidInvoice`
  // splits at the `I` (-> 'void') and `getCurrentUser` splits at the `C` (-> 'get').
  // A leading uppercase identifier (`VoidInvoice`) still yields its first token,
  // lowercased ('void'). snake_case stops at '_': `create_task` -> 'create'.
  const m = s.match(/^[A-Za-z][a-z]*/);
  return m ? m[0].toLowerCase() : '';
}

/**
 * verbClass(opNameVerb) -> 'read' | 'write' | 'destructive' | null
 *
 * Maps an op-name verb token to a class. A destructive verb -> destructive; a read
 * verb -> read; a known write verb -> write; an UNRECOGNIZED verb -> null (no
 * signal; the method/helper carry it, MAX-merged). Accepts EITHER a bare verb token
 * OR a full op-name (camelCase/snake_case) -- it runs verbPrefix() defensively so a
 * caller that hands the whole name still resolves the leading verb.
 */
export function verbClass(opNameVerb) {
  const raw = String(opNameVerb || '').toLowerCase().trim();
  if (!raw) return null;
  // Defensive: if a caller passed a full op-name (snake_case/camelCase) rather than
  // a pre-split token, recover the leading verb so void/cancel/archive still floor.
  const v = /[_A-Z]/.test(String(opNameVerb || '')) ? verbPrefix(opNameVerb) : raw;
  if (!v) return null;
  if (DESTRUCTIVE_VERBS.has(v)) return 'destructive';
  if (READ_VERBS.has(v)) return 'read';
  if (WRITE_VERBS.has(v)) return 'write';
  return null;
}

// ---- Transport classification: GraphQL/RPC carve-out + named-verb helper ------
// A GraphQL/RPC transport is ALWAYS POST -> the method is uninformative.
export const GRAPHQL_TRANSPORT_RE = /(graphql|gql|gqlrequest|persisted-?query|\brpc\b|\bmutate\b)/i;

export function isGraphqlTransport(transportHelper) {
  return GRAPHQL_TRANSPORT_RE.test(String(transportHelper || ''));
}

/**
 * isApiHelper(transportHelper) -> boolean
 *
 * True for the generic mutating-CAPABLE REST transports (`api`, `apiVoid`,
 * `apiPost`, ... -- anything whose name starts with "api"). Used by the HI-01
 * fail-safe-high floor: such a transport with no usable method/verb signal must NOT
 * default to read.
 */
export function isApiHelper(transportHelper) {
  return /^api/.test(String(transportHelper || '').toLowerCase());
}

/**
 * helperClass(transportHelper) -> 'read' | 'write' | 'destructive' | null
 *
 * The named-verb helper signal (airtable convention): apiGet->read; apiPost/apiPut/
 * apiPatch->write; apiDelete->destructive; apiVoid->write. apiVoid's upstream
 * default method is POST (never GET), so the HELPER NAME ALONE floors it to write
 * even when the persisted httpMethod is absent (MED-02 defense-in-depth). Checked
 * delete-FIRST so "apiDelete" is not shadowed by a substring match; void BEFORE the
 * get check for the same reason.
 */
export function helperClass(transportHelper) {
  const h = String(transportHelper || '').toLowerCase();
  if (!h) return null;
  if (/api[_-]?delete/.test(h)) return 'destructive';
  if (/api[_-]?(post|put|patch)/.test(h)) return 'write';
  // apiVoid is a mutating transport (upstream default POST). Floor it to write on
  // the helper name alone -- placed BEFORE the get check so "apivoid" is not missed.
  if (/api[_-]?void/.test(h)) return 'write';
  if (/api[_-]?get/.test(h)) return 'read';
  return null;
}

// ---- Generic api({method}) literal (stripe convention) ------------------------
export function methodClass(httpMethod) {
  const m = String(httpMethod || '').toUpperCase().trim();
  if (!m) return null;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'read';
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'write';
  if (m === 'DELETE') return 'destructive';
  return null;
}

// ---- Override table (RESEARCH Mechanic 2, priority 5) -------------------------
// Keyed by op-name (or a slug ending in the op-name), value is the FLOOR class
// (max-merged -- it can only ESCALATE, never downgrade).
export const SIDE_EFFECT_OVERRIDES = {
  void_invoice: 'destructive',
  delete_customer: 'destructive',
  cancel_subscription: 'destructive',
  refund_charge: 'destructive',
  delete_record: 'destructive',
  archive_project: 'destructive',
  merge_pull_request: 'write',
};

/**
 * overrideFloor(opName, slug) -> 'read' | 'write' | 'destructive' | null
 *
 * The override is keyed by the op-name. It matches when the op-name equals a key,
 * OR when the slug ENDS WITH the key (the importer's slugs are `<service>.<op>` e.g.
 * `stripe.void_invoice`, or `<service>__<op>`), so feeding either the bare op-name
 * OR the dotted slug resolves the floor. (MED-01: callers should pass a real
 * op-name, NOT a bare verb prefix, as arg 1 -- a verb prefix like `void` is not an
 * override key and would only ever resolve via the slug branch.)
 */
export function overrideFloor(opName, slug) {
  const name = String(opName || '').toLowerCase();
  if (name && Object.prototype.hasOwnProperty.call(SIDE_EFFECT_OVERRIDES, name)) {
    return SIDE_EFFECT_OVERRIDES[name];
  }
  const s = String(slug || '').toLowerCase();
  if (s) {
    for (const key of Object.keys(SIDE_EFFECT_OVERRIDES)) {
      if (s === key || s.endsWith('.' + key) || s.endsWith('__' + key)) {
        return SIDE_EFFECT_OVERRIDES[key];
      }
    }
  }
  return null;
}

/**
 * opNameFromSlug(slug) -> the trailing op-name token of a slug, or ''.
 *
 * `stripe.void_invoice` -> `void_invoice`; `opentabs__todoist__close_task` ->
 * `close_task`; `todoist.close_task` -> `close_task`. Used so overrideFloor() and
 * the camelCase verb signal can be recovered from the slug when an explicit op-name
 * is not handed in (MED-01: closes the dead first-argument override path by deriving
 * the real op-name instead of passing a bare verb prefix).
 */
export function opNameFromSlug(slug) {
  const s = String(slug || '');
  if (!s) return '';
  // Split on '.' first (service.op), then on the '__' OpenTabs separator.
  const afterDot = s.indexOf('.') >= 0 ? s.slice(s.lastIndexOf('.') + 1) : s;
  const parts = afterDot.split('__');
  return parts[parts.length - 1] || '';
}

/**
 * deriveClass(signals, slug) -> 'read' | 'write' | 'destructive'
 *
 * The MAX over every computed signal AND the override floor AND the HI-01
 * no-signal fail-safe-high floor. Applies the GraphQL/RPC carve-out FIRST: for a
 * GraphQL/RPC transport the method is discarded and the op-name verb decides, with
 * an ambiguous GraphQL op failing safe to WRITE (never auto-read). For a non-GraphQL
 * transport, the named-verb helper, the generic method literal, AND the op-name verb
 * are MAX-merged. The override table is an UPGRADE-only floor. FINALLY, when the
 * transport is a generic mutating-capable api/apiVoid helper and NO usable signal
 * fired (no helper class, no method class, no recognized verb), the class is floored
 * to WRITE -- a writable-capable op must never sit at the read floor (HI-01).
 *
 * signals: { transportHelper, httpMethod, opNameVerb } (the importer's persisted
 * shape). The op-name verb is read from signals.opNameVerb but ALSO recovered from
 * the slug (so a camelCase op whose persisted verb token was empty still resolves).
 */
export function deriveClass(signals, slug) {
  const s = signals && typeof signals === 'object' ? signals : {};
  const transportHelper = s.transportHelper;
  const httpMethod = s.httpMethod;
  // The op-name verb: prefer the persisted token, else recover it from the slug's
  // trailing op-name (camelCase/snake_case aware). verbClass() itself also runs
  // verbPrefix() defensively, so a full op-name passed here still resolves.
  const opName = opNameFromSlug(slug);
  const opNameVerb = (s.opNameVerb !== undefined && s.opNameVerb !== null && s.opNameVerb !== '')
    ? s.opNameVerb
    : opName;

  const nameVerbCls = verbClass(opNameVerb);

  let derived = 'read'; // floor

  if (isGraphqlTransport(transportHelper)) {
    // CARVE-OUT: the HTTP method is uninformative (GraphQL/RPC is always POST).
    // Classify by the op-name verb; an ambiguous GraphQL op (no recognized verb)
    // fails-safe to WRITE -- never auto-classed read because the method is POST.
    if (nameVerbCls) {
      derived = maxClass(derived, nameVerbCls);
    } else {
      derived = maxClass(derived, 'write');
    }
  } else {
    // Non-GraphQL: combine the named-verb helper, the generic method literal, and
    // the op-name verb -- MAX-merged so the most-severe signal wins.
    const hCls = helperClass(transportHelper);
    const mCls = methodClass(httpMethod);
    if (hCls) derived = maxClass(derived, hCls);
    if (mCls) derived = maxClass(derived, mCls);
    if (nameVerbCls) derived = maxClass(derived, nameVerbCls);

    // HI-01 FAIL-SAFE-HIGH FLOOR: a generic mutating-capable transport (api/apiVoid/
    // apiPost/...) with NO usable signal -- no helper class, no method class, no
    // recognized verb -- MUST NOT float at the read floor. Such a shape (`api` with
    // httpMethod:null and an unrecognized verb like `process`/`submit`/`execute`)
    // is exactly the headline false-negative: a writable op declared `read` would
    // otherwise PASS. Derive at least WRITE so the gate FAILS a declared-read.
    if (!hCls && !mCls && !nameVerbCls && isApiHelper(transportHelper)) {
      derived = maxClass(derived, 'write');
    }
  }

  // Override table: an UPGRADE-only FLOOR applied LAST (never a downgrade). Keyed by
  // the real op-name (recovered from the slug) -- NOT a bare verb prefix (MED-01).
  const floor = overrideFloor(opName || opNameVerb, slug);
  if (floor) derived = maxClass(derived, floor);

  return derived;
}
