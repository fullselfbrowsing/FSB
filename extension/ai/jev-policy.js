/**
 * Phase 67 (JEV-06, JEV-05) -- FsbJevPolicy, the pure tighten-only policy
 * between a Jev decision and FSB's own execution gates.
 *
 * JEV-06: Jev can add a confirmation, but it can never remove one, bypass a
 * safety breaker, or authorize an action on its own (CONTEXT D-28..D-30).
 *
 * - LEVELS / LEVEL_NAMES: the strictness lattice
 *   proceed (0) < confirm (1) < deny (2) < stop (3).
 * - accept(result, kind): whether one Jev decision may act at all. It is
 *   necessary, never sufficient: Phase 68 adds its own eligibility and
 *   freshness checks on top (D-28).
 * - normalizeGate.*: map each real FSB gate output onto the lattice. Every
 *   unrecognised input fails closed (deny, or stop for the breaker and stuck
 *   gates).
 * - combineGates: the strictest of several normalized gates.
 * - mergeConfirmation: max(existing level, Jev contribution), where the Jev
 *   contribution is only ever 'none' or 'confirm' (D-29, D-30).
 * - toBeforeToolResult: the beforeToolExecution hook shape. It is never a
 *   stopping result (Pitfall 4).
 *
 * Pure and inert (D-17): no browser API, no network, no timers, no storage,
 * no clock and no randomness. Every exported function is total: it never
 * throws, whatever it is given. Nothing in the extension calls this module
 * in Phase 67; Phase 68 calls accept, mergeConfirmation and
 * toBeforeToolResult from its decision site and its risk hook.
 */
