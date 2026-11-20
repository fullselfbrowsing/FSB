/**
 * Goal Progress Tracker -- second-layer stuck signal that fires when actions
 * vary but no semantic progress is made.
 *
 * Plan 227-01 introduced an action-repetition detector that fingerprints the
 * (tool, target) tuple per iteration. Real autopilot loops often vary
 * slightly (open dropdown -> close dropdown -> scroll -> reopen) so the
 * fingerprint changes even though no goal-progress is made. This tracker
 * maintains a windowed unique-state vector across three signals:
 *
 *   - URLs visited
 *   - Focused-element identifiers (selector / elementId of last mutation)
 *   - Action-result outcome class (`${tool}:${ok|err}:${fx|nf}`), plus, for a
 *     successful action, what it put on the page or where it left the view
 *
 * If none of these three sets has grown in the last N iterations, the
 * detectStuck integration fires reasonCode=stuck_no_goal_progress.
 *
 * Per-task-type override hook lets form-filling tasks tolerate more
 * repetition before tripping (large forms have many similar field clicks).
 *
 * @module goal-progress-tracker
 */

'use strict';

// ---------------------------------------------------------------------------
// GoalProgressTracker
// ---------------------------------------------------------------------------

/**
 * Maintains a unique-state vector for a single autopilot session.
 *
 * @constructor
 */
function GoalProgressTracker() {
  /** @type {Set<string>} */
  this.urls = new Set();
  /** @type {Set<string>} */
  this.focusedElements = new Set();
  /** @type {Set<string>} */
  this.actionOutcomes = new Set();
  /** @type {number} Iteration index of the most recent unique-state addition. */
  this.lastGrowthIteration = 0;
}

/**
 * Record an iteration's state-vector signals. Updates lastGrowthIteration when
 * ANY of the three signals adds a new value to its set.
 *
 * @param {Object} evt
 * @param {number} evt.iteration - Current iteration number (1-based).
 * @param {string} [evt.url] - Current page URL.
 * @param {string} [evt.focusedElementId] - Selector/elementId of last mutation tool.
 * @param {string} [evt.actionOutcomeKey] - Outcome class string (tool:status:effect).
 */
GoalProgressTracker.prototype.record = function record(evt) {
  if (!evt) return;
  var grew = false;
  if (evt.url && !this.urls.has(evt.url)) {
    this.urls.add(evt.url);
    grew = true;
  }
  if (evt.focusedElementId && !this.focusedElements.has(evt.focusedElementId)) {
    this.focusedElements.add(evt.focusedElementId);
    grew = true;
  }
  if (evt.actionOutcomeKey && !this.actionOutcomes.has(evt.actionOutcomeKey)) {
    this.actionOutcomes.add(evt.actionOutcomeKey);
    grew = true;
  }
  if (grew) {
    this.lastGrowthIteration = evt.iteration || 0;
  }
};

/**
 * Returns true while the tracker has grown within the last `windowSize`
 * iterations (i.e. the autopilot is making goal-progress).
 *
 * @param {number} currentIteration - Current iteration number.
 * @param {number} [windowSize=8] - Stagnation tolerance window.
 * @returns {boolean}
 */
GoalProgressTracker.prototype.hasProgressed = function hasProgressed(currentIteration, windowSize) {
  var w = windowSize || 8;
  return (currentIteration - this.lastGrowthIteration) < w;
};

/**
 * Serialize for session persistence.
 *
 * @returns {Object} Plain object with arrays for the three signal sets.
 */
GoalProgressTracker.prototype.toJSON = function toJSON() {
  return {
    urls: Array.from(this.urls),
    focusedElements: Array.from(this.focusedElements),
    actionOutcomes: Array.from(this.actionOutcomes),
    lastGrowthIteration: this.lastGrowthIteration
  };
};

/**
 * Rehydrate a tracker from a previously-serialized JSON object.
 *
 * @param {Object} o
 * @returns {GoalProgressTracker}
 */
GoalProgressTracker.fromJSON = function fromJSON(o) {
  var t = new GoalProgressTracker();
  if (!o) return t;
  (o.urls || []).forEach(function (u) { t.urls.add(u); });
  (o.focusedElements || []).forEach(function (f) { t.focusedElements.add(f); });
  (o.actionOutcomes || []).forEach(function (a) { t.actionOutcomes.add(a); });
  t.lastGrowthIteration = o.lastGrowthIteration || 0;
  return t;
};

// ---------------------------------------------------------------------------
// Per-task-type override
// ---------------------------------------------------------------------------

/**
 * Default windowSize per task type. Form-filling tasks tolerate more
 * repetition because large forms contain many similar field interactions
 * that share outcome classes (click:ok:fx).
 *
 * @type {Object<string, number>}
 */
var TASK_TYPE_THRESHOLDS = {
  form_fill: 16,
  form: 16,        // alias used by ai-integration.js detectTaskType
  data_entry: 12
};

/**
 * Look up the windowSize for a given task type.
 *
 * @param {string|null} taskType
 * @returns {number} 8 by default, or the override from TASK_TYPE_THRESHOLDS.
 */
function getOverrideThreshold(taskType) {
  if (!taskType) return 8;
  return TASK_TYPE_THRESHOLDS[taskType] || 8;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GoalProgressTracker: GoalProgressTracker,
    getOverrideThreshold: getOverrideThreshold,
    TASK_TYPE_THRESHOLDS: TASK_TYPE_THRESHOLDS
  };
}

// Chrome extension global attachment (mirrors action-history.js style).
if (typeof window !== 'undefined') {
  window.GoalProgressTracker = GoalProgressTracker;
  window.getGoalProgressOverrideThreshold = getOverrideThreshold;
}
