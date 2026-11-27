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

// Remote Dashboard, remote control and live preview ended with v0.9.95. The
// section keeps its disclosures as a record of how the feature worked, so it
// must open with a paragraph that says so, ahead of the description itself.
{
  const retired = (html.match(/<p i18n="@@privacy\.section\.phantomStream\.retired">([\s\S]*?)<\/p>/) || [])[1] || '';
  check('PhantomStream section opens with the retirement paragraph',
    Boolean(retired) &&
      html.indexOf('@@privacy.section.phantomStream.title') < html.indexOf('@@privacy.section.phantomStream.retired') &&
      html.indexOf('@@privacy.section.phantomStream.retired') < html.indexOf('@@privacy.section.phantomStream.body'),
    'retirement paragraph missing or not placed between the section title and its body');
  check('retirement paragraph names v0.9.95 as the last version with the feature',
    /Retired after .*v0\.9\.95/.test(retired) && /last version of .*FSB.* with .*Remote Dashboard.*, remote control, and live preview/.test(retired),
    'retirement paragraph no longer says which version was the last one');
  check('retirement paragraph says newer versions stay off the relay and clear the pairing',
    /never open the relay connection/.test(retired) && /delete the stored hash key and server address/.test(retired),
    'retirement paragraph no longer describes what newer versions do');
  check('retirement paragraph says the server only answers older installs\' pings and stores nothing',
    /keepalive pings/.test(retired) && /discards everything else they send without storing it/.test(retired),
    'retirement paragraph no longer describes what the server does with older installs');
}
for (const phrase of [
  'remote control now handled by the Sync tab',
  'only contacted when you pair a Sync session',
  'You must explicitly enable it in Options',
  'If you pair <span',
  'a relay server facilitates communication',
]) {
  check(`no present-tense claim about the retired relay: "${phrase}"`,
    !html.includes(phrase),
    'current builds have no Sync tab, pairing or server sync; word this for v0.9.95 and earlier');
}
// From v0.9.31 through v0.9.95 the service worker registered a key and opened
// the relay socket at every browser start, paired or not, so the Background
// Agents section must not say the relay was only reached after pairing.
{
  const deprecated = (html.match(/<p i18n="@@privacy\.section\.bgAgents\.deprecated">([\s\S]*?)<\/p>/) || [])[1] || '';
  check('Background Agents section does not claim the relay was only contacted after pairing',
    !/only contacted when you paired/.test(html),
    'builds from v0.9.31 through v0.9.95 connected to the relay whether or not a Sync session was paired');
  check('Background Agents section says v0.9.31 through v0.9.95 connected at every browser start',
    /From <span[^>]*>v0\.9\.31<\/span> through <span[^>]*>v0\.9\.95<\/span>/.test(deprecated) &&
      /connected to it at every browser start, whether or not you paired a Sync session/.test(deprecated),
    'bgAgents.deprecated no longer describes the unconditional relay connection');
}

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
check('the September 29 archive note names the November 27, 2026 update that replaced it',
  /<p class="archive-note">[^<]*before the November 27, 2026 update\.<\/p>/.test(sep29Body),
  'the archive note must name the update that followed the archived text');
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

