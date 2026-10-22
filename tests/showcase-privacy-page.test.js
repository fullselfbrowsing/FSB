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

// =============================================================================
// 7. Phase 68 (68-10, D-07, F7): the September 29, 2026 policy is archived as
//    the first Policy History entry before the fast-mode update changes the
//    page. The september id is taken (it archives the September 28 text), so
//    the new entry uses september29.
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
  archiveHtml.indexOf(SEP29_SUMMARY) >= 0 &&
    archiveHtml.indexOf(SEP28_SUMMARY) > archiveHtml.indexOf(SEP29_SUMMARY) &&
    archiveHtml.indexOf('<details class="policy-version">') < archiveHtml.indexOf(SEP29_SUMMARY) &&
    archiveHtml.indexOf('<details class="policy-version">', archiveHtml.indexOf('<details class="policy-version">') + 1) >
      archiveHtml.indexOf(SEP29_BODY),
  'the september29 entry must precede the september entry and open the archive');
const sep29Start = archiveHtml.indexOf(SEP29_BODY);
const sep29End = archiveHtml.indexOf('</details>', sep29Start);
const sep29Body = sep29Start >= 0 && sep29End > sep29Start ? archiveHtml.slice(sep29Start, sep29End) : '';
check('the September 29 archive note names September 29, 2026',
  /<p class="archive-note">[^<]*September 29, 2026[^<]*<\/p>/.test(sep29Body),
  'archive note must say the text stood from September 29, 2026');
check('the September 29 archive keeps the pre-fast-mode TLDR sentence',
  sep29Body.includes('no browsing data is collected by'),
  'the archived body must hold the old TLDR text');
check('the September 29 archive carries no nested i18n markers',
  !/\si18n="/.test(sep29Body.slice(sep29Body.indexOf('>') + 1)),
  'archive bodies are one unit; nested i18n attributes break extraction');

// =============================================================================
// 8. Phase 68 (68-10, D-07, AUTO-01): the opt-in Jev fast mode disclosure.
//    Every sent and never-sent claim is scoped to what fast mode sends to
//    FSB's server (sync issue 1), the section opens no claim that TypeSafe
//    keeps nothing, and a separate fast-mode Limited Use statement opens with
//    an affirmative compliance sentence (sync issue 3). The page section and
//    the Advanced Settings card are both checked against the one fact list,
//    tests/fixtures/jev-fast-disclosure-facts.js (68-12, M-68-11).
// =============================================================================
const FACTS = require('./fixtures/jev-fast-disclosure-facts.js');
const CONTROL_PANEL_HTML = path.join(ROOT, 'extension/ui/control_panel.html');
const controlPanelHtml = fs.existsSync(CONTROL_PANEL_HTML)
  ? fs.readFileSync(CONTROL_PANEL_HTML, 'utf8')
  : '';

// The rendered text of an English template fragment. Inline translate="no"
// name wrappers are dropped without a gap first (a reader sees "FSB's
// server", not "FSB 's server"), then the shared textOf() strips the rest.
function pageText(fragment) {
  return FACTS.textOf(String(fragment || '')
    .replace(/<span \[attr\.translate\]="'no'">([^<]*)<\/span>/g, '$1'));
}
// The inner HTML of the element carrying i18n="@@<id>", or '' when absent.
function unitHtml(id) {
  const re = new RegExp(`<(\\w+)[^>]*\\si18n="@@${id.replace(/\./g, '\\.')}"[^>]*>([\\s\\S]*?)</\\1>`);
  const m = html.match(re);
  return m ? m[2] : '';
}
function unitIdsWithPrefix(prefix) {
  return [...html.matchAll(/\si18n="@@([^"|]+)/g)].map((m) => m[1]).filter((id) => id.startsWith(prefix));
}

const jevStart = html.indexOf('id="jev-fast-mode"');
const jevH2Start = jevStart >= 0 ? html.lastIndexOf('<h2', jevStart) : -1;
const jevNextH2 = jevStart >= 0 ? html.indexOf('<h2', jevStart) : -1;
const jevSectionHtml = jevH2Start >= 0 && jevNextH2 > jevH2Start ? html.slice(jevH2Start, jevNextH2) : '';
const jevSectionText = pageText(jevSectionHtml);

