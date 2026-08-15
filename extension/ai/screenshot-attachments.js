/**
 * Session-scoped, memory-only screenshot attachments for autopilot.
 * Base64 enters here directly after CDP capture and never reaches the session,
 * transcript, action history, logger, metrics, or persistence layers.
 */
(function initScreenshotAttachments(root) {
  'use strict';

  const MAX_SCREENSHOTS_PER_TURN = 4;
  const MAX_ATTACHMENT_BYTES_PER_TURN = 25 * 1024 * 1024;
  const buckets = new Map();

  function bucketFor(sessionId, create) {
    let bucket = buckets.get(sessionId);
    if (!bucket && create) {
      bucket = { attachments: new Map(), totalBytes: 0 };
      buckets.set(sessionId, bucket);
    }
    return bucket || null;
  }

  function decodedLength(base64) {
    if (typeof base64 !== 'string' || !base64) return 0;
    const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
  }

  function canCapture(sessionId) {
    const bucket = bucketFor(sessionId, false);
    return !bucket || bucket.attachments.size < MAX_SCREENSHOTS_PER_TURN;
  }

  function limitError(toolResult, code, message, metadata) {
    return {
      success: false,
      hadEffect: false,
      error: message,
      navigationTriggered: false,
      result: {
        success: false,
        code,
        error: message,
        retryable: false,
        metadata: metadata || null
      }
    };
  }

  function storeToolResult(sessionId, callId, toolName, toolResult) {
    if (toolName !== 'capture_screenshot' || !toolResult || typeof toolResult !== 'object') {
      return toolResult;
    }
    const capture = toolResult.result;
    if (!capture || typeof capture !== 'object' || typeof capture.image_data !== 'string') {
      return toolResult;
    }

    const imageData = capture.image_data;
    delete capture.image_data;
    const metadata = capture.metadata && typeof capture.metadata === 'object'
      ? capture.metadata
      : {};
    const byteLength = Number.isFinite(metadata.byte_length)
      ? metadata.byte_length
      : decodedLength(imageData);
    const bucket = bucketFor(sessionId, true);

    if (bucket.attachments.size >= MAX_SCREENSHOTS_PER_TURN) {
      metadata.delivery_status = 'attachment_limit_rejected';
      return limitError(toolResult, 'INVALID_SCREENSHOT_ARGUMENTS',
        `Autopilot allows at most ${MAX_SCREENSHOTS_PER_TURN} screenshots per turn.`, metadata);
    }
    if (byteLength <= 0 || bucket.totalBytes + byteLength > MAX_ATTACHMENT_BYTES_PER_TURN) {
      metadata.delivery_status = 'attachment_limit_rejected';
      return limitError(toolResult, 'SCREENSHOT_TOO_LARGE',
        'Autopilot screenshot attachments exceed the 25 MiB per-turn limit.', metadata);
    }

    metadata.delivery_status = 'pending_model_delivery';
    const attachment = {
      sessionId,
      callId,
      toolName,
      captureId: metadata.capture_id || callId,
      data: imageData,
      mimeType: capture.mime_type || 'image/png',
      byteLength,
      width: metadata.output_width || null,
      height: metadata.output_height || null,
      durationMs: metadata.duration_ms || null
    };
    bucket.attachments.set(callId, attachment);
    bucket.totalBytes += byteLength;
    return toolResult;
  }

  function pending(sessionId) {
    const bucket = bucketFor(sessionId, false);
    return bucket ? Array.from(bucket.attachments.values()) : [];
  }

  function label(attachment) {
    const dimensions = attachment.width && attachment.height
      ? ` (${attachment.width}x${attachment.height} PNG)`
      : '';
    return `Screenshot ${attachment.captureId}${dimensions}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function attachForProvider(messages, attachments, provider, model) {
    const outbound = deepClone(messages || []);
    if (!Array.isArray(attachments) || attachments.length === 0) return outbound;

    if (provider === 'anthropic') {
      for (const attachment of attachments) {
        for (const message of outbound) {
          if (!Array.isArray(message.content)) continue;
          const block = message.content.find((item) => item && item.type === 'tool_result'
            && item.tool_use_id === attachment.callId);
          if (!block) continue;
          const prior = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content || '');
          block.content = [
            { type: 'text', text: `${prior}\n${label(attachment)}` },
            {
              type: 'image',
              source: { type: 'base64', media_type: attachment.mimeType, data: attachment.data }
            }
          ];
          break;
        }
      }
      return outbound;
    }

    if (provider === 'gemini') {
      const gemini3 = /(?:^|[^0-9])gemini[-_. ]?3(?:[^0-9]|$)/i.test(model || '');
      for (const attachment of attachments) {
        let matched = false;
        for (const message of outbound) {
          if (!Array.isArray(message.parts)) continue;
          const index = message.parts.findIndex((part) => part && part.functionResponse
            && (part.functionResponse.id === attachment.callId
              || (!part.functionResponse.id && part.functionResponse.name === 'capture_screenshot')));
          if (index < 0) continue;
          if (gemini3) {
            const response = message.parts[index].functionResponse;
            response.parts = [
              { inlineData: { mimeType: attachment.mimeType, data: attachment.data } }
            ];
          } else {
            message.parts.splice(index + 1, 0, {
              inlineData: { mimeType: attachment.mimeType, data: attachment.data }
            });
          }
          matched = true;
          break;
        }
        if (!matched) {
          outbound.push({
            role: 'user',
            parts: [
              { text: label(attachment) },
              { inlineData: { mimeType: attachment.mimeType, data: attachment.data } }
            ]
          });
        }
      }
      return outbound;
    }

    const content = [];
    for (const attachment of attachments) {
      content.push({ type: 'text', text: label(attachment) });
      content.push({
        type: 'image_url',
        image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}`, detail: 'auto' }
      });
    }
    // Appending after every paired role=tool result preserves OpenAI's strict
    // tool-call/result ordering for multiple calls in a single turn.
    outbound.push({ role: 'user', content });
    return outbound;
  }

  function visitAndUpdate(value, ids, status, code, message) {
    let changed = false;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return { value, changed: false };
      try {
        const parsed = JSON.parse(value);
        const updated = visitAndUpdate(parsed, ids, status, code, message);
        return updated.changed
          ? { value: JSON.stringify(updated.value), changed: true }
          : { value, changed: false };
      } catch (_error) {
        return { value, changed: false };
      }
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const updated = visitAndUpdate(value[i], ids, status, code, message);
        if (updated.changed) {
          value[i] = updated.value;
          changed = true;
        }
      }
      return { value, changed };
    }
    if (!value || typeof value !== 'object') return { value, changed: false };

    if (value.metadata && typeof value.metadata === 'object'
        && ids.has(value.metadata.capture_id)) {
      value.metadata.delivery_status = status;
      if (code) {
        value.code = code;
        value.image_delivery_error = code;
        const warnings = Array.isArray(value.metadata.warnings) ? value.metadata.warnings : [];
        if (!warnings.some((warning) => warning && warning.code === code)) {
          warnings.push({ code, message });
        }
        value.metadata.warnings = warnings;
      }
      changed = true;
    }
    for (const key of Object.keys(value)) {
      if (key === 'metadata') continue;
      const updated = visitAndUpdate(value[key], ids, status, code, message);
      if (updated.changed) {
        value[key] = updated.value;
        changed = true;
      }
    }
    return { value, changed };
  }

  function updateMessages(messages, captureIds, status, code, message) {
    const ids = new Set(captureIds || []);
    if (ids.size === 0 || !Array.isArray(messages)) return;
    visitAndUpdate(messages, ids, status, code, message || code || status);
  }

  function clear(sessionId, messages, status, code, message) {
    const attachments = pending(sessionId);
    updateMessages(messages, attachments.map((item) => item.captureId), status, code, message);
    buckets.delete(sessionId);
    return attachments;
  }

  function markDelivered(sessionId, messages) {
    return clear(sessionId, messages, 'delivered_to_model', null, null);
  }

  function markRejected(sessionId, messages, code) {
    return clear(
      sessionId,
      messages,
      code === 'MODEL_IMAGE_INPUT_TOO_LARGE' ? 'model_image_too_large' : 'model_image_unsupported',
      code,
      code === 'MODEL_IMAGE_INPUT_TOO_LARGE'
        ? 'The selected model rejected the screenshot size; the turn was retried without images.'
        : 'The selected model rejected image input; the turn was retried without images.'
    );
  }

  function discard(sessionId) {
    const attachments = pending(sessionId);
    buckets.delete(sessionId);
    return attachments;
  }

  function collectPendingIds(value, output) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return;
      try { collectPendingIds(JSON.parse(value), output); } catch (_error) { /* not JSON */ }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectPendingIds(item, output));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value.metadata && value.metadata.delivery_status === 'pending_model_delivery'
        && value.metadata.capture_id) {
      output.add(value.metadata.capture_id);
    }
    Object.values(value).forEach((item) => collectPendingIds(item, output));
  }

  function expireOrphans(sessionId, messages) {
    const recorded = new Set();
    collectPendingIds(messages, recorded);
    const live = new Set(pending(sessionId).map((item) => item.captureId));
    const expired = Array.from(recorded).filter((id) => !live.has(id));
    updateMessages(
      messages,
      expired,
      'attachment_expired',
      'SCREENSHOT_ATTACHMENT_EXPIRED',
      'The service worker restarted before the transient screenshot could be delivered.'
    );
    return expired;
  }

  function classifyImageRejection(error) {
    const status = Number(error && (error.status || error.statusCode));
    if (![400, 413, 415, 422].includes(status)) return null;
    const detail = [error && error.message, error && error.responseText, error && error.providerError]
      .filter(Boolean).join(' ').toLowerCase();
    if (/auth(?:entication|orization)?|unauthori[sz]ed|forbidden|api.?key|credential|billing|quota|rate.?limit/.test(detail)) {
      return null;
    }
    if (status === 413 || /too large|payload size|image size|dimensions?|megapixel|maximum.*(?:bytes|pixels)/i.test(detail)) {
      return 'MODEL_IMAGE_INPUT_TOO_LARGE';
    }
    if (status === 415 || /image|vision|multimodal|inline.?data|image_url|media.?type|mime|base64|content.?type/i.test(detail)) {
      return 'MODEL_IMAGE_INPUT_UNSUPPORTED';
    }
    return null;
  }

  const api = {
    canCapture,
    storeToolResult,
    pending,
    attachForProvider,
    markDelivered,
    markRejected,
    discard,
    expireOrphans,
    classifyImageRejection,
    _buckets: buckets,
    constants: { MAX_SCREENSHOTS_PER_TURN, MAX_ATTACHMENT_BYTES_PER_TURN }
  };
  root.FsbScreenshotAttachments = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
