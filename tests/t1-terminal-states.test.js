'use strict';

/**
 * Phase 51 -- terminal-state/readiness surface proof.
 *
 * Run: node tests/t1-terminal-states.test.js
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const TERMINAL_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-terminal-states.mjs');
const READINESS_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const WORKLIST_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-tail-worklist.mjs');
const SEARCH_SOURCE = path.join(REPO_ROOT, 'extension', 'utils', 'capability-search.js');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function readinessOverrideSlugs() {
  const source = fs.readFileSync(SEARCH_SOURCE, 'utf8');
  const match = source.match(/var T1_READY_SLUGS = \{([\s\S]*?)\n  \};/);
  if (!match) return new Set();
  const slugs = new Set();
  const re = /'([^']+)': true/g;
  let item;
  while ((item = re.exec(match[1]))) slugs.add(item[1]);
  return slugs;
}

(async function run() {
  console.log('--- Phase 51: terminal-state and readiness-surface gates ---');

  const terminal = await import(pathToFileURL(TERMINAL_PATH).href);
  const readinessMod = await import(pathToFileURL(READINESS_PATH).href);
  const worklistMod = await import(pathToFileURL(WORKLIST_PATH).href);

  const readiness = readinessMod.reportReadiness();
  const worklist = worklistMod.buildTailWorklist(readiness);
  const report = terminal.buildTerminalStateReport({ readiness, worklist });
  const ledger = terminal.buildWriteUatLedger({ readiness, worklist });

  const terminalValidation = terminal.validateTerminalStateReport(report, readiness, worklist);
  check(terminalValidation.failures.length === 0,
    'terminal-state report validates' +
    (terminalValidation.failures.length ? ': ' + terminalValidation.failures.join(' | ') : ''));

  const ledgerValidation = terminal.validateWriteUatLedger(ledger, readiness);
  check(ledgerValidation.failures.length === 0,
    'write/destructive UAT ledger validates' +
    (ledgerValidation.failures.length ? ': ' + ledgerValidation.failures.join(' | ') : ''));

  check(report.rows.length === readiness.rows.length,
    'terminal-state report accounts for every descriptor');
  check((report.totals.bySurfaceStatus['bridge-needed'] || 0) > 0,
    'bridge-needed rows are surfaced explicitly');
  check((report.totals.bySurfaceStatus['uat-needed'] || 0) > 0,
    'write/destructive UAT-needed rows are surfaced explicitly');
  check((report.totals.bySurfaceStatus.blocked || 0) === readiness.totals.blocked,
    'blocked surface count matches readiness blocked count');

  const bridgeRows = report.rows.filter(function(row) { return row.surfaceStatus === 'bridge-needed'; });
  check(bridgeRows.every(function(row) { return row.executionEnabled === false && row.bridgeDecisionStatus; }),
    'all bridge-needed rows carry disabled bridge decisions');

  const supabaseApp = report.apps.find(function(app) { return app && app.app === 'supabase'; });
  const supabaseRows = report.rows.filter(function(row) { return row && row.app === 'supabase'; });
  check(!!supabaseApp &&
      supabaseApp.appStatus === 'guarded-fail-closed' &&
      (supabaseApp.counts['t1-ready'] || 0) > 0 &&
      (supabaseApp.counts['guarded-fail-closed'] || 0) > 0 &&
      (supabaseApp.counts['bridge-needed'] || 0) === 0 &&
      supabaseRows.every(function(row) {
        return (row.surfaceStatus === 't1-ready' && row.executionEnabled === true) ||
          (row.surfaceStatus === 'guarded-fail-closed' && row.executionEnabled === false);
      }),
    'Supabase is surfaced as T1/guarded with no remaining bridge-needed rows');

  const writeNeedsUat = ledger.rows.filter(function(row) {
    return row.status === 'not-activated-live-uat-required';
  });
  check(writeNeedsUat.length > 0 && writeNeedsUat.every(function(row) { return row.activationAllowed === false; }),
    'tail write/destructive rows remain non-activated until live UAT evidence exists');

  const appStatuses = new Set(report.apps.map(function(app) { return app.appStatus; }));
  check(appStatuses.has('bridge-needed') && appStatuses.has('uat-needed') &&
      appStatuses.has('blocked') && appStatuses.has('degraded-discovery-pending'),
    'app rollup exposes blocked, bridge-needed, UAT-needed, and degraded states');

  const netflixApp = report.apps.find(function(app) { return app && app.app === 'netflix'; });
  const netflixRows = report.rows.filter(function(row) { return row && row.app === 'netflix'; });
  const netflixLedgerRows = ledger.rows.filter(function(row) { return row && row.app === 'netflix'; });
  check(!!netflixApp &&
      netflixApp.appStatus === 'blocked' &&
      netflixRows.length === 18 &&
      netflixRows.every(function(row) {
        return row.surfaceStatus === 'blocked' &&
          row.terminalState === 'blocked-policy' &&
          row.workstream === 'blocked-policy' &&
          row.executionEnabled === false;
      }) &&
      netflixLedgerRows.length === 3 &&
      netflixLedgerRows.every(function(row) {
        return row.status === 'blocked-policy' && row.activationAllowed === false;
      }),
    'Netflix is T1-terminal as blocked-policy and remains non-invocable');

  const youtubeApp = report.apps.find(function(app) { return app && app.app === 'youtube'; });
  const youtubeRows = report.rows.filter(function(row) { return row && row.app === 'youtube'; });
  const youtubeLedgerRows = ledger.rows.filter(function(row) { return row && row.app === 'youtube'; });
  const youtubeWriteRows = youtubeRows.filter(function(row) { return row.workstream === 'write-destructive-uat'; });
  const youtubeReadRows = youtubeRows.filter(function(row) { return row.workstream === 'same-origin-read'; });
  check(!!youtubeApp &&
      youtubeApp.appStatus === 'uat-needed' &&
      youtubeRows.length === 18 &&
      youtubeWriteRows.length === 5 &&
      youtubeWriteRows.every(function(row) {
        return row.surfaceStatus === 'uat-needed' &&
          row.terminalState === 'live-uat-required' &&
          row.executionEnabled === false;
      }) &&
      youtubeReadRows.length === 13 &&
      youtubeReadRows.every(function(row) {
        return row.surfaceStatus === 'degraded-discovery-pending' &&
          row.terminalState === 'same-origin-proof-required' &&
          row.executionEnabled === false;
      }) &&
      youtubeLedgerRows.length === 5 &&
      youtubeLedgerRows.every(function(row) {
        return row.status === 'not-activated-live-uat-required' && row.activationAllowed === false;
      }),
    'YouTube is sensitive discovery-pending with write UAT-needed rows and read same-origin-proof rows');

  const ytmusicApp = report.apps.find(function(app) { return app && app.app === 'ytmusic'; });
  const ytmusicRows = report.rows.filter(function(row) {
    return row && row.app === 'ytmusic' && row.service === 'music.youtube.com';
  });
  const ytmusicLedgerRows = ledger.rows.filter(function(row) {
    return row && row.app === 'ytmusic' && row.service === 'music.youtube.com';
  });
  const ytmusicWriteRows = ytmusicRows.filter(function(row) { return row.workstream === 'write-destructive-uat'; });
  const ytmusicReadRows = ytmusicRows.filter(function(row) { return row.workstream === 'same-origin-read'; });
  check(!!ytmusicApp &&
      ytmusicApp.appStatus === 'uat-needed' &&
      ytmusicRows.length === 15 &&
      ytmusicWriteRows.length === 5 &&
      ytmusicWriteRows.every(function(row) {
        return row.surfaceStatus === 'uat-needed' &&
          row.terminalState === 'live-uat-required' &&
          row.executionEnabled === false;
      }) &&
      ytmusicReadRows.length === 10 &&
      ytmusicReadRows.every(function(row) {
        return row.surfaceStatus === 'degraded-discovery-pending' &&
          row.terminalState === 'same-origin-proof-required' &&
          row.executionEnabled === false;
      }) &&
      ytmusicLedgerRows.length === 5 &&
      ytmusicLedgerRows.every(function(row) {
        return row.status === 'not-activated-live-uat-required' && row.activationAllowed === false;
      }),
    'YouTube Music ytmusic is sensitive discovery-pending with write UAT-needed rows and read same-origin-proof rows');

  const onlyfansApp = report.apps.find(function(app) { return app && app.app === 'onlyfans'; });
  const onlyfansRows = report.rows.filter(function(row) { return row && row.app === 'onlyfans'; });
  const onlyfansLedgerRows = ledger.rows.filter(function(row) { return row && row.app === 'onlyfans'; });
  check(!!onlyfansApp &&
      onlyfansApp.appStatus === 'blocked' &&
      onlyfansRows.length === 21 &&
      onlyfansRows.every(function(row) {
        return row.surfaceStatus === 'blocked' &&
          row.terminalState === 'blocked-policy' &&
          row.workstream === 'blocked-policy' &&
          row.executionEnabled === false;
      }) &&
      onlyfansLedgerRows.length === 3 &&
      onlyfansLedgerRows.every(function(row) {
        return row.status === 'blocked-policy' && row.activationAllowed === false;
      }),
    'OnlyFans is T1-terminal as blocked-policy and remains non-invocable');

  const overrideSlugs = readinessOverrideSlugs();
  const handlerReady = readiness.rows
    .filter(function(row) { return row.readiness === 't1-ready' && row.proof === 'handler'; })
    .map(function(row) { return row.slug; });
  const missingOverrides = handlerReady.filter(function(slug) { return !overrideSlugs.has(slug); });
  check(missingOverrides.length === 0,
    'search readiness override covers all current handler-backed T1 rows' +
    (missingOverrides.length ? ': ' + missingOverrides.join(', ') : ''));

  check(overrideSlugs.has('airbnb.get_current_user') && overrideSlugs.has('airbnb.search_suggestions')
      && overrideSlugs.has('airtable.list_records') && overrideSlugs.has('airtable.get_base_schema')
      && overrideSlugs.has('bitbucket.get_commit') && overrideSlugs.has('bitbucket.search_code')
      && overrideSlugs.has('retool.get_current_user') && overrideSlugs.has('asana.get_task')
      && overrideSlugs.has('shortcut.list_epics') && overrideSlugs.has('leetcode.get_current_user')
      && overrideSlugs.has('wikipedia.search_articles') && overrideSlugs.has('hackernews.list_top_stories')
      && overrideSlugs.has('reddit.list_posts') && overrideSlugs.has('npm.search_packages') && overrideSlugs.has('yelp.search_businesses')
      && overrideSlugs.has('tripadvisor.get_restaurant') && overrideSlugs.has('zillow.search_for_sale')
      && overrideSlugs.has('meticulous.list_projects') && overrideSlugs.has('stripe.list_customers')
	      && overrideSlugs.has('x.get_tweet') && overrideSlugs.has('stackoverflow.get_question')
	      && overrideSlugs.has('expedia.search_flights') && overrideSlugs.has('expedia.navigate_to_hotel')
	      && overrideSlugs.has('booking.search_properties') && overrideSlugs.has('booking.navigate_to_property')
	      && overrideSlugs.has('instagram.search_users') && overrideSlugs.has('tiktok.get_user_profile')
      && overrideSlugs.has('tiktok.get_video') && overrideSlugs.has('facebook.get_current_user')
      && overrideSlugs.has('facebook.search_marketplace') && overrideSlugs.has('threads.get_thread')
      && overrideSlugs.has('mongodb.list_clusters')
      && overrideSlugs.has('cockroachdb.list_clusters')
      && overrideSlugs.has('amplitude.get_org_data') && overrideSlugs.has('chipotle.get_menu')
      && overrideSlugs.has('pandaexpress.find_restaurants') && overrideSlugs.has('pandaexpress.get_restaurant_menu')
      && overrideSlugs.has('costco.get_product') && overrideSlugs.has('costco.get_product_availability')
      && overrideSlugs.has('instacart.get_current_user') && overrideSlugs.has('instacart.list_orders')
      && overrideSlugs.has('doordash.get_current_user') && overrideSlugs.has('doordash.list_orders')
      && overrideSlugs.has('circleci.get_context') && overrideSlugs.has('circleci.list_schedules')
      && overrideSlugs.has('lucid.get_current_user') && overrideSlugs.has('lucid.list_documents')
      && overrideSlugs.has('lucid.search_documents')
      && overrideSlugs.has('linear.get_viewer') && overrideSlugs.has('linear.search_issues')
	      && overrideSlugs.has('target.search_products') && overrideSlugs.has('target.get_product')
	      && overrideSlugs.has('walmart.search_products') && overrideSlugs.has('walmart.get_product')
	      && overrideSlugs.has('etsy.search_listings') && overrideSlugs.has('etsy.get_listing')
	      && overrideSlugs.has('homedepot.search_products') && overrideSlugs.has('homedepot.get_cart')
      && overrideSlugs.has('todoist.list_tasks') && overrideSlugs.has('todoist.get_task')
      && overrideSlugs.has('discord.list_guilds')
      && overrideSlugs.has('chatgpt.get_current_user') && overrideSlugs.has('chatgpt.list_conversations')
      && overrideSlugs.has('ticketmaster.search_events') && overrideSlugs.has('ticketmaster.get_event')
      && overrideSlugs.has('eventbrite.search_events') && overrideSlugs.has('eventbrite.get_event')
      && overrideSlugs.has('figma.list_teams') && overrideSlugs.has('figma.get_file')
      && overrideSlugs.has('excel.get_current_user') && overrideSlugs.has('excel.list_worksheets')
      && overrideSlugs.has('onenote.get_current_user') && overrideSlugs.has('onenote.list_notebooks')
      && overrideSlugs.has('webflow.list_workspaces') && overrideSlugs.has('webflow.get_site')
      && overrideSlugs.has('ynab.list_accounts') && overrideSlugs.has('ynab.get_transaction')
      && overrideSlugs.has('calendly.get_current_user') && overrideSlugs.has('calendly.list_event_types')
      && overrideSlugs.has('dockerhub.list_repositories') && overrideSlugs.has('dockerhub.search_catalog')
      && overrideSlugs.has('shopify.list_products') && overrideSlugs.has('shopify.get_product')
      && overrideSlugs.has('gcloud.list_projects') && overrideSlugs.has('gcloud.get_bucket')
      && overrideSlugs.has('twitch.get_current_user') && overrideSlugs.has('twitch.search_channels')
      && overrideSlugs.has('fidelity.list_accounts') && overrideSlugs.has('fidelity.get_positions')
      && overrideSlugs.has('robinhood.list_positions') && overrideSlugs.has('robinhood.search_instruments')
      && overrideSlugs.has('steam.search_store') && overrideSlugs.has('steam.get_app_details'),
	    'Airbnb, Airtable, Bitbucket, Retool, Asana, Shortcut, LeetCode, Wikipedia, Hacker News, Reddit, npm, Yelp, TripAdvisor, Zillow, Meticulous, Stripe, X, Expedia, Booking, Instagram, Stack Overflow, MongoDB, CockroachDB, Amplitude, Chipotle, Panda Express, Costco, Instacart, CircleCI, Lucid, Linear, Target, Walmart, Todoist, Discord, ChatGPT, Ticketmaster, Eventbrite, Figma, Excel, OneNote, Webflow, YNAB, Calendly, Docker Hub, Shopify, Google Cloud, Twitch, Fidelity, Robinhood, and Steam handler rows are no longer surfaced as discovery-pending');

  console.log('\nt1-terminal-states: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: t1-terminal-states threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
