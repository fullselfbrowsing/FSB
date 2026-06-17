'use strict';

/**
 * Phase 243 Plan 04 / UI-03 - Pure helpers for the Agent Concurrency Cap UI
 * polish (current-active counter + inline validation).
 *
 * These helpers live in their own file so they can be:
 *   1. Loaded as a classic <script> in extension/ui/control_panel.html before
 *      options.js, exposing computeActiveAgentCount / formatCounterText /
 *      isCapInputInvalid as globals on the browser-extension page.
 *   2. require()-d directly by Node tests under tests/, exercising the same
 *      logic without spinning up a DOM.
 *
 * Contract (per 243-04-PLAN.md):
 *   - computeActiveAgentCount(envelope) -> integer count of records keys
 *     filtered to NOT start with the 'legacy:' prefix. Phase 240's synthesized
 *     legacy:popup / legacy:sidepanel / legacy:autopilot agents live forever
 *     once any FSB UI surface opens, so they must NOT inflate the user-facing
 *     active-agent count (Pitfall 1 per 243-RESEARCH.md).
 *   - formatCounterText(active, cap) -> 'N of M active' display string. Falls
 *     back to safe defaults when either value is non-finite.
 *   - isCapInputInvalid(rawValue) -> true when the raw cap input value is
 *     out-of-range, non-finite, non-integer, or empty; used to toggle the
 *     red validation hint without affecting the existing input clamp.
 */

function computeActiveAgentCount(envelope) {
  if (!envelope || typeof envelope !== 'object') return 0;
  var records = envelope.records;
  if (!records || typeof records !== 'object') return 0;
  var keys = Object.keys(records);
  var count = 0;
  for (var i = 0; i < keys.length; i++) {
    var id = keys[i];
    if (typeof id !== 'string') continue;
    if (id.indexOf('legacy:') === 0) continue;
    count++;
  }
  return count;
}

function computeActiveTriggerCount(envelope) {
  if (!envelope || typeof envelope !== 'object') return 0;
  var records = envelope.records;
  if (!records || typeof records !== 'object') return 0;
  var keys = Object.keys(records);
  var count = 0;
  for (var i = 0; i < keys.length; i++) {
    var record = records[keys[i]];
    if (!record || typeof record !== 'object') continue;
    if (record.status === 'armed' || record.status === 'needs_attention' || record.status === 'blocked') {
      count++;
    }
  }
  return count;
}

function formatCounterText(active, cap) {
  var a = (typeof active === 'number' && Number.isFinite(active)) ? active : 0;
  var c = (typeof cap === 'number' && Number.isFinite(cap)) ? cap : 8;
  return a + ' of ' + c + ' active';
}

function isCapInputInvalid(raw) {
  if (raw === null || raw === undefined || raw === '') return true;
  var n = Number(raw);
  if (!Number.isFinite(n)) return true;
  if (!Number.isInteger(n)) return true;
  if (n < 1 || n > 64) return true;
  return false;
}

// Dual export: CommonJS for Node tests, browser global for the options page.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeActiveAgentCount: computeActiveAgentCount,
    computeActiveTriggerCount: computeActiveTriggerCount,
    formatCounterText: formatCounterText,
    isCapInputInvalid: isCapInputInvalid
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.computeActiveAgentCount = computeActiveAgentCount;
  globalThis.computeActiveTriggerCount = computeActiveTriggerCount;
  globalThis.formatCounterText = formatCounterText;
  globalThis.isCapInputInvalid = isCapInputInvalid;
}