(function initFsbJevPolicy(root) {
  'use strict';

  /**
   * One FSB gate on the strictness lattice.
   * @typedef {Object} JevGate
   * @property {0|1|2|3} level - proceed 0, confirm 1, deny 2, stop 3.
   * @property {'consent'|'paymentFill'|'permission'|'safetyBreakers'|'stuck'|'combined'} source
   */

  /**
   * The verdict of accept(). A Noul verdict names its effect, because the
   * polarity differs by kind (CONTRACT.NOUL_DIRECTION): an accepted
   * completion is a VETO ('veto_completion': Jev is confident the task is
   * NOT done, p at or below its threshold) and never means "done"; an
   * accepted stuck or risk is a flag ('flag_stuck', 'flag_risk': p at or
   * above its threshold).
   * @typedef {({accepted: true, kind: ('operation'|'target'), choice: string}
   *   | {accepted: true, kind: 'completion', p: number, effect: 'veto_completion'}
   *   | {accepted: true, kind: 'stuck', p: number, effect: 'flag_stuck'}
   *   | {accepted: true, kind: 'risk', p: number, effect: 'flag_risk'}
   *   | {accepted: false, reason: ('not_ok'|'not_calibrated'|'kind_absent'|'threshold_null'|'below_threshold'|'catch_all'|'malformed')})} JevAcceptance
   */

  /**
   * The result of mergeConfirmation().
   * @typedef {Object} JevMerged
   * @property {0|1|2|3} level - max(existingLevel, 1 when jevContribution is 'confirm', else 0).
   * @property {'proceed'|'confirm'|'deny'|'stop'} levelName
   * @property {0|1|2|3} existingLevel - the level of the existing gate(s) alone.
   * @property {'none'|'confirm'} jevContribution - the only two things Jev can contribute.
   * @property {boolean} requiresConfirmation - level === 1.
   * @property {boolean} blocked - level >= 2 (deny or stop; Jev never causes this).
   */

  /**
   * The beforeToolExecution hook result. shouldStop is always false.
   * @typedef {({shouldStop: false, denied: true, denial: {reason: 'jev_requires_confirmation', source: 'jev'}}
   *   | {shouldStop: false, denied: false})} JevBeforeToolResult
   */

  function deepFreeze(node) {
    if (node !== null && typeof node === 'object' && !Object.isFrozen(node)) {
      Object.keys(node).forEach(function freezeChild(key) { deepFreeze(node[key]); });
      Object.freeze(node);
    }
    return node;
  }

  var LEVELS = deepFreeze({ proceed: 0, confirm: 1, deny: 2, stop: 3 });
  var LEVEL_NAMES = deepFreeze(['proceed', 'confirm', 'deny', 'stop']);

  // Mirror of the matching fields of showcase/server/src/jev/contract.js. The
  // server image cannot load extension files (D-03), so the copy is held to
  // the server CONTRACT by tests/jev-policy-tighten-only.test.js.
  var CONSTANTS = deepFreeze({
    KINDS: ['operation', 'target', 'completion', 'stuck', 'risk'],
    CHOICE_KINDS: ['operation', 'target'],
    NOUL_KINDS: ['completion', 'stuck', 'risk'],
    RESERVED_OPTION_KEY: 'none_of_the_above'
  });

  var CONFIRM_DENIAL_REASON = 'jev_requires_confirmation';

  // What an accepted Noul does. completion can only veto "done" (its
  // threshold is met when p is at or below it); it never confirms completion.
  var NOUL_EFFECTS = deepFreeze({ completion: 'veto_completion', stuck: 'flag_stuck', risk: 'flag_risk' });

  function isObjectLike(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function isUnitNumber(value) {
    return typeof value === 'number' && isFinite(value) && value >= 0 && value <= 1;
  }

  function isLevel(value) {
    return value === LEVELS.proceed || value === LEVELS.confirm || value === LEVELS.deny || value === LEVELS.stop;
  }

  function makeGate(level, source) {
    return { level: level, source: source };
  }

  function reject(reason) {
    return { accepted: false, reason: reason };
  }

  // ---------------------------------------------------------------------------
  // accept (D-28)
  // ---------------------------------------------------------------------------

  function acceptUnguarded(result, kind) {
    if (typeof kind !== 'string' || CONSTANTS.KINDS.indexOf(kind) === -1) return reject('malformed');
    if (!isObjectLike(result)) return reject('malformed');

    var ok = result.ok;
    if (ok === false) return reject('not_ok');
    if (ok !== true) return reject('malformed');

    var calibration = result.calibration;
    if (!isObjectLike(calibration)) return reject('malformed');
    var status = calibration.status;
    if (typeof status !== 'string') return reject('malformed');
    if (status !== 'calibrated') return reject('not_calibrated');

    var decisions = result.decisions;
    if (!isObjectLike(decisions)) return reject('malformed');
    if (!hasOwn(decisions, kind)) return reject('kind_absent');
    var decision = decisions[kind];
    if (decision === undefined) return reject('kind_absent');
    if (!isObjectLike(decision)) return reject('malformed');

    var threshold = decision.threshold;
    if (threshold === null) return reject('threshold_null');
    if (!isUnitNumber(threshold)) return reject('malformed');

    var meetsThreshold = decision.meetsThreshold;
    if (typeof meetsThreshold !== 'boolean') return reject('malformed');
    if (meetsThreshold !== true) return reject('below_threshold');

    if (CONSTANTS.CHOICE_KINDS.indexOf(kind) !== -1) {
      var choice = decision.choice;
      if (typeof choice !== 'string' || choice.length === 0) return reject('malformed');
      if (choice === CONSTANTS.RESERVED_OPTION_KEY) return reject('catch_all');
      return { accepted: true, kind: kind, choice: choice };
    }

    var p = decision.p;
    if (!isUnitNumber(p)) return reject('malformed');
    return { accepted: true, kind: kind, p: p, effect: NOUL_EFFECTS[kind] };
  }

  /**
   * Whether the decision for `kind` may act. Accepted only when all of these
   * hold: result.ok is true; result.calibration.status is 'calibrated'; the
   * kind's decision exists (as an own property) with a numeric threshold in
   * [0, 1] and meetsThreshold true; and, for a Choice, the choice is not
   * none_of_the_above. A Noul also needs p in [0, 1].
   *
   * An accepted Noul carries `effect`. For completion it is
   * 'veto_completion': the server meets a completion threshold when p is AT
   * OR BELOW it, so acceptance means Jev is confident the task is not done
   * yet. A caller must never read it as "Jev confirms done"; ending a task
   * early is the one loosening JEV-06 forbids. stuck and risk give
   * 'flag_stuck' and 'flag_risk' (p at or above the threshold).
   *
   * It reads only result.ok, result.calibration.status and
   * result.decisions[kind].{threshold, meetsThreshold, choice | p}, each read
   * once, so no other field (approval-looking or not) can change the
   * verdict. Under the shipped UNCALIBRATED profile it is false for every
   * kind (JEV-05). Never throws: bad input gives reason 'malformed'.
   *
   * @param {*} result - a FsbJevClient.decide() result (D-15).
   * @param {string} kind - one of CONSTANTS.KINDS.
   * @returns {JevAcceptance}
   */
  function accept(result, kind) {
    try {
      return acceptUnguarded(result, kind);
    } catch (_e) {
      return reject('malformed');
    }
  }

  // ---------------------------------------------------------------------------
  // normalizeGate (D-29)
  // ---------------------------------------------------------------------------

  /**
   * Consent gate (utils/capability-router.js _evaluateConsent). Only 'allow'
   * proceeds. Every other verdict ('ask', 'off', 'mutating_required',
   * 'blocked') and anything unrecognised is deny, because the router refuses
   * every verdict other than 'allow' when the capability is invoked: it
   * returns the RECIPE_CONSENT_* error and audits the call as 'blocked'
   * (consent is granted out of band, never inside the call).
   *
   * @param {string|{decision: string}} decisionOrObject - the verdict string or the gate's verdict object.
   * @returns {JevGate}
   */
  function normalizeConsent(decisionOrObject) {
    try {
      var decision = isObjectLike(decisionOrObject) ? decisionOrObject.decision : decisionOrObject;
      return makeGate(decision === 'allow' ? LEVELS.proceed : LEVELS.deny, 'consent');
    } catch (_e) {
      return makeGate(LEVELS.deny, 'consent');
    }
  }

  /**
   * Payment-fill confirmation (ai/tool-executor.js). {approved:true}, a user
   * approval, proceeds; {approved:false, reason} (timeout, user_declined,
   * sidepanel_unavailable or any other reason) and anything malformed is deny.
   *
   * @param {{approved: boolean, reason?: string}} result
   * @returns {JevGate}
   */
  function normalizePaymentFill(result) {
    try {
      var approved = isObjectLike(result) ? result.approved : undefined;
      return makeGate(approved === true ? LEVELS.proceed : LEVELS.deny, 'paymentFill');
    } catch (_e) {
      return makeGate(LEVELS.deny, 'paymentFill');
    }
  }

  /**
   * Permission hook (ai/hooks/permission-hook.js). {denied:false} proceeds;
   * {denied:true} and anything malformed is deny.
   *
   * @param {{shouldStop: boolean, denied: boolean, denial?: Object}} result
   * @returns {JevGate}
   */
  function normalizePermission(result) {
    try {
      var denied = isObjectLike(result) ? result.denied : undefined;
      return makeGate(denied === false ? LEVELS.proceed : LEVELS.deny, 'permission');
    } catch (_e) {
      return makeGate(LEVELS.deny, 'permission');
    }
  }

  /**
   * Safety breakers (checkSafetyBreakers in ai/agent-loop.js). A result whose
   * shouldStop is exactly false proceeds; a stop and anything malformed is
   * stop.
   *
   * @param {{shouldStop: boolean, reason: (string|null)}} result
   * @returns {JevGate}
   */
  function normalizeSafetyBreakers(result) {
    try {
      var shouldStop = isObjectLike(result) ? result.shouldStop : undefined;
      return makeGate(shouldStop === false ? LEVELS.proceed : LEVELS.stop, 'safetyBreakers');
    } catch (_e) {
      return makeGate(LEVELS.stop, 'safetyBreakers');
    }
  }

  /**
   * Stuck detection (detectStuck in ai/agent-loop.js, which never returns
   * null):
   * - {isStuck:false, shouldForceStop:false, reasonCode:null, hint:null}
   *   (not stuck) proceeds;
   * - {isStuck:true, shouldForceStop:false, reasonCode, hint} is a hint for
   *   the model, which Jev cannot clear; it proceeds;
   * - {isStuck:true, shouldForceStop:true, ...} is stop;
   * - anything else (null, undefined, {}, a non-boolean isStuck or
   *   shouldForceStop, shouldForceStop true with isStuck false) is stop.
   *
   * A caller with no stuck result for this step must leave the stuck gate
   * out of combineGates rather than pass null, which fails closed to stop.
   *
   * @param {{isStuck: boolean, shouldForceStop: boolean, reasonCode: (string|null), hint: (string|null)}} result
   * @returns {JevGate}
   */
  function normalizeStuck(result) {
    try {
      if (!isObjectLike(result)) return makeGate(LEVELS.stop, 'stuck');
      var isStuck = result.isStuck;
      var shouldForceStop = result.shouldForceStop;
      if (typeof isStuck !== 'boolean' || typeof shouldForceStop !== 'boolean') return makeGate(LEVELS.stop, 'stuck');
      return makeGate(shouldForceStop === false ? LEVELS.proceed : LEVELS.stop, 'stuck');
    } catch (_e) {
      return makeGate(LEVELS.stop, 'stuck');
    }
  }

  var normalizeGate = Object.freeze({
    consent: normalizeConsent,
    paymentFill: normalizePaymentFill,
    permission: normalizePermission,
    safetyBreakers: normalizeSafetyBreakers,
    stuck: normalizeStuck
  });

  // ---------------------------------------------------------------------------
  // combineGates, mergeConfirmation, toBeforeToolResult (D-29, D-30)
  // ---------------------------------------------------------------------------

  /** The level of one normalized gate; anything malformed counts as deny. */
  function gateLevel(gate) {
    try {
      if (!isObjectLike(gate)) return LEVELS.deny;
      var level = gate.level;
      return isLevel(level) ? level : LEVELS.deny;
    } catch (_e) {
      return LEVELS.deny;
    }
  }

  /**
   * The strictest of several normalized gates: proceed for an empty array,
   * deny for anything that is not an array, and a malformed entry counts as
   * deny.
   *
   * @param {Array<JevGate>} gates
   * @returns {JevGate} with source 'combined'.
   */
  function combineGates(gates) {
    var level = LEVELS.proceed;
    try {
      if (!Array.isArray(gates)) return makeGate(LEVELS.deny, 'combined');
      for (var i = 0; i < gates.length; i += 1) {
        level = Math.max(level, gateLevel(gates[i]));
      }
    } catch (_e) {
      level = Math.max(level, LEVELS.deny);
    }
    return makeGate(level, 'combined');
  }

  function existingLevelOf(existingGate) {
    try {
      return Array.isArray(existingGate) ? combineGates(existingGate).level : gateLevel(existingGate);
    } catch (_e) {
      return LEVELS.deny;
    }
  }

  function wantsFailClosed(options) {
    try {
      return isObjectLike(options) && options.failClosed === true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Merge FSB's existing gate(s) with a Jev decision result. The merged
   * level is max(existingLevel, 1 when Jev contributes 'confirm', else 0), so
   * it is never below the existing level, and Jev alone never denies or
   * stops anything.
   *
   * Jev contributes 'confirm' when accept(result, 'risk') accepts (a
   * calibrated, at-threshold risk flag), or when options.failClosed === true
   * and accept(result, 'risk') failed for any reason other than
   * 'below_threshold'. failClosed is Phase 68's code-near-risk option for
   * steps such as danger-flagged submit controls: there a fallback,
   * timeout, uncalibrated or malformed answer also asks for a confirmation.
   * Otherwise a Jev failure contributes nothing (D-30).
   *
   * @param {JevGate|Array<JevGate>} existingGate - one normalized gate or an
   *   array (merged with combineGates); a malformed value counts as deny.
   * @param {*} result - a FsbJevClient.decide() result.
   * @param {{failClosed?: boolean}} [options]
   * @returns {JevMerged}
   */
  function mergeConfirmation(existingGate, result, options) {
    var existingLevel = existingLevelOf(existingGate);
    var verdict = accept(result, 'risk');
    var jevContribution = 'none';
    if (verdict.accepted === true) {
      jevContribution = 'confirm';
    } else if (wantsFailClosed(options) && verdict.reason !== 'below_threshold') {
      jevContribution = 'confirm';
    }
    var level = Math.max(existingLevel, jevContribution === 'confirm' ? LEVELS.confirm : LEVELS.proceed);
    return {
      level: level,
      levelName: LEVEL_NAMES[level],
      existingLevel: existingLevel,
      jevContribution: jevContribution,
      requiresConfirmation: level === LEVELS.confirm,
      blocked: level >= LEVELS.deny
    };
  }

  /**
   * The beforeToolExecution hook result for a merged decision: a denial with
   * reason 'jev_requires_confirmation' when Jev contributed 'confirm',
   * otherwise a pass. shouldStop is always false.
   *
   * Phase 68 registers its risk hook AFTER the permission hook and expresses
   * tightening only through `denied` and the confirmation card, never by
   * stopping. HookPipeline.emit ends the handler loop at the first stopping
   * result, and the BEFORE_TOOL_EXECUTION consumer in ai/agent-loop.js only
   * looks for a `denied` entry, so a stopping Jev handler that ran first
   * would hide a permission denial and let the tool run (Pitfall 4).
   *
   * @param {JevMerged} merged - a mergeConfirmation() result.
   * @returns {JevBeforeToolResult}
   */
  function toBeforeToolResult(merged) {
    var confirm = false;
    try {
      confirm = isObjectLike(merged) && merged.jevContribution === 'confirm';
    } catch (_e) {
      confirm = false;
    }
    if (confirm) {
      return { shouldStop: false, denied: true, denial: { reason: CONFIRM_DENIAL_REASON, source: 'jev' } };
    }
    return { shouldStop: false, denied: false };
  }

  var api = Object.freeze({
    LEVELS: LEVELS,
    LEVEL_NAMES: LEVEL_NAMES,
    CONSTANTS: CONSTANTS,
    accept: accept,
    normalizeGate: normalizeGate,
    combineGates: combineGates,
    mergeConfirmation: mergeConfirmation,
    toBeforeToolResult: toBeforeToolResult
  });
  root.FsbJevPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
