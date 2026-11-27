/**
 * Phase 68 (D-06, D-07, AUTO-01; M-68-11) -- the one fact list for the
 * fast-mode disclosure.
 *
 * The Advanced Settings card (extension/ui/control_panel.html, plan 68-12)
 * and the privacy-page section (showcase privacy page, plan 68-10) are both
 * tested against this list, and the Chrome Web Store copy (V6, M-68-11) is
 * written from it, so the three cannot name different recipients or list
 * different sent and never-sent items.
 *
 * Scope rule (68-SYNC-RECHECK.md item 8, sync issue 1): every "sent" and
 * "never sent" claim describes only what fast mode sends to FSB's server.
 * FSB's own page descriptions for the user's AI provider include form field
 * values (formatInlineRef, extension/content/dom-analysis.js), and the
 * fast-mode hand-off snapshot goes to that provider, so no copy may say that
 * FSB never reads, sees or sends what the user typed.
 *
 * Phrases are matched case-insensitively against text, never raw markup:
 * pass the HTML through textOf() first (the Angular templates wrap names in
 * translate="no" spans, and both sources use HTML entities).
 *
 * Exports:
 *   SHARED_PHRASES     substrings both the card and the page section contain
 *   CARD_ONLY_PHRASES  substrings the card contains
 *   PAGE_ONLY_PHRASES  substrings the page section contains
 *   FORBIDDEN_PATTERNS regexes neither may match
 *   ENFORCEMENT        content-side claims and the test markers that prove them
 *   textOf(html)       visible text of an HTML fragment, whitespace collapsed
 *
 * CommonJS, dependency-free, Node 20-safe.
 */

'use strict';

const SHARED_PHRASES = Object.freeze([
  // Recipients.
  "FSB's server",
  'TypeSafe AI',
  'OpenRouter',
  // Sent to FSB's server.
  'task text',
  'query string',
  'fragment',
  'title',
  'visible text',
  'labels',
  'roles',
  'recent',
  // Never sent to FSB's server.
  'typed',
  'field value',
  'passwords',
  'payment',
  'hidden',
  'file',
  'saved',
  'cookies',
  'API keys',
  'secret',
  // Control and status.
  'off by default',
  'off at any time',
  'experimental',
  'calibrated',
  // WR-04: before calibration a session sends at most one request (one decide
  // call per session until a calibrated answer; ENFORCEMENT below).
  'one step description',
  // Scope: every never-sent and excerpt claim is about fast mode's request
  // to FSB's server, and the AI provider is named as a separate recipient.
  "never sent to FSB's server",
  'fast mode leaves out',
  'AI provider'
]);

const CARD_ONLY_PHRASES = Object.freeze([
  'keeps no page content',
  'plans, types and reads'
]);

const PAGE_ONLY_PHRASES = Object.freeze([
  'full-selfbrowsing.com',
  '7 days',
  '365 days',
  'Limited Use',
  // D-07 affirmative Limited Use compliance statement (sync issue 3).
  'complies with',
  'Advanced Settings'
]);

const FORBIDDEN_PATTERNS = Object.freeze([
  // D-07: never claim that TypeSafe keeps nothing; its own terms govern that.
  /TypeSafe[^.]*\b(does not|doesn't|never)\s+(retain|store|keep)/i,
  // Sync issue 1: FSB's own snapshots for the AI provider read field values.
  /FSB never reads/i,
  /\bnever reads?\b/i,
  // Sync issue 1: a never-sent list must name FSB's server as its scope.
  /\bnever sent\s*:/i
]);

const ENFORCEMENT = Object.freeze([
  Object.freeze({ fact: 'typed', file: 'tests/jev-fast-menu.test.js', markers: Object.freeze(['SECRET-DRAFT-1', 'SECRET-DRAFT-2']) }),
  Object.freeze({ fact: 'field value', file: 'tests/jev-fast-menu.test.js', markers: Object.freeze(['SECRET-VAL', 'SECRET-OPT-A']) }),
  Object.freeze({ fact: 'saved', file: 'extension/content/actions.js', markers: Object.freeze(['noteVaultFilled']) }),
  Object.freeze({
    fact: 'one step description',
    file: 'tests/jev-fast-loop.test.js',
    markers: Object.freeze(['WR-04 one step description', "fallbackBody(reason)"])
  })
]);

/**
 * The visible text of an HTML fragment: comments and tags removed, the
 * apostrophe, ampersand and non-breaking-space entities decoded, whitespace
 * collapsed to single spaces and trimmed. A non-string gives ''.
 */
function textOf(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#39;|&#x27;|&apos;|&rsquo;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  SHARED_PHRASES,
  CARD_ONLY_PHRASES,
  PAGE_ONLY_PHRASES,
  FORBIDDEN_PATTERNS,
  ENFORCEMENT,
  textOf
};
