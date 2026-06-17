'use strict';

const { Buffer } = require('buffer');

const RELAY_PER_MESSAGE_LIMIT_BYTES = 1024 * 1024;
const BACKPRESSURE_BUFFER_LIMIT_BYTES = 16 * 1024 * 1024;
const UNKNOWN_TYPE = 'unknown';
const COMPRESSED_ENVELOPE_TYPE = 'compressed-envelope';

function classifyRelayFrame(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      type: UNKNOWN_TYPE,
      compressed: false,
      parseError: 'json-parse-failed'
    };
  }

  const compressed = isRelayCompressedEnvelope(parsed);
  const type = typeof parsed?.type === 'string'
    ? parsed.type
    : (compressed ? COMPRESSED_ENVELOPE_TYPE : UNKNOWN_TYPE);

  return {
    type,
    compressed,
    parseError: null
  };
}

function checkRelayFrameLimit(raw, options = {}) {
  const capBytes = Number.isFinite(options.capBytes)
    ? options.capBytes
    : RELAY_PER_MESSAGE_LIMIT_BYTES;
  const byteSize = Buffer.byteLength(raw, 'utf8');
  const classification = classifyRelayFrame(raw);

  if (byteSize <= capBytes) {
    return {
      ok: true,
      byteSize,
      capBytes,
      type: classification.type,
      compressed: classification.compressed
    };
  }

  return {
    ok: false,
    error: 'message-too-large',
    byteSize,
    capBytes,
    type: classification.type,
    compressed: classification.compressed,
    roomPrefix: roomPrefix(options.roomId),
    role: options.role
  };
}

function normalizeFsbRelayRole(role) {
  return role === 'extension' ? 'source' : 'viewer';
}

function isRelayCompressedEnvelope(parsed) {
  return !!parsed
    && typeof parsed === 'object'
    && (
      (parsed._lz === true && typeof parsed.d === 'string')
      || (parsed._ps === 'deflate-raw' && typeof parsed.d === 'string')
    );
}

function roomPrefix(roomId) {
  return typeof roomId === 'string' ? roomId.slice(0, 8) : '';
}

module.exports = {
  RELAY_PER_MESSAGE_LIMIT_BYTES,
  BACKPRESSURE_BUFFER_LIMIT_BYTES,
  classifyRelayFrame,
  checkRelayFrameLimit,
  normalizeFsbRelayRole
};
