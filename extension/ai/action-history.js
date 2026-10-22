/**
 * Action History -- structured action event creation and history management.
 *
 * Replaces the ad-hoc `session.actionHistory.push({...})` pattern in
 * agent-loop.js (line 1291) with structured event objects that support
 * replay, diff, filtering, and tool counting.
 *
 * Enables Phase 157 stuck detection improvements and Phase 159 agent loop
 * refactor by providing a queryable action event store.
 *
 * @module action-history
 */

'use strict';

// ---------------------------------------------------------------------------
// Action event factory
// ---------------------------------------------------------------------------

/**
 * Create a structured action event object.
 *
 * Matches the shape currently pushed inline at agent-loop.js line 1291-1297,
 * with the addition of durationMs and normalized result.error field.
 *
 * @param {Object} [fields={}] - Override fields.
 * @param {string} [fields.tool] - Tool name (e.g., 'click', 'type').
 * @param {Object} [fields.params] - Tool call parameters.
 * @param {Object} [fields.result] - Execution result.
 * @param {boolean} [fields.result.success] - Whether the tool call succeeded.
 * @param {boolean} [fields.result.hadEffect] - Whether the tool caused a DOM change.
 * @param {string|null} [fields.result.error] - Error message if failed.
 * @param {number} [fields.timestamp] - Timestamp of the event.
 * @param {number} [fields.iteration] - Iteration number when this event occurred.
 * @param {number} [fields.durationMs] - Duration of the tool execution in ms.
 *   A measured value (0 included) is kept; an absent one is null, never 0.
 * @returns {Object} A structured action event.
 */
function createActionEvent(fields) {
  var f = fields || {};
  var r = f.result || {};
  return {
    tool: f.tool || 'unknown',
    params: f.params || {},
    result: {
      success: r.success !== undefined ? r.success : false,
      hadEffect: r.hadEffect !== undefined ? r.hadEffect : false,
      error: r.error || null
    },
    timestamp: f.timestamp || Date.now(),
    iteration: f.iteration || 0,
    durationMs: Number.isFinite(f.durationMs) ? f.durationMs : null
  };
}

// ---------------------------------------------------------------------------
// ActionHistory class
// ---------------------------------------------------------------------------

/**
 * Queryable action event store for a session.
 *
 * Provides push, query, diff, filter, and serialization capabilities
 * over the session's action event history.
 *
 * @constructor
 */
function ActionHistory() {
  /** @type {Array<Object>} */
  this.events = [];
}

/**
 * The number of events in the history.
 * @type {number}
 */
Object.defineProperty(ActionHistory.prototype, 'length', {
  get: function () {
    return this.events.length;
  }
});

/**
 * Push an action event to the history.
 *
 * If the argument already has tool and timestamp properties, it is pushed
 * directly.  Otherwise, it is normalized through createActionEvent().
 *
 * @param {Object} eventOrFields - An action event or fields to create one.
 * @returns {Object} The event that was pushed.
 */
ActionHistory.prototype.push = function push(eventOrFields) {
  var evt;
  if (eventOrFields && eventOrFields.tool && eventOrFields.timestamp) {
    evt = eventOrFields;
  } else {
    evt = createActionEvent(eventOrFields);
  }
  this.events.push(evt);
  return evt;
};

/**
 * Return the last N events (or all if fewer than N exist).
 *
 * @param {number} n - Number of recent events to return.
 * @returns {Array<Object>} A new array of the last N events.
 */
ActionHistory.prototype.getLastN = function getLastN(n) {
  if (n >= this.events.length) {
    return this.events.slice();
  }
  return this.events.slice(-n);
};

/**
 * Return all events for a specific iteration number.
 *
 * @param {number} iteration - The iteration number to filter by.
 * @returns {Array<Object>} Events matching the iteration.
 */
ActionHistory.prototype.getByIteration = function getByIteration(iteration) {
  var results = [];
  for (var i = 0; i < this.events.length; i++) {
    if (this.events[i].iteration === iteration) {
      results.push(this.events[i]);
    }
  }
  return results;
};

/**
 * Return a map of tool names to call counts.
 *
 * Used by stuck detection to identify repetitive tool patterns.
 *
 * @returns {Object.<string, number>} Tool name to count mapping.
 */
ActionHistory.prototype.getToolCounts = function getToolCounts() {
  var counts = {};
  for (var i = 0; i < this.events.length; i++) {
    var tool = this.events[i].tool;
    counts[tool] = (counts[tool] || 0) + 1;
  }
  return counts;
};

/**
 * Return all events where result.success is false.
 *
 * Used for error analysis and recovery.
 *
 * @returns {Array<Object>} Failed events.
 */
ActionHistory.prototype.getFailures = function getFailures() {
  var failures = [];
  for (var i = 0; i < this.events.length; i++) {
    if (this.events[i].result && this.events[i].result.success === false) {
      failures.push(this.events[i]);
    }
  }
  return failures;
};

/**
 * Return events added since a given index.
 *
 * Enables delta comparison between turns (per STATE-04 requirement).
 *
 * @param {number} fromIndex - The starting index (inclusive).
 * @returns {Array<Object>} Events from fromIndex onward.
 */
ActionHistory.prototype.diff = function diff(fromIndex) {
  return this.events.slice(fromIndex);
};

/**
 * Replace internal events with a provided array, normalizing each
 * through createActionEvent.
 *
 * Used when restoring from storage.
 *
 * @param {Array<Object>} events - Raw event objects to hydrate with.
 */
ActionHistory.prototype.hydrate = function hydrate(events) {
  this.events = [];
  if (!Array.isArray(events)) return;
  for (var i = 0; i < events.length; i++) {
    this.events.push(createActionEvent(events[i]));
  }
};

/**
 * Return a JSON-serializable copy of the events array.
 *
 * Handles non-serializable values in params by truncating large objects
 * (params values longer than 500 chars when stringified are replaced
 * with a truncated version).
 *
 * @returns {Array<Object>} A serializable copy of all events.
 */
ActionHistory.prototype.toJSON = function toJSON() {
  var copy = [];
  for (var i = 0; i < this.events.length; i++) {
    var evt = this.events[i];
    var safeParms = {};
    if (evt.params && typeof evt.params === 'object') {
      var keys = Object.keys(evt.params);
      for (var k = 0; k < keys.length; k++) {
        var val = evt.params[keys[k]];
        try {
          var str = typeof val === 'string' ? val : JSON.stringify(val);
          safeParms[keys[k]] = str.length > 500 ? str.substring(0, 497) + '...' : val;
        } catch (_) {
          safeParms[keys[k]] = '[unserializable]';
        }
      }
    }
    copy.push({
      tool: evt.tool,
      params: safeParms,
      result: { success: evt.result.success, hadEffect: evt.result.hadEffect, error: evt.result.error },
      timestamp: evt.timestamp,
      iteration: evt.iteration,
      durationMs: evt.durationMs
    });
  }
  return copy;
};

/**
 * Empty the events array and return the old events.
 *
 * @returns {Array<Object>} The events that were cleared.
 */
ActionHistory.prototype.clear = function clear() {
  var old = this.events;
  this.events = [];
  return old;
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ActionHistory: ActionHistory, createActionEvent: createActionEvent };
}
