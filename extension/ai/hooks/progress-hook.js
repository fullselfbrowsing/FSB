/**
 * Progress hook handlers for broadcasting lifecycle events through
 * the SessionStateEmitter.
 *
 * Four focused factory functions, each returning a handler for a specific
 * lifecycle event:
 *   - createToolProgressHook      -> afterToolExecution
 *   - createIterationProgressHook -> afterIteration
 *   - createCompletionProgressHook -> onCompletion
 *   - createErrorProgressHook     -> onError
 *
 * Phase 159 registers these on the HookPipeline.  Phase 158 creates them
 * as standalone factories only -- it does NOT replace the existing
 * sendStatus calls in agent-loop.js (D-04).
 *
 * All handlers always return { shouldStop: false } -- progress hooks
 * never halt automation (D-05).  Each is wrapped in try/catch so a
 * buggy progress hook cannot kill the pipeline.
 *
 * @module hooks/progress-hook
 */

'use strict';

// ---------------------------------------------------------------------------
// STATE_EVENTS values (inline to avoid importing state-emitter.js)
// ---------------------------------------------------------------------------

var TOOL_EXECUTED = 'tool_executed';
var ITERATION_COMPLETE = 'iteration_complete';
var SESSION_ENDED = 'session_ended';
var ERROR_OCCURRED = 'error_occurred';

// ---------------------------------------------------------------------------
// createToolProgressHook
// ---------------------------------------------------------------------------

/**
 * Create a progress hook for afterToolExecution events.
 *
 * Emits STATE_EVENTS.TOOL_EXECUTED through the SessionStateEmitter.
 *
 * @param {Object} emitter - A SessionStateEmitter instance with emit(type, data).
 * @returns {Function} Handler for pipeline.register(AFTER_TOOL_EXECUTION, handler).
 */
function createToolProgressHook(emitter) {
  /**
   * @param {Object} context - Pipeline event context.
   * @param {string} context.sessionId - The session identifier.
   * @param {string} context.toolName - Name of the tool that executed.
   * @param {Object} context.toolResult - Result from tool execution.
   * @param {number} context.iteration - Current iteration number.
   * @returns {{ shouldStop: boolean }}
   */
  function toolProgressHandler(context) {
    try {
      emitter.emit(TOOL_EXECUTED, {
        sessionId: context.sessionId,
        toolName: context.toolName,
        success: !(context.toolResult && context.toolResult.error),
        iteration: context.iteration,
        timestamp: Date.now()
      });
    } catch (err) {
      console.warn('[progress-hook] toolProgressHandler error:', err);
    }
    return { shouldStop: false };
  }

  return toolProgressHandler;
}

// ---------------------------------------------------------------------------
// createIterationProgressHook
// ---------------------------------------------------------------------------

/**
 * Create a progress hook for afterIteration events.
 *
 * Emits STATE_EVENTS.ITERATION_COMPLETE through the SessionStateEmitter.
 *
 * @param {Object} emitter - A SessionStateEmitter instance with emit(type, data).
 * @returns {Function} Handler for pipeline.register(AFTER_ITERATION, handler).
 */
function createIterationProgressHook(emitter) {
  /**
   * @param {Object} context - Pipeline event context.
   * @param {string} context.sessionId - The session identifier.
   * @param {number} context.iteration - The iteration number that completed.
   * @param {number} context.totalCost - Cumulative cost so far.
   * @param {number} context.inputTokens - Input tokens used in this iteration.
   * @param {number} context.outputTokens - Output tokens used in this iteration.
   * @returns {{ shouldStop: boolean }}
   */
  function iterationProgressHandler(context) {
    try {
      emitter.emit(ITERATION_COMPLETE, {
        sessionId: context.sessionId,
        iteration: context.iteration,
        cost: context.totalCost,
        inputTokens: context.inputTokens,
        outputTokens: context.outputTokens,
        // Route persistence to the originating conversation/tab so a
        // background-tab session's progress rows land in its own log rather
        // than the conversation currently shown in the side panel.
        tabId: (context.session && typeof context.session.tabId === 'number') ? context.session.tabId : null,
        conversationId: (context.session && context.session.conversationId) ? context.session.conversationId : null,
        timestamp: Date.now()
      });
    } catch (err) {
      console.warn('[progress-hook] iterationProgressHandler error:', err);
    }
    return { shouldStop: false };
  }

  return iterationProgressHandler;
}

// ---------------------------------------------------------------------------
// createCompletionProgressHook
// ---------------------------------------------------------------------------

/**
 * Create a progress hook for onCompletion events.
 *
 * Emits STATE_EVENTS.SESSION_ENDED through the SessionStateEmitter.
 *
 * @param {Object} emitter - A SessionStateEmitter instance with emit(type, data).
 * @returns {Function} Handler for pipeline.register(ON_COMPLETION, handler).
 */
function createCompletionProgressHook(emitter) {
  /**
   * @param {Object} context - Pipeline event context.
   * @param {string} context.sessionId - The session identifier.
   * @param {string} context.result - Completion result/summary.
   * @param {number} context.totalCost - Total session cost.
   * @param {number} context.iterations - Total iterations completed.
   * @returns {{ shouldStop: boolean }}
   */
  function completionProgressHandler(context) {
    try {
      emitter.emit(SESSION_ENDED, {
        sessionId: context.sessionId,
        result: context.result,
        totalCost: context.totalCost,
        iterations: context.iterations,
        timestamp: Date.now()
      });
    } catch (err) {
      console.warn('[progress-hook] completionProgressHandler error:', err);
    }
    return { shouldStop: false };
  }

  return completionProgressHandler;
}

// ---------------------------------------------------------------------------
// createErrorProgressHook
// ---------------------------------------------------------------------------

/**
 * Create a progress hook for onError events.
 *
 * Emits STATE_EVENTS.ERROR_OCCURRED through the SessionStateEmitter.
 *
 * @param {Object} emitter - A SessionStateEmitter instance with emit(type, data).
 * @returns {Function} Handler for pipeline.register(ON_ERROR, handler).
 */
function createErrorProgressHook(emitter) {
  /**
   * @param {Object} context - Pipeline event context.
   * @param {string} context.sessionId - The session identifier.
   * @param {Error|string} context.error - The error that occurred.
   * @param {number} context.iteration - Iteration during which the error occurred.
   * @returns {{ shouldStop: boolean }}
   */
  function errorProgressHandler(context) {
    try {
      emitter.emit(ERROR_OCCURRED, {
        sessionId: context.sessionId,
        error: (context.error && context.error.message) ? context.error.message : String(context.error),
        iteration: context.iteration,
        timestamp: Date.now()
      });
    } catch (err) {
      console.warn('[progress-hook] errorProgressHandler error:', err);
    }
    return { shouldStop: false };
  }

  return errorProgressHandler;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createToolProgressHook: createToolProgressHook,
    createIterationProgressHook: createIterationProgressHook,
    createCompletionProgressHook: createCompletionProgressHook,
    createErrorProgressHook: createErrorProgressHook
  };
}
