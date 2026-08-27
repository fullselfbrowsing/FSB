(function(global) {
  'use strict';

  var VERSION = 'skopeo-decision-policy/1';
  var DECISION_KIND = 'cited-contract-decision';
  var REVIEW_KEYS = ['decisionDigest', 'documentFileKey', 'documentRevisionKey'];
  var SHA256_CONSTANTS = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function dependency() {
    if (global && global.FsbSkopeoAskSchema) return global.FsbSkopeoAskSchema;
    if (typeof require === 'function') {
      try { return require('./skopeo-ask-schema.js'); } catch (_error) { return null; }
    }
    return null;
  }

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isPlainRecord(value) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_error) {
      return false;
    }
  }

  function dataValues(value, expectedKeys) {
    if (!isPlainRecord(value)) return null;
    try {
      var keys = Reflect.ownKeys(value);
      if (keys.length !== expectedKeys.length || keys.some(function(key) {
        return typeof key !== 'string';
      })) {
        return null;
      }
      var expected = Object.create(null);
      expectedKeys.forEach(function(key) { expected[key] = true; });
      var output = Object.create(null);
      for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!own(expected, key) || !descriptor || !own(descriptor, 'value') ||
            descriptor.enumerable !== true) {
          return null;
        }
        output[key] = descriptor.value;
      }
      return output;
    } catch (_error) {
      return null;
    }
  }

  function frozenRecord(entries) {
    var output = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      output[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(output);
  }

  function utf8Bytes(value) {
    if (global && typeof global.TextEncoder === 'function') {
      return Array.from(new global.TextEncoder().encode(value));
    }
    var output = [];
    for (var index = 0; index < value.length; index += 1) {
      var code = value.charCodeAt(index);
      if (code < 0x80) output.push(code);
      else if (code < 0x800) output.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f));
      else if (code >= 0xd800 && code <= 0xdbff) {
        var next = value.charCodeAt(index + 1);
        var scalar = 0x10000 + ((code & 0x3ff) << 10) + (next & 0x3ff);
        output.push(
          0xf0 | (scalar >>> 18),
          0x80 | ((scalar >>> 12) & 0x3f),
          0x80 | ((scalar >>> 6) & 0x3f),
          0x80 | (scalar & 0x3f)
        );
        index += 1;
      } else {
        output.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return output;
  }

  function rotateRight(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  function sha256(value) {
    var bytes = utf8Bytes(value);
    var bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var high = Math.floor(bitLength / 0x100000000);
    var low = bitLength >>> 0;
    for (var highShift = 24; highShift >= 0; highShift -= 8) bytes.push((high >>> highShift) & 0xff);
    for (var lowShift = 24; lowShift >= 0; lowShift -= 8) bytes.push((low >>> lowShift) & 0xff);

    var state = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    var words = new Array(64);
    for (var offset = 0; offset < bytes.length; offset += 64) {
      for (var wordIndex = 0; wordIndex < 16; wordIndex += 1) {
        var start = offset + wordIndex * 4;
        words[wordIndex] = (
          (bytes[start] << 24) |
          (bytes[start + 1] << 16) |
          (bytes[start + 2] << 8) |
          bytes[start + 3]
        ) >>> 0;
      }
      for (var scheduleIndex = 16; scheduleIndex < 64; scheduleIndex += 1) {
        var prior15 = words[scheduleIndex - 15];
        var prior2 = words[scheduleIndex - 2];
        var sigma0 = rotateRight(prior15, 7) ^ rotateRight(prior15, 18) ^ (prior15 >>> 3);
        var sigma1 = rotateRight(prior2, 17) ^ rotateRight(prior2, 19) ^ (prior2 >>> 10);
        words[scheduleIndex] = (
          words[scheduleIndex - 16] + sigma0 + words[scheduleIndex - 7] + sigma1
        ) >>> 0;
      }

      var a = state[0];
      var b = state[1];
      var c = state[2];
      var d = state[3];
      var e = state[4];
      var f = state[5];
      var g = state[6];
      var h = state[7];
      for (var round = 0; round < 64; round += 1) {
        var upper1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
        var choice = (e & f) ^ ((~e) & g);
        var temp1 = (h + upper1 + choice + SHA256_CONSTANTS[round] + words[round]) >>> 0;
        var upper0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
        var majority = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (upper0 + majority) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      state[0] = (state[0] + a) >>> 0;
      state[1] = (state[1] + b) >>> 0;
      state[2] = (state[2] + c) >>> 0;
      state[3] = (state[3] + d) >>> 0;
      state[4] = (state[4] + e) >>> 0;
      state[5] = (state[5] + f) >>> 0;
      state[6] = (state[6] + g) >>> 0;
      state[7] = (state[7] + h) >>> 0;
    }
    return state.map(function(word) { return word.toString(16).padStart(8, '0'); }).join('');
  }

  function parsedInput(value) {
    var schema = dependency();
    return schema && typeof schema.parsePolicyInput === 'function'
      ? schema.parsePolicyInput(value)
      : null;
  }

  function computeParsedDigest(value) {
    return 'sha256:' + sha256(JSON.stringify(value));
  }

  function computeDecisionDigest(value) {
    var parsed = parsedInput(value);
    return parsed ? computeParsedDigest(parsed) : null;
  }

  function isApplicable(value) {
    var parsed = parsedInput(value);
    return !!parsed && parsed.decisionKind === DECISION_KIND;
  }

  function reviewRecord(value) {
    var fields = dataValues(value, REVIEW_KEYS);
    if (!fields || typeof fields.decisionDigest !== 'string' ||
        typeof fields.documentFileKey !== 'string' ||
        typeof fields.documentRevisionKey !== 'string') {
      return null;
    }
    return fields;
  }

  function currentReviewRecord(parsed) {
    if (!parsed || parsed.decisionKind !== DECISION_KIND || parsed.document10.state !== 'current') {
      return null;
    }
    return frozenRecord([
      ['decisionDigest', computeParsedDigest(parsed)],
      ['documentFileKey', parsed.document10.configuredFileKey],
      ['documentRevisionKey', parsed.document10.currentRevisionKey]
    ]);
  }

  function sameReview(left, right) {
    return !!left && !!right && left.decisionDigest === right.decisionDigest &&
      left.documentFileKey === right.documentFileKey &&
      left.documentRevisionKey === right.documentRevisionKey;
  }

  function openDocument10Review(value) {
    return currentReviewRecord(parsedInput(value));
  }

  function acknowledgeDocument10Review(value, opened) {
    var parsed = parsedInput(value);
    var current = currentReviewRecord(parsed);
    var supplied = reviewRecord(opened);
    if (!sameReview(current, supplied)) return null;
    return frozenRecord([
      ['decisionDigest', current.decisionDigest],
      ['documentFileKey', current.documentFileKey],
      ['documentRevisionKey', current.documentRevisionKey]
    ]);
  }

  function evaluate(value, acknowledgement) {
    var schema = dependency();
    var parsed = parsedInput(value);
    if (!schema || !parsed) return null;
    var digest = computeParsedDigest(parsed);
    if (parsed.decisionKind !== DECISION_KIND) {
      return schema.parsePolicyResult({
        clearance: 'not-applicable',
        applicable: false,
        decisionDigest: digest,
        reasons: [],
        document10: null
      });
    }

    var reasons = [];
    var reviewed = false;
    if (parsed.document10.state === 'current') {
      reviewed = sameReview(currentReviewRecord(parsed), reviewRecord(acknowledgement));
      if (!reviewed) reasons.push('document-10-unreviewed');
    } else if (parsed.document10.state === 'missing') {
      reasons.push('document-10-missing');
    } else if (parsed.document10.state === 'inaccessible') {
      reasons.push('document-10-inaccessible');
    } else {
      reasons.push('document-10-stale');
    }
    if (parsed.governingConflict) reasons.push('governing-conflict');

    var result = {
      clearance: reasons.length === 0 ? 'cleared' : 'blocked',
      applicable: true,
      decisionDigest: digest,
      reasons: reasons,
      document10: {
        state: parsed.document10.state,
        reviewed: reviewed
      }
    };
    if (parsed.classification === 'complex') {
      result.memo = {
        state: parsed.memoProof.state,
        satisfied: parsed.memoProof.state === 'on-file'
      };
      if (parsed.memoProof.state === 'proven-missing') reasons.push('memo-missing');
      else if (parsed.memoProof.state === 'inaccessible') reasons.push('memo-inaccessible');
      else if (parsed.memoProof.state === 'incomplete') reasons.push('memo-incomplete');
      result.clearance = reasons.length === 0 ? 'cleared' : 'blocked';
    }
    return schema.parsePolicyResult(result);
  }

  var api = Object.freeze({
    VERSION: VERSION,
    DECISION_KIND: DECISION_KIND,
    computeDecisionDigest: computeDecisionDigest,
    isApplicable: isApplicable,
    openDocument10Review: openDocument10Review,
    acknowledgeDocument10Review: acknowledgeDocument10Review,
    evaluate: evaluate
  });

  global.FsbSkopeoDecisionPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