// =============================================================================
// 9. Logins and cards come from 1Password. FSB's own PIN vault is gone, so the
//    policy says what the 1Password connection stores, what the AI sees, and
//    that FSB keeps no logins, cards or CVVs, and no longer claims a local
//    credential manager or payment-method vault.
// =============================================================================
{
  const unit = (id) => ((html.match(new RegExp(`i18n="@@privacy\\.section\\.${id.replace(/\./g, '\\.')}">([\\s\\S]*?)</(?:li|p|h2)>`)) || [])[1] || '')
    .replace(/<[^>]+>/g, '');
  check('the Connecting 1Password section has its stable anchor',
    /<h2 data-depth-anchor="\d+" id="onepassword" i18n="@@privacy\.section\.onePassword\.title">/.test(html),
    'the 1Password section needs id="onepassword"');
  check('FSB keeps no passwords or cards of its own',
    unit('onePassword.body').includes('keeps no passwords or cards of its own'),
    'the 1Password section must say FSB keeps no logins or cards');
  const settings = unit('onePassword.li.2');
  check('the settings file, its permissions and the unencrypted service-account token are disclosed',
    settings.includes('~/.fsb/onepassword.json') && settings.includes('readable only by you') &&
      settings.includes('service-account token') && settings.includes('rather than encrypted'),
    'the policy must name onepassword.json, its owner-only access and that the token is not encrypted');
  check('Disconnect deletes the settings file',
    unit('onePassword.li.3').includes('Disconnect deletes onepassword.json'),
    'the policy must say what Disconnect removes');
  check('nothing about logins or cards reaches FSB servers',
    unit('onePassword.li.4').includes("Nothing about your logins or cards is sent to FSB's servers"),
    'the policy must say no login or card data goes to FSB servers');
  check('the old vault is disclosed until it is moved or deleted',
    /stay encrypted/.test(unit('onePassword.li.5')) && unit('onePassword.li.5').includes('batches of 10'),
    'the policy must say old vault entries stay until moved or deleted');
  check('an https login is never filled on an http page',
    unit('autoPasswords.li.1').includes('never filled on an http page'),
    'the logins section must keep the https rule');
  check('passwords and one-time codes never reach an MCP client',
    unit('autoPasswords.li.4').includes('never to an MCP client'),
    'the logins section must say secrets never reach MCP clients');
  check('cards fill only on https pages',
    unit('paymentMethods.li.1').includes('only on https pages'),
    'the cards section must keep the https-only rule');
  check('the card-approval line says FSB shows no prompt over MCP and names use_payment_method',
    unit('paymentMethods.li.5').includes('shows no prompt of its own') && unit('paymentMethods.li.5').includes('use_payment_method'),
    'the cards section must say who asks before a card is filled');
  check('expiry is no longer claimed to stay out of AI prompts',
    !/expiry are never included/.test(unit('paymentMethods.li.2')) && unit('paymentMethods.li.4').includes('expiry month and year'),
    'agents see the expiry month and year, so the policy must say so');
  check('FSB never stores a CVV',
    unit('paymentMethods.li.6').includes('never stores a CVV'),
    'the cards section must say no CVV is stored');
  for (const removed of ['credential manager', 'payment-method vault', 'vault-derived key', 'PBKDF2']) {
    check(`the current policy no longer claims the removed vault (${removed})`,
      !html.includes(removed),
      `"${removed}" describes the PIN vault that 1Password replaced`);
  }
}

// Policy History: the newest entry keeps the text the latest update replaced, so
// its note must name the date the page now shows. Entry ids are unit ids and
// must stay unique.
{
  const visible = (html.match(/i18n="@@privacy\.header\.updated">Last updated: ([A-Z][a-z]+ \d{1,2}, \d{4})</) || [])[1];
  const newest = archiveHtml.slice(0, archiveHtml.indexOf('</details>'));
  const ids = [...archiveHtml.matchAll(/i18n="@@privacy\.archive\.([A-Za-z0-9]+)\.summary"/g)].map((m) => m[1]);
  check('Policy History entries have unique ids',
    ids.length > 0 && new Set(ids).size === ids.length &&
      ids.every((id) => archiveHtml.includes(`i18n="@@privacy.archive.${id}.body"`)),
    `archive ids: ${ids.join(', ')}`);
  check('newest Policy History entry archives the text replaced by the current update',
    Boolean(visible) && newest.includes(`before the ${visible} update.</p>`),
    `newest archive note does not end "before the ${visible} update."`);
  const sep29Start = archiveHtml.indexOf('i18n="@@privacy.archive.september29.body"');
  const sep29 = sep29Start === -1 ? '' : archiveHtml.slice(sep29Start, archiveHtml.indexOf('</details>', sep29Start));
  check('September 29, 2026 archive keeps the Remote Dashboard wording it was written with',
    sep29.includes('as it stood from September 29, 2026, before the November 27, 2026 update.') &&
      sep29.includes('remote control now handled by the Sync tab') &&
      sep29.includes('Region (city-level) metric') &&
      !/ i18n="/.test(sep29) && !/ id="/.test(sep29),
    'september29 archive body missing, altered, or still carrying live-page ids');
}

console.log(`\n=== showcase-privacy-page.test results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
