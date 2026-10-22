'use strict';

/**
 * Phase 67 (JEV-03, D-19, D-21) -- the Jev secret scrubber and the mirrored
 * injection-phrase filter.
 *
 * scrubText() replaces high-precision secret shapes with typed placeholders.
 * The patterns run in a fixed order: PEM private keys, JWTs, Bearer tokens,
 * known key prefixes, the fsb-auth bridge secret, Luhn-valid cards, and
 * long mixed-character tokens last. Short order and record numbers, UUIDs,
 * hex hashes, file paths and hyphenated product names survive.
 *
 * Every regex is a literal created inside the function on every call and is
 * applied with String.prototype.replace, so no lastIndex state is ever shared
 * between calls (RESEARCH Pitfall 10). scrubText(scrubText(x)) === scrubText(x).
 *
 * MIRROR: extension/ai/jev-state.js holds a hand-mirrored copy (same sources,
 * flags, order and placeholders). tests/fixtures/jev-scrubber-corpus.json is
 * the shared corpus both copies must pass, and tests/jev-contract-parity.test.js
 * compares PATTERN_SOURCES, INJECTION_PATTERN_SOURCES and PLACEHOLDERS across
 * the two sides, so both copies must change in the same commit.
 *
 * The fsbBridge source mirrors extension/utils/redactForLog.js byte-for-byte.
 * The injection list mirrors the INJECTION_PATTERNS of sanitizePageContent in
 * extension/ai/ai-integration.js (sources and flags only; no truncation).
 */

const PLACEHOLDERS = Object.freeze({
  pem: '[REDACTED_PRIVATE_KEY]',
  jwt: '[REDACTED_JWT]',
  bearer: 'Bearer [REDACTED_TOKEN]',
  keyPrefix: '[REDACTED_API_KEY]',
  fsbBridge: '[REDACTED_FSB_BRIDGE_SECRET]',
  card: '[REDACTED_CARD]',
  highEntropy: '[REDACTED_TOKEN]',
});

/**
 * Luhn checksum over a string of ASCII digits only. Anything else is false.
 */
function luhnValid(digits) {
  if (typeof digits !== 'string' || !/^[0-9]+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function replaceCard(match) {
  const digits = match.replace(/[ -]/g, '');
  if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return PLACEHOLDERS.card;
  return match;
}

function replaceHighEntropy(match) {
  if (!/[A-Z]/.test(match) || !/[a-z]/.test(match) || !/[0-9]/.test(match)) return match;
  const segments = match.split(/[-_/+=]/);
  const hasMixedLongSegment = segments.some((segment) => segment.length >= 16
    && /[A-Za-z]/.test(segment) && /[0-9]/.test(segment));
  return hasMixedLongSegment ? PLACEHOLDERS.highEntropy : match;
}

/**
 * The scrub patterns in application order. Called on every scrubText() call,
 * so each regex literal is fresh.
 */
function buildScrubPatterns() {
  return [
    {
      name: 'pem',
      re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      replacement: PLACEHOLDERS.pem,
    },
    {
      name: 'jwt',
      re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
      replacement: PLACEHOLDERS.jwt,
    },
    {
      name: 'bearer',
      re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
      replacement: PLACEHOLDERS.bearer,
    },
    {
      name: 'keyPrefix',
      re: /\b(?:sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9_-]{16,}|gh[po]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[bpas]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})/g,
      replacement: PLACEHOLDERS.keyPrefix,
    },
    {
      name: 'fsbBridge',
      re: /fsb-auth\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,
      replacement: PLACEHOLDERS.fsbBridge,
    },
    {
      name: 'card',
      re: /\b[0-9](?:[ -]?[0-9]){12,18}\b/g,
      replacement: replaceCard,
    },
    {
      name: 'highEntropy',
      re: /[A-Za-z0-9+/=_-]{32,}/g,
      replacement: replaceHighEntropy,
    },
  ];
}

/**
 * The 10 sanitizePageContent INJECTION_PATTERNS, same sources and flags.
 * Called on every filterInjection() call, so each regex literal is fresh.
 */
function buildInjectionPatterns() {
  return [
    /ignore\s+(all\s+)?previous\s+instructions/gi,
    /you\s+are\s+now\s+(a|an)\b/gi,
    /system\s*prompt/gi,
    /\<\/?(?:system|instruction|prompt|override|admin|root|command|directive)\s*\>/gi,
    /IMPORTANT\s*:\s*(?:ignore|forget|disregard|override|bypass)/gi,
    /(?:disregard|forget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|rules|context)/gi,
    /you\s+must\s+(?:now|instead)\s+(?:act|behave|respond)\s+as/gi,
    /\[\s*(?:SYSTEM|INST|ADMIN|ROOT)\s*\]/gi,
    /BEGIN\s+(?:NEW\s+)?(?:SYSTEM|INSTRUCTIONS?|PROMPT)/gi,
    /END\s+(?:OF\s+)?(?:SYSTEM|INSTRUCTIONS?|PROMPT)/gi,
  ];
}

/**
 * Replace every secret match with its typed placeholder. Non-strings are
 * returned unchanged.
 */
function scrubText(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const pattern of buildScrubPatterns()) {
    out = out.replace(pattern.re, pattern.replacement);
  }
  return out;
}

/**
 * True when scrubText would change `s`, i.e. `s` holds at least one secret.
 */
function matchesSecret(s) {
  return typeof s === 'string' && scrubText(s) !== s;
}

/**
 * Replace each known injection phrase with [FILTERED]. Non-strings are
 * returned unchanged; nothing is truncated.
 */
function filterInjection(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const re of buildInjectionPatterns()) {
    out = out.replace(re, '[FILTERED]');
  }
  return out;
}

const PATTERN_SOURCES = Object.freeze(buildScrubPatterns().map((pattern) => Object.freeze({
  name: pattern.name,
  source: pattern.re.source,
  flags: pattern.re.flags,
})));

const INJECTION_PATTERN_SOURCES = Object.freeze(buildInjectionPatterns().map((re) => Object.freeze({
  source: re.source,
  flags: re.flags,
})));

module.exports = {
  scrubText,
  matchesSecret,
  filterInjection,
  luhnValid,
  PATTERN_SOURCES,
  INJECTION_PATTERN_SOURCES,
  PLACEHOLDERS,
};
