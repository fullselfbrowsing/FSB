/**
 * Phase 275 / Plan 04 -- privacy-page.component.html source-level invariants
 * for the Anonymous Usage Telemetry section added by 275-01.
 *
 * Reads the template directly as a file (no browser, no build). Asserts the
 * presence of:
 *   - id="telemetry-disclosure" attribute (stable anchor cited by the extension
 *     control-panel link and the CWS Privacy Practices URL).
 *   - "Anonymous Usage Telemetry" string (the H2 source text).
 *   - The five collected fields and six NOT-collected categories (English
 *     source words/phrases). Translations are checked separately via the
 *     showcase-build-smoke i18nMissingTranslation invariant.
 *   - The /api/telemetry/forget curl recipe URL.
 *   - The /stats link reference.
 *   - All 24 required @@PRIVACY_TELEMETRY_* i18n markers.
 *
 * Run: node tests/showcase-privacy-page.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRIVACY_HTML = path.join(
  ROOT,
  'showcase/angular/src/app/pages/privacy/privacy-page.component.html'
);
const PRIVACY_ARCHIVE_HTML = path.join(
  ROOT,
  'showcase/angular/src/app/pages/privacy/privacy-history-archive.component.html'
);

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

console.log('--- showcase-privacy-page.test (Phase 275 / Plan 04) ---');

if (!fs.existsSync(PRIVACY_HTML)) {
  console.log(`  FAIL: privacy-page.component.html missing at ${PRIVACY_HTML}`);
  process.exit(1);
}
const html = fs.readFileSync(PRIVACY_HTML, 'utf8');
const archiveHtml = fs.existsSync(PRIVACY_ARCHIVE_HTML)
  ? fs.readFileSync(PRIVACY_ARCHIVE_HTML, 'utf8')
  : '';

// =============================================================================
// 1. Stable anchor + section heading.
// =============================================================================
check('has id="telemetry-disclosure" anchor',
  /id="telemetry-disclosure"/.test(html),
  'anchor missing; CWS Privacy Policy URL would break');
check('has "Anonymous Usage Telemetry" H2 source text',
  html.includes('Anonymous Usage Telemetry'),
  'section heading text missing');
check('has Site API capabilities disclosure',
  /Site.*API.*capabilities/.test(html) && /same-origin site.*API.*requests/.test(html) && /CSRF/.test(html),
  'site API capability disclosure missing or too vague');
check('no visible LEGAL.md reference remains',
  !/LEGAL\.md/.test(html) && !/LEGAL\.md/.test(archiveHtml),
  'LEGAL.md should not appear in live policy or visible archive copy');
check('has PhantomStream live preview disclosure',
  /Remote Dashboard.*PhantomStream.*Live Preview/.test(html) &&
    /MutationObserver/.test(html) &&
    /WebSocket/.test(html) &&
    /live-preview frames/.test(html),
  'PhantomStream live preview disclosure missing or too vague');
// The August 2026 policy states this once, as an anchored list under External
// Services, and has the PhantomStream and Background Agents sections link back
// to it instead of restating it. Assert the canonical list AND the link, so
// neither the disclosure nor the path to it can be dropped silently.
check('discloses relay non-persistence in one canonical anchored list',
  /id="relay-non-persistence"/.test(html) &&
    /none of the following is ever persisted on an .*FSB.* server/.test(html) &&
    ['page content', 'DOM', 'browsing history', 'screenshots', 'AI prompts',
     'AI responses', 'cookies', 'tokens', 'payloads'].every((f) => html.includes(f)),
  'relay non-persistence wording missing');
check('PhantomStream section links to the relay non-persistence list',
  /phantomStream[\s\S]*?href="#relay-non-persistence"/.test(html),
  'PhantomStream section no longer reaches the non-persistence disclosure');
check('discloses PhantomStream input masking',
  /maskInputs: true/.test(html) &&
    /passwords and form-control values are masked/.test(html),
  'PhantomStream input masking disclosure missing');
check('discloses PhantomStream sandboxed viewer',
  /scriptless sandbox/.test(html) &&
    /sanitizes mirrored.*DOM.*CSS/.test(html),
  'PhantomStream sandbox/sanitization disclosure missing');
check('discloses PhantomStream media-by-reference fetch behavior',
  /Media bytes do not cross the relay/.test(html) &&
    /public.*HTTPS.*asset or media URLs/.test(html) &&
    /fail-closed fetch policy/.test(html),
  'PhantomStream media-by-reference disclosure missing');

// =============================================================================
// 2. Five collected fields enumerated.
// =============================================================================
// Look for the SHORT, ID-bearing source text. The plan requires UUID,
// MCP client, model, tokens, active-agent count.
const COLLECTED_CHECKS = [
  // UUID + chrome.storage.local key fsbInstallUuid
  ['fsbInstallUuid storage key', /fsbInstallUuid/],
  // chrome.storage.local location
  ['chrome.storage.local reference', /chrome\.storage\.local/],
  // MCP client allowlist mention (clients are wrapped in <span [attr.translate]="'no'">)
  ['MCP client name mention', /MCP/],
  ['Claude Code allowlist entry', /Claude Code/],
  ['Cursor allowlist entry', />Cursor</],
  ['Codex allowlist entry', />Codex</],
  // Model name examples
  ['grok-4-fast model example', /grok-4-fast/],
  ['claude-opus-4 model example', /claude-opus-4/],
  // Token counts
  ['input\\/output token counts', /input\/output token counts/i],
  // Active-agent count
  ['active FSB agents on your install', /active.*FSB.*agents on your install/i],
];
for (const [label, re] of COLLECTED_CHECKS) {
  check(`collected field: ${label}`, re.test(html), `pattern ${re} not found`);
}

// =============================================================================
// 3. Six NOT-collected categories enumerated.
// =============================================================================
// The bullets sit under @@PRIVACY_TELEMETRY_NOT_COLLECT_*. The English source
// terms are URLs, prompts, DOM, IP, names, emails — each must be present
// inside the privacy template.
const NOT_COLLECTED_CHECKS = [
  ['URLs / hostnames / browsing history bullet', /hostnames, or browsing history/i],
  ['Prompts / instructions bullet', /Prompts, instructions, task descriptions/i],
  ['DOM / screenshots / page content / site API payloads bullet', /screenshots, page content, site.*API.*payloads/i],
  ['Plaintext IP addresses bullet', /Plaintext.*IP.*addresses/i],
  ['Names / usernames / account handles bullet', /Names, usernames, account handles/i],
  ['Email addresses / phone numbers bullet', /Email addresses, phone numbers/i],
];
for (const [label, re] of NOT_COLLECTED_CHECKS) {
  check(`not-collected category: ${label}`, re.test(html), `pattern ${re} not found`);
}

// =============================================================================
// 4. GDPR Article 17 curl recipe + /stats link.
// =============================================================================
check('curl recipe references /api/telemetry/forget',
  /\/api\/telemetry\/forget/.test(html),
  'erasure endpoint reference missing');
check('curl recipe references full-selfbrowsing.com host',
  /full-selfbrowsing\.com\/api\/telemetry\/forget/.test(html),
  'fully-qualified erasure endpoint URL missing');
check('install_uuid POST body parameter present',
  /install_uuid/.test(html),
  'install_uuid body key missing in curl recipe');
check('aggregated metrics link to /stats',
  /<a\s+routerLink="\/stats"[^>]*>\/stats<\/a>/.test(html),
  'link to /stats missing');
check('GDPR Article 17 attribution',
  /GDPR.*Article 17/i.test(html),
  'GDPR Article 17 attribution missing');

// =============================================================================
// 5. Limited Use verbatim phrasing.
// =============================================================================
// The verbatim clause must appear verbatim (no paraphrasing).
const LIMITED_USE_PHRASES = [
  'never sold',
  'never shared with third parties',
  'never used for advertising',
  'never used to train any machine-learning models',
  "Chrome Web Store",
  "Limited Use",
];
for (const phrase of LIMITED_USE_PHRASES) {
  check(`Limited Use verbatim clause: "${phrase}"`,
    html.includes(phrase),
    'CWS-compliant phrasing required by spec; paraphrasing is forbidden');
}

// =============================================================================
// 6. All 24 required i18n markers (anchor IDs from plan).
// =============================================================================
const REQUIRED_IDS = [
  'PRIVACY_TELEMETRY_HEADING',
  'PRIVACY_TELEMETRY_COLLECT_HEADING',
  'PRIVACY_TELEMETRY_COLLECT_UUID',
  'PRIVACY_TELEMETRY_COLLECT_MCP_CLIENT',
  'PRIVACY_TELEMETRY_COLLECT_MODEL',
  'PRIVACY_TELEMETRY_COLLECT_TOKENS',
  'PRIVACY_TELEMETRY_COLLECT_AGENTS',
  'PRIVACY_TELEMETRY_NOT_COLLECT_HEADING',
  'PRIVACY_TELEMETRY_NOT_COLLECT_URLS',
  'PRIVACY_TELEMETRY_NOT_COLLECT_PROMPTS',
  'PRIVACY_TELEMETRY_NOT_COLLECT_DOM',
  'PRIVACY_TELEMETRY_NOT_COLLECT_IP',
  'PRIVACY_TELEMETRY_NOT_COLLECT_NAMES',
  'PRIVACY_TELEMETRY_NOT_COLLECT_EMAILS',
  'PRIVACY_TELEMETRY_RETENTION_HEADING',
  'PRIVACY_TELEMETRY_RETENTION_TEXT',
  'PRIVACY_TELEMETRY_OPTOUT_HEADING',
  'PRIVACY_TELEMETRY_OPTOUT_TEXT',
  'PRIVACY_TELEMETRY_ERASE_HEADING',
  'PRIVACY_TELEMETRY_ERASE_TEXT',
  'PRIVACY_TELEMETRY_LIMITED_USE_HEADING',
  'PRIVACY_TELEMETRY_LIMITED_USE_TEXT',
  'PRIVACY_TELEMETRY_AGGREGATED_HEADING',
  'PRIVACY_TELEMETRY_AGGREGATED_TEXT',
];
for (const id of REQUIRED_IDS) {
  check(`i18n marker @@${id} present`,
    html.includes(`@@${id}`),
    'marker missing; build with i18nMissingTranslation: error will fail');
}

// The date under the heading and the dateModified the page's structured data reports
// are written in two places; a policy change that updates one must update the other.
{
  const componentTs = fs.readFileSync(
    path.join(ROOT, 'showcase/angular/src/app/pages/privacy/privacy-page.component.ts'), 'utf8');
  const visible = (html.match(/i18n="@@privacy\.header\.updated">Last updated: ([A-Z][a-z]+ \d{1,2}, \d{4})</) || [])[1];
  const declared = (componentTs.match(/const PRIVACY_LAST_UPDATED = '(\d{4}-\d{2}-\d{2})';/) || [])[1];
  check('visible "Last updated" date found', Boolean(visible), 'privacy.header.updated line not found');
  check('PRIVACY_LAST_UPDATED constant found', Boolean(declared), 'constant missing from privacy-page.component.ts');
  const parsed = visible ? new Date(`${visible} UTC`) : null;
  const iso = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
  check('structured-data dateModified matches the visible "Last updated" date',
    Boolean(iso) && iso === declared,
    `page shows ${visible} (${iso}), PRIVACY_LAST_UPDATED is ${declared}`);
  check('privacy page emits page-level structured data',
    componentTs.includes("this.pageJsonLd.set('privacy-page'") && componentTs.includes('dateModified: PRIVACY_LAST_UPDATED'),
    'WebPage JSON-LD with dateModified missing');
}

// =============================================================================
// 7. The September 29, 2026 policy is the first Policy History entry. The
//    "september" id already holds the September 28 text, so this entry uses
//    "september29". Its body is one i18n unit, so it must not nest markers.
// =============================================================================
const SEP29_SUMMARY = '@@privacy.archive.september29.summary';
const SEP29_BODY = '@@privacy.archive.september29.body';
const SEP28_SUMMARY = '@@privacy.archive.september.summary';
check('archive has the September 29 summary unit',
  archiveHtml.includes(SEP29_SUMMARY),
  `${SEP29_SUMMARY} missing from the archive`);
check('archive has the September 29 body unit',
  archiveHtml.includes(SEP29_BODY),
  `${SEP29_BODY} missing from the archive`);
check('the September 29 entry is the first Policy History entry',
  archiveHtml.indexOf('<details class="policy-version">') === 0 &&
    archiveHtml.indexOf(SEP29_SUMMARY) >= 0 &&
    archiveHtml.indexOf(SEP28_SUMMARY) > archiveHtml.indexOf(SEP29_BODY) &&
    archiveHtml.indexOf('<details class="policy-version">', 1) > archiveHtml.indexOf(SEP29_BODY),
  'the september29 entry must open the archive, ahead of the september entry');
const sep29Start = archiveHtml.indexOf(SEP29_BODY);
const sep29End = archiveHtml.indexOf('</details>', sep29Start);
const sep29Body = sep29Start >= 0 && sep29End > sep29Start ? archiveHtml.slice(sep29Start, sep29End) : '';
check('the September 29 archive note names September 29, 2026',
  /<p class="archive-note">[^<]*September 29, 2026[^<]*<\/p>/.test(sep29Body),
  'archive note must say the text stood from September 29, 2026');
check('the September 29 archive keeps the earlier native-host registration sentence',
  sep29Body.includes('is registered only by an explicit action you take, by running <code [attr.translate]="\'no\'">fsb-mcp-server install --native-host</code>'),
  'the archived body must hold the September 29 wording of the registration bullet');
check('the September 29 archive carries no nested i18n markers',
  !/\si18n="/.test(sep29Body.slice(sep29Body.indexOf('>') + 1)),
  'archive bodies are one unit; nested i18n attributes break extraction');

// =============================================================================
// 8. The live registration bullet: the host is registered only by running
//    fsb-mcp-server install, the local server never registers it, the
//    extension cannot install it, and each registration names one origin.
// =============================================================================
{
  const li1 = (html.match(/<li i18n="@@privacy\.section\.localService\.li\.1">([\s\S]*?)<\/li>/) || [])[1] || '';
  const text = li1.replace(/<[^>]+>/g, '');
  check('registration bullet found', Boolean(li1), 'privacy.section.localService.li.1 missing');
  check('registration happens only when the user runs fsb-mcp-server install',
    /registered only when you run fsb-mcp-server install\b/.test(text),
    'the bullet must tie registration to running the install command');
  check('the local server only refreshes an already registered host',
    /only refreshes a host you have already registered and never registers one/.test(text),
    'the bullet must say server start never registers the host');
  check('the extension cannot install the host',
    text.includes('The extension cannot install it'),
    'the bullet must say the extension cannot install the host');
  check('each registration names one permitted extension origin, in browsers where FSB is installed',
    text.includes('each registration names one permitted extension origin') &&
      /in each browser where FSB is installed/.test(text),
    'the bullet must keep the one-origin and per-browser statements');
  check('the bullet names the opt-out and removal commands',
    text.includes('--no-native-host') && text.includes('fsb-mcp-server uninstall --native-host'),
    'the bullet must say how to skip and how to remove the host');
}

console.log(`\n=== showcase-privacy-page.test results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
