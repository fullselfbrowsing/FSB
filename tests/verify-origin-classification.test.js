#!/usr/bin/env node
'use strict';

/**
 * Phase 41 / Plan 01 (v1.0.0 Full App Catalog -- DEPTH-02) -- the CORS /
 * FIRST-PARTY-ORIGIN GATE unit proof (WR-02).
 *
 * THE COVERAGE GAP THIS CLOSES: scripts/verify-origin-classification.mjs documents a
 * dual-export contract ("export { classifyOriginPattern, checkOriginClassification } --
 * driven by a test") but no test drove the EXPORTED functions -- the failure path rested
 * solely on the CLI inline linear negative-control inside validate:extension. So the
 * per-branch logic (parseHeadModules entry-splitting, the unmapped-head fail-closed
 * branch, the CORS_UNRESOLVABLE branch, the slack dynamic-workspace same-registrable
 * accommodation) had NO focused unit coverage; a refactor could silently mis-parse until
 * the whole validate:extension happened to notice.
 *
 * This drives the REAL exports (NOT a re-implemented copy; mirrors
 * tests/no-duplicate-stem.test.js's real-export pattern):
 *   (a) parseHeadModules on the REAL catalog source -> exactly the known head globals
 *       with their correct origins; PLUS a synthetic NESTED-brace entry parses whole
 *       (IN-01 hardening: origin is captured, not dropped to null).
 *   (b) the classifier returns sameOrigin:true for gitlab.com/api/v4,
 *       app.notion.com/api/v3, AND the slack dynamic-workspace accommodation
 *       (same-registrable-domain, explicit SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE
 *       reason) -- including the real end-to-end checkOriginClassification() over the
 *       live catalog + vendored slack-api.ts.
 *   (c) sameOrigin:false / CORS_SEPARATE_ORIGIN for a synthetic separate-origin head
 *       (linear -> client-api.linear.app) AND a per-org wildcard (app.datadoghq.com ->
 *       *.datadoghq.com api subdomain); AND a dynamic-workspace base OUTSIDE the head
 *       registrable family still FAILS (the accommodation is asserted, not a rubber-stamp).
 *   (d) the unmapped-head (CORS_UNMAPPED_HEAD) and CORS_UNRESOLVABLE_ORIGIN branches
 *       return the right reason.
 *
 * Zero-framework node test: a check(cond,msg) counter, PASS=/FAIL= summary,
 * process.exit(failed>0?1:0). ASCII-only, NO emojis.
 *
 * Run: node tests/verify-origin-classification.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

(async () => {
  console.log('--- DEPTH-02 origin-classification gate unit proof (WR-02: the CORS-gate exports are non-vacuously tested) ---');

  const ROOT = path.resolve(__dirname, '..');
  const gateUrl = pathToFileURL(path.join(ROOT, 'scripts', 'verify-origin-classification.mjs')).href;
  const gate = await import(gateUrl);

  check(typeof gate.classifyOriginPattern === 'function',
    'classifyOriginPattern is a named export of the real gate (not re-implemented here)');
  check(typeof gate.checkOriginClassification === 'function',
    'checkOriginClassification is a named export of the real gate');
  check(typeof gate.parseHeadModules === 'function',
    'parseHeadModules is a named export of the real gate (driven directly, IN-01 coverage)');
  check(typeof gate.verifyPageGapiUiSheetsSessionSources === 'function',
    'verifyPageGapiUiSheetsSessionSources is a named export of the real gate');

  // ===== (a) parseHeadModules on the REAL catalog source =====================
  const CATALOG_PATH = path.join(ROOT, 'extension', 'utils', 'capability-catalog.js');
  check(fs.existsSync(CATALOG_PATH), '(a) capability-catalog.js exists (the head manifest source)');
  const catalogSrc = fs.existsSync(CATALOG_PATH) ? fs.readFileSync(CATALOG_PATH, 'utf8') : '';
  const realHeads = gate.parseHeadModules(catalogSrc) || [];
  check(realHeads.length === 124,
    '(a) parseHeadModules returns exactly 124 heads from the real catalog source; got ' + realHeads.length);
  const byGlobal = {};
  for (const h of realHeads) { byGlobal[h.global] = h.origin; }
  check(byGlobal.FsbHandlerGithub === 'https://github.com',
    '(a) FsbHandlerGithub origin parsed as https://github.com');
  check(byGlobal.FsbHandlerSlack === 'https://app.slack.com',
    '(a) FsbHandlerSlack origin parsed as https://app.slack.com');
  check(byGlobal.FsbHandlerNotion === 'https://app.notion.com',
    '(a) FsbHandlerNotion origin parsed as https://app.notion.com');
  check(byGlobal.FsbHandlerGitlab === 'https://gitlab.com',
    '(a) FsbHandlerGitlab origin parsed as https://gitlab.com');
  check(byGlobal.FsbHandlerNetlify === 'https://app.netlify.com',
    '(a) FsbHandlerNetlify origin parsed as https://app.netlify.com');
  check(byGlobal.FsbHandlerBitbucket === 'https://bitbucket.org',
    '(a) FsbHandlerBitbucket origin parsed as https://bitbucket.org');
  check(byGlobal.FsbHandlerCircleci === 'https://app.circleci.com',
    '(a) FsbHandlerCircleci origin parsed as https://app.circleci.com');
  check(byGlobal.FsbHandlerVercel === 'https://vercel.com',
    '(a) FsbHandlerVercel origin parsed as https://vercel.com');
  check(byGlobal.FsbHandlerRetool === 'https://retool.com',
    '(a) FsbHandlerRetool origin parsed as https://retool.com');
  check(byGlobal.FsbHandlerAsana === 'https://app.asana.com',
    '(a) FsbHandlerAsana origin parsed as https://app.asana.com');
  check(byGlobal.FsbHandlerShortcut === 'https://app.shortcut.com',
    '(a) FsbHandlerShortcut origin parsed as https://app.shortcut.com');
  check(byGlobal.FsbHandlerLeetcode === 'https://leetcode.com',
    '(a) FsbHandlerLeetcode origin parsed as https://leetcode.com');
  check(byGlobal.FsbHandlerWikipedia === 'https://en.wikipedia.org',
    '(a) FsbHandlerWikipedia origin parsed as https://en.wikipedia.org');
  check(byGlobal.FsbHandlerHackernews === 'https://news.ycombinator.com',
    '(a) FsbHandlerHackernews origin parsed as https://news.ycombinator.com');
  check(byGlobal.FsbHandlerNpm === 'https://www.npmjs.com',
    '(a) FsbHandlerNpm origin parsed as https://www.npmjs.com');
  check(byGlobal.FsbHandlerYelp === 'https://www.yelp.com',
    '(a) FsbHandlerYelp origin parsed as https://www.yelp.com');
  check(byGlobal.FsbHandlerTripadvisor === 'https://www.tripadvisor.com',
    '(a) FsbHandlerTripadvisor origin parsed as https://www.tripadvisor.com');
  check(byGlobal.FsbHandlerZillow === 'https://www.zillow.com',
    '(a) FsbHandlerZillow origin parsed as https://www.zillow.com');
  check(byGlobal.FsbHandlerRedfin === 'https://www.redfin.com',
    '(a) FsbHandlerRedfin origin parsed as https://www.redfin.com');
  check(byGlobal.FsbHandlerBsky === 'https://bsky.app',
    '(a) FsbHandlerBsky origin parsed as https://bsky.app');
  check(byGlobal.FsbHandlerTerraform === 'https://app.terraform.io',
    '(a) FsbHandlerTerraform origin parsed as https://app.terraform.io');
  check(byGlobal.FsbHandlerCloudflare === 'https://dash.cloudflare.com',
    '(a) FsbHandlerCloudflare origin parsed as https://dash.cloudflare.com');
  check(byGlobal.FsbHandlerX === 'https://x.com',
    '(a) FsbHandlerX origin parsed as https://x.com');
  check(byGlobal.FsbHandlerInstagram === 'https://www.instagram.com',
    '(a) FsbHandlerInstagram origin parsed as https://www.instagram.com');
  check(byGlobal.FsbHandlerTiktok === 'https://www.tiktok.com',
    '(a) FsbHandlerTiktok origin parsed as https://www.tiktok.com');
  check(byGlobal.FsbHandlerFacebook === 'https://www.facebook.com',
    '(a) FsbHandlerFacebook origin parsed as https://www.facebook.com');
  check(byGlobal.FsbHandlerStackoverflow === 'https://stackoverflow.com',
    '(a) FsbHandlerStackoverflow origin parsed as https://stackoverflow.com');
  check(byGlobal.FsbHandlerTwilio === 'https://www.twilio.com',
    '(a) FsbHandlerTwilio origin parsed as https://www.twilio.com');
  check(byGlobal.FsbHandlerTumblr === 'https://www.tumblr.com',
    '(a) FsbHandlerTumblr origin parsed as https://www.tumblr.com');
  check(byGlobal.FsbHandlerPriceline === 'https://www.priceline.com',
    '(a) FsbHandlerPriceline origin parsed as https://www.priceline.com');
  check(byGlobal.FsbHandlerAirbnb === 'https://www.airbnb.com',
    '(a) FsbHandlerAirbnb origin parsed as https://www.airbnb.com');
  check(byGlobal.FsbHandlerExpedia === 'https://www.expedia.com',
    '(a) FsbHandlerExpedia origin parsed as https://www.expedia.com');
  check(byGlobal.FsbHandlerBooking === 'https://www.booking.com',
    '(a) FsbHandlerBooking origin parsed as https://www.booking.com');
  check(byGlobal.FsbHandlerKayak === 'https://www.kayak.com',
    '(a) FsbHandlerKayak origin parsed as https://www.kayak.com');
  check(byGlobal.FsbHandlerMongodb === 'https://cloud.mongodb.com',
    '(a) FsbHandlerMongodb origin parsed as https://cloud.mongodb.com');
  check(byGlobal.FsbHandlerCockroachdb === 'https://cockroachlabs.cloud',
    '(a) FsbHandlerCockroachdb origin parsed as https://cockroachlabs.cloud');
  check(byGlobal.FsbHandlerPinterest === 'https://www.pinterest.com',
    '(a) FsbHandlerPinterest origin parsed as https://www.pinterest.com');
  check(byGlobal.FsbHandlerExcel === 'https://excel.cloud.microsoft',
    '(a) FsbHandlerExcel origin parsed as https://excel.cloud.microsoft');
  check(byGlobal.FsbHandlerStarbucks === 'https://www.starbucks.com',
    '(a) FsbHandlerStarbucks origin parsed as https://www.starbucks.com');
  check(byGlobal.FsbHandlerMedium === 'https://medium.com',
    '(a) FsbHandlerMedium origin parsed as https://medium.com');
  check(byGlobal.FsbHandlerDominos === 'https://www.dominos.com',
    '(a) FsbHandlerDominos origin parsed as https://www.dominos.com');
  check(byGlobal.FsbHandlerWhatsapp === 'https://web.whatsapp.com',
    '(a) FsbHandlerWhatsapp origin parsed as https://web.whatsapp.com');
  check(byGlobal.FsbHandlerAmplitude === 'https://app.amplitude.com',
    '(a) FsbHandlerAmplitude origin parsed as https://app.amplitude.com');
  check(byGlobal.FsbHandlerNewrelic === 'https://one.newrelic.com',
    '(a) FsbHandlerNewrelic origin parsed as https://one.newrelic.com');
  check(byGlobal.FsbHandlerDatadog === 'https://app.datadoghq.com',
    '(a) FsbHandlerDatadog origin parsed as https://app.datadoghq.com');
  check(byGlobal.FsbHandlerChipotle === 'https://www.chipotle.com',
    '(a) FsbHandlerChipotle origin parsed as https://www.chipotle.com');
  check(byGlobal.FsbHandlerPandaexpress === 'https://www.pandaexpress.com',
    '(a) FsbHandlerPandaexpress origin parsed as https://www.pandaexpress.com');
  check(byGlobal.FsbHandlerLucid === 'https://lucid.app',
    '(a) FsbHandlerLucid origin parsed as https://lucid.app');
  check(byGlobal.FsbHandlerTarget === 'https://www.target.com',
    '(a) FsbHandlerTarget origin parsed as https://www.target.com');
  check(byGlobal.FsbHandlerCostco === 'https://www.costco.com',
    '(a) FsbHandlerCostco origin parsed as https://www.costco.com');
  check(byGlobal.FsbHandlerWalmart === 'https://www.walmart.com',
    '(a) FsbHandlerWalmart origin parsed as https://www.walmart.com');
  check(byGlobal.FsbHandlerHack2hire === 'https://www.hack2hire.com',
    '(a) FsbHandlerHack2hire origin parsed as https://www.hack2hire.com');
  check(byGlobal.FsbHandlerClickhouse === 'https://console.clickhouse.cloud',
    '(a) FsbHandlerClickhouse origin parsed as https://console.clickhouse.cloud');
  check(byGlobal.FsbHandlerChatgpt === 'https://chatgpt.com',
    '(a) FsbHandlerChatgpt origin parsed as https://chatgpt.com');
  check(byGlobal.FsbHandlerClaude === 'https://claude.ai',
    '(a) FsbHandlerClaude origin parsed as https://claude.ai');
  check(byGlobal.FsbHandlerGemini === 'https://gemini.google.com',
    '(a) FsbHandlerGemini origin parsed as https://gemini.google.com');
  check(byGlobal.FsbHandlerGsheets === 'https://docs.google.com',
    '(a) FsbHandlerGsheets origin parsed as https://docs.google.com');
  check(byGlobal.FsbHandlerPowerpoint === 'https://powerpoint.cloud.microsoft',
    '(a) FsbHandlerPowerpoint origin parsed as https://powerpoint.cloud.microsoft');
  check(byGlobal.FsbHandlerOutlook === 'https://outlook.cloud.microsoft',
    '(a) FsbHandlerOutlook origin parsed as https://outlook.cloud.microsoft');
  check(byGlobal.FsbHandlerOnenote === 'https://onenote.cloud.microsoft',
    '(a) FsbHandlerOnenote origin parsed as https://onenote.cloud.microsoft');
  check(byGlobal.FsbHandlerTodoist === 'https://app.todoist.com',
    '(a) FsbHandlerTodoist origin parsed as https://app.todoist.com');
  check(byGlobal.FsbHandlerExcel === 'https://excel.cloud.microsoft',
    '(a) FsbHandlerExcel origin parsed as https://excel.cloud.microsoft');
  check(byGlobal.FsbHandlerWebflow === 'https://webflow.com',
    '(a) FsbHandlerWebflow origin parsed as https://webflow.com');
  check(byGlobal.FsbHandlerCalendly === 'https://calendly.com',
    '(a) FsbHandlerCalendly origin parsed as https://calendly.com');
  check(byGlobal.FsbHandlerAirtable === 'https://airtable.com',
    '(a) FsbHandlerAirtable origin parsed as https://airtable.com');
  check(byGlobal.FsbHandlerSpotify === 'https://open.spotify.com',
    '(a) FsbHandlerSpotify origin parsed as https://open.spotify.com');
  check(byGlobal.FsbHandlerSteam === 'https://store.steampowered.com',
    '(a) FsbHandlerSteam origin parsed as https://store.steampowered.com');
  check(byGlobal.FsbHandlerTwitch === 'https://www.twitch.tv',
    '(a) FsbHandlerTwitch origin parsed as https://www.twitch.tv');

  // (a-IN01) a synthetic NESTED-brace entry parses WHOLE (origin not dropped to null).
  // The old /\{[^}]*\}/g entry regex would have truncated this entry at the inner `}` of
  // `meta: { region: 'us' }`, dropping origin -> origin:null -> a confusing false red.
  const nestedSrc = [
    'var HEAD_HANDLER_MODULES = [',
    "  { global: 'FsbHandlerGithub', service: 'github.com', origin: 'https://github.com' },",
    "  { global: 'FsbHandlerFuture', meta: { region: 'us' }, origin: 'https://future.example.com' },",
    "  { global: 'FsbHandlerSlack', service: 'app.slack.com', origin: 'https://app.slack.com' }",
    '];'
  ].join('\n');
  const nestedHeads = gate.parseHeadModules(nestedSrc) || [];
  check(nestedHeads.length === 3,
    '(a-IN01) a nested-brace manifest parses all 3 entries; got ' + nestedHeads.length);
  const future = nestedHeads.find((h) => h.global === 'FsbHandlerFuture');
  check(!!future && future.origin === 'https://future.example.com',
    '(a-IN01) the NESTED-brace entry keeps its origin (https://future.example.com, NOT null) -- IN-01 hardening');

  // (a) a `}` inside a quoted string value does not falsely close an entry.
  const quotedSrc = [
    'var HEAD_HANDLER_MODULES = [',
    "  { global: 'FsbHandlerQuote', note: 'a } brace in a string', origin: 'https://quote.example.com' }",
    '];'
  ].join('\n');
  const quotedHeads = gate.parseHeadModules(quotedSrc) || [];
  const quoteEntry = quotedHeads.find((h) => h.global === 'FsbHandlerQuote');
  check(!!quoteEntry && quoteEntry.origin === 'https://quote.example.com',
    '(a) a `}` inside a quoted string value does not split the entry (string-aware scan)');

  // ===== (b) same-origin / same-registrable PASS rows ========================
  const gl = gate.classifyOriginPattern('https://gitlab.com', 'https://gitlab.com/api/v4');
  check(gl.sameOrigin === true && gl.separate === false && gl.reason === null,
    '(b) gitlab.com vs gitlab.com/api/v4 -> sameOrigin:true (strict same-origin path)');
  const nt = gate.classifyOriginPattern('https://app.notion.com', 'https://app.notion.com/api/v3/${endpoint}');
  check(nt.sameOrigin === true && nt.separate === false && nt.reason === null,
    '(b) app.notion.com vs app.notion.com/api/v3 -> sameOrigin:true (strict same-origin path)');
  const sl = gate.classifyOriginPattern('https://app.slack.com', 'https://workspace.slack.com', { dynamicWorkspace: true });
  check(sl.sameOrigin === true && sl.separate === false,
    '(b) slack app.slack.com vs *.slack.com dynamic base -> sameOrigin:true (registrable-domain accommodation)');
  check(typeof sl.reason === 'string' && sl.reason.indexOf('SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE') === 0,
    '(b) the slack accommodation carries the EXPLICIT SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE reason (asserted, not a silent fallback)');
  // a per-team classic-client subdomain is still same-registrable (the real runtime case).
  const slTeam = gate.classifyOriginPattern('https://app.slack.com', 'https://myteam.slack.com', { dynamicWorkspace: true });
  check(slTeam.sameOrigin === true,
    '(b) slack per-team classic-client subdomain (myteam.slack.com) -> sameOrigin:true (same registrable domain slack.com)');
  const relativeApi = gate.classifyOriginPattern('https://app.netlify.com', 'https://app.netlify.com/access-control/bb-api/api/v1');
  check(relativeApi.sameOrigin === true && relativeApi.separate === false,
    '(b) same-origin relative vendored API bases classify as strict same-origin after joining with the handler origin');
  const pinterestResource = gate.classifyOriginPattern('https://www.pinterest.com', 'https://www.pinterest.com/resource');
  check(pinterestResource.sameOrigin === true && pinterestResource.separate === false,
    '(b) Pinterest www.pinterest.com/resource -> sameOrigin:true (strict same-origin resource path)');
  const bskyPublic = gate.classifyOriginPattern('https://bsky.app', 'https://api.bsky.app/xrpc', { publicCorsRead: true });
  check(bskyPublic.sameOrigin === true && bskyPublic.separate === false
    && typeof bskyPublic.reason === 'string'
    && bskyPublic.reason.indexOf('PUBLIC_CORS_READ_NO_AUTH') === 0,
    '(b) bsky.app vs api.bsky.app public AppView -> sameOrigin:true through the explicit no-auth public CORS read accommodation');
  const bskyPublicBad = gate.classifyOriginPattern('https://bsky.app', 'https://evil.example.com/xrpc', { publicCorsRead: true });
  check(bskyPublicBad.sameOrigin === false && bskyPublicBad.separate === true
    && typeof bskyPublicBad.reason === 'string'
    && bskyPublicBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the Bluesky public CORS accommodation still rejects bases outside the bsky.app registrable family');
  const chipotlePublic = gate.classifyOriginPattern('https://www.chipotle.com', 'https://services.chipotle.com', { publicCorsRead: true });
  check(chipotlePublic.sameOrigin === true && chipotlePublic.separate === false
    && typeof chipotlePublic.reason === 'string'
    && chipotlePublic.reason.indexOf('PUBLIC_CORS_READ_NO_AUTH') === 0,
    '(b) www.chipotle.com vs services.chipotle.com public services -> sameOrigin:true through the explicit no-auth public CORS read accommodation');
  const h2hStorage = gate.classifyOriginPattern('https://www.hack2hire.com', 'https://api.hack2hire.com/algro/v1', { storageBearerRead: true });
  check(h2hStorage.sameOrigin === true && h2hStorage.separate === false
    && typeof h2hStorage.reason === 'string'
    && h2hStorage.reason.indexOf('SAME_REGISTRABLE_DOMAIN_STORAGE_BEARER_READ') === 0,
    '(b) www.hack2hire.com vs api.hack2hire.com storage-bearer API -> sameOrigin:true through the explicit storage-bearer read accommodation');
  const h2hStorageBad = gate.classifyOriginPattern('https://www.hack2hire.com', 'https://evil.example.com/algro/v1', { storageBearerRead: true });
  check(h2hStorageBad.sameOrigin === false && h2hStorageBad.separate === true
    && typeof h2hStorageBad.reason === 'string'
    && h2hStorageBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the Hack2Hire storage-bearer accommodation still rejects bases outside the hack2hire.com registrable family');
  const clickhouseStorage = gate.classifyOriginPattern('https://console.clickhouse.cloud', 'https://control-plane-internal.clickhouse.cloud', { storageBearerRead: true });
  check(clickhouseStorage.sameOrigin === true && clickhouseStorage.separate === false
    && typeof clickhouseStorage.reason === 'string'
    && clickhouseStorage.reason.indexOf('SAME_REGISTRABLE_DOMAIN_STORAGE_BEARER_READ') === 0,
    '(b) console.clickhouse.cloud vs control-plane-internal.clickhouse.cloud storage-bearer API -> sameOrigin:true through the explicit storage-bearer read accommodation');
  const lucidAuthRead = gate.classifyOriginPattern('https://lucid.app', 'https://users.lucid.app', { firstPartyAuthRead: true });
  check(lucidAuthRead.sameOrigin === true && lucidAuthRead.separate === false
    && typeof lucidAuthRead.reason === 'string'
    && lucidAuthRead.reason.indexOf('SAME_REGISTRABLE_DOMAIN_FIRST_PARTY_AUTH_READ') === 0,
    '(b) lucid.app vs users.lucid.app first-party auth reads -> sameOrigin:true through the explicit authenticated read accommodation');
  const lucidAuthReadBad = gate.classifyOriginPattern('https://lucid.app', 'https://evil.example.com', { firstPartyAuthRead: true });
  check(lucidAuthReadBad.sameOrigin === false && lucidAuthReadBad.separate === true
    && typeof lucidAuthReadBad.reason === 'string'
    && lucidAuthReadBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the Lucid first-party auth read accommodation still rejects bases outside the lucid.app registrable family');
  const powerpointGraph = gate.classifyOriginPattern('https://powerpoint.cloud.microsoft', 'https://graph.microsoft.com/v1.0', { pageBearerGraphRead: true });
  check(powerpointGraph.sameOrigin === true && powerpointGraph.separate === false
    && typeof powerpointGraph.reason === 'string'
    && powerpointGraph.reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0,
    '(b) powerpoint.cloud.microsoft vs graph.microsoft.com Graph GETs -> sameOrigin:true through the explicit page-bearer Graph read accommodation');
  const powerpointGraphBad = gate.classifyOriginPattern('https://word.cloud.microsoft', 'https://graph.microsoft.com/v1.0', { pageBearerGraphRead: true });
  check(powerpointGraphBad.sameOrigin === false && powerpointGraphBad.separate === true
    && typeof powerpointGraphBad.reason === 'string'
    && powerpointGraphBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the PowerPoint page-bearer Graph accommodation rejects non-PowerPoint head origins');
  const wordGraph = gate.classifyOriginPattern('https://word.cloud.microsoft', 'https://graph.microsoft.com/v1.0', { pageBearerGraphRead: true, pageBearerGraphApp: 'microsoft-word' });
  check(wordGraph.sameOrigin === true && wordGraph.separate === false
    && typeof wordGraph.reason === 'string'
    && wordGraph.reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0,
    '(b) word.cloud.microsoft vs graph.microsoft.com Graph GETs -> sameOrigin:true through the explicit Microsoft Word page-bearer Graph read accommodation');
  const wordGraphBad = gate.classifyOriginPattern('https://docs.example.com', 'https://graph.microsoft.com/v1.0', { pageBearerGraphRead: true, pageBearerGraphApp: 'microsoft-word' });
  check(wordGraphBad.sameOrigin === false && wordGraphBad.separate === true
    && typeof wordGraphBad.reason === 'string'
    && wordGraphBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the Microsoft Word page-bearer Graph accommodation rejects non-Word head origins');
  const outlookGraph = gate.classifyOriginPattern('https://outlook.cloud.microsoft', 'https://graph.microsoft.com/v1.0', { pageBearerGraphRead: true, pageBearerGraphApp: 'outlook' });
  check(outlookGraph.sameOrigin === true && outlookGraph.separate === false
    && typeof outlookGraph.reason === 'string'
    && outlookGraph.reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0,
    '(b) outlook.cloud.microsoft vs graph.microsoft.com Graph GETs -> sameOrigin:true through the explicit page-bearer Graph read accommodation');
  const outlookGraphBad = gate.classifyOriginPattern('https://mail.example.com', 'https://graph.microsoft.com/v1.0', { pageBearerGraphRead: true, pageBearerGraphApp: 'outlook' });
  check(outlookGraphBad.sameOrigin === false && outlookGraphBad.separate === true
    && typeof outlookGraphBad.reason === 'string'
    && outlookGraphBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the Outlook page-bearer Graph accommodation rejects non-Outlook head origins');
  const onenoteGraph = gate.classifyOriginPattern('https://onenote.cloud.microsoft', 'https://graph.microsoft.com/v1.0', { pageBearerGraphRead: true, pageBearerGraphApp: 'onenote' });
  check(onenoteGraph.sameOrigin === true && onenoteGraph.separate === false
    && typeof onenoteGraph.reason === 'string'
    && onenoteGraph.reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0,
    '(b) onenote.cloud.microsoft vs graph.microsoft.com Graph GETs -> sameOrigin:true through the explicit page-bearer Graph read accommodation');
  const onenoteGraphBad = gate.classifyOriginPattern('https://notes.example.com', 'https://graph.microsoft.com/v1.0', { pageBearerGraphRead: true, pageBearerGraphApp: 'onenote' });
  check(onenoteGraphBad.sameOrigin === false && onenoteGraphBad.separate === true
    && typeof onenoteGraphBad.reason === 'string'
    && onenoteGraphBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the OneNote page-bearer Graph accommodation rejects non-OneNote head origins');
  const spotifyPageBearer = gate.classifyOriginPattern('https://open.spotify.com', 'https://api.spotify.com/v1', { pageBearerRead: true });
  check(spotifyPageBearer.sameOrigin === true && spotifyPageBearer.separate === false
    && typeof spotifyPageBearer.reason === 'string'
    && spotifyPageBearer.reason.indexOf('SAME_REGISTRABLE_DOMAIN_PAGE_BEARER_READ') === 0,
    '(b) open.spotify.com vs api.spotify.com page-bearer API -> sameOrigin:true through the explicit page-bearer read accommodation');
  const spotifyPageBearerBad = gate.classifyOriginPattern('https://open.spotify.com', 'https://evil.example.com', { pageBearerRead: true });
  check(spotifyPageBearerBad.sameOrigin === false && spotifyPageBearerBad.separate === true
    && typeof spotifyPageBearerBad.reason === 'string'
    && spotifyPageBearerBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the Spotify page-bearer read accommodation still rejects bases outside the spotify.com registrable family');
  const supabasePageBearer = gate.classifyOriginPattern('https://supabase.com', 'https://api.supabase.com/v1', { pageBearerRead: true });
  check(supabasePageBearer.sameOrigin === true && supabasePageBearer.separate === false
    && typeof supabasePageBearer.reason === 'string'
    && supabasePageBearer.reason.indexOf('SAME_REGISTRABLE_DOMAIN_PAGE_BEARER_READ') === 0,
    '(b) supabase.com vs api.supabase.com page-bearer Management API -> sameOrigin:true through the explicit page-bearer read accommodation');
  const supabasePageBearerBad = gate.classifyOriginPattern('https://supabase.com', 'https://evil.example.com', { pageBearerRead: true });
  check(supabasePageBearerBad.sameOrigin === false && supabasePageBearerBad.separate === true
    && typeof supabasePageBearerBad.reason === 'string'
    && supabasePageBearerBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the Supabase page-bearer read accommodation still rejects bases outside the supabase.com registrable family');
  const twitchPageBearer = gate.classifyOriginPattern('https://www.twitch.tv', 'https://gql.twitch.tv', { pageBearerRead: true });
  check(twitchPageBearer.sameOrigin === true && twitchPageBearer.separate === false
    && typeof twitchPageBearer.reason === 'string'
    && twitchPageBearer.reason.indexOf('SAME_REGISTRABLE_DOMAIN_PAGE_BEARER_READ') === 0,
    '(b) www.twitch.tv vs gql.twitch.tv page-bearer GraphQL -> sameOrigin:true through the explicit page-bearer read accommodation');

  const sheetsSession = gate.classifyOriginPattern(
    'https://docs.google.com',
    'https://sheets.googleapis.com/v4',
    { pageGapiUiSheetsSession: true }
  );
  check(sheetsSession.sameOrigin === true && sheetsSession.separate === false
    && typeof sheetsSession.reason === 'string'
    && sheetsSession.reason.indexOf('PAGE_GAPI_UI_SHEETS_SESSION') === 0,
    '(b) docs.google.com -> exact sheets.googleapis.com/v4 passes only through the explicit page-gapi/UI Sheets session accommodation');
  const sheetsWrongHead = gate.classifyOriginPattern(
    'https://drive.google.com',
    'https://sheets.googleapis.com/v4',
    { pageGapiUiSheetsSession: true }
  );
  check(sheetsWrongHead.sameOrigin === false && sheetsWrongHead.separate === true
    && String(sheetsWrongHead.reason || '').indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the page-gapi/UI Sheets accommodation rejects a non-docs.google.com head origin');
  const sheetsWrongApi = gate.classifyOriginPattern(
    'https://docs.google.com',
    'https://content.googleapis.com/v4',
    { pageGapiUiSheetsSession: true }
  );
  check(sheetsWrongApi.sameOrigin === false && sheetsWrongApi.separate === true
    && String(sheetsWrongApi.reason || '').indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the page-gapi/UI Sheets accommodation rejects a non-sheets.googleapis.com API origin');
  const sheetsBroaderPath = gate.classifyOriginPattern(
    'https://docs.google.com',
    'https://sheets.googleapis.com/v5',
    { pageGapiUiSheetsSession: true }
  );
  check(sheetsBroaderPath.sameOrigin === false && sheetsBroaderPath.separate === true
    && String(sheetsBroaderPath.reason || '').indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(b) the page-gapi/UI Sheets accommodation rejects a broader path on the otherwise-correct API origin');

  const liveSheetsSources = gate.verifyPageGapiUiSheetsSessionSources();
  check(liveSheetsSources && liveSheetsSources.ok === true
    && Array.isArray(liveSheetsSources.failures) && liveSheetsSources.failures.length === 0,
    '(b) the live Sheets manifest/session/action/handler/descriptors satisfy the exact source-verified no-auth session contract');
  const sheetsSessionSource = fs.readFileSync(
    path.join(ROOT, 'extension', 'utils', 'google-sheets-session.js'),
    'utf8'
  );
  const broadenedSheetsSources = gate.verifyPageGapiUiSheetsSessionSources({
    sessionText: sheetsSessionSource + '\nfetch(request.url);'
  });
  check(broadenedSheetsSources && broadenedSheetsSources.ok === false
    && broadenedSheetsSources.failures.includes('SHEETS_GAPI_REQUEST_NOT_FIXED')
    && broadenedSheetsSources.failures.includes('FORBIDDEN_SHEETS_CREDENTIAL_OR_NETWORK_SOURCE'),
    '(b) negative control: adding caller-selected fetch(request.url) fails both the fixed-gapi and forbidden-network source checks');
  const sheetsContentSource = fs.readFileSync(
    path.join(ROOT, 'extension', 'content', 'actions.js'),
    'utf8'
  );
  const broadenedContentSources = gate.verifyPageGapiUiSheetsSessionSources({
    contentActionsText: sheetsContentSource.replace(
      'sheetsSession: async (params = {}) => {',
      'sheetsSession: async (params = {}) => { fetch(params.url);'
    )
  });
  check(broadenedContentSources && broadenedContentSources.ok === false
    && broadenedContentSources.failures.includes('FORBIDDEN_SHEETS_CREDENTIAL_OR_NETWORK_SOURCE'),
    '(b) negative control: a caller-selected content-action fetch fails the fixed Sheets UI source contract');

  // (b) REAL end-to-end: checkOriginClassification() over the LIVE catalog + vendored
  // slack-api.ts -- proves the real heads all pass and slack rides the dynamic
  // accommodation against the genuinely-extracted vendored dynamic form (not a stub).
  const real = gate.checkOriginClassification();
  check(real && Array.isArray(real.failures) && real.failures.length === 0,
    '(b) the REAL heads over the live catalog + vendored source yield 0 failures ['
      + (real && real.failures && real.failures.length ? real.failures.join(' | ') : 'all same-origin') + ']');
  const realSlack = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerSlack') : null;
  check(!!realSlack && realSlack.classification.sameOrigin === true
    && typeof realSlack.classification.reason === 'string'
    && realSlack.classification.reason.indexOf('SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE') === 0,
    '(b) the REAL slack head classifies via the dynamic-workspace accommodation (grounded in the vendored slack-api.ts), not a fallback rubber-stamp');
  const realGitlab = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerGitlab') : null;
  check(!!realGitlab && realGitlab.apiBaseUrl === 'https://gitlab.com/api/v4',
    '(b) the REAL gitlab head is verified against its genuinely-extracted vendored base gitlab.com/api/v4');
  const realNotion = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerNotion') : null;
  check(!!realNotion && realNotion.apiBaseUrl === 'https://app.notion.com/api/v3'
    && realNotion.classification && realNotion.classification.sameOrigin === true,
    '(b) the REAL notion head uses the explicit observed runtime override app.notion.com/api/v3 and still classifies same-origin');
  const realNetlify = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerNetlify') : null;
  check(!!realNetlify && realNetlify.apiBaseUrl === 'https://app.netlify.com/access-control/bb-api/api/v1'
    && realNetlify.classification && realNetlify.classification.sameOrigin === true,
    '(b) the REAL netlify head joins the relative vendored base to app.netlify.com and classifies same-origin');
  const realBitbucket = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerBitbucket') : null;
  check(!!realBitbucket && realBitbucket.apiBaseUrl === 'https://bitbucket.org/!api/2.0'
    && realBitbucket.classification && realBitbucket.classification.sameOrigin === true,
    '(b) the REAL bitbucket head joins the relative vendored base to bitbucket.org and classifies same-origin');
  const realCircleci = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerCircleci') : null;
  check(!!realCircleci && realCircleci.apiBaseUrl === 'https://app.circleci.com/api/v2'
    && realCircleci.classification && realCircleci.classification.sameOrigin === true,
    '(b) the REAL circleci head joins the relative vendored base to app.circleci.com and classifies same-origin');
  const realVercel = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerVercel') : null;
  check(!!realVercel && realVercel.apiBaseUrl === 'https://vercel.com/api'
    && realVercel.classification && realVercel.classification.sameOrigin === true,
    '(b) the REAL vercel head joins the inline /api${endpoint} vendored base to vercel.com and classifies same-origin');
  const realRetool = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerRetool') : null;
  check(!!realRetool && realRetool.apiBaseUrl === 'https://retool.com/api'
    && realRetool.classification && realRetool.classification.sameOrigin === true,
    '(b) the REAL retool head uses the Retool-only relative /api runtime override and classifies same-origin');
  const realAsana = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerAsana') : null;
  check(!!realAsana && realAsana.apiBaseUrl === 'https://app.asana.com/api/1.0'
    && realAsana.classification && realAsana.classification.sameOrigin === true,
    '(b) the REAL asana head is verified against vendored app.asana.com/api/1.0 and classifies same-origin');
  const realShortcut = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerShortcut') : null;
  check(!!realShortcut && realShortcut.apiBaseUrl === 'https://app.shortcut.com/backend/api/v3'
    && realShortcut.classification && realShortcut.classification.sameOrigin === true,
    '(b) the REAL shortcut head uses the Shortcut-only relative /backend/api/v3 tenant-header runtime override and classifies same-origin');
  const realLeetcode = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerLeetcode') : null;
  check(!!realLeetcode && realLeetcode.apiBaseUrl === 'https://leetcode.com'
    && realLeetcode.classification && realLeetcode.classification.sameOrigin === true,
    '(b) the REAL leetcode head is verified against its vendored first-party GraphQL origin');
  const realWikipedia = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerWikipedia') : null;
  check(!!realWikipedia && realWikipedia.apiBaseUrl === 'https://en.wikipedia.org/w/api.php'
    && realWikipedia.classification && realWikipedia.classification.sameOrigin === true,
    '(b) the REAL wikipedia head joins the relative vendored /w/api.php base to en.wikipedia.org and classifies same-origin');
  const realHackernews = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerHackernews') : null;
  check(!!realHackernews && realHackernews.apiBaseUrl === 'https://news.ycombinator.com/'
    && realHackernews.classification && realHackernews.classification.sameOrigin === true,
    '(b) the REAL hackernews head uses the Hacker News-only relative HTML read proof and classifies same-origin');
  const realReddit = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerReddit') : null;
  check(!!realReddit && realReddit.apiBaseUrl === 'https://www.reddit.com/'
    && realReddit.classification && realReddit.classification.sameOrigin === true,
    '(b) the REAL reddit head uses the Reddit-only same-origin .json GET proof and classifies same-origin');
  const realNpm = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerNpm') : null;
  check(!!realNpm && realNpm.apiBaseUrl === 'https://www.npmjs.com/'
    && realNpm.classification && realNpm.classification.sameOrigin === true,
    '(b) the REAL npm head uses the npm-only public Spiferack page-read proof and classifies same-origin');
  const realYelp = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerYelp') : null;
  check(!!realYelp && realYelp.apiBaseUrl === 'https://www.yelp.com/'
    && realYelp.classification && realYelp.classification.sameOrigin === true,
    '(b) the REAL Yelp head uses the Yelp-only public relative page/autocomplete read proof and classifies same-origin');
  const realTripadvisor = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerTripadvisor') : null;
  check(!!realTripadvisor && realTripadvisor.apiBaseUrl === 'https://www.tripadvisor.com/'
    && realTripadvisor.classification && realTripadvisor.classification.sameOrigin === true,
    '(b) the REAL TripAdvisor head uses the TripAdvisor-only public relative SSR/GraphQL read proof and classifies same-origin');
  const realZillow = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerZillow') : null;
  check(!!realZillow && realZillow.apiBaseUrl === 'https://www.zillow.com'
    && realZillow.classification && realZillow.classification.sameOrigin === true,
    '(b) the REAL Zillow head is verified against the vendored www.zillow.com search-state base and classifies same-origin');
  const realRedfin = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerRedfin') : null;
  check(!!realRedfin && realRedfin.apiBaseUrl === 'https://www.redfin.com/'
    && realRedfin.classification && realRedfin.classification.sameOrigin === true,
    '(b) the REAL Redfin head uses the Redfin-only relative Stingray proof and classifies same-origin');
  const realBsky = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerBsky') : null;
  check(!!realBsky && realBsky.apiBaseUrl === 'https://api.bsky.app/xrpc'
    && realBsky.classification && realBsky.classification.sameOrigin === true
    && typeof realBsky.classification.reason === 'string'
    && realBsky.classification.reason.indexOf('PUBLIC_CORS_READ_NO_AUTH') === 0,
    '(b) the REAL Bluesky head uses the explicit public AppView no-auth read accommodation');
  const realCloudflare = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerCloudflare') : null;
  check(!!realCloudflare && realCloudflare.apiBaseUrl === 'https://dash.cloudflare.com/api/v4'
    && realCloudflare.classification && realCloudflare.classification.sameOrigin === true,
    '(b) the REAL Cloudflare head joins the vendored /api/v4 dashboard base to dash.cloudflare.com and classifies same-origin');
  const realTerraform = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerTerraform') : null;
  check(!!realTerraform && realTerraform.apiBaseUrl === 'https://app.terraform.io/api/v2'
    && realTerraform.classification && realTerraform.classification.sameOrigin === true,
    '(b) the REAL Terraform Cloud head joins the vendored /api/v2 base to app.terraform.io and classifies same-origin');
  const realX = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerX') : null;
  check(!!realX && realX.apiBaseUrl === 'https://x.com/'
    && realX.classification && realX.classification.sameOrigin === true,
    '(b) the REAL X head uses the X-only public relative page-read proof and classifies same-origin');
  const realInstagram = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerInstagram') : null;
  check(!!realInstagram && realInstagram.apiBaseUrl === 'https://www.instagram.com/'
    && realInstagram.classification && realInstagram.classification.sameOrigin === true,
    '(b) the REAL Instagram head uses the Instagram-only public page/search proof and classifies same-origin');
  const realTiktok = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerTiktok') : null;
  check(!!realTiktok && realTiktok.apiBaseUrl === 'https://www.tiktok.com/'
    && realTiktok.classification && realTiktok.classification.sameOrigin === true,
    '(b) the REAL TikTok head uses the TikTok-only public SSR proof and classifies same-origin');
  const realFacebook = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerFacebook') : null;
  check(!!realFacebook && realFacebook.apiBaseUrl === 'https://www.facebook.com/'
    && realFacebook.classification && realFacebook.classification.sameOrigin === true,
    '(b) the REAL Facebook head uses the Facebook-only conservative HTML proof and classifies same-origin');
  const realStackoverflow = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerStackoverflow') : null;
  check(!!realStackoverflow && realStackoverflow.apiBaseUrl === 'https://stackoverflow.com/'
    && realStackoverflow.classification && realStackoverflow.classification.sameOrigin === true,
    '(b) the REAL Stack Overflow head uses the Stack Overflow-only public relative page-read proof and classifies same-origin');
  const realTwilio = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerTwilio') : null;
  check(!!realTwilio && realTwilio.apiBaseUrl === 'https://www.twilio.com'
    && realTwilio.classification && realTwilio.classification.sameOrigin === true,
    '(b) the REAL Twilio head uses the first-party dashboard project-info base and classifies same-origin');
  const realTumblr = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerTumblr') : null;
  check(!!realTumblr && realTumblr.apiBaseUrl === 'https://www.tumblr.com/api/v2'
    && realTumblr.classification && realTumblr.classification.sameOrigin === true,
    '(b) the REAL Tumblr head joins the vendored /api/v2 web base to www.tumblr.com and classifies same-origin');
  const realPriceline = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerPriceline') : null;
  check(!!realPriceline && realPriceline.apiBaseUrl === 'https://www.priceline.com'
    && realPriceline.classification && realPriceline.classification.sameOrigin === true,
    '(b) the REAL Priceline head verifies against the vendored www.priceline.com first-party base and classifies same-origin');
  const realExpedia = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerExpedia') : null;
  check(!!realExpedia && realExpedia.apiBaseUrl === 'https://www.expedia.com/'
    && realExpedia.classification && realExpedia.classification.sameOrigin === true,
    '(b) the REAL Expedia head uses the Expedia-only public search-page proof and classifies same-origin');
  const realBooking = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerBooking') : null;
  check(!!realBooking && realBooking.apiBaseUrl === 'https://www.booking.com/'
    && realBooking.classification && realBooking.classification.sameOrigin === true,
    '(b) the REAL Booking head uses the Booking-only public search/property page proof and classifies same-origin');
  const realKayak = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerKayak') : null;
  check(!!realKayak && realKayak.apiBaseUrl === 'https://www.kayak.com/v1'
    && realKayak.classification && realKayak.classification.sameOrigin === true,
    '(b) the REAL Kayak head uses the Kayak-only metadata /v1 proof and classifies same-origin');
  const realMongodb = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerMongodb') : null;
  check(!!realMongodb && realMongodb.apiBaseUrl === 'https://cloud.mongodb.com'
    && realMongodb.classification && realMongodb.classification.sameOrigin === true,
    '(b) the REAL MongoDB Atlas head verifies against the vendored cloud.mongodb.com first-party base and classifies same-origin');
  const realCockroachdb = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerCockroachdb') : null;
  check(!!realCockroachdb && realCockroachdb.apiBaseUrl === 'https://cockroachlabs.cloud'
    && realCockroachdb.classification && realCockroachdb.classification.sameOrigin === true,
    '(b) the REAL CockroachDB Cloud head verifies against the vendored cockroachlabs.cloud first-party base and classifies same-origin');
  const realPinterest = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerPinterest') : null;
  check(!!realPinterest && realPinterest.apiBaseUrl === 'https://www.pinterest.com/resource'
    && realPinterest.classification && realPinterest.classification.sameOrigin === true,
    '(b) the REAL Pinterest head joins the reviewed /resource runtime base to www.pinterest.com and classifies same-origin');
  const realStarbucks = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerStarbucks') : null;
  check(!!realStarbucks && realStarbucks.apiBaseUrl === 'https://www.starbucks.com/apiproxy/v1'
    && realStarbucks.classification && realStarbucks.classification.sameOrigin === true,
    '(b) the REAL Starbucks head joins the relative /apiproxy/v1 runtime base to www.starbucks.com and classifies same-origin');
  const realMedium = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerMedium') : null;
  check(!!realMedium && realMedium.apiBaseUrl === 'https://medium.com/_/graphql'
    && realMedium.classification && realMedium.classification.sameOrigin === true,
    '(b) the REAL Medium head joins the reviewed /_/graphql runtime base to medium.com and classifies same-origin');
  const realDominos = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerDominos') : null;
  check(!!realDominos && realDominos.apiBaseUrl === 'https://www.dominos.com/api/web-bff/graphql'
    && realDominos.classification && realDominos.classification.sameOrigin === true,
    "(b) the REAL Domino's head joins the reviewed /api/web-bff/graphql runtime base to www.dominos.com and classifies same-origin");
  const realWhatsapp = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerWhatsapp') : null;
  check(!!realWhatsapp && realWhatsapp.apiBaseUrl === 'https://web.whatsapp.com'
    && realWhatsapp.classification && realWhatsapp.classification.sameOrigin === true,
    '(b) the REAL WhatsApp page-state head classifies against web.whatsapp.com without inventing a REST API base');
  const realAmplitude = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerAmplitude') : null;
  check(!!realAmplitude && realAmplitude.apiBaseUrl === 'https://app.amplitude.com/t/graphql/org'
    && realAmplitude.classification && realAmplitude.classification.sameOrigin === true,
    '(b) the REAL Amplitude head joins the reviewed /t/graphql/org runtime base to app.amplitude.com and classifies same-origin');
  const realNewrelic = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerNewrelic') : null;
  check(!!realNewrelic && realNewrelic.apiBaseUrl === 'https://one.newrelic.com/graphql'
    && realNewrelic.classification && realNewrelic.classification.sameOrigin === true,
    '(b) the REAL New Relic head joins the reviewed /graphql runtime base to one.newrelic.com and classifies same-origin');
  const realDatadog = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerDatadog') : null;
  check(!!realDatadog && realDatadog.apiBaseUrl === 'https://app.datadoghq.com/api'
    && realDatadog.classification && realDatadog.classification.sameOrigin === true,
    '(b) the REAL Datadog head joins the reviewed /api runtime base to app.datadoghq.com and classifies same-origin');
  const realChipotle = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerChipotle') : null;
  check(!!realChipotle && realChipotle.apiBaseUrl === 'https://services.chipotle.com'
    && realChipotle.classification && realChipotle.classification.sameOrigin === true
    && typeof realChipotle.classification.reason === 'string'
    && realChipotle.classification.reason.indexOf('PUBLIC_CORS_READ_NO_AUTH') === 0,
    '(b) the REAL Chipotle head uses the explicit no-auth public services read accommodation');
  const realPandaexpress = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerPandaexpress') : null;
  check(!!realPandaexpress && realPandaexpress.apiBaseUrl === 'https://www.pandaexpress.com/'
    && realPandaexpress.classification && realPandaexpress.classification.sameOrigin === true,
    '(b) the REAL Panda Express head joins the reviewed public Olo runtime base to www.pandaexpress.com and classifies same-origin');
  const realCostco = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerCostco') : null;
  check(!!realCostco && realCostco.apiBaseUrl === 'https://ecom-api.costco.com'
    && realCostco.classification && realCostco.classification.sameOrigin === true
    && typeof realCostco.classification.reason === 'string'
    && realCostco.classification.reason.indexOf('PUBLIC_CORS_READ_NO_AUTH') === 0,
    '(b) the REAL Costco head uses the explicit no-auth public ecom read accommodation');
  const realInstacart = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerInstacart') : null;
  check(!!realInstacart && realInstacart.apiBaseUrl === 'https://www.instacart.com/graphql'
    && realInstacart.classification && realInstacart.classification.sameOrigin === true,
    '(b) the REAL Instacart head joins the reviewed /graphql runtime base to www.instacart.com and classifies same-origin');
  const realLucid = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerLucid') : null;
  check(!!realLucid && realLucid.apiBaseUrl === 'https://users.lucid.app'
    && realLucid.classification && realLucid.classification.sameOrigin === true
    && typeof realLucid.classification.reason === 'string'
    && realLucid.classification.reason.indexOf('SAME_REGISTRABLE_DOMAIN_FIRST_PARTY_AUTH_READ') === 0,
    '(b) the REAL Lucid head uses the explicit first-party authenticated read accommodation');
  const realTarget = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerTarget') : null;
  check(!!realTarget && realTarget.apiBaseUrl === 'https://www.target.com/'
    && realTarget.classification && realTarget.classification.sameOrigin === true,
    '(b) the REAL Target head joins the reviewed public HTML runtime base to www.target.com and classifies same-origin');
  const realWalmart = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerWalmart') : null;
  check(!!realWalmart && realWalmart.apiBaseUrl === 'https://www.walmart.com/'
    && realWalmart.classification && realWalmart.classification.sameOrigin === true,
    '(b) the REAL Walmart head joins the reviewed public HTML runtime base to www.walmart.com and classifies same-origin');
  const realAirbnb = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerAirbnb') : null;
  check(!!realAirbnb && realAirbnb.apiBaseUrl === 'https://www.airbnb.com'
    && realAirbnb.classification && realAirbnb.classification.sameOrigin === true,
    '(b) the REAL Airbnb head targets the same www.airbnb.com origin');
  const realHack2hire = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerHack2hire') : null;
  check(!!realHack2hire && realHack2hire.apiBaseUrl === 'https://api.hack2hire.com/algro/v1'
    && realHack2hire.classification && realHack2hire.classification.sameOrigin === true
    && typeof realHack2hire.classification.reason === 'string'
    && realHack2hire.classification.reason.indexOf('SAME_REGISTRABLE_DOMAIN_STORAGE_BEARER_READ') === 0,
    '(b) the REAL Hack2Hire head uses the explicit storage-bearer read accommodation grounded in vendored localStorage auth');
  const realClickhouse = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerClickhouse') : null;
  check(!!realClickhouse && realClickhouse.apiBaseUrl === 'https://control-plane-internal.clickhouse.cloud'
    && realClickhouse.classification && realClickhouse.classification.sameOrigin === true
    && typeof realClickhouse.classification.reason === 'string'
    && realClickhouse.classification.reason.indexOf('SAME_REGISTRABLE_DOMAIN_STORAGE_BEARER_READ') === 0,
    '(b) the REAL ClickHouse head uses the explicit storage-bearer read accommodation grounded in vendored Auth0 control-plane auth');
  const realChatgpt = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerChatgpt') : null;
  check(!!realChatgpt && realChatgpt.apiBaseUrl === 'https://chatgpt.com'
    && realChatgpt.classification && realChatgpt.classification.sameOrigin === true,
    '(b) the REAL ChatGPT head classifies the reviewed backend-api path as same-origin on chatgpt.com');
  const realClaude = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerClaude') : null;
  check(!!realClaude && realClaude.apiBaseUrl === 'https://claude.ai/api'
    && realClaude.classification && realClaude.classification.sameOrigin === true,
    '(b) the REAL Claude head classifies the reviewed /api path as same-origin on claude.ai');
  const realGemini = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerGemini') : null;
  check(!!realGemini && realGemini.apiBaseUrl === 'https://gemini.google.com'
    && realGemini.classification && realGemini.classification.sameOrigin === true,
    '(b) the REAL Gemini head classifies the reviewed UI/RPC path as same-origin on gemini.google.com');
  const realGsheets = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerGsheets') : null;
  check(realGsheets && realGsheets.apiBaseUrl === 'https://sheets.googleapis.com/v4' &&
      realGsheets.classification && realGsheets.classification.sameOrigin === true &&
      String(realGsheets.classification.reason || '').startsWith('PAGE_GAPI_UI_SHEETS_SESSION'),
    '(b) the REAL Google Sheets head uses the exact source-verified signed-in page-gapi/UI session accommodation');
  const realPowerpoint = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerPowerpoint') : null;
  check(!!realPowerpoint && realPowerpoint.apiBaseUrl === 'https://graph.microsoft.com/v1.0'
    && realPowerpoint.classification && realPowerpoint.classification.sameOrigin === true
    && typeof realPowerpoint.classification.reason === 'string'
    && realPowerpoint.classification.reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0,
    '(b) the REAL PowerPoint head uses the explicit page-bearer Microsoft Graph read accommodation');
  const realOutlook = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerOutlook') : null;
  check(!!realOutlook && realOutlook.apiBaseUrl === 'https://graph.microsoft.com/v1.0'
    && realOutlook.classification && realOutlook.classification.sameOrigin === true
    && typeof realOutlook.classification.reason === 'string'
    && realOutlook.classification.reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0,
    '(b) the REAL Outlook head uses the explicit page-bearer Microsoft Graph read accommodation');
  const realExcel = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerExcel') : null;
  check(!!realExcel && realExcel.apiBaseUrl === 'https://graph.microsoft.com/v1.0'
    && realExcel.classification && realExcel.classification.sameOrigin === true
    && typeof realExcel.classification.reason === 'string'
    && realExcel.classification.reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0,
    '(b) the REAL Excel head uses the explicit page-bearer Microsoft Graph read accommodation');
  const realMsword = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerMsword') : null;
  check(!!realMsword && realMsword.apiBaseUrl === 'https://graph.microsoft.com/v1.0'
    && realMsword.classification && realMsword.classification.sameOrigin === true
    && typeof realMsword.classification.reason === 'string'
    && realMsword.classification.reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0,
    '(b) the REAL Microsoft Word head uses the explicit page-bearer Microsoft Graph read accommodation');
  const realCalendly = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerCalendly') : null;
  check(!!realCalendly && realCalendly.apiBaseUrl === 'https://calendly.com/api'
    && realCalendly.classification && realCalendly.classification.sameOrigin === true,
    '(b) the REAL Calendly head joins the reviewed /api runtime base to calendly.com and classifies same-origin');
  const realAirtable = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerAirtable') : null;
  check(!!realAirtable && realAirtable.apiBaseUrl === 'https://airtable.com/v0.3'
    && realAirtable.classification && realAirtable.classification.sameOrigin === true,
    '(b) the REAL Airtable head joins the reviewed /v0.3 runtime base to airtable.com and classifies same-origin');
  const realSpotify = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerSpotify') : null;
  check(!!realSpotify && realSpotify.apiBaseUrl === 'https://api.spotify.com/v1'
    && realSpotify.classification && realSpotify.classification.sameOrigin === true
    && typeof realSpotify.classification.reason === 'string'
    && realSpotify.classification.reason.indexOf('SAME_REGISTRABLE_DOMAIN_PAGE_BEARER_READ') === 0,
    '(b) the REAL Spotify head uses the explicit page-bearer api.spotify.com read accommodation');
  const realSupabase = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerSupabase') : null;
  check(!!realSupabase && realSupabase.apiBaseUrl === 'https://api.supabase.com/v1'
    && realSupabase.classification && realSupabase.classification.sameOrigin === true
    && typeof realSupabase.classification.reason === 'string'
    && realSupabase.classification.reason.indexOf('SAME_REGISTRABLE_DOMAIN_PAGE_BEARER_READ') === 0,
    '(b) the REAL Supabase head uses the explicit page-bearer api.supabase.com read accommodation');
  const realSteam = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerSteam') : null;
  check(!!realSteam && realSteam.apiBaseUrl === 'https://store.steampowered.com'
    && realSteam.classification && realSteam.classification.sameOrigin === true,
    '(b) the REAL Steam head uses the strict same-origin store.steampowered.com runtime base');
  const realTwitch = real && real.results ? real.results.find((r) => r.global === 'FsbHandlerTwitch') : null;
  check(!!realTwitch && realTwitch.apiBaseUrl === 'https://gql.twitch.tv'
    && realTwitch.classification && realTwitch.classification.sameOrigin === true
    && typeof realTwitch.classification.reason === 'string'
    && realTwitch.classification.reason.indexOf('SAME_REGISTRABLE_DOMAIN_PAGE_BEARER_READ') === 0,
    '(b) the REAL Twitch head uses the explicit page-bearer gql.twitch.tv read accommodation');

  const badRetoolOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerRetoolBad', origin: 'https://retool.com' }],
    {
      appMap: {
        FsbHandlerRetoolBad: {
          app: 'retool',
          fallbackBaseUrl: 'https://retool.com',
          relativeRuntimeBaseUrl: '/not-api'
        }
      }
    }
  );
  check(badRetoolOverride && badRetoolOverride.failures.length === 1
    && badRetoolOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Retool relative-runtime override fails closed instead of broadening the CORS gate');

  const badShortcutOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerShortcutBad', origin: 'https://app.shortcut.com' }],
    {
      appMap: {
        FsbHandlerShortcutBad: {
          app: 'shortcut',
          fallbackBaseUrl: 'https://app.shortcut.com',
          relativeRuntimeBaseUrl: '/backend/api/v4'
        }
      }
    }
  );
  check(badShortcutOverride && badShortcutOverride.failures.length === 1
    && badShortcutOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Shortcut relative-runtime override fails closed instead of broadening the CORS gate');

  const badHackernewsOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerHackernewsBad', origin: 'https://news.ycombinator.com' }],
    {
      appMap: {
        FsbHandlerHackernewsBad: {
          app: 'hackernews',
          fallbackBaseUrl: 'https://news.ycombinator.com',
          relativeRuntimeBaseUrl: '/api'
        }
      }
    }
  );
  check(badHackernewsOverride && badHackernewsOverride.failures.length === 1
    && badHackernewsOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Hacker News relative HTML override fails closed instead of broadening the CORS gate');

  const badRedditOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerRedditBad', origin: 'https://www.reddit.com' }],
    {
      appMap: {
        FsbHandlerRedditBad: {
          app: 'reddit',
          fallbackBaseUrl: 'https://www.reddit.com',
          relativeRuntimeBaseUrl: '/api',
          ignoreVendoredBaseUrl: true
        }
      }
    }
  );
  check(badRedditOverride && badRedditOverride.failures.length === 1
    && badRedditOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Reddit relative .json GET override fails closed instead of broadening the CORS gate');

  const badNpmOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerNpmBad', origin: 'https://www.npmjs.com' }],
    {
      appMap: {
        FsbHandlerNpmBad: {
          app: 'npm',
          fallbackBaseUrl: 'https://www.npmjs.com',
          relativeRuntimeBaseUrl: '/api'
        }
      }
    }
  );
  check(badNpmOverride && badNpmOverride.failures.length === 1
    && badNpmOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed npm Spiferack relative page-read override fails closed instead of broadening the CORS gate');

  const badYelpOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerYelpBad', origin: 'https://www.yelp.com' }],
    {
      appMap: {
        FsbHandlerYelpBad: {
          app: 'yelp',
          fallbackBaseUrl: 'https://www.yelp.com',
          relativeRuntimeBaseUrl: '/api'
        }
      }
    }
  );
  check(badYelpOverride && badYelpOverride.failures.length === 1
    && badYelpOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Yelp relative page/autocomplete override fails closed instead of broadening the CORS gate');

  const badTripadvisorOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerTripadvisorBad', origin: 'https://www.tripadvisor.com' }],
    {
      appMap: {
        FsbHandlerTripadvisorBad: {
          app: 'tripadvisor',
          fallbackBaseUrl: 'https://www.tripadvisor.com',
          relativeRuntimeBaseUrl: '/api'
        }
      }
    }
  );
  check(badTripadvisorOverride && badTripadvisorOverride.failures.length === 1
    && badTripadvisorOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed TripAdvisor relative SSR/GraphQL override fails closed instead of broadening the CORS gate');

  const badRedfinOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerRedfinBad', origin: 'https://www.redfin.com' }],
    {
      appMap: {
        FsbHandlerRedfinBad: {
          app: 'redfin',
          fallbackBaseUrl: 'https://www.redfin.com',
          relativeRuntimeBaseUrl: '/api'
        }
      }
    }
  );
  check(badRedfinOverride && badRedfinOverride.failures.length === 1
    && badRedfinOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Redfin relative Stingray override fails closed instead of broadening the CORS gate');

  const badNotionOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerNotionBad', origin: 'https://app.notion.com' }],
    {
      appMap: {
        FsbHandlerNotionBad: {
          app: 'notion',
          fallbackBaseUrl: 'https://app.notion.com',
          observedRuntimeBaseUrl: 'https://app.notion.com/api/v3',
          expectedStaleVendoredBaseUrl: 'https://wrong.notion.so/api/v3'
        }
      }
    }
  );
  check(badNotionOverride && badNotionOverride.failures.length === 1
    && badNotionOverride.failures[0].indexOf('CORS_OBSERVED_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Notion observed-runtime override fails closed instead of broadening the CORS gate');

  const badBskyOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerBskyBad', origin: 'https://bsky.app' }],
    {
      appMap: {
        FsbHandlerBskyBad: {
          app: 'bluesky',
          fallbackBaseUrl: 'https://bsky.app',
          publicAppViewBaseUrl: 'https://evil.example.com/xrpc'
        }
      }
    }
  );
  check(badBskyOverride && badBskyOverride.failures.length === 1
    && badBskyOverride.failures[0].indexOf('CORS_PUBLIC_APPVIEW_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Bluesky public AppView override fails closed instead of broadening the CORS gate');

  const badChipotleOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerChipotleBad', origin: 'https://www.chipotle.com' }],
    {
      appMap: {
        FsbHandlerChipotleBad: {
          app: 'chipotle',
          fallbackBaseUrl: 'https://www.chipotle.com',
          publicCorsReadBaseUrl: 'https://evil.example.com'
        }
      }
    }
  );
  check(badChipotleOverride && badChipotleOverride.failures.length === 1
    && badChipotleOverride.failures[0].indexOf('CORS_PUBLIC_READ_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Chipotle public-services override fails closed instead of broadening the CORS gate');

  const badPandaOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerPandaexpressBad', origin: 'https://www.pandaexpress.com' }],
    {
      appMap: {
        FsbHandlerPandaexpressBad: {
          app: 'panda-express',
          fallbackBaseUrl: 'https://www.pandaexpress.com',
          relativeRuntimeBaseUrl: '/evil'
        }
      }
    }
  );
  check(badPandaOverride && badPandaOverride.failures.length === 1
    && badPandaOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Panda Express relative Olo override fails closed instead of broadening the relative runtime gate');

  const badCostcoOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerCostcoBad', origin: 'https://www.costco.com' }],
    {
      appMap: {
        FsbHandlerCostcoBad: {
          app: 'costco',
          fallbackBaseUrl: 'https://www.costco.com',
          publicCorsReadBaseUrl: 'https://evil.example.com'
        }
      }
    }
  );
  check(badCostcoOverride && badCostcoOverride.failures.length === 1
    && badCostcoOverride.failures[0].indexOf('CORS_PUBLIC_READ_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Costco public-ecom override fails closed instead of broadening the CORS gate');

  const badInstacartOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerInstacartBad', origin: 'https://www.instacart.com' }],
    {
      appMap: {
        FsbHandlerInstacartBad: {
          app: 'instacart',
          fallbackBaseUrl: 'https://www.instacart.com',
          relativeRuntimeBaseUrl: '/api/graphql'
        }
      }
    }
  );
  check(badInstacartOverride && badInstacartOverride.failures.length === 1
    && badInstacartOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Instacart relative GraphQL override fails closed instead of broadening the CORS gate');

  const badTargetOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerTargetBad', origin: 'https://www.target.com' }],
    {
      appMap: {
        FsbHandlerTargetBad: {
          app: 'target',
          fallbackBaseUrl: 'https://www.target.com',
          relativeRuntimeBaseUrl: '/api',
          ignoreVendoredBaseUrl: true
        }
      }
    }
  );
  check(badTargetOverride && badTargetOverride.failures.length === 1
    && badTargetOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Target public page-read override fails closed instead of broadening the CORS gate');

  const badWalmartOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerWalmartBad', origin: 'https://www.walmart.com' }],
    {
      appMap: {
        FsbHandlerWalmartBad: {
          app: 'walmart',
          fallbackBaseUrl: 'https://www.walmart.com',
          relativeRuntimeBaseUrl: '/api',
          ignoreVendoredBaseUrl: true
        }
      }
    }
  );
  check(badWalmartOverride && badWalmartOverride.failures.length === 1
    && badWalmartOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Walmart public page-read override fails closed instead of broadening the CORS gate');

  const badStackoverflowOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerStackoverflowBad', origin: 'https://stackoverflow.com' }],
    {
      appMap: {
        FsbHandlerStackoverflowBad: {
          app: 'stackoverflow',
          fallbackBaseUrl: 'https://stackoverflow.com',
          relativeRuntimeBaseUrl: '/api',
          ignoreVendoredBaseUrl: true
        }
      }
    }
  );
  check(badStackoverflowOverride && badStackoverflowOverride.failures.length === 1
    && badStackoverflowOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Stack Overflow relative-runtime override fails closed instead of broadening the CORS gate');

  const badInstagramOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerInstagramBad', origin: 'https://www.instagram.com' }],
    {
      appMap: {
        FsbHandlerInstagramBad: {
          app: 'instagram-bad',
          fallbackBaseUrl: 'https://www.instagram.com',
          relativeRuntimeBaseUrl: '/api'
        }
      }
    }
  );
  check(badInstagramOverride && badInstagramOverride.failures.length === 1
    && badInstagramOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Instagram relative-runtime override fails closed instead of broadening the CORS gate');

  const badTiktokOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerTiktokBad', origin: 'https://www.tiktok.com' }],
    {
      appMap: {
        FsbHandlerTiktokBad: {
          app: 'tiktok-bad',
          fallbackBaseUrl: 'https://www.tiktok.com',
          relativeRuntimeBaseUrl: '/api'
        }
      }
    }
  );
  check(badTiktokOverride && badTiktokOverride.failures.length === 1
    && badTiktokOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed TikTok relative-runtime override fails closed instead of broadening the CORS gate');

  const badFacebookOverride = gate.checkOriginClassification(
    [{ global: 'FsbHandlerFacebookBad', origin: 'https://www.facebook.com' }],
    {
      appMap: {
        FsbHandlerFacebookBad: {
          app: 'facebook',
          fallbackBaseUrl: 'https://www.facebook.com',
          relativeRuntimeBaseUrl: '/api'
        }
      }
    }
  );
  check(badFacebookOverride && badFacebookOverride.failures.length === 1
    && badFacebookOverride.failures[0].indexOf('CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH') === 0,
    '(b) a malformed Facebook relative-runtime override fails closed instead of broadening the CORS gate');

  // ===== (c) separate-origin / wildcard FAIL rows ============================
  const linear = gate.classifyOriginPattern('https://linear.app', 'https://client-api.linear.app/graphql');
  check(linear.sameOrigin === false && linear.separate === true
    && typeof linear.reason === 'string' && linear.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(c) linear.app vs client-api.linear.app -> CORS_SEPARATE_ORIGIN (the demote-to-T3 the gate enforces)');
  const linearReviewed = gate.classifyOriginPattern(
    'https://linear.app',
    'https://client-api.linear.app/graphql',
    { firstPartyAuthRead: true }
  );
  check(linearReviewed.sameOrigin === true && linearReviewed.separate === false
    && typeof linearReviewed.reason === 'string'
    && linearReviewed.reason.indexOf('SAME_REGISTRABLE_DOMAIN_FIRST_PARTY_AUTH_READ') === 0,
    '(c) reviewed Linear first-party authenticated read accommodation passes explicitly');
  const linearReviewedBad = gate.classifyOriginPattern(
    'https://linear.app',
    'https://evil.example.com/graphql',
    { firstPartyAuthRead: true }
  );
  check(linearReviewedBad.sameOrigin === false && linearReviewedBad.separate === true
    && typeof linearReviewedBad.reason === 'string'
    && linearReviewedBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(c) Linear first-party authenticated read accommodation still rejects an outside registrable domain');
  const datadog = gate.classifyOriginPattern('https://app.datadoghq.com', 'https://api.datadoghq.com/api/v1');
  check(datadog.sameOrigin === false && datadog.separate === true
    && typeof datadog.reason === 'string' && datadog.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(c) per-org wildcard app.datadoghq.com vs api.datadoghq.com -> CORS_SEPARATE_ORIGIN (a different subdomain is a separate origin)');
  // a dynamic-workspace base OUTSIDE the head registrable family must STILL fail
  // (the accommodation is asserted same-registrable, not a blanket slack waiver).
  const dynBad = gate.classifyOriginPattern('https://app.slack.com', 'https://evil.example.com', { dynamicWorkspace: true });
  check(dynBad.sameOrigin === false && dynBad.separate === true
    && typeof dynBad.reason === 'string' && dynBad.reason.indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(c) a dynamic-workspace base OUTSIDE the head registrable family (evil.example.com) still FAILS CORS_SEPARATE_ORIGIN');
  // suffix-confusion: slack.com.evil.com is registrable evil.com, NOT slack.com.
  const dynConfuse = gate.classifyOriginPattern('https://app.slack.com', 'https://slack.com.evil.com', { dynamicWorkspace: true });
  check(dynConfuse.sameOrigin === false,
    '(c) suffix-confusion slack.com.evil.com (registrable evil.com) does NOT match slack.com -> FAILS');

  // a separate-origin head drives checkOriginClassification to exactly 1 failure.
  const synthSep = gate.checkOriginClassification(
    [{ global: 'FsbHandlerLinearSynthetic', origin: 'https://linear.app' }],
    { appMap: { FsbHandlerLinearSynthetic: { app: null, fallbackBaseUrl: 'https://client-api.linear.app/graphql' } } }
  );
  check(synthSep && synthSep.failures.length === 1
    && synthSep.failures[0].indexOf('CORS_SEPARATE_ORIGIN') === 0,
    '(c) a synthetic separate-origin head drives checkOriginClassification to exactly 1 CORS_SEPARATE_ORIGIN failure');

  const synthLinearReviewed = gate.checkOriginClassification(
    [{ global: 'FsbHandlerLinearReviewed', origin: 'https://linear.app' }],
    {
      appMap: {
        FsbHandlerLinearReviewed: {
          app: 'linear',
          fallbackBaseUrl: 'https://linear.app',
          firstPartyAuthReadBaseUrls: ['https://client-api.linear.app']
        }
      }
    }
  );
  check(synthLinearReviewed && synthLinearReviewed.failures.length === 0
    && synthLinearReviewed.results[0].classification.reason.indexOf('SAME_REGISTRABLE_DOMAIN_FIRST_PARTY_AUTH_READ') === 0,
    '(c) Linear reviewed handler proof passes checkOriginClassification without weakening the raw negative control');

  // ===== (d) unmapped-head + unresolvable branches ===========================
  const unmapped = gate.checkOriginClassification(
    [{ global: 'FsbHandlerNeverHeardOf', origin: 'https://whatever.example.com' }],
    { appMap: {} }
  );
  check(unmapped && unmapped.failures.length === 1
    && unmapped.failures[0].indexOf('CORS_UNMAPPED_HEAD') === 0,
    '(d) an UNMAPPED head global -> exactly 1 CORS_UNMAPPED_HEAD failure (fail closed, never silently pass)');
  const unresolvable = gate.classifyOriginPattern('https://app.slack.com', 'not-a-url');
  check(unresolvable.sameOrigin === false && unresolvable.separate === true
    && typeof unresolvable.reason === 'string' && unresolvable.reason.indexOf('CORS_UNRESOLVABLE_ORIGIN') === 0,
    '(d) classifyOriginPattern(x, "not-a-url") -> CORS_UNRESOLVABLE_ORIGIN (an unparseable origin is demoted to T3-DOM)');

  console.log('\nverify-origin-classification: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: verify-origin-classification test threw:', err && err.message ? err.message : err);
  process.exit(1);
});