check('has exactly one id="jev-fast-mode" anchor',
  (html.match(/id="jev-fast-mode"/g) || []).length === 1,
  'the fast-mode section anchor is missing or repeated');
check('the fast-mode heading is an h2 with @@privacy.section.jevFastMode.title',
  /<h2 id="jev-fast-mode" i18n="@@privacy\.section\.jevFastMode\.title">/.test(html),
  'the jev-fast-mode h2 must carry the title unit');
check('the fast-mode section comes right after External Services',
  html.indexOf('@@privacy.section.external.title') >= 0 &&
    html.indexOf('@@privacy.section.external.title') < jevStart &&
    jevStart < html.indexOf('@@privacy.section.localService.title'),
  'section must sit between External Services and the Local Agent Service section');
for (const phrase of ['TypeSafe AI', 'full-selfbrowsing.com', 'OpenRouter', '7 days', '365 days',
  'query string', 'off by default', 'Advanced Settings']) {
  check(`fast-mode section mentions "${phrase}"`,
    jevSectionText.toLowerCase().includes(phrase.toLowerCase()),
    `"${phrase}" missing from the fast-mode section`);
}
const notSentTitle = jevSectionHtml.indexOf('@@privacy.section.jevFastMode.notSent.title');
const notSentList = notSentTitle >= 0
  ? jevSectionHtml.slice(notSentTitle, jevSectionHtml.indexOf('</ul>', notSentTitle))
  : '';
check('the never-sent list names passwords and typed text',
  /<ul>/.test(notSentList) && /passwords/i.test(pageText(notSentList)) && /typed/i.test(pageText(notSentList)),
  'the never-sent list must name passwords and anything typed');
check("the never-sent heading is scoped to FSB's server",
  /never sent to FSB's server/i.test(pageText(unitHtml('privacy.section.jevFastMode.notSent.title'))),
  "the never-sent list must say it describes what is never sent to FSB's server");
check('the section says fast mode does not change what goes to the chosen AI provider',
  /does not change what[^.]*AI provider you chose/i.test(pageText(unitHtml('privacy.section.jevFastMode.scope'))),
  'scope sentence missing (sync issue 1)');

const limitedUseBody = unitHtml('privacy.section.jevFastMode.limitedUse.body');
const limitedUseText = pageText(limitedUseBody);
check('separate @@privacy.section.jevFastMode.limitedUse.body unit exists',
  (html.match(/@@privacy\.section\.jevFastMode\.limitedUse\.body/g) || []).length === 1 && limitedUseText.length > 0,
  'the fast-mode Limited Use statement is missing');
check('fast-mode Limited Use statement names Limited Use and the Chrome Web Store',
  limitedUseText.includes('Limited Use') && limitedUseText.includes('Chrome Web Store'),
  'Limited Use statement must name the Chrome Web Store and Limited Use');
check('fast-mode Limited Use body matches /(complies with|adheres to)/i (affirmative compliance)',
  /(complies with|adheres to)/i.test(limitedUseText),
  'the statement must affirmatively say FSB complies (sync issue 3)');
check('fast-mode Limited Use statement opens with the affirmative compliance sentence',
  /^FSB's use of information received through fast mode complies with the Chrome Web Store User Data Policy, including the Limited Use requirements\./.test(limitedUseText),
  'the first sentence must be the D-07 compliance sentence');

const jevUnitIds = unitIdsWithPrefix('privacy.section.jevFastMode.');
check('the fast-mode section has separate units for intro, control, scope, lists, recipients, retention and terms',
  ['title', 'intro', 'control', 'calibration', 'scope', 'sent.title', 'notSent.title', 'secrets',
    'recipients', 'retention', 'typesafe', 'openrouter', 'limitedUse.title', 'limitedUse.body']
    .every((suffix) => jevUnitIds.includes(`privacy.section.jevFastMode.${suffix}`)),
  `units found: ${jevUnitIds.join(', ')}`);
const neverReadsHits = jevUnitIds.filter((id) => {
  const text = pageText(unitHtml(id));
  return /FSB never reads/i.test(text) || /\bnever reads?\b/i.test(text);
});
check('no fast-mode unit says FSB never reads (sync issue 1)',
  neverReadsHits.length === 0,
  `units: ${neverReadsHits.join(', ')}`);

