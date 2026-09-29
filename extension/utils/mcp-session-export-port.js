/**
 * Acknowledged, one-chunk-at-a-time transport for journal session exports.
 * Shared by the MV3 service worker producer and the control-panel file writer.
 */
(function (globalScope) {
  'use strict';

  var ACK_TIMEOUT_MS = 60 * 1000;

  function exportError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function errorFromMessage(message) {
    var error = exportError(
      typeof message.code === 'string' ? message.code : 'session_export_failed',
      typeof message.error === 'string' && message.error ? message.error : 'Session export failed'
    );
    return error;
  }

  function serveExportPort(port, generate, options) {
    options = options || {};
    var ackTimeoutMs = Number.isFinite(options.ackTimeoutMs)
      ? Math.max(1, options.ackTimeoutMs)
      : ACK_TIMEOUT_MS;
    var started = false;
    var cancelled = false;
    var disconnected = false;
    var pendingAck = null;
    var chunkCount = 0;

    function rejectPending(error) {
      if (!pendingAck) return;
      var pending = pendingAck;
      pendingAck = null;
      clearTimeout(pending.timer);
      pending.reject(error);
    }

    function post(message) {
      if (disconnected) throw exportError('session_export_disconnected', 'Session export disconnected before completion');
      port.postMessage(message);
    }

    function emit(chunk) {
      if (cancelled) return Promise.reject(exportError('session_export_cancelled', 'Session export cancelled'));
      if (disconnected) return Promise.reject(exportError('session_export_disconnected', 'Session export disconnected before completion'));
      if (pendingAck) return Promise.reject(exportError('session_export_protocol_error', 'Session export already has an unacknowledged chunk'));
      var sequence = chunkCount++;
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          if (!pendingAck || pendingAck.sequence !== sequence) return;
          pendingAck = null;
          reject(exportError('session_export_ack_timeout', 'Session export writer did not acknowledge a chunk in time'));
        }, ackTimeoutMs);
        pendingAck = { sequence: sequence, resolve: resolve, reject: reject, timer: timer };
        try {
          post({ type: 'chunk', sequence: sequence, data: String(chunk || '') });
        } catch (error) {
          rejectPending(error);
        }
      });
    }

    async function run(message) {
      try {
        if (typeof generate !== 'function') {
          throw exportError('session_export_unavailable', 'Session export generator is unavailable');
        }
        var generated = await generate({
          sessionId: typeof message.sessionId === 'string' ? message.sessionId : '',
          format: message.format === 'text' ? 'text' : 'json',
          emit: emit
        });
        if (generated === false) throw exportError('session_export_not_found', 'Journal-backed session not found');
        if (cancelled) throw exportError('session_export_cancelled', 'Session export cancelled');
        post({ type: 'end', chunks: chunkCount });
      } catch (error) {
        if (disconnected || cancelled) return;
        try {
          post({
            type: 'error',
            code: typeof error.code === 'string' ? error.code : 'session_export_failed',
            error: error && error.message ? error.message : 'Session export failed'
          });
        } catch (_postError) { /* the consumer is already gone */ }
      }
    }

    function onMessage(message) {
      if (message && message.type === 'ack') {
        if (!pendingAck || message.sequence !== pendingAck.sequence) return;
        var pending = pendingAck;
        pendingAck = null;
        clearTimeout(pending.timer);
        pending.resolve();
        return;
      }
      if (message && message.type === 'cancel') {
        cancelled = true;
        rejectPending(exportError('session_export_cancelled', 'Session export cancelled'));
        return;
      }
      if (!message || message.type !== 'start' || started) return;
      started = true;
      Promise.resolve().then(function () { return run(message); });
    }

    function onDisconnect() {
      disconnected = true;
      rejectPending(exportError('session_export_disconnected', 'Session export disconnected before completion'));
    }

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    return {
      cancel: function () { onMessage({ type: 'cancel' }); },
      getState: function () {
        return { started: started, cancelled: cancelled, disconnected: disconnected, pending: !!pendingAck, chunks: chunkCount };
      }
    };
  }

  function streamExportToWritable(input) {
    input = input || {};
    return new Promise(function (resolve, reject) {
      if (typeof input.connect !== 'function' || !input.writable || typeof input.writable.write !== 'function') {
        reject(exportError('session_export_unavailable', 'Session export writer is unavailable'));
        return;
      }
      var port = input.connect();
      var expectedSequence = 0;
      var writing = false;
      var settled = false;

      function disconnect() {
        try { port.disconnect(); } catch (_error) { /* already disconnected */ }
      }

      function finish(callback, value) {
        if (settled) return;
        settled = true;
        disconnect();
        callback(value);
      }

      function fail(error) {
        if (settled) return;
        try { port.postMessage({ type: 'cancel' }); } catch (_error) { /* producer is already gone */ }
        finish(reject, error instanceof Error ? error : exportError('session_export_failed', String(error || 'Session export failed')));
      }

      port.onMessage.addListener(function (message) {
        if (settled || !message) return;
        if (message.type === 'error') {
          fail(errorFromMessage(message));
          return;
        }
        if (message.type === 'end') {
          if (writing || (Number.isFinite(message.chunks) && message.chunks !== expectedSequence)) {
            fail(exportError('session_export_protocol_error', 'Session export ended before every chunk was written'));
            return;
          }
          finish(resolve, { chunks: expectedSequence });
          return;
        }
        if (message.type !== 'chunk') return;
        if (writing || message.sequence !== expectedSequence) {
          fail(exportError('session_export_protocol_error', 'Session export chunk sequence is invalid'));
          return;
        }
        writing = true;
        Promise.resolve(input.writable.write(String(message.data || ''))).then(function () {
          if (settled) return;
          writing = false;
          var sequence = expectedSequence++;
          port.postMessage({ type: 'ack', sequence: sequence });
        }).catch(fail);
      });
      port.onDisconnect.addListener(function () {
        if (!settled) fail(exportError('session_export_disconnected', 'Session export disconnected before completion'));
      });

      try {
        port.postMessage({
          type: 'start',
          sessionId: typeof input.sessionId === 'string' ? input.sessionId : '',
          format: input.format === 'text' ? 'text' : 'json'
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  var api = {
    ACK_TIMEOUT_MS: ACK_TIMEOUT_MS,
    serveExportPort: serveExportPort,
    streamExportToWritable: streamExportToWritable
  };

  globalScope.FsbMcpSessionExportPort = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
