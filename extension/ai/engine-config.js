/**
 * Engine Configuration -- session defaults, execution modes, and config loader.
 *
 * Single source of truth for all session limits currently hardcoded across
 * agent-loop.js and background.js.  Formalizes FSB's execution modes as named
 * mode objects with per-mode safety limits and UI feedback channels.
 *
 * Mirrors Claude Code's direct_modes.py pattern adapted for Chrome MV3.
 *
 * @module engine-config
 */

'use strict';

// ---------------------------------------------------------------------------
// Session defaults -- single source for all configurable constants
// ---------------------------------------------------------------------------

/**
 * Default values for all session-level configuration.
 *
 * These replace hardcoded magic numbers scattered across:
 *   - agent-loop.js line 839: costLimit 2.00
 *   - agent-loop.js line 840: timeLimit 600000
 *   - background.js line 5893: maxIterations 20
 *   - transcript-store.js line 77: compactThreshold 0.8
 *   - transcript-store.js line 75: tokenBudget 128000
 *   - transcript-store.js line 79: keepRecentCount 5
 *
 * @type {Object}
 */
var SESSION_DEFAULTS = {
  costLimit: 2.00,           // USD, from agent-loop.js line 839
  timeLimit: 600000,         // 10 minutes in ms, from agent-loop.js line 840
  maxIterations: 500,        // raised for complex multi-step tasks (booking flows, multi-site scraping)
  compactThreshold: 0.8,     // from transcript-store.js line 77
  tokenBudget: 128000,       // from transcript-store.js line 75
  keepRecentCount: 5,        // from transcript-store.js line 79
  actionDelay: 200,          // ms between actions
  stuckThreshold: 3,         // consecutive no-progress iterations before recovery
  stuckForceStopThreshold: 5 // consecutive no-progress before force stop
};

// ---------------------------------------------------------------------------
// Execution modes -- formalized from implicit background.js code paths
// ---------------------------------------------------------------------------

/**
 * Named execution mode definitions.
 *
 * Each mode object describes a distinct entry point into the automation
 * engine with per-mode safety limits and UI feedback routing.
 *
 * Five modes based on current background.js entry points:
 *   - autopilot:        User-initiated from popup/sidepanel
 *   - mcp-manual:       Single tool execution via MCP
 *   - mcp-agent:        Multi-step automation via MCP run_automation
 *   - dashboard-remote: Remote automation from dashboard UI
 *   - delegated:        Local agent provider driving FSB browser tools
 *
 * @type {Object.<string, {name: string, description: string, safetyLimits: {maxIterations?: number, costLimit?: number, timeLimit?: number, wallClockMs?: number, eventSilenceMs?: number}, uiFeedbackChannel: string, animatedHighlights: boolean}>}
 */
var EXECUTION_MODES = {
  autopilot: {
    name: 'autopilot',
    description: 'User-initiated automation from popup or sidepanel',
    safetyLimits: {
      maxIterations: 500,
      costLimit: 2.00,
      timeLimit: 600000
    },
    uiFeedbackChannel: 'popup-sidepanel',
    animatedHighlights: true
  },
  'mcp-manual': {
    name: 'mcp-manual',
    description: 'Single tool execution via MCP server (Claude Code / IDE)',
    safetyLimits: {
      maxIterations: 1,
      costLimit: 0.50,
      timeLimit: 60000
    },
    uiFeedbackChannel: 'mcp-response',
    animatedHighlights: false
  },
  'mcp-agent': {
    name: 'mcp-agent',
    description: 'Multi-step automation triggered by MCP run_automation tool',
    safetyLimits: {
      maxIterations: 500,
      costLimit: 2.00,
      timeLimit: 600000
    },
    uiFeedbackChannel: 'mcp-progress',
    animatedHighlights: true
  },
  'dashboard-remote': {
    name: 'dashboard-remote',
    description: 'Remote automation triggered from dashboard UI',
    safetyLimits: {
      maxIterations: 500,
      costLimit: 2.00,
      timeLimit: 600000
    },
    uiFeedbackChannel: 'dashboard-ws',
    animatedHighlights: true
  },
  delegated: {
    name: 'delegated',
    description: 'Local agent provider driving FSB browser tools',
    safetyLimits: {
      wallClockMs: 2700000,
      eventSilenceMs: 120000
    },
    uiFeedbackChannel: 'popup-sidepanel',
    animatedHighlights: true
  }
};

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * Load session configuration by merging defaults, mode-specific overrides,
 * and user-configured values from chrome.storage.local.
 *
 * Merge priority (highest wins):
 *   1. chrome.storage.local user overrides (costLimit, timeLimit, maxIterations)
 *   2. Mode-specific safetyLimits
 *   3. SESSION_DEFAULTS
 *
 * @param {string} [modeName] - Name of the execution mode (defaults to 'autopilot').
 * @returns {Promise<Object>} Merged configuration object with a `.mode` property.
 */
async function loadSessionConfig(modeName) {
  var config = {};
  for (var key in SESSION_DEFAULTS) {
    config[key] = SESSION_DEFAULTS[key];
  }
  // Apply mode-specific overrides
  var mode = EXECUTION_MODES[modeName] || EXECUTION_MODES.autopilot;
  if (mode.safetyLimits) {
    for (var lk in mode.safetyLimits) {
      config[lk] = mode.safetyLimits[lk];
    }
  }
  // Read user overrides from chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      var stored = await chrome.storage.local.get({
        costLimit: config.costLimit,
        timeLimit: Math.floor(config.timeLimit / 60000),
        maxIterations: config.maxIterations
      });
      config.costLimit = parseFloat(stored.costLimit) || config.costLimit;
      config.timeLimit = (parseInt(stored.timeLimit) || Math.floor(config.timeLimit / 60000)) * 60000;
      config.maxIterations = parseInt(stored.maxIterations) || config.maxIterations;
    } catch (_e) {
      // Storage unavailable -- use defaults + mode overrides
    }
  }
  config.mode = mode;
  return config;
}

// ---------------------------------------------------------------------------
// Mode accessor
// ---------------------------------------------------------------------------

/**
 * Get an execution mode object by name, falling back to autopilot.
 *
 * @param {string} modeName - Name of the execution mode.
 * @returns {Object} The mode object from EXECUTION_MODES.
 */
function getMode(modeName) {
  return EXECUTION_MODES[modeName] || EXECUTION_MODES.autopilot;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SESSION_DEFAULTS: SESSION_DEFAULTS, EXECUTION_MODES: EXECUTION_MODES, loadSessionConfig: loadSessionConfig, getMode: getMode };
}