const external6 = pageText(unitHtml('privacy.section.external.li.6'));
check('External Services has @@privacy.section.external.li.6 about fast mode',
  /fast mode/i.test(external6),
  'External Services must carry a fast-mode bullet');

const tldrHtml = unitHtml('privacy.tldr.body');
check('TLDR no longer carries the unqualified "no browsing data is collected by FSB servers." sentence',
  tldrHtml.length > 0 &&
    !/no browsing data is collected by (?:<span[^>]*>)?FSB(?:<\/span>)? servers\./.test(tldrHtml),
  'the TLDR must qualify the no-browsing-data claim for fast mode');
check('TLDR mentions fast mode',
  /fast mode/i.test(pageText(tldrHtml)),
  'the TLDR must mention the opt-in fast mode');
check('TLDR no longer says the telemetry is the only data that leaves for FSB without a fast-mode qualifier',
  /apart from fast mode/i.test(pageText(tldrHtml)),
  'the "only data that ever leaves" sentence must be qualified');
const updatedHtml = unitHtml('privacy.header.updated');
check('header Last updated moved off September 29, 2026',
  /Last updated:/.test(updatedHtml) && !updatedHtml.includes('September 29, 2026'),
  `header says: ${updatedHtml}`);

const pageSentences = pageText(html).split(/(?<=\.)\s+/);
const typesafeRetention = pageSentences.filter((s) =>
  /TypeSafe[^.]*\b(does not|doesn't|never)\s+(retain|store|keep)/i.test(s));
check('no sentence claims TypeSafe does not retain, store or keep requests',
  typesafeRetention.length === 0 &&
    !/TypeSafe[^.]*\b(does not|doesn't|never)\s+(retain|store|keep)/i.test(html),
  typesafeRetention.join(' | '));
check('TypeSafe terms are stated as TypeSafe states them, with its retention wording',
  /TypeSafe AI states/i.test(pageText(unitHtml('privacy.section.jevFastMode.typesafe'))) &&
    /as long as reasonably necessary/i.test(pageText(unitHtml('privacy.section.jevFastMode.typesafe'))),
  'TypeSafe terms sentence missing');

// Alignment with the shared fact list (warning-proof for M-68-11).
const cardStart = controlPanelHtml.indexOf('id="fsbJevFastModeCard"');
const cardEnd = controlPanelHtml.indexOf('<!-- /fsbJevFastModeCard -->');
const cardText = cardStart >= 0 && cardEnd > cardStart
  ? FACTS.textOf(controlPanelHtml.slice(cardStart, cardEnd))
  : '';
const sectionLower = jevSectionText.toLowerCase();
const cardLower = cardText.toLowerCase();
const missingOnPage = [...FACTS.SHARED_PHRASES, ...FACTS.PAGE_ONLY_PHRASES]
  .filter((phrase) => !sectionLower.includes(phrase.toLowerCase()));
check('the fast-mode section contains every SHARED_PHRASES and PAGE_ONLY_PHRASES entry',
  jevSectionText.length > 0 && missingOnPage.length === 0,
  `missing: ${missingOnPage.join(' | ')}`);
const missingOnCard = FACTS.SHARED_PHRASES.filter((phrase) => !cardLower.includes(phrase.toLowerCase()));
check('the control_panel.html card contains every SHARED_PHRASES entry',
  cardText.length > 0 && missingOnCard.length === 0,
  `missing: ${missingOnCard.join(' | ')}`);
const forbiddenOnPage = FACTS.FORBIDDEN_PATTERNS.filter((re) => re.test(jevSectionText));
check('the fast-mode section matches no FORBIDDEN_PATTERNS entry',
  jevSectionText.length > 0 && forbiddenOnPage.length === 0,
  `matched: ${forbiddenOnPage.map(String).join(' | ')}`);
const forbiddenOnCard = FACTS.FORBIDDEN_PATTERNS.filter((re) => re.test(cardText));
check('the control_panel.html card matches no FORBIDDEN_PATTERNS entry',
  cardText.length > 0 && forbiddenOnCard.length === 0,
  `matched: ${forbiddenOnCard.map(String).join(' | ')}`);

console.log(`\n=== showcase-privacy-page.test results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
