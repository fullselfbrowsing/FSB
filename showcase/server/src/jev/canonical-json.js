'use strict';

/**
 * Phase 67 (D-10, D-27) -- canonical JSON and SHA-256, ported to CJS.
 *
 * An exact port of canonicalJson and sha256Hex from
 * scripts/bench/lib/identity.mjs. The server image copies only src/, so it
 * cannot import that ESM file (D-03). tests/jev-instrument.test.js runs both
 * copies over the same fixtures and asserts they give the same
 * INSTRUMENT_HASH, so the two must keep identical semantics:
 *
 *   - keys sorted at every depth;
 *   - undefined and function values dropped from objects;
 *   - array order kept;
 *   - TypeError on a cycle (shared, non-cyclic references are fine);
 *   - a top-level undefined becomes null.
 */

const crypto = require('crypto');

function canonicalJson(value) {
  const seen = new Set();
  const normalize = (node) => {
    if (node === null || typeof node !== 'object') return node;
    if (seen.has(node)) throw new TypeError('Circular value cannot be canonicalized');
    seen.add(node);
    let out;
    if (Array.isArray(node)) {
      out = node.map(normalize);
    } else {
      out = {};
      for (const key of Object.keys(node).sort()) {
        const child = node[key];
        if (child !== undefined && typeof child !== 'function') out[key] = normalize(child);
      }
    }
    seen.delete(node);
    return out;
  };
  return JSON.stringify(normalize(value === undefined ? null : value));
}

/**
 * Lowercase hex SHA-256 of a string (hashed as UTF-8).
 */
function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

module.exports = { canonicalJson, sha256Hex };
