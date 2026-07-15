#!/usr/bin/env node
/**
 * Phase 41 / Plan 01 (v1.0.0 Full App Catalog -- DEPTH-02) -- the CORS /
 * FIRST-PARTY-ORIGIN VERIFICATION GATE (the SC3 fail-closed shipping guarantee).
 *
 * THE TRAP THIS CLOSES: a T1a head builds a credentialed same-origin-cookie spec and
 * hands it to executeBoundSpec, which pins the active tab to spec.origin (Wall 2). That
 * is SAFE only when the handler origin is SAME-ORIGIN with the app's real API base-URL
 * -- a PATH on the first-party origin (gitlab.com/api/v4, app.notion.com/api/v3). If a
 * head's API actually lives on a SEPARATE subdomain (linear -> client-api.linear.app)
 * or a per-org wildcard (*.datadoghq.com, *.atlassian.net), the first-party session
 * cookie does NOT cross that origin -- porting it would require a CORS-verified
 * cross-origin credentialed fetch that punches a controlled hole in the NON-NEGOTIABLE
 * Wall-2 origin-pin. Such a head must be DEMOTED to T3-DOM, not shipped as a head.
 *
 * THE GATE: it iterates EVERY HEAD_HANDLER_MODULES entry (parsed from the catalog
 * SOURCE -- the same array-literal freeze tests/head-handler-cap.test.js uses), reads
 * each head's declared origin and the app's real API base-URL from the vendored
 * vendor/opentabs-snapshot/plugins/<app>/src/<app>-api.ts (the SAME extraction the
 * Phase-40 planner used), and asserts SAME-ORIGIN. A separate-origin head FAILS THE
 * BUILD with a clear CORS_SEPARATE_ORIGIN reason naming the head + both origins. This
 * is FAIL-CLOSED: a future separate-origin port can NEVER silently ship -- it reds this
 * gate (wired into validate:extension) first.
 *
 * NEGATIVE-CONTROL (in the same run): a synthetic linear head
 * ({ global:'FsbHandlerLinear', origin:'https://linear.app' }) classified against
 * https://client-api.linear.app/graphql MUST classify separate -- the proof the gate
 * actually enforces the linear/datadog/jira demote-to-T3 and is not a no-op.
 *
 * IT IS A SHIPPING GATE, NOT AN EXECUTOR: it enables NO cross-origin call. It only
 * decides port-eligibility at build time. The runtime origin-pin (executeBoundSpec's
 * RECIPE_ORIGIN_MISMATCH) is the separate EXECUTION gate -- both intact, neither
 * extended for cross-origin (Pattern-D is deferred; see 41-DEFERRAL.md).
 *
 * DUAL EXPORT (mirrors scripts/verify-no-duplicate-stem.mjs):
 *   - export { classifyOriginPattern, checkOriginClassification } -- driven by a test.
 *   - CLI on direct invocation -- chained into validate:extension. Both paths reuse the
 *     SAME logic.
 *
 * Wall-1 discipline: this is build tooling (NOT shipped to the browser), kept FREE of
 * run-string-as-code / function-from-string / dynamic-module-loader constructs in code
 * AND comments. The static `import ... from` below is the ESM module graph, not a
 * dynamic loader; it reads the api.ts files as TEXT (readFileSync), never executes them.
 *
 * NO EMOJIS, ASCII-only source.
 */

'use strict';

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const CATALOG_PATH = join(ROOT, 'extension', 'utils', 'capability-catalog.js');
const VENDOR_PLUGINS = join(ROOT, 'vendor', 'opentabs-snapshot', 'plugins');

// ---- The handler-global -> { app, fallbackBaseUrl } map ----------------------
// `app` is the vendored plugin dir whose <app>-api.ts carries the real API base-URL.
// `fallbackBaseUrl` is the documented base-URL for an app with NO vendored plugin
// (github ships no opentabs plugin -- its first-party origin is https://github.com).
// A head global absent from this map FAILS the gate (an unmapped head cannot be
// origin-verified -> fail closed, never silently pass).
//
// `dynamicWorkspace: true` (slack ONLY) marks an app whose vendored API base is NOT a
// static literal but a runtime-interpolated `${workspaceUrl}/api/<method>` (slack-api.ts
// builds it off auth.workspaceUrl, which is app.slack.com on the new client OR a
// per-workspace <team>.slack.com subdomain on the classic client, line 138). That base
// CANNOT be extracted as a single literal, so a generic null->fallback would
// rubber-stamp slack against its own fallbackBaseUrl (WR-01). Instead the gate
// REQUIRES the vendored api.ts to actually contain that dynamic form (readDynamicWorkspaceBase),
// then asserts it is SAME-REGISTRABLE-DOMAIN with the head origin (*.slack.com vs
// app.slack.com) -- a visible, asserted accommodation, NOT a silent fallback. A future
// dynamic-workspace base that is NOT same-registrable-domain with the head still FAILS.
const HEAD_APP_MAP = {
  FsbHandlerGithub: { app: null, fallbackBaseUrl: 'https://github.com' },
  FsbHandlerSlack: { app: 'slack', fallbackBaseUrl: 'https://app.slack.com', dynamicWorkspace: true },
  FsbHandlerNotion: {
    app: 'notion',
    fallbackBaseUrl: 'https://app.notion.com',
    observedRuntimeBaseUrl: 'https://app.notion.com/api/v3',
    expectedStaleVendoredBaseUrl: 'https://www.notion.so/api/v3'
  },
  FsbHandlerGitlab: { app: 'gitlab', fallbackBaseUrl: 'https://gitlab.com' },
  FsbHandlerNetlify: { app: 'netlify', fallbackBaseUrl: 'https://app.netlify.com' },
  FsbHandlerBitbucket: { app: 'bitbucket', fallbackBaseUrl: 'https://bitbucket.org' },
  FsbHandlerJira: {
    app: 'jira',
    fallbackBaseUrl: 'https://example.atlassian.net',
    relativeRuntimeBaseUrl: '/rest/api/3'
  },
  FsbHandlerConfluence: {
    app: 'confluence',
    fallbackBaseUrl: 'https://example.atlassian.net',
    relativeRuntimeBaseUrl: '/wiki/api/v2'
  },
  FsbHandlerCircleci: { app: 'circleci', fallbackBaseUrl: 'https://app.circleci.com' },
  FsbHandlerVercel: { app: 'vercel', fallbackBaseUrl: 'https://vercel.com' },
  FsbHandlerRetool: {
    app: 'retool',
    fallbackBaseUrl: 'https://retool.com',
    relativeRuntimeBaseUrl: '/api'
  },
  FsbHandlerAsana: { app: 'asana', fallbackBaseUrl: 'https://app.asana.com' },
  FsbHandlerRobinhood: {
    app: 'robinhood',
    fallbackBaseUrl: 'https://robinhood.com',
    guardedOnlyHandlerFile: 'robinhood.js'
  },
  FsbHandlerFidelity: {
    app: 'fidelity',
    fallbackBaseUrl: 'https://digital.fidelity.com',
    guardedOnlyHandlerFile: 'fidelity.js'
  },
  FsbHandlerShortcut: {
    app: 'shortcut',
    fallbackBaseUrl: 'https://app.shortcut.com',
    relativeRuntimeBaseUrl: '/backend/api/v3'
  },
  FsbHandlerLeetcode: { app: 'leetcode', fallbackBaseUrl: 'https://leetcode.com' },
  FsbHandlerWikipedia: { app: 'wikipedia', fallbackBaseUrl: 'https://en.wikipedia.org' },
  FsbHandlerHackernews: {
    app: 'hackernews',
    fallbackBaseUrl: 'https://news.ycombinator.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerReddit: {
    app: 'reddit',
    fallbackBaseUrl: 'https://www.reddit.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerNpm: {
    app: 'npm',
    fallbackBaseUrl: 'https://www.npmjs.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerYelp: {
    app: 'yelp',
    fallbackBaseUrl: 'https://www.yelp.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerTripadvisor: {
    app: 'tripadvisor',
    fallbackBaseUrl: 'https://www.tripadvisor.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerZillow: {
    app: 'zillow',
    fallbackBaseUrl: 'https://www.zillow.com'
  },
  FsbHandlerRedfin: {
    app: 'redfin',
    fallbackBaseUrl: 'https://www.redfin.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerBsky: {
    app: 'bluesky',
    fallbackBaseUrl: 'https://bsky.app',
    publicAppViewBaseUrl: 'https://api.bsky.app/xrpc'
  },
  FsbHandlerMastodon: {
    app: 'mastodon',
    fallbackBaseUrl: 'https://mastodon.social',
    relativeRuntimeBaseUrl: '/api/v1'
  },
  FsbHandlerMeticulous: {
    app: 'meticulous',
    fallbackBaseUrl: 'https://app.meticulous.ai',
    relativeRuntimeBaseUrl: '/api/graphql'
  },
  FsbHandlerX: {
    app: 'x',
    fallbackBaseUrl: 'https://x.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerInstagram: {
    app: 'instagram',
    fallbackBaseUrl: 'https://www.instagram.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerTiktok: {
    app: 'tiktok',
    fallbackBaseUrl: 'https://www.tiktok.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerFacebook: {
    app: 'facebook',
    fallbackBaseUrl: 'https://www.facebook.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerThreads: {
    app: 'threads',
    fallbackBaseUrl: 'https://www.threads.net',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerStackoverflow: {
    app: 'stackoverflow',
    fallbackBaseUrl: 'https://stackoverflow.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerStripe: {
    app: 'stripe',
    fallbackBaseUrl: 'https://dashboard.stripe.com'
  },
  FsbHandlerCoinbase: {
    app: 'coinbase',
    fallbackBaseUrl: 'https://www.coinbase.com',
    relativeRuntimeBaseUrl: '/graphql/query'
  },
  FsbHandlerCarta: {
    app: 'carta',
    fallbackBaseUrl: 'https://app.carta.com',
    pageStateRuntime: true
  },
  FsbHandlerCloudflare: {
    app: 'cloudflare',
    fallbackBaseUrl: 'https://dash.cloudflare.com'
  },
  FsbHandlerTerraform: { app: 'terraform-cloud', fallbackBaseUrl: 'https://app.terraform.io' },
  FsbHandlerTwilio: { app: 'twilio', fallbackBaseUrl: 'https://www.twilio.com' },
  FsbHandlerTumblr: {
    app: 'tumblr',
    fallbackBaseUrl: 'https://www.tumblr.com',
    relativeRuntimeBaseUrl: '/api/v2'
  },
  FsbHandlerPriceline: { app: 'priceline', fallbackBaseUrl: 'https://www.priceline.com' },
  FsbHandlerAirbnb: { app: 'airbnb', fallbackBaseUrl: 'https://www.airbnb.com' },
  FsbHandlerAirtable: {
    app: 'airtable',
    fallbackBaseUrl: 'https://airtable.com',
    relativeRuntimeBaseUrl: '/v0.3'
  },
  FsbHandlerAws: { app: 'aws-console', fallbackBaseUrl: 'https://console.aws.amazon.com' },
  FsbHandlerGcloud: {
    app: 'google-cloud',
    fallbackBaseUrl: 'https://console.cloud.google.com',
    sameOriginPageReadHandlerFile: 'gcloud.js',
    pageReadNamespace: 'gcloud'
  },
  FsbHandlerEtsy: {
    app: 'etsy',
    fallbackBaseUrl: 'https://www.etsy.com',
    relativeRuntimeBaseUrl: '/v1',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerExpedia: {
    app: 'expedia',
    fallbackBaseUrl: 'https://www.expedia.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerBooking: {
    app: 'booking',
    fallbackBaseUrl: 'https://www.booking.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerStubhub: {
    app: 'stubhub',
    fallbackBaseUrl: 'https://www.stubhub.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerKayak: {
    app: 'kayak',
    fallbackBaseUrl: 'https://www.kayak.com',
    relativeRuntimeBaseUrl: '/v1'
  },
  FsbHandlerOpentable: {
    app: 'opentable',
    fallbackBaseUrl: 'https://www.opentable.com',
    relativeRuntimeBaseUrl: '/v1'
  },
  FsbHandlerMongodb: { app: 'mongodb-atlas', fallbackBaseUrl: 'https://cloud.mongodb.com' },
  FsbHandlerSnowflake: {
    app: 'snowflake',
    fallbackBaseUrl: 'https://app.snowflake.com',
    snowflakePageContextRuntimeBaseUrl: 'https://app.snowflake.com'
  },
  FsbHandlerCockroachdb: { app: 'cockroachdb', fallbackBaseUrl: 'https://cockroachlabs.cloud' },
  FsbHandlerClickhouse: {
    app: 'clickhouse',
    fallbackBaseUrl: 'https://console.clickhouse.cloud',
    storageBearerReadBaseUrl: 'https://control-plane-internal.clickhouse.cloud'
  },
  FsbHandlerTemporal: {
    app: 'temporal',
    fallbackBaseUrl: 'https://cloud.temporal.io',
    sameOriginPageReadHandlerFile: 'temporal.js',
    pageReadNamespace: 'temporal'
  },
  FsbHandlerMsword: {
    app: 'microsoft-word',
    fallbackBaseUrl: 'https://word.cloud.microsoft',
    graphBearerRuntimeBaseUrl: 'https://graph.microsoft.com/v1.0',
    pageBearerGraphApp: 'microsoft-word'
  },
  FsbHandlerExcel: {
    app: 'excel-online',
    fallbackBaseUrl: 'https://excel.cloud.microsoft',
    graphBearerRuntimeBaseUrl: 'https://graph.microsoft.com/v1.0',
    pageBearerGraphApp: 'excel'
  },
  FsbHandlerPowerpoint: {
    app: 'powerpoint',
    fallbackBaseUrl: 'https://powerpoint.cloud.microsoft',
    graphBearerRuntimeBaseUrl: 'https://graph.microsoft.com/v1.0',
    pageBearerGraphApp: 'powerpoint'
  },
  FsbHandlerOutlook: {
    app: 'outlook',
    fallbackBaseUrl: 'https://outlook.cloud.microsoft',
    graphBearerRuntimeBaseUrl: 'https://graph.microsoft.com/v1.0',
    pageBearerGraphApp: 'outlook'
  },
  FsbHandlerTeams: {
    app: 'teams',
    fallbackBaseUrl: 'https://teams.live.com',
    graphBearerRuntimeBaseUrl: 'https://graph.microsoft.com/v1.0',
    pageBearerGraphApp: 'teams'
  },
  FsbHandlerOnenote: {
    app: 'onenote',
    fallbackBaseUrl: 'https://onenote.cloud.microsoft',
    graphBearerRuntimeBaseUrl: 'https://graph.microsoft.com/v1.0',
    pageBearerGraphApp: 'onenote'
  },
  FsbHandlerTodoist: { app: 'todoist', fallbackBaseUrl: 'https://app.todoist.com' },
  FsbHandlerPinterest: {
    app: 'pinterest',
    fallbackBaseUrl: 'https://www.pinterest.com',
    relativeRuntimeBaseUrl: '/resource'
  },
  FsbHandlerStarbucks: { app: 'starbucks', fallbackBaseUrl: 'https://www.starbucks.com' },
  FsbHandlerMedium: {
    app: 'medium',
    fallbackBaseUrl: 'https://medium.com',
    relativeRuntimeBaseUrl: '/_/graphql'
  },
  FsbHandlerDominos: {
    app: 'dominos',
    fallbackBaseUrl: 'https://www.dominos.com',
    relativeRuntimeBaseUrl: '/api/web-bff/graphql'
  },
  FsbHandlerWhatsapp: {
    app: 'whatsapp',
    fallbackBaseUrl: 'https://web.whatsapp.com',
    pageStateRuntime: true
  },
  FsbHandlerTelegram: {
    app: 'telegram',
    fallbackBaseUrl: 'https://web.telegram.org',
    sameOriginPageReadHandlerFile: 'telegram.js',
    pageReadNamespace: 'telegram'
  },
  FsbHandlerAmplitude: {
    app: 'amplitude',
    fallbackBaseUrl: 'https://app.amplitude.com',
    relativeRuntimeBaseUrl: '/t/graphql/org'
  },
  FsbHandlerNewrelic: {
    app: 'newrelic',
    fallbackBaseUrl: 'https://one.newrelic.com',
    relativeRuntimeBaseUrl: '/graphql',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerGrafana: {
    app: 'grafana',
    fallbackBaseUrl: 'https://grafana.com',
    relativeRuntimeBaseUrl: '/api'
  },
  FsbHandlerDatadog: {
    app: 'datadog',
    fallbackBaseUrl: 'https://app.datadoghq.com',
    relativeRuntimeBaseUrl: '/api',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerPosthog: {
    app: 'posthog',
    fallbackBaseUrl: 'https://us.posthog.com',
    relativeRuntimeBaseUrl: '/api'
  },
  FsbHandlerChipotle: {
    app: 'chipotle',
    fallbackBaseUrl: 'https://www.chipotle.com',
    publicCorsReadBaseUrl: 'https://services.chipotle.com'
  },
  FsbHandlerPandaexpress: {
    app: 'panda-express',
    fallbackBaseUrl: 'https://www.pandaexpress.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerGrubhub: {
    app: 'grubhub',
    fallbackBaseUrl: 'https://www.grubhub.com',
    relativeRuntimeBaseUrl: '/v1'
  },
  FsbHandlerCostco: {
    app: 'costco',
    fallbackBaseUrl: 'https://www.costco.com',
    publicCorsReadBaseUrl: 'https://ecom-api.costco.com'
  },
  FsbHandlerInstacart: {
    app: 'instacart',
    fallbackBaseUrl: 'https://www.instacart.com',
    relativeRuntimeBaseUrl: '/graphql'
  },
  FsbHandlerUbereats: {
    app: 'ubereats',
    fallbackBaseUrl: 'https://www.ubereats.com',
    relativeRuntimeBaseUrl: '/eats/v1'
  },
  FsbHandlerUber: {
    app: 'uber',
    fallbackBaseUrl: 'https://www.uber.com',
    relativeRuntimeBaseUrl: '/api'
  },
  FsbHandlerDoordash: {
    app: 'doordash',
    fallbackBaseUrl: 'https://www.doordash.com',
    relativeRuntimeBaseUrl: '/graphql'
  },
  FsbHandlerLyft: {
    app: 'lyft',
    fallbackBaseUrl: 'https://www.lyft.com',
    relativeRuntimeBaseUrl: '/v1'
  },
  FsbHandlerLucid: {
    app: 'lucid',
    fallbackBaseUrl: 'https://lucid.app',
    firstPartyAuthReadBaseUrls: [
      'https://users.lucid.app',
      'https://documents.lucid.app',
      'https://userdocslist.lucid.app'
    ]
  },
  FsbHandlerLinear: {
    app: 'linear',
    fallbackBaseUrl: 'https://linear.app',
    firstPartyAuthReadBaseUrls: [
      'https://client-api.linear.app'
    ]
  },
  FsbHandlerLinkedin: {
    app: 'linkedin',
    fallbackBaseUrl: 'https://www.linkedin.com',
    relativeRuntimeBaseUrl: '/voyager/api'
  },
  FsbHandlerClickup: {
    app: 'clickup',
    fallbackBaseUrl: 'https://app.clickup.com',
    pageBearerReadBaseUrl: 'https://api.clickup.com'
  },
  FsbHandlerTarget: {
    app: 'target',
    fallbackBaseUrl: 'https://www.target.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerWalmart: {
    app: 'walmart',
    fallbackBaseUrl: 'https://www.walmart.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerAmazon: {
    app: 'amazon',
    fallbackBaseUrl: 'https://www.amazon.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerEbay: {
    app: 'ebay',
    fallbackBaseUrl: 'https://www.ebay.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerHomedepot: {
    app: 'homedepot',
    fallbackBaseUrl: 'https://www.homedepot.com',
    firstPartyAuthReadBaseUrls: [
      'https://apionline.homedepot.com'
    ],
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerHack2hire: {
    app: 'hack2hire',
    fallbackBaseUrl: 'https://www.hack2hire.com',
    storageBearerReadBaseUrl: 'https://api.hack2hire.com/algro/v1'
  },
  FsbHandlerTinder: {
    app: 'tinder',
    fallbackBaseUrl: 'https://www.tinder.com',
    tinderStorageBearerReadBaseUrl: 'https://api.gotinder.com'
  },
  FsbHandlerChatgpt: {
    app: 'chatgpt',
    fallbackBaseUrl: 'https://chatgpt.com',
    relativeRuntimeBaseUrl: '/backend-api'
  },
  FsbHandlerClaude: {
    app: 'claude',
    fallbackBaseUrl: 'https://claude.ai',
    relativeRuntimeBaseUrl: '/api'
  },
  FsbHandlerMinimax: {
    app: 'minimax',
    fallbackBaseUrl: 'https://agent.minimax.io',
    sameOriginPageReadHandlerFile: 'minimax.js',
    pageReadNamespace: 'minimax'
  },
  FsbHandlerGemini: {
    app: 'gemini',
    fallbackBaseUrl: 'https://gemini.google.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerGanalytics: {
    app: 'google-analytics',
    fallbackBaseUrl: 'https://analytics.google.com',
    gapiPageBridgeBaseUrls: [
      'https://analyticsdata.googleapis.com/v1beta',
      'https://analyticssuitefrontend-pa.clients6.google.com'
    ]
  },
  FsbHandlerDiscord: { app: 'discord', fallbackBaseUrl: 'https://discord.com' },
  FsbHandlerFigma: {
    app: 'figma',
    fallbackBaseUrl: 'https://www.figma.com',
    relativeRuntimeBaseUrl: '/api'
  },
  FsbHandlerGdrive: {
    app: 'google-drive',
    fallbackBaseUrl: 'https://drive.google.com',
    gapiPageReadBaseUrl: 'https://content.googleapis.com/drive/v3'
  },
  FsbHandlerGdocs: {
    app: 'google-docs',
    fallbackBaseUrl: 'https://docs.google.com',
    relativeRuntimeBaseUrl: '/drive/v3'
  },
  FsbHandlerGsheets: {
    app: 'google-sheets',
    fallbackBaseUrl: 'https://docs.google.com',
    pageGapiUiSheetsSessionBaseUrl: 'https://sheets.googleapis.com/v4'
  },
  FsbHandlerWebflow: {
    app: 'webflow',
    fallbackBaseUrl: 'https://webflow.com',
    relativeRuntimeBaseUrl: '/api'
  },
  FsbHandlerYnab: {
    app: 'ynab',
    fallbackBaseUrl: 'https://app.ynab.com',
    relativeRuntimeBaseUrl: '/api'
  },
  FsbHandlerCalendly: {
    app: 'calendly',
    fallbackBaseUrl: 'https://calendly.com',
    relativeRuntimeBaseUrl: '/api'
  },
  FsbHandlerDockerhub: {
    app: 'docker-hub',
    fallbackBaseUrl: 'https://hub.docker.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerSentry: {
    app: 'sentry',
    fallbackBaseUrl: 'https://sentry.io',
    relativeRuntimeBaseUrl: '/api/0'
  },
  FsbHandlerAzure: {
    app: 'azure',
    fallbackBaseUrl: 'https://portal.azure.com',
    storageBearerReadBaseUrl: 'https://management.azure.com'
  },
  FsbHandlerShopify: {
    app: 'shopify',
    fallbackBaseUrl: 'https://admin.shopify.com',
    relativeRuntimeBaseUrl: '/admin/api'
  },
  FsbHandlerEventbrite: {
    app: 'eventbrite',
    fallbackBaseUrl: 'https://www.eventbrite.com',
    relativeRuntimeBaseUrl: '/v3'
  },
  FsbHandlerNotebooklm: {
    app: 'notebooklm',
    fallbackBaseUrl: 'https://notebooklm.google.com'
  },
  FsbHandlerCraigslist: {
    app: 'craigslist',
    fallbackBaseUrl: 'https://accounts.craigslist.org',
    firstPartyAuthReadBaseUrls: [
      'https://wapi.craigslist.org/web/v8',
      'https://capi.craigslist.org/web/v8',
      'https://accounts.craigslist.org'
    ]
  },
  FsbHandlerTicketmaster: {
    app: 'ticketmaster',
    fallbackBaseUrl: 'https://www.ticketmaster.com',
    relativeRuntimeBaseUrl: '/',
    ignoreVendoredBaseUrl: true
  },
  FsbHandlerGcal: {
    app: 'google-calendar',
    fallbackBaseUrl: 'https://calendar.google.com'
  },
  FsbHandlerGmaps: {
    app: 'google-maps',
    fallbackBaseUrl: 'https://www.google.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerZendesk: {
    app: 'zendesk',
    fallbackBaseUrl: 'https://zendesk.com',
    relativeRuntimeBaseUrl: '/api/v2'
  },
  FsbHandlerSpotify: {
    app: 'spotify',
    fallbackBaseUrl: 'https://open.spotify.com',
    pageBearerReadBaseUrl: 'https://api.spotify.com/v1'
  },
  FsbHandlerSupabase: {
    app: 'supabase',
    fallbackBaseUrl: 'https://supabase.com',
    pageBearerReadBaseUrl: 'https://api.supabase.com/v1'
  },
  FsbHandlerTwitch: {
    app: 'twitch',
    fallbackBaseUrl: 'https://www.twitch.tv',
    pageBearerReadBaseUrl: 'https://gql.twitch.tv'
  },
  FsbHandlerSteam: {
    app: 'steam',
    fallbackBaseUrl: 'https://store.steampowered.com'
  },
  FsbHandlerFiverr: {
    app: 'fiverr',
    fallbackBaseUrl: 'https://www.fiverr.com',
    relativeRuntimeBaseUrl: '/'
  },
  FsbHandlerGlama: {
    app: 'glama',
    fallbackBaseUrl: 'https://glama.ai',
    glamaPageStateRuntimeBaseUrl: 'https://glama.ai'
  }
};

/**
 * originHost(value) -> the origin host of a URL or a URL-with-path, or null.
 * new URL('https://gitlab.com/api/v4').origin === 'https://gitlab.com'. Tolerant of a
 * trailing-path base-URL (the api.ts bases are paths on the origin).
 */
function originHost(value) {
  if (typeof value !== 'string' || !value) { return null; }
  try {
    return new URL(value).origin;
  } catch (e) {
    return null;
  }
}

/**
 * registrableDomain(value) -> the registrable domain (eTLD+1, e.g. 'slack.com' for both
 * app.slack.com and myteam.slack.com), lower-cased, or null if unparseable. Used ONLY
 * for the slack dynamic-workspace accommodation (WR-01): the per-workspace runtime base
 * is *.slack.com, so the gate asserts SAME-REGISTRABLE-DOMAIN with the head's app.slack.com
 * origin rather than strict same-origin. Deliberately a conservative last-two-labels
 * heuristic (no public-suffix-list dependency in build tooling): correct for the simple
 * registrable domains in play (slack.com). It is NOT used for the strict same-origin
 * path -- gitlab/notion/github stay full-origin-equality unless a head has an explicit
 * observedRuntimeBaseUrl override. A host with fewer than two
 * labels (e.g. 'localhost') returns the host unchanged.
 */
function registrableDomain(value) {
  const origin = originHost(value);
  if (!origin) { return null; }
  let host;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch (e) {
    return null;
  }
  if (!host) { return null; }
  const labels = host.split('.');
  if (labels.length <= 2) { return host; }
  return labels.slice(-2).join('.');
}

/**
 * classifyOriginPattern(handlerOrigin, apiBaseUrl, opts)
 *   -> { sameOrigin, separate, apiOrigin, handlerOrigin, reason }
 *
 * sameOrigin === the API base-URL's origin host EQUALS the handler origin host (a PATH
 * on the same first-party origin, e.g. gitlab.com/api/v4 vs https://gitlab.com).
 * separate === a different host / subdomain (client-api.linear.app vs linear.app) or an
 * unparseable input. The two are mutually exclusive. `reason` is null when same-origin,
 * else a CORS_SEPARATE_ORIGIN (or CORS_UNRESOLVABLE_ORIGIN) string naming both origins.
 *
 * opts.dynamicWorkspace === true (slack ONLY, WR-01): `apiBaseUrl` is a per-workspace
 * runtime base (a *.slack.com subdomain that varies per team) reduced to a representative
 * origin by the caller. For this app the gate CANNOT require strict same-origin (the
 * runtime host is dynamic), so it asserts SAME-REGISTRABLE-DOMAIN instead: the api base
 * and the head origin must share a registrable domain (slack.com). When they do, the
 * result is sameOrigin:true with an EXPLICIT reason marker
 * (SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE) recording the accommodation -- it is NOT a
 * silent fallback. When they do NOT (a future app whose dynamic base left the
 * registrable family), it FAILS with CORS_SEPARATE_ORIGIN exactly like the strict path.
 */
export function classifyOriginPattern(handlerOrigin, apiBaseUrl, opts) {
  const options = opts || {};
  const hOrigin = originHost(handlerOrigin);
  const aOrigin = originHost(apiBaseUrl);
  if (!hOrigin || !aOrigin) {
    return {
      sameOrigin: false,
      separate: true,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: 'CORS_UNRESOLVABLE_ORIGIN: handler="' + String(handlerOrigin) +
        '" apiBaseUrl="' + String(apiBaseUrl) + '" -- one origin did not parse; ' +
        'a head whose origin cannot be verified must be demoted to T3-DOM'
    };
  }
  // ---- Signed-in page-gapi/UI Google Sheets session: exact endpoints, ASSERTED ----
  if (options.pageGapiUiSheetsSession) {
    const expectedBase = 'https://sheets.googleapis.com/v4';
    const same = hOrigin === 'https://docs.google.com'
      && aOrigin === 'https://sheets.googleapis.com'
      && apiBaseUrl === expectedBase;
    return {
      sameOrigin: same,
      separate: !same,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: same
        ? 'PAGE_GAPI_UI_SHEETS_SESSION: head origin https://docs.google.com uses only the ' +
          'already signed-in, agent-owned Sheets tab through the reviewed fixed five-method ' +
          'session. The MAIN-world path calls only gapi.client.request against ' + expectedBase +
          ', the fallback is the fixed sheetsSession UI action, no auth or credential source ' +
          'is available, and write/destructive slugs remain guarded fail-closed.'
        : 'CORS_SEPARATE_ORIGIN: page-gapi/UI Sheets session accommodation is limited to ' +
          'exactly docs.google.com -> ' + expectedBase + '; got head ' + hOrigin +
          ', API base ' + String(apiBaseUrl)
    };
  }
  // ---- Dynamic-workspace accommodation (slack): same-registrable-domain, ASSERTED ----
  if (options.dynamicWorkspace) {
    const hReg = registrableDomain(hOrigin);
    const aReg = registrableDomain(aOrigin);
    const sameReg = !!hReg && !!aReg && hReg === aReg;
    return {
      sameOrigin: sameReg,
      separate: !sameReg,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: sameReg
        ? 'SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE: head origin ' + hOrigin +
          ' shares registrable domain ' + hReg + ' with its DYNAMIC per-workspace API base ' +
          aOrigin + ' (slack-api.ts builds ${workspaceUrl}/api/<method> off a *.slack.com ' +
          'subdomain). The runtime executeBoundSpec origin-pin holds the head to ' + hOrigin +
          ', so no per-workspace subdomain is silently targeted -- this is an EXPLICIT, ' +
          'reviewed same-registrable-domain accommodation, not a fallback rubber-stamp.'
        : 'CORS_SEPARATE_ORIGIN: head origin ' + hOrigin + ' does NOT share a registrable ' +
          'domain with its dynamic API base ' + aOrigin + ' (' + String(hReg) + ' != ' +
          String(aReg) + ') -- a dynamic-workspace base outside the head registrable family ' +
          'cannot ride the first-party cookie; demote this head to T3-DOM (Pattern-D ' +
          'cross-origin execution is deferred, see 41-DEFERRAL.md)'
    };
  }
  // ---- Public read accommodation (Bluesky/Chipotle): no-auth CORS, ASSERTED ----
  if (options.publicCorsRead) {
    const hReg = registrableDomain(hOrigin);
    const aReg = registrableDomain(aOrigin);
    const sameReg = !!hReg && !!aReg && hReg === aReg;
    return {
      sameOrigin: sameReg,
      separate: !sameReg,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: sameReg
        ? 'PUBLIC_CORS_READ_NO_AUTH: head origin ' + hOrigin +
          ' shares registrable domain ' + hReg +
          ' with documented no-auth public read base ' + aOrigin +
          '. This accommodation is limited to reviewed read-only endpoints whose handler ' +
          'does not read local session state, send authorization headers, or enable writes.'
        : 'CORS_SEPARATE_ORIGIN: head origin ' + hOrigin + ' does NOT share a registrable ' +
          'domain with documented public read base ' + aOrigin + ' (' + String(hReg) +
          ' != ' + String(aReg) + ') -- a public CORS read base outside the head ' +
          'registrable family cannot ship as a bundled T1 head'
    };
  }
  // ---- First-party authenticated read accommodation (Lucid): same-registrable, ASSERTED ----
  if (options.firstPartyAuthRead) {
    const hReg = registrableDomain(hOrigin);
    const aReg = registrableDomain(aOrigin);
    const sameReg = !!hReg && !!aReg && hReg === aReg;
    return {
      sameOrigin: sameReg,
      separate: !sameReg,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: sameReg
        ? 'SAME_REGISTRABLE_DOMAIN_FIRST_PARTY_AUTH_READ: head origin ' + hOrigin +
          ' shares registrable domain ' + hReg + ' with reviewed first-party authenticated ' +
          'read base ' + aOrigin + '. This accommodation is limited to app-specific read ' +
          'handlers that use bound specs, same-origin-cookie auth, no direct credential APIs, ' +
          'and guarded fail-closed mutations.'
        : 'CORS_SEPARATE_ORIGIN: head origin ' + hOrigin + ' does NOT share a registrable ' +
          'domain with reviewed first-party authenticated read base ' + aOrigin + ' (' +
          String(hReg) + ' != ' + String(aReg) + ') -- an authenticated first-party read ' +
          'base outside the head registrable family cannot ship as a bundled T1 head'
    };
  }
  // ---- Storage bearer read accommodation (Hack2Hire): same-registrable, ASSERTED ----
  if (options.storageBearerRead) {
    const hReg = registrableDomain(hOrigin);
    const aReg = registrableDomain(aOrigin);
    const sameReg = !!hReg && !!aReg && hReg === aReg;
    return {
      sameOrigin: sameReg,
      separate: !sameReg,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: sameReg
        ? 'SAME_REGISTRABLE_DOMAIN_STORAGE_BEARER_READ: head origin ' + hOrigin +
          ' shares registrable domain ' + hReg + ' with reviewed storage-bearer read base ' +
          aOrigin + '. This accommodation is limited to reviewed read-only handlers whose token ' +
          'material stays inside the origin-pinned page fetch primitive and is never logged or returned.'
        : 'CORS_SEPARATE_ORIGIN: head origin ' + hOrigin + ' does NOT share a registrable ' +
          'domain with reviewed storage-bearer read base ' + aOrigin + ' (' + String(hReg) +
          ' != ' + String(aReg) + ') -- a storage-bearer read base outside the head ' +
        'registrable family cannot ship as a bundled T1 head'
    };
  }
  // ---- Page bearer read accommodation (Spotify): same-registrable, ASSERTED ----
  if (options.pageBearerRead) {
    const hReg = registrableDomain(hOrigin);
    const aReg = registrableDomain(aOrigin);
    const sameReg = !!hReg && !!aReg && hReg === aReg;
    return {
      sameOrigin: sameReg,
      separate: !sameReg,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: sameReg
        ? 'SAME_REGISTRABLE_DOMAIN_PAGE_BEARER_READ: head origin ' + hOrigin +
          ' shares registrable domain ' + hReg + ' with reviewed page-bearer read base ' +
          aOrigin + '. Bearer material is read only inside the origin-pinned page-read ' +
          'primitive, is not logged or returned, and playback mutations stay guarded.'
        : 'CORS_SEPARATE_ORIGIN: head origin ' + hOrigin + ' does NOT share a registrable ' +
          'domain with reviewed page-bearer read base ' + aOrigin + ' (' + String(hReg) +
          ' != ' + String(aReg) + ') -- a page-bearer read base outside the head ' +
          'registrable family cannot ship as a bundled T1 head'
    };
  }
  // ---- Tinder storage bearer read accommodation: exact cross-brand API host, ASSERTED ----
  if (options.tinderStorageBearerRead) {
    const same = hOrigin === 'https://www.tinder.com' && aOrigin === 'https://api.gotinder.com';
    return {
      sameOrigin: same,
      separate: !same,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: same
        ? 'TINDER_STORAGE_BEARER_READ: head origin https://www.tinder.com uses the reviewed ' +
          'api.gotinder.com GET-only storage-token API surface. The token and persistent device ' +
          'id are read only inside the origin-pinned page request primitive, are not logged or ' +
          'returned, and all swipe/message/profile/location mutations stay guarded fail-closed.'
        : 'CORS_SEPARATE_ORIGIN: Tinder storage-bearer read accommodation is limited to ' +
          'www.tinder.com -> api.gotinder.com; got head ' + hOrigin + ', API ' + aOrigin
    };
  }
  // ---- Page bearer Graph read accommodation (Microsoft Office): ASSERTED and read-only ----
  if (options.pageBearerGraphRead) {
    const graphApp = options.pageBearerGraphApp || 'powerpoint';
    const allowedHead = graphApp === 'powerpoint'
      ? hOrigin === 'https://powerpoint.cloud.microsoft'
      : graphApp === 'excel'
        ? hOrigin === 'https://excel.cloud.microsoft'
        : graphApp === 'microsoft-word'
          ? hOrigin === 'https://word.cloud.microsoft'
          : graphApp === 'outlook'
            ? hOrigin === 'https://outlook.cloud.microsoft'
            : graphApp === 'teams'
              ? hOrigin === 'https://teams.live.com'
              : graphApp === 'onenote'
                ? hOrigin === 'https://onenote.cloud.microsoft'
                : false;
    const same = allowedHead && aOrigin === 'https://graph.microsoft.com';
        const appLabel = graphApp === 'excel'
          ? 'Excel'
          : graphApp === 'microsoft-word'
            ? 'Microsoft Word'
            : graphApp === 'outlook'
              ? 'Outlook'
              : graphApp === 'teams'
                ? 'Teams'
                : graphApp === 'onenote'
                  ? 'OneNote'
                  : 'PowerPoint';
    return {
      sameOrigin: same,
      separate: !same,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: same
        ? 'PAGE_BEARER_GRAPH_READ: head origin ' + hOrigin +
          ' uses a reviewed ' + appLabel + ' page-read auth_context to supply a Microsoft Graph ' +
          'bearer token for GET-only bound specs. The token is harvested only inside the ' +
          appLabel + ' page context, is not logged or returned, and write/destructive rows stay guarded.'
        : 'CORS_SEPARATE_ORIGIN: page-bearer Graph read accommodation is limited to ' +
          'the reviewed Office heads -> graph.microsoft.com; got head ' + hOrigin +
          ', API ' + aOrigin + ', app ' + graphApp
    };
  }
  // ---- GAPI client page-bridge read accommodation (Google Analytics): ASSERTED ----
  if (options.gapiPageBridgeRead) {
    const app = options.gapiPageBridgeApp || '';
    const same = app === 'google-analytics'
      && hOrigin === 'https://analytics.google.com'
      && (aOrigin === 'https://analyticsdata.googleapis.com'
        || aOrigin === 'https://analyticssuitefrontend-pa.clients6.google.com');
    return {
      sameOrigin: same,
      separate: !same,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: same
        ? 'PAGE_GAPI_CLIENT_READ: head origin ' + hOrigin +
          ' uses the reviewed Google Analytics page-owned gapi.client bridge for read-only ' +
          'GA4 account/reporting calls. GAPI auth state stays inside the analytics.google.com ' +
          'page context, the head handler delegates only through executeBoundPageRead, and no ' +
          'cookie, storage, or authorization material is read by the handler.'
        : 'CORS_SEPARATE_ORIGIN: GAPI page-bridge read accommodation is limited to the ' +
          'reviewed Google Analytics head on analytics.google.com -> Google Analytics GAPI ' +
          'endpoints; got head ' + hOrigin + ', API ' + aOrigin + ', app ' + app
    };
  }
  // ---- Google Drive GAPI page-read accommodation: ASSERTED and GET-only ----
  if (options.gdriveGapiPageRead) {
    const same = hOrigin === 'https://drive.google.com'
      && aOrigin === 'https://content.googleapis.com';
    return {
      sameOrigin: same,
      separate: !same,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: same
        ? 'PAGE_GAPI_DRIVE_READ: head origin ' + hOrigin +
          ' uses a reviewed Google Drive page-read bridge so page-owned gapi.client.request ' +
          'performs GET-only Drive API reads. The handler never reads cookies, storage, or ' +
          'authorization headers directly, and write/destructive rows stay guarded.'
        : 'CORS_SEPARATE_ORIGIN: Google Drive GAPI page-read accommodation is limited to ' +
          'drive.google.com -> content.googleapis.com Drive v3 GET reads; got head ' +
      hOrigin + ', API ' + aOrigin
    };
  }
  // ---- Glama React Router page-state read accommodation: ASSERTED and read-only ----
  if (options.glamaPageStateRuntimeRead) {
    const same = hOrigin === 'https://glama.ai' && aOrigin === 'https://glama.ai';
    return {
      sameOrigin: same,
      separate: !same,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: same
        ? 'GLAMA_PAGE_STATE_RUNTIME_READ: head origin https://glama.ai uses the reviewed ' +
          'Glama React Router loader-data page-read bridge. The handler delegates only ' +
          'through executeBoundPageRead, reads no credential material directly, and all ' +
          'promoted Glama rows are read-only.'
        : 'CORS_SEPARATE_ORIGIN: Glama page-state runtime accommodation is limited to ' +
          'glama.ai -> glama.ai; got head ' + hOrigin + ', runtime ' + aOrigin
    };
  }
  // ---- Guarded-only accommodation (MSWord): no executable API base is used ----
  if (options.guardedOnly) {
    const same = hOrigin === aOrigin;
    return {
      sameOrigin: same,
      separate: !same,
      apiOrigin: aOrigin,
      handlerOrigin: hOrigin,
      reason: same
        ? 'GUARDED_ONLY_NO_EXECUTION: head origin ' + hOrigin +
          ' is registered only for inert guarded fail-closed rows. The handler source ' +
          'contains no executeBoundSpec, direct network, page-read, token, or storage path, ' +
          'so no separate-origin API base is exercised by this head.'
        : 'CORS_SEPARATE_ORIGIN: guarded-only head origin ' + hOrigin +
          ' does not match fallback origin ' + aOrigin
    };
  }
  const same = hOrigin === aOrigin;
  return {
    sameOrigin: same,
    separate: !same,
    apiOrigin: aOrigin,
    handlerOrigin: hOrigin,
    reason: same ? null
      : 'CORS_SEPARATE_ORIGIN: head origin ' + hOrigin + ' is NOT same-origin with its ' +
        'API base-URL origin ' + aOrigin + ' -- the first-party session cookie does not ' +
        'cross origins; demote this head to T3-DOM (Pattern-D cross-origin execution is ' +
        'deferred, see 41-DEFERRAL.md)'
  };
}

// ---- Parse the HEAD_HANDLER_MODULES array literal from the catalog SOURCE ---------
// Mirrors tests/head-handler-cap.test.js: match `var HEAD_HANDLER_MODULES = [ ... ];`
// non-greedily, then pull each entry's global:'...' and origin:'...' fields. The
// manifest is a flat array of object literals (no nested ]), so the first ] closes it.
//
// IN-01 hardening: entries are split with a BRACE-BALANCED scan (not the old
// /\{[^}]*\}/g, which matched only a `{...}` with no inner `}` and would silently
// TRUNCATE a future nested-brace entry -- e.g. { global:'...', meta:{region:'us'},
// origin:'...' } would have been chunked as `{ global:'...', meta:{region:'us'}`,
// dropping `origin` and mis-parsing the head as origin:null). The depth scan keeps each
// top-level `{ ... }` entry whole regardless of nesting, so a future nested entry parses
// correctly instead of failing closed on a confusing mis-parse. String literals are
// tracked so a `}` inside a quoted value does not falsely close an entry.
export function parseHeadModules(source) {
  const declMatch = source.match(/var\s+HEAD_HANDLER_MODULES\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!declMatch) { return null; }
  const body = declMatch[1];
  const heads = [];
  let depth = 0;
  let start = -1;
  let quote = null;       // the active string-literal delimiter (' " `) or null
  let escaped = false;    // the previous char was a backslash inside a string
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      // Inside a string literal: only a matching un-escaped delimiter closes it.
      if (escaped) { escaped = false; }
      else if (ch === '\\') { escaped = true; }
      else if (ch === quote) { quote = null; }
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') {
      if (depth === 0) { start = i; }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const chunk = body.slice(start, i + 1);
        const g = chunk.match(/global\s*:\s*'([^']+)'/);
        const o = chunk.match(/origin\s*:\s*'([^']+)'/);
        if (g) {
          heads.push({ global: g[1], origin: o ? o[1] : null });
        }
        start = -1;
      }
    }
  }
  return heads;
}

// ---- Read the app's real API base-URL from the vendored <app>-api.ts as TEXT ------
// The base-URL appears as a string literal in the plugin's api module (the SAME
// extraction the Phase-40 planner used): gitlab-api.ts -> 'https://gitlab.com/api/v4';
// notion-api.ts is currently a stale `https://www.notion.so/api/v3/...` snapshot while
// the observed authenticated runtime is app.notion.com; slack-api.ts builds
// `${workspaceUrl}/api/${method}` off the app.slack.com origin. We scan for the FIRST
// https:// literal that carries an /api path on the plugin's own origin. Returns the
// base-URL string or null (an app with no vendored plugin uses its fallbackBaseUrl).
function readApiBaseUrl(app) {
  if (!app) { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  // Match an https:// origin optionally followed by an /api... path, inside a string
  // literal (single, double, or template-quoted). The first such literal is the base.
  const re = /https:\/\/[a-z0-9.-]+(?:\/api[a-z0-9/_.${}-]*)?/i;
  const m = text.match(re);
  return m ? m[0] : null;
}

// Some same-origin app runtimes declare only a relative API base in <app>-api.ts
// (Netlify /access-control/..., Bitbucket /!api/2.0, CircleCI /api/v2). Vercel builds
// `/api${endpoint}` inline instead of via a named constant. These are stronger
// same-origin signals, not unresolvable bases: combine the reviewed handler fallback
// origin with the relative path and keep the normal strict same-origin check.
function readRelativeApiBase(app) {
  if (!app) { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  const m = text.match(/const\s+API[A-Z0-9_]*\s*=\s*['"](\/[^'"]*)['"]/);
  if (m) { return m[1]; }
  const templatedEndpoint = text.match(/['"`](\/api(?:\/v[0-9]+)?)\$\{endpoint\}/);
  return templatedEndpoint ? templatedEndpoint[1] : null;
}

// ---- Detect a DYNAMIC per-workspace API base in a vendored <app>-api.ts (slack) -----
// slack-api.ts has no static https:// base literal; the runtime base is built as
// `${auth.workspaceUrl}/api/<method>` (slack-api.ts:431) where workspaceUrl is a
// *.slack.com subdomain resolved per workspace (app.slack.com on the new client, or
// `https://${team.domain}.slack.com` on the classic client, line 138). readApiBaseUrl
// returns null for such a file; rather than letting that null silently fall back, the
// gate PROVES the dynamic form is genuinely present so the same-registrable-domain
// accommodation is grounded in the vendored source (WR-01). Returns true only when both
// (a) the `${...workspaceUrl}/api/` interpolation AND (b) a literal *.slack.com origin
// (the classic-client per-workspace host) appear in the source. If a vendored refresh
// dropped that form, this returns false -> checkOriginClassification fails closed.
function readDynamicWorkspaceBase(app) {
  if (!app) { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  // (a) the runtime fetch base: `${...workspaceUrl}/api/...`
  const dynRe = /\$\{[^}]*workspaceUrl\s*\}\s*\/api\//;
  // (b) a literal *.slack.com per-workspace origin (proves the slack registrable family)
  const slackHostRe = /https:\/\/(?:\$\{[^}]+\}|[a-z0-9.-]+)\.slack\.com/i;
  if (dynRe.test(text) && slackHostRe.test(text)) {
    // The representative origin used for the same-registrable-domain assertion: the
    // classic-client per-workspace host carries the *.slack.com registrable domain that
    // the dynamic base resolves within. We pin it to a representative subdomain so the
    // classifier compares registrable domains (slack.com), NOT a static app.slack.com
    // (which would collapse back into the rubber-stamp the fallback caused).
    return 'https://workspace.slack.com';
  }
  return null;
}

// Snowflake's Snowsight runtime obtains the authenticated app server URL from
// page context, then uses bound specs pinned to app.snowflake.com. Accept this
// only when both the vendored helper and bundled handler show that reviewed
// page-context contract and the handler keeps SQL execution read-only.
function readSnowflakePageContextRuntimeBase(app, runtimeBaseUrl) {
  if (app !== 'snowflake' || runtimeBaseUrl !== 'https://app.snowflake.com') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'snowflake-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'snowflake.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesPageContext = /getPageGlobal\(['"]numeracy\.api\.backendHttp\.getRequestContext['"]\)/.test(apiText)
    && /ctx\.appServerUrl/.test(apiText)
    && /\/v1\/queries/.test(apiText)
    && /credentials\s*:\s*['"]include['"]/.test(apiText);
  const handlerPinsSnowsight = /Snowflake same-origin read head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/app\.snowflake\.com['"]/.test(handlerText)
    && /executeBoundPageRead/.test(handlerText)
    && /namespace\s*:\s*['"]snowflake['"]/.test(handlerText)
    && /context\.appServerUrl/.test(handlerText)
    && /origin\s*:\s*ORIGIN/.test(handlerText);
  const readOnlySql = /function\s+normalizeReadSql/.test(handlerText)
    && /first\s*===\s*['"]SELECT['"]/.test(handlerText)
    && /INSERT\|UPDATE\|DELETE\|MERGE\|CREATE\|DROP\|ALTER\|TRUNCATE/.test(handlerText);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem/.test(handlerText);
  return vendoredUsesPageContext && handlerPinsSnowsight && readOnlySql && avoidsDirectCredentialApis
    ? runtimeBaseUrl
    : null;
}

// Retool's vendored helper is intentionally relative: api(endpoint) accepts paths such
// as /api/user and fetches them from the active Retool tab while adding X-Xsrf-Token
// from the xsrfToken cookie. Keep that accommodation Retool-only and evidence-based so
// a future app with an unextractable api.ts cannot silently ride the documented origin.
function readRetoolRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'retool' || relativeRuntimeBaseUrl !== '/api') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  const hasRelativeEndpoint = /api\s*=\s*async[\s\S]*endpoint\s*:\s*string/.test(text)
    && /\$\{endpoint\}\?\$\{qs\}/.test(text);
  const hasCookieCsrf = /getCookie\(['"]xsrfToken['"]\)/.test(text)
    && /['"]X-Xsrf-Token['"]\s*:\s*xsrf/.test(text);
  return hasRelativeEndpoint && hasCookieCsrf ? relativeRuntimeBaseUrl : null;
}

// Shortcut's vendored runtime is also relative, but unlike Retool it requires a
// workspace bootstrap and Tenant-* headers. Keep this reviewed separately so another
// relative helper cannot inherit Retool's cookie-CSRF accommodation by accident.
function readShortcutRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'shortcut' || relativeRuntimeBaseUrl !== '/backend/api/v3') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  const hasRelativeEndpoint = /\/backend\/api\/v3\$\{endpoint\}/.test(text);
  const hasSlugInfoBootstrap = /\/backend\/api\/private\/user\/slug-info\/\$\{slug\}/.test(text);
  const hasTenantHeaders = /['"]Tenant-Organization2['"]\s*:\s*auth\.organizationId/.test(text)
    && /['"]Tenant-Workspace2['"]\s*:\s*auth\.workspaceId/.test(text);
  return hasRelativeEndpoint && hasSlugInfoBootstrap && hasTenantHeaders ? relativeRuntimeBaseUrl : null;
}

// Hacker News is intentionally HTML-backed: the vendored implementation documents
// HN's CSP and calls fetchText(path) against relative paths such as /news, /item,
// and /user. Keep this recognition app-specific so an unrelated plugin cannot
// inherit a documented-origin fallback just because it has no API_BASE literal.
function readHackerNewsRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'hackernews' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  const usesRelativeHtml = /fetchText\s*\(\s*path\s*\)/.test(text)
    && /parseFromString\s*\(\s*html\s*,\s*['"]text\/html['"]\s*\)/.test(text);
  const hasReviewedPaths = /fetchStoryPage\s*=\s*async[\s\S]*fetchHtml\s*\(\s*url\s*\)/.test(text)
    && /fetchItem\s*=\s*async[\s\S]*\/item\?id=/.test(text)
    && /fetchUser\s*=\s*async[\s\S]*\/user\?id=/.test(text);
  return usesRelativeHtml && hasReviewedPaths ? relativeRuntimeBaseUrl : null;
}

// Reddit's activated head is a reviewed subset of the vendored redditGet() tools:
// first-party www.reddit.com .json GET endpoints only. This proof checks that the
// new handler stays within that reviewed read-only subset before accepting the
// relative first-party runtime base.
function readRedditRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'reddit' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'reddit.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredGetIsFirstParty = /const\s+redditGet\s*=\s*async[\s\S]*new\s+URL\s*\(\s*path\s*,\s*['"]https:\/\/www\.reddit\.com['"]\s*\)/.test(apiText)
    && /credentials\s*:\s*['"]include['"]/.test(apiText);
  const handlerIsGetOnly = /Reddit same-origin GET read head/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText)
    && /reddit\.get_post/.test(handlerText)
    && /reddit\.search_subreddits/.test(handlerText);
  const avoidsMutationFlows = !/oauth\.reddit\.com|redditPost|redditOAuthPost|X-Modhash|Authorization\s*:|Bearer|svc\/shreddit\/token|method\s*:\s*['"]POST['"]/.test(handlerText)
    && !/reddit\.(hide|save|report|submit_comment|submit_post|subscribe|vote|edit_text|delete|send_message)['"]/.test(handlerText);
  return vendoredGetIsFirstParty && handlerIsGetOnly && avoidsMutationFlows
    ? relativeRuntimeBaseUrl
    : null;
}

// npm exposes public JSON for first-party page paths when the website receives the
// x-spiferack header. The vendored helper intentionally builds a relative URL from
// `path` and calls fetchFromPage(url), so the base is the npmjs.com page origin rather
// than a separate API host. Keep this recognition npm-only and source-proven.
function readNpmRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'npm' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  const hasSpiferackHelper = /export\s+const\s+spiferack\s*=\s*async[\s\S]*path\s*:\s*string/.test(text)
    && /const\s+url\s*=\s*qs\s*\?\s*`\$\{path\}\?\$\{qs\}`\s*:\s*path/.test(text);
  const hasSpiferackHeader = /['"]x-spiferack['"]\s*:\s*['"]1['"]/.test(text);
  const usesRelativeFetchFromPage = /fetchFromPage\s*\(\s*url\s*,/.test(text);
  return hasSpiferackHelper && hasSpiferackHeader && usesRelativeFetchFromPage
    ? relativeRuntimeBaseUrl
    : null;
}

// Yelp's public search/business reads are server-rendered first-party pages or
// relative first-party autocomplete JSON. The vendored helper proves both forms:
// fetchPageData(path) fetches relative HTML and extracts react_root_props, while
// fetchAutocompleteSuggestions hits /search_suggest/... on the same origin.
function readYelpRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'yelp' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  const hasRelativePageData = /fetchPageData\s*=\s*async[\s\S]*path\s*:\s*string/.test(text)
    && /fetchText\s*\(\s*url\s*,[\s\S]*Accept\s*:\s*['"]text\/html['"]/.test(text)
    && /react_root_props/.test(text);
  const hasRelativeAutocomplete = /fetchAutocompleteSuggestions\s*=\s*async[\s\S]*\/search_suggest\/v2\/prefetch/.test(text)
    && /fetchJSON<AutocompleteResponse>\s*\(/.test(text);
  return hasRelativePageData && hasRelativeAutocomplete ? relativeRuntimeBaseUrl : null;
}

// TripAdvisor's public read surface is first-party only: GraphQL posts to the
// relative /data/graphql/ids endpoint with pre-registered query IDs, while detail
// and list pages are SSR/LD+JSON HTML reads from relative paths. Keep this
// TripAdvisor-specific so `/` never becomes a generic documented-origin fallback.
function readTripadvisorRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'tripadvisor' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  const hasRelativeGraphql = /const\s+GRAPHQL_URL\s*=\s*['"]\/data\/graphql\/ids['"]/.test(text)
    && /fetchFromPage\s*\(\s*GRAPHQL_URL\s*,[\s\S]*method\s*:\s*['"]POST['"]/.test(text)
    && /preRegisteredQueryId/.test(text);
  const hasRelativeSsr = /fetchSsrData\s*=\s*async[\s\S]*path\s*:\s*string/.test(text)
    && /fetchText\s*\(\s*path\s*,[\s\S]*Accept\s*:\s*['"]text\/html['"]/.test(text)
    && /urqlSsrData/.test(text);
  const hasLdJson = /fetchLdJson\s*=\s*async/.test(text)
    && (/application\/ld\+json/.test(text) || /application\\\/ld\\\+json/.test(text));
  return hasRelativeGraphql && hasRelativeSsr && hasLdJson ? relativeRuntimeBaseUrl : null;
}

// Redfin's Stingray helper accepts relative /stingray endpoints, signs GETs with
// the same-origin RF_AUTH cookie via x-rf-secure, and strips Redfin's JSON prefix.
// This keeps the whole handler on www.redfin.com; there is no separate API origin.
function readRedfinRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'redfin' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  const toolsDir = join(VENDOR_PLUGINS, app, 'src', 'tools');
  if (!existsSync(apiFile) || !existsSync(toolsDir)) { return null; }
  const text = readFileSync(apiFile, 'utf8');
  const hasStingrayHelper = /api\s*=\s*async[\s\S]*endpoint\s*:\s*string/.test(text)
    && /fetchFromPage\s*\(\s*url\s*,\s*init\s*\)/.test(text)
    && /['"]x-rf-secure['"]\s*:\s*auth\.rfAuth/.test(text)
    && /stripJsonpPrefix/.test(text);
  const hasStingrayTools = readdirSync(toolsDir)
    .filter((name) => name.endsWith('.ts'))
    .some((name) => {
      const toolText = readFileSync(join(toolsDir, name), 'utf8');
      return /api<[\s\S]*\(\s*['"]\/stingray\//.test(toolText);
    });
  return hasStingrayHelper && hasStingrayTools ? relativeRuntimeBaseUrl : null;
}

function readMastodonRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'mastodon' || relativeRuntimeBaseUrl !== '/api/v1') { return null; }
  const toolsDir = join(VENDOR_PLUGINS, app, 'src', 'tools');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'mastodon.js');
  if (!existsSync(toolsDir) || !existsSync(handlerFile)) { return null; }

  const requiredTools = [
    ['get-status.ts', '/api/v1/statuses/${encodeURIComponent(params.status_id)}'],
    ['list-timeline.ts', "'/api/v1/timelines/home'"],
    ['create-status.ts', "'/api/v1/statuses'"],
    ['delete-status.ts', '/api/v1/statuses/${encodeURIComponent(params.status_id)}']
  ];
  let toolsOk = true;
  for (const pair of requiredTools) {
    const toolPath = join(toolsDir, pair[0]);
    if (!existsSync(toolPath)) { toolsOk = false; break; }
    const text = readFileSync(toolPath, 'utf8');
    if (text.indexOf(pair[1]) === -1) {
      toolsOk = false;
      break;
    }
  }

  const handlerText = readFileSync(handlerFile, 'utf8');
  const guardedMatch = handlerText.match(/function\s+guarded\s*\([^)]*\)\s*\{[\s\S]*?async\s+handle\s*\(\)\s*\{[\s\S]*?return\s+fallback\s*\(\s*slug\s*,\s*reason\s*\);[\s\S]*?\}\s*\};[\s\S]*?\}/);
  const guardedIsInert = !!guardedMatch && guardedMatch[0].indexOf('executeBoundSpec') === -1;
  const handlerOk = /Mastodon same-origin API head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/mastodon\.social['"]/.test(handlerText)
    && /var\s+API_BASE\s*=\s*ORIGIN\s*\+\s*['"]\/api\/v1['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /mastodon\.get_status/.test(handlerText)
    && /mastodon\.list_timeline/.test(handlerText)
    && /mastodon\.create_status/.test(handlerText)
    && /mastodon\.delete_status/.test(handlerText)
    && /unverified-mastodon-create-status-mutation/.test(handlerText)
    && /unverified-mastodon-delete-status-mutation/.test(handlerText);
  const avoidsPrivateRuntime = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer/i.test(handlerText);

  return toolsOk && guardedIsInert && handlerOk && avoidsPrivateRuntime ? relativeRuntimeBaseUrl : null;
}

// Meticulous uses first-party HttpOnly session cookies and a relative GraphQL path in
// the vendored helper. The bundled head mirrors that by pinning executeBoundSpec to
// app.meticulous.ai/api/graphql and only registering read handlers.
function readMeticulousRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'meticulous' || relativeRuntimeBaseUrl !== '/api/graphql') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'meticulous.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeGraphql = /postJSON<GraphQLResponse<T>>\(\s*['"]\/api\/graphql['"]/.test(apiText)
    && /HttpOnly session cookies/.test(apiText)
    && /interface\s+GraphQLResponse<T>/.test(apiText)
    && /GET_USER_CONTEXT/.test(apiText)
    && /GET_SESSIONS_FOR_PROJECT/.test(apiText);
  const handlerPinsGraphql = /var\s+GRAPHQL_URL\s*=\s*METICULOUS_ORIGIN\s*\+\s*['"]\/api\/graphql['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText)
    && /function\s+readHandler\s*\(/.test(handlerText);
  return vendoredUsesRelativeGraphql && handlerPinsGraphql ? relativeRuntimeBaseUrl : null;
}

// Medium uses a first-party relative /_/graphql endpoint for query reads. This
// proof is Medium-specific so a generic relative GraphQL helper cannot inherit the
// origin fallback without a reviewed handler.
function readMediumRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'medium' || relativeRuntimeBaseUrl !== '/_/graphql') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'medium.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeGraphql = /const\s+GRAPHQL_URL\s*=\s*['"]\/_\/graphql['"]/.test(apiText)
    && /fetchFromPage\s*\(\s*GRAPHQL_URL/.test(apiText)
    && /graphql-operation/.test(apiText);
  const handlerPinsGraphql = /Medium same-origin GraphQL head/.test(handlerText)
    && /var\s+GRAPHQL_URL\s*=\s*MEDIUM_ORIGIN\s*\+\s*['"]\/_\/graphql['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /graphql-operation/.test(handlerText)
    && /medium\.get_post/.test(handlerText)
    && /medium\.search_posts/.test(handlerText)
    && /guarded\(['"]medium\.clap_post['"]/.test(handlerText);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/.test(handlerText);
  return vendoredUsesRelativeGraphql && handlerPinsGraphql && avoidsDirectCredentialApis
    ? relativeRuntimeBaseUrl
    : null;
}

// Coinbase uses a first-party relative /graphql/query endpoint for query reads.
// Keep this proof Coinbase-specific so relative GraphQL does not become a generic
// documented-origin fallback.
function readCoinbaseRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'coinbase' || relativeRuntimeBaseUrl !== '/graphql/query') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'coinbase.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeGraphql = /const\s+GQL_ENDPOINT\s*=\s*['"]\/graphql\/query['"]/.test(apiText)
    && /fetchFromPage\s*\(\s*GQL_ENDPOINT/.test(apiText)
    && /HttpOnly session cookies/.test(apiText);
  const handlerPinsGraphql = /Coinbase same-origin GraphQL head/.test(handlerText)
    && /var\s+GRAPHQL_URL\s*=\s*ORIGIN\s*\+\s*['"]\/graphql\/query['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /coinbase\.get_asset_by_uuid/.test(handlerText)
    && /guarded\(['"]coinbase\.create_watchlist['"]/.test(handlerText);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/.test(handlerText);
  return vendoredUsesRelativeGraphql && handlerPinsGraphql && avoidsDirectCredentialApis
    ? relativeRuntimeBaseUrl
    : null;
}

// Amplitude uses a first-party relative GraphQL runtime scoped by org id:
// /t/graphql/org/{orgId}?q={operationName}. Keep this proof Amplitude-specific
// so relative GraphQL does not become a generic documented-origin fallback.
function readAmplitudeRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'amplitude' || relativeRuntimeBaseUrl !== '/t/graphql/org') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'amplitude.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeGraphql = /\/t\/graphql\/org\/\$\{auth\.orgId\}\?q=\$\{operationName\}/.test(apiText)
    && /fetchFromPage\s*\(\s*url\s*,\s*init\s*\)/.test(apiText)
    && /['"]X-Org['"]\s*:\s*auth\.orgId/.test(apiText);
  const handlerPinsGraphql = /Amplitude same-origin GraphQL READ head/.test(handlerText)
    && /var\s+GRAPHQL_PATH_PREFIX\s*=\s*['"]\/t\/graphql\/org\/['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText)
    && /amplitude\.get_org_data/.test(handlerText)
    && !/amplitude\.check_permissions['"]\s*:/.test(handlerText);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer/i.test(handlerText);
  return vendoredUsesRelativeGraphql && handlerPinsGraphql && avoidsDirectCredentialApis
    ? relativeRuntimeBaseUrl
    : null;
}

// New Relic uses the one.newrelic.com first-party NerdGraph proxy. Keep this
// proof New Relic-specific so relative /graphql is not accepted for arbitrary
// GraphQL apps without a reviewed same-origin read handler.
function readNewrelicRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'newrelic' || relativeRuntimeBaseUrl !== '/graphql') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'newrelic.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesSameOriginNerdGraph = /const\s+GRAPHQL_URL\s*=\s*['"]https:\/\/one\.newrelic\.com\/graphql['"]/.test(apiText)
    && /fetchFromPage\s*\(\s*GRAPHQL_URL/.test(apiText)
    && /newrelic-requesting-services/.test(apiText)
    && /x-requested-with/.test(apiText)
    && /HttpOnly session cookies/.test(apiText);
  const handlerPinsNerdGraph = /New Relic same-origin NerdGraph read head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/one\.newrelic\.com['"]/.test(handlerText)
    && /var\s+GRAPHQL_URL\s*=\s*ORIGIN\s*\+\s*['"]\/graphql['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText)
    && /newrelic-requesting-services/.test(handlerText)
    && /newrelic\.run_nrql_query/.test(handlerText)
    && /newrelic-read-only-nrql-required/.test(handlerText)
    && !/mutation\s+/.test(handlerText);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer/i.test(handlerText);
  return vendoredUsesSameOriginNerdGraph && handlerPinsNerdGraph && avoidsDirectCredentialApis
    ? relativeRuntimeBaseUrl
    : null;
}

function readDatadogRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'datadog' || relativeRuntimeBaseUrl !== '/api') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'datadog.js');
  const monitorToolFile = join(VENDOR_PLUGINS, app, 'src', 'tools', 'list-monitors.ts');
  const userToolFile = join(VENDOR_PLUGINS, app, 'src', 'tools', 'list-users.ts');
  if (!existsSync(apiFile) || !existsSync(handlerFile) ||
      !existsSync(monitorToolFile) || !existsSync(userToolFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const monitorToolText = readFileSync(monitorToolFile, 'utf8');
  const userToolText = readFileSync(userToolFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeApi = /export\s+const\s+apiGet\s*=\s*async/.test(apiText)
    && /\$\{endpoint\}\?\$\{qs\}/.test(apiText)
    && /fetchJSON<T>\(url\)/.test(apiText)
    && /apiGet<Array<Record<string, unknown>>>\s*\(['"]\/api\/v1\/monitor['"]/.test(monitorToolText)
    && /apiGet<\{ data\?: Array<Record<string, unknown>> \}>\s*\(['"]\/api\/v2\/users['"]/.test(userToolText);
  const promotedSlugs = [
    'datadog.get_current_user',
    'datadog.get_dashboard',
    'datadog.get_monitor',
    'datadog.get_slo',
    'datadog.list_dashboards',
    'datadog.list_monitors',
    'datadog.list_services',
    'datadog.query_metrics',
    'datadog.search_monitors'
  ];
  const excludedSlugs = [
    'datadog.clone_dashboard',
    'datadog.clone_monitor',
    'datadog.search_logs',
    'datadog.cancel_downtime',
    'datadog.create_monitor',
    'datadog.delete_monitor',
    'datadog.update_monitor',
    'datadog.mute_monitor',
    'datadog.unmute_monitor'
  ];
  const hasReviewedHandler = /Datadog same-origin GET read head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/app\.datadoghq\.com['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; });
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization|Bearer|method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer)\b/i.test(handlerText);

  return vendoredUsesRelativeApi && hasReviewedHandler && promotedOk && excludedOk
    && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

// Instacart uses a first-party relative /graphql endpoint for persisted-query
// reads. Keep this proof app-specific because the broader vendored helper also
// contains mutations and page-cache helpers that this bundled head does not ship.
function readInstacartRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'instacart' || relativeRuntimeBaseUrl !== '/graphql') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'instacart-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'instacart.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeGraphql = /const\s+GQL_ENDPOINT\s*=\s*['"]\/graphql['"]/.test(apiText)
    && /fetchJSON<[\s\S]*>\(url,\s*init\)/.test(apiText)
    && /method:\s*['"]GET['"]/.test(apiText)
    && /operationName/.test(apiText)
    && /persistedQuery/.test(apiText);
  const handlerPinsGraphql = /Instacart same-origin GraphQL READ head/.test(handlerText)
    && /var\s+INSTACART_ORIGIN\s*=\s*['"]https:\/\/www\.instacart\.com['"]/.test(handlerText)
    && /var\s+GQL_URL\s*=\s*INSTACART_ORIGIN\s*\+\s*['"]\/graphql['"]/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText);
  const promotedSlugs = [
    'instacart.get_current_user',
    'instacart.list_addresses',
    'instacart.list_active_carts',
    'instacart.get_cart',
    'instacart.list_orders',
    'instacart.get_order'
  ];
  const excludedSlugs = [
    'instacart.delete_cart',
    'instacart.get_location_context',
    'instacart.get_product',
    'instacart.navigate_to_checkout',
    'instacart.search_products',
    'instacart.update_cart_items'
  ];
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; });
  const avoidsPrivateRuntime = !/getPageGlobal|waitUntil|fetchJSON|ToolError|gqlMutation|isAuthenticated|getLocationContext|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)/i.test(handlerText);
  return vendoredUsesRelativeGraphql && handlerPinsGraphql
    && promotedOk && excludedOk && avoidsPrivateRuntime
    ? relativeRuntimeBaseUrl
    : null;
}

// X has an authenticated same-origin GraphQL runtime in the vendored plugin, but
// this quick head intentionally uses only public first-party HTML pages. Keep the
// proof X-specific and source-grounded in the reviewed handler so the relative
// page-read override cannot become a generic fallback for social apps.
function readXRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'x' || relativeRuntimeBaseUrl !== '/') { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'x.js');
  if (!existsSync(handlerFile)) { return null; }
  const text = readFileSync(handlerFile, 'utf8');
  const hasPublicHtmlGuard = /X public same-origin READ head/.test(text)
    && /['"]Accept['"]\s*:\s*['"]text\/html['"]/.test(text)
    && /parseLdJsonObjects/.test(text)
    && /x\.get_tweet/.test(text)
    && /x\.get_user_profile/.test(text);
  const avoidsGraphqlAuth = !/GRAPHQL_BASE|authorization\s*:|Bearer|getCookie|ct0|x-csrf-token|x-client-transaction-id/i.test(text);
  return hasPublicHtmlGuard && avoidsGraphqlAuth ? relativeRuntimeBaseUrl : null;
}

// Instagram has authenticated runtimes in the vendored plugin, but this quick head
// intentionally uses only public first-party pages and public topsearch JSON. Keep
// the proof Instagram-specific so social-app private runtimes do not inherit a
// documented-origin fallback.
function readInstagramRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'instagram' || relativeRuntimeBaseUrl !== '/') { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'instagram.js');
  if (!existsSync(handlerFile)) { return null; }
  const handlerText = readFileSync(handlerFile, 'utf8');
  const hasPublicPageGuard = /Instagram public same-origin READ head/.test(handlerText)
    && /headers\s*:\s*\{\s*['"]Accept['"]\s*:\s*accept\s*\}/.test(handlerText)
    && /spec\s*\(\s*path\s*,\s*['"]text\/html['"]\s*\)/.test(handlerText)
    && /spec\s*\(\s*['"]\/web\/search\/topsearch\//.test(handlerText)
    && /['"]application\/json['"]/.test(handlerText)
    && /instagram\.get_post/.test(handlerText)
    && /instagram\.get_user_profile/.test(handlerText)
    && /instagram\.search_users/.test(handlerText);
  const avoidsPrivateRuntime = !/\/api\/v1|X-CSRFToken|X-IG-App-ID|csrftoken|ds_user_id|getCookie|document\.cookie|localStorage|sessionStorage|Authorization|Bearer/i.test(handlerText);
  return hasPublicPageGuard && avoidsPrivateRuntime ? relativeRuntimeBaseUrl : null;
}

// TikTok has signed/authenticated API helpers in the vendored plugin. This head
// intentionally exposes only public first-party SSR page reads; signed API rows stay
// inert guarded entries.
function readTiktokRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'tiktok' || relativeRuntimeBaseUrl !== '/') { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'tiktok.js');
  if (!existsSync(handlerFile)) { return null; }
  const handlerText = readFileSync(handlerFile, 'utf8');
  const hasPublicSsrGuard = /TikTok public same-origin READ head/.test(handlerText)
    && /__UNIVERSAL_DATA_FOR_REHYDRATION__/.test(handlerText)
    && /headers\s*:\s*\{\s*['"]Accept['"]\s*:\s*['"]text\/html['"]\s*\}/.test(handlerText)
    && /tiktok\.get_user_profile/.test(handlerText)
    && /tiktok\.get_video/.test(handlerText);
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1
    && guardedFunction[0].indexOf('executeBoundPageRead') === -1;
  const avoidsPrivateRuntime = !/frontierSign|X-Bogus|getCookie|getPageGlobal|tt_csrf_token|byted_acrawler|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)/i.test(handlerText);
  return hasPublicSsrGuard && guardedIsInert && avoidsPrivateRuntime ? relativeRuntimeBaseUrl : null;
}

// Facebook's vendored plugin uses authenticated Relay/private social runtimes. This
// quick head intentionally exposes only reviewed same-origin HTML reads and inert
// guarded mutation placeholders.
function readFacebookRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'facebook' || relativeRuntimeBaseUrl !== '/') { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'facebook.js');
  if (!existsSync(handlerFile)) { return null; }
  const handlerText = readFileSync(handlerFile, 'utf8');
  const promotedSlugs = [
    'facebook.get_current_user',
    'facebook.search_marketplace'
  ];
  const guardedSlugs = [
    'facebook.confirm_friend_request',
    'facebook.delete_friend_request',
    'facebook.react_to_post'
  ];
  const excludedSlugs = [
    'facebook.get_user_profile',
    'facebook.get_user_posts',
    'facebook.get_reactions',
    'facebook.list_events',
    'facebook.list_friend_requests',
    'facebook.list_groups',
    'facebook.list_notifications',
    'facebook.list_saved'
  ];
  const hasPublicHtmlGuard = /Facebook conservative same-origin READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/www\.facebook\.com['"]/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /headers\s*:\s*\{\s*['"]Accept['"]\s*:\s*['"]text\/html['"]\s*\}/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; })
    && !/['"]facebook\.search['"]/.test(handlerText);
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1
    && guardedFunction[0].indexOf('executeBoundPageRead') === -1;
  const avoidsPrivateRuntime = !/\/api\/graphql\/|fb_dtsg|lsd|doc_id|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)/i.test(handlerText);
  return hasPublicHtmlGuard && promotedOk && guardedOk && excludedOk && guardedIsInert && avoidsPrivateRuntime
    ? relativeRuntimeBaseUrl
    : null;
}

// Stack Overflow's vendored helper uses api.stackexchange.com, which is not a
// same-origin runtime for stackoverflow.com. This quick head deliberately ignores
// that helper and uses only public first-party HTML pages. Keep the proof
// Stack Overflow-specific and grounded in the reviewed handler.
function readStackOverflowRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'stackoverflow' || relativeRuntimeBaseUrl !== '/') { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'stackoverflow.js');
  if (!existsSync(handlerFile)) { return null; }
  const text = readFileSync(handlerFile, 'utf8');
  const hasPublicHtmlGuard = /Stack Overflow public same-origin HTML READ head/.test(text)
    && /['"]Accept['"]\s*:\s*['"]text\/html['"]/.test(text)
    && /s-post-summary--content-title/.test(text)
    && /js-post-body/.test(text)
    && /stackoverflow\.get_question/.test(text)
    && /stackoverflow\.search_questions/.test(text)
    && /stackoverflow\.list_tags/.test(text);
  const avoidsStackExchangeApi = !/api\.stackexchange\.com|\bfetch\s*\(|XMLHttpRequest|Authorization|Bearer|getPageGlobal|localStorage|sessionStorage/.test(text);
  return hasPublicHtmlGuard && avoidsStackExchangeApi ? relativeRuntimeBaseUrl : null;
}

// Target's vendored helper uses several target.com subdomains for the broader
// authenticated plugin surface. This quick head deliberately ignores those hosts
// and uses only first-party public HTML page reads on www.target.com.
function readTargetRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'target' || relativeRuntimeBaseUrl !== '/') { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'target.js');
  if (!existsSync(handlerFile)) { return null; }
  const text = readFileSync(handlerFile, 'utf8');
  const promotedSlugs = [
    'target.search_products',
    'target.get_product'
  ];
  const excludedSlugs = [
    'target.add_to_cart',
    'target.apply_promo_code',
    'target.find_nearby_stores',
    'target.get_cart',
    'target.get_current_user',
    'target.get_loyalty_details',
    'target.get_order',
    'target.get_savings_summary',
    'target.get_shopping_list',
    'target.get_store',
    'target.list_favorites',
    'target.list_orders',
    'target.list_shopping_lists',
    'target.navigate_to_checkout',
    'target.remove_cart_item',
    'target.update_cart_item_quantity'
  ];
  const hasPublicHtmlGuard = /Target public same-origin HTML READ head/.test(text)
    && /var\s+TARGET_ORIGIN\s*=\s*['"]https:\/\/www\.target\.com['"]/.test(text)
    && /headers\s*:\s*\{\s*['"]Accept['"]\s*:\s*['"]text\/html['"]\s*\}/.test(text)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(text)
    && /htmlSpec\(\s*['"]\/s['"]/.test(text)
    && /htmlSpec\(\s*['"]\/p\/-\/A-['"]/.test(text);
  const promotedOk = promotedSlugs.every(function(slug) { return text.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return text.indexOf(slug) === -1; });
  const avoidsTargetApiBridge = !/api\.target\.com|redsky\.target\.com|carts\.target\.com|typeahead\.target\.com|visitorId|x-api-key|getCookie|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)/i.test(text);
  return hasPublicHtmlGuard && promotedOk && excludedOk && avoidsTargetApiBridge
    ? relativeRuntimeBaseUrl
    : null;
}

// Walmart's vendored helper uses first-party public page data for product/search/
// store reads and separate account helpers for authenticated state. This head
// activates only the reviewed public __NEXT_DATA__ page-read subset.
function readWalmartRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'walmart' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'walmart-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'walmart.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const apiUsesPageData = /fetchPageData/.test(apiText)
    && /https:\/\/www\.walmart\.com\$\{path\}/.test(apiText)
    && /fetchFromPage\(url,\s*init\)/.test(apiText)
    && /accept\s*:\s*['"]text\/html['"]/.test(apiText)
    && /__NEXT_DATA__/.test(apiText);
  const requiredTools = [
    ['search-products.ts', "fetchPageData('/search'"],
    ['get-product.ts', 'fetchPageData(`/ip/item/${params.us_item_id}`)'],
    ['get-product-reviews.ts', 'fetchPageData(`/ip/item/${params.us_item_id}`)'],
    ['get-store.ts', 'fetchPageData(`/store/${params.store_id}`)']
  ];
  let toolsOk = true;
  for (const pair of requiredTools) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath) || readFileSync(toolPath, 'utf8').indexOf(pair[1]) === -1) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'walmart.search_products',
    'walmart.get_product',
    'walmart.get_product_reviews',
    'walmart.get_store'
  ];
  const excludedSlugs = [
    'walmart.get_cart',
    'walmart.get_current_user',
    'walmart.list_orders',
    'walmart.navigate_to_checkout',
    'walmart.navigate_to_product',
    'walmart.navigate_to_search'
  ];
  const hasPublicHtmlGuard = /Walmart public same-origin HTML READ head/.test(handlerText)
    && /var\s+WALMART_ORIGIN\s*=\s*['"]https:\/\/www\.walmart\.com['"]/.test(handlerText)
    && /headers\s*:\s*\{\s*['"]Accept['"]\s*:\s*['"]text\/html['"]\s*\}/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /htmlSpec\(\s*['"]\/search['"]/.test(handlerText)
    && /htmlSpec\(\s*['"]\/ip\/item\/['"]/.test(handlerText)
    && /htmlSpec\(\s*['"]\/store\/['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; });
  const avoidsPrivateRuntime = !/orchestra\/api|bootstrapData|fetchBootstrapData|getCustomerInfo|isAuthenticated|getAuthCache|setAuthCache|waitUntil|getCookie|hasCID|ceid|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource|window\.location|document\.querySelector|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)/i.test(handlerText);
  return apiUsesPageData && toolsOk && hasPublicHtmlGuard
    && promotedOk && excludedOk && avoidsPrivateRuntime
    ? relativeRuntimeBaseUrl
    : null;
}

// Etsy's hand slice exposes a small first-party /v1 helper surface. The cart and
// checkout rows stay guarded fail-closed, so this proof accepts only the reviewed
// read calls plus inert guarded write registrations.
function readEtsyRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'etsy' || relativeRuntimeBaseUrl !== '/v1') { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'etsy.js');
  const pluginFile = join(VENDOR_PLUGINS, app, 'src', 'index.ts');
  if (!existsSync(handlerFile) || !existsSync(pluginFile)) { return null; }
  const handlerText = readFileSync(handlerFile, 'utf8');
  const pluginText = readFileSync(pluginFile, 'utf8');
  const requiredTools = [
    ['search-listings.ts', "/v1/listings/search"],
    ['get-listing.ts', "/v1/listings/${params.listing_id}"],
    ['list-orders.ts', "/v1/orders"],
    ['add-to-cart.ts', "/v1/cart/items"],
    ['checkout.ts', "/v1/cart/checkout"]
  ];
  let toolsOk = /\*:\/\/www\.etsy\.com\/\*/.test(pluginText);
  for (const pair of requiredTools) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath) || readFileSync(toolPath, 'utf8').indexOf(pair[1]) === -1) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'etsy.search_listings',
    'etsy.get_listing',
    'etsy.list_orders'
  ];
  const guardedSlugs = [
    'etsy.add_to_cart',
    'etsy.checkout'
  ];
  const hasReviewedHandler = /Etsy same-origin marketplace READ head/.test(handlerText)
    && /var\s+ETSY_ORIGIN\s*=\s*['"]https:\/\/www\.etsy\.com['"]/.test(handlerText)
    && /var\s+API_BASE\s*=\s*ETSY_ORIGIN\s*\+\s*['"]\/v1['"]/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /headers\s*:\s*\{\s*['"]Accept['"]\s*:\s*['"]application\/json['"]\s*\}/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsPrivateRuntime = !/document\.cookie|localStorage|sessionStorage|Authorization|Bearer|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|window\.location|document\.querySelector/i.test(handlerText);
  return toolsOk && hasReviewedHandler && promotedOk && guardedOk && guardedIsInert && avoidsPrivateRuntime
    ? relativeRuntimeBaseUrl
    : null;
}

// Expedia's vendored helper includes authenticated typeahead and GraphQL reads,
// but this head activates only deterministic first-party search-page URL reads.
// Keep the proof Expedia-specific so travel-account or booking runtimes do not
// inherit a generic documented-origin fallback.
function readExpediaRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'expedia' || relativeRuntimeBaseUrl !== '/') { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'expedia.js');
  if (!existsSync(handlerFile)) { return null; }
  const handlerText = readFileSync(handlerFile, 'utf8');
  const requiredTools = [
    ['search-flights.ts', '/Flights-Search'],
    ['search-car-rentals.ts', '/Cars-Search'],
    ['search-packages.ts', '/Vacation-Packages-Search'],
    ['search-activities.ts', '/Activities-Search'],
    ['search-cruises.ts', '/Cruise-Search'],
    ['navigate-to-hotel.ts', '/Hotel-Search']
  ];
  let toolsOk = true;
  for (const pair of requiredTools) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath)) { toolsOk = false; break; }
    const text = readFileSync(toolPath, 'utf8');
    if (text.indexOf(pair[1]) === -1 || !/window\.location\.href\s*=\s*url/.test(text)) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'expedia.navigate_to_hotel',
    'expedia.search_activities',
    'expedia.search_car_rentals',
    'expedia.search_cruises',
    'expedia.search_flights',
    'expedia.search_packages'
  ];
  const excludedSlugs = [
    'expedia.get_current_user',
    'expedia.list_trips',
    'expedia.navigate_to_account',
    'expedia.navigate_to_trips',
    'expedia.search_hotels',
    'expedia.search_locations'
  ];
  const hasPublicHtmlGuard = /Expedia public same-origin search-page READ head/.test(handlerText)
    && /var\s+EXPEDIA_ORIGIN\s*=\s*['"]https:\/\/www\.expedia\.com['"]/.test(handlerText)
    && /headers\s*:\s*\{\s*['"]Accept['"]\s*:\s*['"]text\/html['"]\s*\}/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /htmlSpec\(\s*path\s*\)/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; });
  const avoidsPrivateRuntime = !/\/graphql|\/api\/v4\/typeahead|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource|getPageGlobal|window\.location/i.test(handlerText);
  return toolsOk && hasPublicHtmlGuard && promotedOk && excludedOk && avoidsPrivateRuntime
    ? relativeRuntimeBaseUrl
    : null;
}

// Booking's vendored helper includes SSR auth detection and CSRF-bearing GraphQL,
// but this head activates only public first-party HTML search/property reads.
// Keep the accommodation Booking-specific so account/trip/wishlist rows cannot
// inherit a generic documented-origin fallback.
function readBookingRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'booking' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'booking-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'booking.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const toolFiles = [
    'search-properties.ts',
    'search-destinations.ts',
    'get-property.ts',
    'get-property-reviews.ts',
    'navigate-to-search.ts',
    'navigate-to-property.ts'
  ];
  let toolsOk = /export\s+const\s+buildSearchUrl/.test(apiText)
    && /\/searchresults\.html\?\$\{qs\}/.test(apiText);
  for (const tool of toolFiles) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', tool);
    if (!existsSync(toolPath)) { toolsOk = false; break; }
    const text = readFileSync(toolPath, 'utf8');
    if (tool === 'navigate-to-property.ts') {
      if (text.indexOf('https://www.booking.com/hotel/') === -1 ||
          !/window\.location\.href\s*=\s*url/.test(text)) {
        toolsOk = false;
        break;
      }
    } else if (text.indexOf('buildSearchUrl') === -1 &&
        text.indexOf('/searchresults.html?ss=') === -1) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'booking.get_property',
    'booking.get_property_reviews',
    'booking.navigate_to_property',
    'booking.navigate_to_search',
    'booking.search_destinations',
    'booking.search_properties'
  ];
  const excludedSlugs = [
    'booking.get_current_user',
    'booking.get_genius_status',
    'booking.list_trips',
    'booking.list_wishlists'
  ];
  const hasPublicHtmlGuard = /Booking\.com public same-origin HTML READ head/.test(handlerText)
    && /var\s+BOOKING_ORIGIN\s*=\s*['"]https:\/\/www\.booking\.com['"]/.test(handlerText)
    && /headers\s*:\s*\{\s*['"]Accept['"]\s*:\s*['"]text\/html['"]\s*\}/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /htmlSpec\(\s*path\s*\)/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; });
  const avoidsPrivateRuntime = !/\/dml\/graphql|x-booking-csrf-token|csrfToken|getAuthCache|setAuthCache|clearAuthCache|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|getPageGlobal|window\.location|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)/i.test(handlerText);
  return toolsOk && hasPublicHtmlGuard && promotedOk && excludedOk && avoidsPrivateRuntime
    ? relativeRuntimeBaseUrl
    : null;
}

// StubHub's vendored source is a metadata-only slice, but the tool files preserve
// the upstream relative GET paths. The reviewed head activates only those read
// paths and deliberately excludes the money-moving ticket purchase op.
function readStubHubRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'stubhub' || relativeRuntimeBaseUrl !== '/') { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'stubhub.js');
  if (!existsSync(handlerFile)) { return null; }
  const handlerText = readFileSync(handlerFile, 'utf8');
  const requiredTools = [
    ['search-events.ts', '/search/catalog/events', 'GET'],
    ['get-listing.ts', '/inventory/listings/', 'GET'],
    ['list-orders.ts', '/orders', 'GET'],
    ['buy-tickets.ts', '/orders', 'POST']
  ];
  let toolsOk = true;
  for (const pair of requiredTools) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath)) { toolsOk = false; break; }
    const text = readFileSync(toolPath, 'utf8');
    if (text.indexOf(pair[1]) === -1 || text.indexOf('api ' + pair[2]) === -1) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'stubhub.search_events',
    'stubhub.get_listing',
    'stubhub.list_orders'
  ];
  const excludedSlugs = [
    'stubhub.buy_tickets'
  ];
  const hasReviewedHandler = /StubHub same-origin T1 read head/.test(handlerText)
    && /var\s+STUBHUB_ORIGIN\s*=\s*['"]https:\/\/www\.stubhub\.com['"]/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /\/search\/catalog\/events/.test(handlerText)
    && /\/inventory\/listings\//.test(handlerText)
    && /\/orders/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; });
  const avoidsPrivateRuntime = !/method\s*:\s*['"]POST['"]|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource|window\.location|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)/i.test(handlerText);
  return toolsOk && hasReviewedHandler && promotedOk && excludedOk && avoidsPrivateRuntime
    ? relativeRuntimeBaseUrl
    : null;
}

function readKayakRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'kayak' || relativeRuntimeBaseUrl !== '/v1') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'kayak-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'kayak.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredIsMetadataOnly = /metadata-only/.test(apiText)
    && /export\s+const\s+api\s*=/.test(apiText)
    && /POST for the price-alert write/.test(apiText);
  const hasReviewedHandler = /Kayak same-origin head/.test(handlerText)
    && /var\s+KAYAK_ORIGIN\s*=\s*['"]https:\/\/www\.kayak\.com['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = [
    'kayak.search_flights',
    'kayak.search_hotels',
    'kayak.get_price_alert',
    '/v1/flights/search',
    '/v1/hotels/search',
    '/v1/price-alerts/'
  ].every(function(needle) { return handlerText.indexOf(needle) !== -1; });
  const guardedOk = handlerText.indexOf("'kayak.create_price_alert': guarded('kayak.create_price_alert'") !== -1;
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredIsMetadataOnly && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readOpentableRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'opentable' || relativeRuntimeBaseUrl !== '/v1') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'opentable-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'opentable.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredIsMetadataOnly = /metadata-only/.test(apiText)
    && /export\s+const\s+api\s*=/.test(apiText)
    && /RESERVING a table POSTs/.test(apiText);
  const hasReviewedHandler = /OpenTable same-origin T1 head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/www\.opentable\.com['"]/.test(handlerText)
    && /var\s+API_BASE\s*=\s*ORIGIN\s*\+\s*['"]\/v1['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = [
    'opentable.search_restaurants',
    'opentable.get_restaurant',
    'opentable.list_reservations',
    '/restaurants/search',
    '/restaurants/',
    '/reservations'
  ].every(function(needle) { return handlerText.indexOf(needle) !== -1; });
  const guardedOk = handlerText.indexOf("'opentable.reserve_table': guarded('opentable.reserve_table'") !== -1
    && handlerText.indexOf("'opentable.cancel_reservation': guarded('opentable.cancel_reservation'") !== -1;
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredIsMetadataOnly && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readGrubhubRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'grubhub' || relativeRuntimeBaseUrl !== '/v1') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'grubhub-api.ts');
  const toolsDir = join(VENDOR_PLUGINS, app, 'src', 'tools');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'grubhub.js');
  if (!existsSync(apiFile) || !existsSync(toolsDir) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredIsMetadataOnly = /metadata-only/.test(apiText)
    && /export\s+const\s+api\s*=/.test(apiText)
    && /export\s+const\s+apiVoid\s*=/.test(apiText)
    && /default method GET/.test(apiText)
    && /apiVoid[\s\S]*DELETE/.test(apiText);
  const requiredTools = [
    ['list-restaurants.ts', '/v1/restaurants', /api<[\s\S]*>\(/],
    ['get-restaurant.ts', '/v1/restaurants/${params.restaurant_id}', /api<[\s\S]*>\(/],
    ['list-orders.ts', '/v1/orders', /api<[\s\S]*>\(/],
    ['place-order.ts', '/v1/orders', /method\s*:\s*['"]POST['"]/],
    ['cancel-order.ts', '/v1/orders/${params.order_id}', /method\s*:\s*['"]DELETE['"]/]
  ];
  let toolsOk = true;
  for (const item of requiredTools) {
    const toolPath = join(toolsDir, item[0]);
    if (!existsSync(toolPath)) { toolsOk = false; break; }
    const text = readFileSync(toolPath, 'utf8');
    if (text.indexOf(item[1]) === -1 || !item[2].test(text)) {
      toolsOk = false;
      break;
    }
  }
  const hasReviewedHandler = /Grubhub same-origin T1 head/.test(handlerText)
    && /var\s+GRUBHUB_ORIGIN\s*=\s*['"]https:\/\/www\.grubhub\.com['"]/.test(handlerText)
    && /function\s+apiSpec\s*\(/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = [
    'grubhub.list_restaurants',
    'grubhub.get_restaurant',
    'grubhub.list_orders',
    '/v1/restaurants',
    '/v1/restaurants/',
    '/v1/orders'
  ].every(function(needle) { return handlerText.indexOf(needle) !== -1; });
  const guardedOk = /['"]grubhub\.place_order['"]\s*:\s*guarded\s*\(\s*['"]grubhub\.place_order['"]/.test(handlerText)
    && /['"]grubhub\.cancel_order['"]\s*:\s*guarded\s*\(\s*['"]grubhub\.cancel_order['"]/.test(handlerText)
    && /unverified-grubhub-paid-order-mutation/.test(handlerText)
    && /unverified-grubhub-cancel-order-mutation/.test(handlerText);
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|csrfSource|Authorization|Bearer|method\s*:\s*['"]POST['"]|method\s*:\s*['"]DELETE['"]/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredIsMetadataOnly && toolsOk && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

// Pinterest's vendored runtime builds first-party relative /resource/<name>/...
// URLs and adds web-app headers plus csrftoken CSRF. Keep this reviewed
// Pinterest-only so a relative resource helper cannot inherit the documented
// origin fallback without a handler proof.
function readPinterestRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'pinterest' || relativeRuntimeBaseUrl !== '/resource') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', app + '-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'pinterest.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeResourceApi = /\/resource\/\$\{resource\}\/get\//.test(apiText)
    && /source_url=\$\{encodeURIComponent\(sourceUrl\)\}/.test(apiText)
    && /data=\$\{data\}/.test(apiText)
    && /fetchFromPage\s*\(\s*url\s*,\s*\{\s*headers\s*\}/.test(apiText)
    && /resourcePost\s*=\s*async[\s\S]*\/resource\/\$\{resource\}\/\$\{action\}\//.test(apiText);
  const handlerPinsResourceApi = /Pinterest same-origin resource READ head/.test(handlerText)
    && /var\s+RESOURCE_BASE\s*=\s*PINTEREST_ORIGIN\s*\+\s*['"]\/resource\/['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /csrfSource\s*:\s*\{\s*from\s*:\s*['"]cookie['"]\s*,\s*selector\s*:\s*['"]csrftoken['"]\s*,\s*header\s*:\s*['"]X-CSRFToken['"]\s*\}/.test(handlerText)
    && /pinterest\.search_pins/.test(handlerText)
    && /pinterest\.get_current_user/.test(handlerText)
    && /guarded\(['"]pinterest\.save_pin['"]/.test(handlerText);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/.test(handlerText);
  return vendoredUsesRelativeResourceApi && handlerPinsResourceApi && avoidsDirectCredentialApis
    ? relativeRuntimeBaseUrl
    : null;
}

// Domino's web BFF uses a first-party relative GraphQL endpoint. Keep the
// accommodation app-specific and prove the handler only exposes read queries.
function readDominosRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'dominos' || relativeRuntimeBaseUrl !== '/api/web-bff/graphql') { return null; }
  const apiFile = join(ROOT, 'vendor', 'opentabs-snapshot', 'plugins', 'dominos', 'src', 'dominos-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'dominos.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeGraphql = /const\s+GQL_ENDPOINT\s*=\s*['"]\/api\/web-bff\/graphql['"]/.test(apiText);
  const handlerPinsGraphql = /Domino's same-origin GraphQL READ head/.test(handlerText)
    && /GQL_URL\s*=\s*DOMINOS_ORIGIN\s*\+\s*['"]\/api\/web-bff\/graphql['"]/.test(handlerText)
    && /dominos\.search_address/.test(handlerText)
    && /dominos\.get_menu_categories/.test(handlerText)
    && !/mutation\s+(?:AddDealToCart|QuickAddProductMenu|CreateCart|RemoveDeal|UpdateProductQuantity)/.test(handlerText)
    && !/dominos\.place_order_cash/.test(handlerText);
  return vendoredUsesRelativeGraphql && handlerPinsGraphql ? relativeRuntimeBaseUrl : null;
}

function readPandaExpressRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'panda-express' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'panda-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'pandaexpress.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeOlo = /Panda Express uses Olo \(NomNom\) APIs proxied through the same origin/.test(apiText)
    && /getLocalStorage\(['"]persist:root['"]\)/.test(apiText)
    && /fetch\(url,[\s\S]*credentials\s*:\s*['"]include['"]/.test(apiText);
  const requiredTools = [
    ['find-restaurants.ts', '/restaurants/near'],
    ['get-restaurant.ts', '/restaurants/byslug/${params.slug}'],
    ['get-restaurant.ts', '/restaurants/byref/${params.ext_ref}'],
    ['get-restaurant-menu.ts', '/restaurants/${params.restaurant_id}/menu'],
    ['get-product-modifiers.ts', '/products/${params.product_id}/modifiers']
  ];
  let toolsOk = true;
  for (const pair of requiredTools) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath)) { toolsOk = false; break; }
    const text = readFileSync(toolPath, 'utf8');
    if (text.indexOf(pair[1]) === -1 || !/api<[\s\S]*>\(/.test(text) || /getRequiredAuthToken|waitForAuth/.test(text)) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'pandaexpress.find_restaurants',
    'pandaexpress.get_restaurant',
    'pandaexpress.get_restaurant_menu',
    'pandaexpress.get_product_modifiers'
  ];
  const excludedSlugs = [
    'pandaexpress.add_product_to_basket',
    'pandaexpress.apply_coupon',
    'pandaexpress.cancel_order',
    'pandaexpress.create_basket',
    'pandaexpress.get_basket',
    'pandaexpress.get_billing_accounts',
    'pandaexpress.get_checkout_summary',
    'pandaexpress.get_favorites',
    'pandaexpress.get_loyalty_rewards',
    'pandaexpress.get_recent_orders',
    'pandaexpress.get_user_profile',
    'pandaexpress.navigate_to_checkout',
    'pandaexpress.remove_coupon',
    'pandaexpress.update_product_quantity'
  ];
  const hasReviewedHandler = /Panda Express public same-origin READ head/.test(handlerText)
    && /var\s+PANDAEXPRESS_ORIGIN\s*=\s*['"]https:\/\/www\.pandaexpress\.com['"]/.test(handlerText)
    && /function\s+oloSpec\s*\(/.test(handlerText)
    && /authStrategy\s*:\s*['"]none['"]/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; });
  const avoidsPrivateRuntime = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|Authorization|Bearer|localStorage|sessionStorage|getLocalStorage|persist:root|document\.cookie|csrfSource|window\.location|location\.href|method\s*:\s*['"]POST['"]/i.test(handlerText);
  return vendoredUsesRelativeOlo && toolsOk && hasReviewedHandler
    && promotedOk && excludedOk && avoidsPrivateRuntime
    ? relativeRuntimeBaseUrl
    : null;
}

function readYnabRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'ynab' || relativeRuntimeBaseUrl !== '/api') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'ynab-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'ynab.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeApi = /fetch\(['"]\/api\/v1\/catalog['"]/.test(apiText)
    && /fetch\(`\/api\/v2\$\{endpoint\}`/.test(apiText)
    && /X-Session-Token/.test(apiText)
    && /syncBudgetData/.test(apiText);
  const readSlugs = [
    'ynab.get_account',
    'ynab.get_current_user',
    'ynab.get_month',
    'ynab.get_plan',
    'ynab.get_transaction',
    'ynab.list_accounts',
    'ynab.list_categories',
    'ynab.list_months',
    'ynab.list_payees',
    'ynab.list_scheduled_transactions',
    'ynab.list_transactions'
  ];
  const guardedSlugs = [
    'ynab.create_category',
    'ynab.create_category_group',
    'ynab.create_transaction',
    'ynab.delete_category',
    'ynab.delete_category_group',
    'ynab.delete_transaction',
    'ynab.move_category_budget',
    'ynab.snooze_category_goal',
    'ynab.update_category',
    'ynab.update_category_budget',
    'ynab.update_transaction'
  ];
  const hasReviewedHandler = /YNAB same-origin internal API READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/app\.ynab\.com['"]/.test(handlerText)
    && /var\s+CATALOG_URL\s*=\s*ORIGIN\s*\+\s*['"]\/api\/v1\/catalog['"]/.test(handlerText)
    && /var\s+API_V2_BASE\s*=\s*ORIGIN\s*\+\s*['"]\/api\/v2['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText)
    && /method\s*:\s*['"]POST['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("guarded('" + slug + "'") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredUsesRelativeApi && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readCalendlyRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'calendly' || relativeRuntimeBaseUrl !== '/api') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'calendly-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'calendly.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeApi = /const\s+url\s*=\s*qs\s*\?\s*`\/api\$\{endpoint\}\?\$\{qs\}`\s*:\s*`\/api\$\{endpoint\}`/.test(apiText)
    && /getMetaContent\(['"]csrf-token['"]\)/.test(apiText)
    && /X-CSRF-Token/.test(apiText)
    && /X-Requested-With/.test(apiText);
  const readSlugs = [
    'calendly.get_current_user',
    'calendly.get_event_type',
    'calendly.get_organization',
    'calendly.get_organization_statistics',
    'calendly.get_user_busy_times',
    'calendly.get_user_permissions',
    'calendly.list_calendar_accounts',
    'calendly.list_event_types',
    'calendly.list_scheduled_events'
  ];
  const guardedSlugs = [
    'calendly.activate_event_type',
    'calendly.clone_event_type',
    'calendly.create_event_type',
    'calendly.deactivate_event_type',
    'calendly.delete_event_type',
    'calendly.update_event_type'
  ];
  const hasReviewedHandler = /Calendly same-origin internal API READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/calendly\.com['"]/.test(handlerText)
    && /var\s+API_BASE\s*=\s*ORIGIN\s*\+\s*['"]\/api['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /X-CSRF-Token/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("guarded('" + slug + "'") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredUsesRelativeApi && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readJiraRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'jira' || relativeRuntimeBaseUrl !== '/rest/api/3') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'jira-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'jira.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeRest = /options\.basePath\s*\?\?\s*['"]\/rest\/api\/3['"]/.test(apiText)
    && /credentials\s*:\s*['"]include['"]/.test(apiText)
    && /basePath:\s*AGILE_BASE/.test(readFileSync(join(VENDOR_PLUGINS, app, 'src', 'tools', 'list-boards.ts'), 'utf8'))
    && /basePath:\s*AGILE_BASE/.test(readFileSync(join(VENDOR_PLUGINS, app, 'src', 'tools', 'list-sprints.ts'), 'utf8'));
  const readSlugs = [
    'jira.get_issue',
    'jira.get_myself',
    'jira.get_project',
    'jira.get_transitions',
    'jira.list_boards',
    'jira.list_comments',
    'jira.list_issue_types',
    'jira.list_priorities',
    'jira.list_projects',
    'jira.list_sprints',
    'jira.search_issues',
    'jira.search_users'
  ];
  const guardedSlugs = [
    'jira.add_comment',
    'jira.add_watcher',
    'jira.assign_issue',
    'jira.create_issue',
    'jira.delete_issue',
    'jira.link_issues',
    'jira.transition_issue',
    'jira.update_issue'
  ];
  const hasReviewedHandler = /Jira Cloud tenant same-origin REST READ head/.test(handlerText)
    && /var\s+REPRESENTATIVE_ORIGIN\s*=\s*['"]https:\/\/example\.atlassian\.net['"]/.test(handlerText)
    && /var\s+API_BASE\s*=\s*['"]\/rest\/api\/3['"]/.test(handlerText)
    && /var\s+AGILE_BASE\s*=\s*['"]\/rest\/agile\/1\.0['"]/.test(handlerText)
    && /atlassianTenantOrigin/.test(handlerText)
    && /\.atlassian\.net/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("guarded('" + slug + "'") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session|atl)\b/i.test(handlerText);
  return vendoredUsesRelativeRest && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readConfluenceRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'confluence' || relativeRuntimeBaseUrl !== '/wiki/api/v2') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'confluence-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'confluence.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeRest = /getMetaContent\(['"]ajs-base-url['"]\)/.test(apiText)
    && /\$\{auth\.baseUrl\}\/api\/v2/.test(apiText)
    && /\$\{auth\.baseUrl\}\/rest\/api/.test(apiText)
    && /credentials\s*:\s*['"]include['"]/.test(apiText);
  const readSlugs = [
    'confluence.get_page',
    'confluence.get_page_children',
    'confluence.get_space',
    'confluence.get_user_profile',
    'confluence.list_comment_replies',
    'confluence.list_comments',
    'confluence.list_inline_comments',
    'confluence.list_labels',
    'confluence.list_page_attachments',
    'confluence.list_page_versions',
    'confluence.list_pages',
    'confluence.list_spaces',
    'confluence.search'
  ];
  const guardedSlugs = [
    'confluence.add_label',
    'confluence.create_comment',
    'confluence.create_inline_comment',
    'confluence.create_page',
    'confluence.delete_comment',
    'confluence.delete_page',
    'confluence.remove_label',
    'confluence.update_page'
  ];
  const hasReviewedHandler = /Confluence Cloud tenant same-origin REST READ head/.test(handlerText)
    && /var\s+REPRESENTATIVE_ORIGIN\s*=\s*['"]https:\/\/example\.atlassian\.net['"]/.test(handlerText)
    && /var\s+CONTEXT_PATH\s*=\s*['"]\/wiki['"]/.test(handlerText)
    && /var\s+API_V2_BASE\s*=\s*['"]\/api\/v2['"]/.test(handlerText)
    && /var\s+API_V1_BASE\s*=\s*['"]\/rest\/api['"]/.test(handlerText)
    && /atlassianTenantOrigin/.test(handlerText)
    && /contextPathFromContext/.test(handlerText)
    && /\.atlassian\.net/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("guarded('" + slug + "'") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session|atl)\b/i.test(handlerText);
  return vendoredUsesRelativeRest && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readDockerHubRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'docker-hub' || relativeRuntimeBaseUrl !== '/') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'docker-hub-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'dockerhub.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesHubOrigin = /API_BASE\s*=\s*['"]https:\/\/hub\.docker\.com['"]/.test(apiText)
    && /\/auth\/profile/.test(apiText)
    && /Authorization:\s*`\s*Bearer\s+\$\{auth\.token\}`/.test(apiText);
  const readSlugs = [
    'dockerhub.get_current_user',
    'dockerhub.get_repository',
    'dockerhub.get_tag',
    'dockerhub.get_user_profile',
    'dockerhub.list_organizations',
    'dockerhub.list_repositories',
    'dockerhub.list_tags',
    'dockerhub.search_catalog',
    'dockerhub.search_repositories'
  ];
  const guardedSlugs = [
    'dockerhub.create_repository',
    'dockerhub.update_repository',
    'dockerhub.delete_repository'
  ];
  const hasReviewedHandler = /Docker Hub same-origin READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/hub\.docker\.com['"]/.test(handlerText)
    && /function\s+profileSpec\s*\(/.test(handlerText)
    && /\/auth\/profile/.test(handlerText)
    && /['"]Authorization['"]\s*:\s*['"]Bearer ['"]\s*\+\s*bearerToken/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("'" + slug + "': guarded(") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSeparateDockerApi = handlerText.indexOf('registry-1.docker.io') === -1
    && handlerText.indexOf('api.docker.com') === -1;
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredUsesHubOrigin && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSeparateDockerApi && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readAirtableRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'airtable' || relativeRuntimeBaseUrl !== '/v0.3') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'airtable-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'airtable.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeV03 = apiText.indexOf('fetch(`/v0.3/${endpoint}?${qs}`') !== -1
    && apiText.indexOf("credentials: 'include'") !== -1
    && apiText.indexOf("'x-airtable-inter-service-client': 'webClient'") !== -1
    && apiText.indexOf("'x-airtable-application-id'") !== -1;
  const readSlugs = [
    'airtable.get_base_schema',
    'airtable.get_field_choices',
    'airtable.get_record',
    'airtable.get_record_activity',
    'airtable.list_records',
    'airtable.list_workspaces'
  ];
  const guardedSlugs = [
    'airtable.create_comment',
    'airtable.update_cell'
  ];
  const hasReviewedHandler = /Airtable same-origin internal API READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/airtable\.com['"]/.test(handlerText)
    && /var\s+API_BASE\s*=\s*ORIGIN\s*\+\s*['"]\/v0\.3['"]/.test(handlerText)
    && /function\s+apiSpec\s*\(/.test(handlerText)
    && /x-airtable-inter-service-client/.test(handlerText)
    && /x-airtable-application-id/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("'" + slug + "': guarded(") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSeparateAirtableApi = handlerText.indexOf('api.airtable.com') === -1
    && handlerText.indexOf('content.airtable.com') === -1;
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredUsesRelativeV03 && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSeparateAirtableApi && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readSentryRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'sentry' || relativeRuntimeBaseUrl !== '/api/0') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'sentry-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'sentry.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeApi = /let\s+url\s*=\s*`\/api\/0\$\{endpoint\}`/.test(apiText)
    && /credentials:\s*['"]include['"]/.test(apiText)
    && /const\s+getOrgSlug\s*=/.test(apiText)
    && /getCsrfToken/.test(apiText);
  const readSlugs = [
    'sentry.get_event',
    'sentry.get_issue',
    'sentry.get_organization',
    'sentry.get_project',
    'sentry.get_project_keys',
    'sentry.get_release',
    'sentry.list_alerts',
    'sentry.list_comments',
    'sentry.list_issue_events',
    'sentry.list_issue_tags',
    'sentry.list_members',
    'sentry.list_monitors',
    'sentry.list_organizations',
    'sentry.list_project_environments',
    'sentry.list_projects',
    'sentry.list_releases',
    'sentry.list_replays',
    'sentry.list_teams',
    'sentry.search_issues'
  ];
  const guardedSlugs = [
    'sentry.create_comment',
    'sentry.update_issue'
  ];
  const hasReviewedHandler = /Sentry same-origin API head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/sentry\.io['"]/.test(handlerText)
    && /var\s+API_PREFIX\s*=\s*['"]\/api\/0['"]/.test(handlerText)
    && /function\s+orgSlugFromContext\s*\(/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("'" + slug + "': guarded(") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSeparateApiHost = handlerText.indexOf('api.sentry.io') === -1;
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredUsesRelativeApi && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSeparateApiHost && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readZendeskRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'zendesk' || relativeRuntimeBaseUrl !== '/api/v2') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'zendesk-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'zendesk.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredUsesRelativeApi = /\/api\/v2\$\{endpoint\}/.test(apiText)
    && /getPageGlobal\(['"]__app_config__\.currentUser\.id['"]\)/.test(apiText)
    && /getMetaContent\(['"]csrf-token['"]\)/.test(apiText)
    && /fetchJSON<[\s\S]*>\(url,\s*init\)/.test(apiText);
  const readSlugs = [
    'zendesk.get_current_user',
    'zendesk.get_organization',
    'zendesk.get_ticket',
    'zendesk.get_user',
    'zendesk.get_view_tickets',
    'zendesk.list_groups',
    'zendesk.list_organizations',
    'zendesk.list_tags',
    'zendesk.list_ticket_comments',
    'zendesk.list_tickets',
    'zendesk.list_users',
    'zendesk.list_views',
    'zendesk.search'
  ];
  const guardedSlugs = [
    'zendesk.add_ticket_comment',
    'zendesk.create_ticket',
    'zendesk.delete_ticket',
    'zendesk.update_ticket'
  ];
  const hasReviewedHandler = /Zendesk same-origin REST API READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/zendesk\.com['"]/.test(handlerText)
    && /\/api\/v2/.test(handlerText)
    && /function\s+zendeskOriginFromContext\s*\(/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("'" + slug + "': guarded(") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredUsesRelativeApi && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readEventbriteRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  if (app !== 'eventbrite' || relativeRuntimeBaseUrl !== '/v3') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'eventbrite-api.ts');
  const toolsDir = join(VENDOR_PLUGINS, app, 'src', 'tools');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'eventbrite.js');
  if (!existsSync(apiFile) || !existsSync(toolsDir) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const toolTexts = readdirSync(toolsDir)
    .filter(function(name) { return name.endsWith('.ts'); })
    .map(function(name) { return readFileSync(join(toolsDir, name), 'utf8'); })
    .join('\n');
  const vendoredUsesV3Api = /api\s*=\s*async/.test(apiText)
    && /\/v3\/events\/search/.test(toolTexts)
    && /\/v3\/events\/\$\{params\.event_id\}/.test(toolTexts)
    && /\/v3\/users\/me\/orders/.test(toolTexts)
    && /\/v3\/events\/\$\{params\.event_id\}\/orders/.test(toolTexts)
    && /method\s*:\s*['"]POST['"]/.test(toolTexts);
  const readSlugs = [
    'eventbrite.search_events',
    'eventbrite.get_event',
    'eventbrite.list_orders'
  ];
  const hasReviewedHandler = /Eventbrite same-origin API READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/www\.eventbrite\.com['"]/.test(handlerText)
    && /var\s+API_BASE\s*=\s*ORIGIN\s*\+\s*['"]\/v3['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /method\s*:\s*['"]GET['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = handlerText.indexOf("'eventbrite.register_for_event': guarded(") !== -1;
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredUsesV3Api && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

// Some heads intentionally expose only guarded fail-closed mutation rows while a
// separate-origin auth bridge is still unapproved. This proof is intentionally
// narrow: the handler must contain no execution primitive, no network primitive,
// and no token/storage path. It is currently used for MSWord's Graph-backed
// mutations, not as a generic cross-origin read/write accommodation.
function readGuardedOnlyHead(mapping) {
  if (!mapping || !mapping.guardedOnlyHandlerFile) { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', mapping.guardedOnlyHandlerFile);
  if (!existsSync(handlerFile)) { return null; }
  const text = readFileSync(handlerFile, 'utf8');
  const executableText = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n\r]*/g, '');
  const hasFallback = /RECIPE_DOM_FALLBACK_PENDING/.test(text)
    && /fellBackToDom\s*:\s*true/.test(text);
  const hasGuardedEntries = (/function\s+guarded\s*\(/.test(text) || /function\s+inert\s*\(/.test(text))
    && /async\s+handle\s*\(\)\s*\{[\s\S]*return\s+fallback\(/.test(text);
  const avoidsExecution = !/executeBoundSpec|executeBoundPageRead|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|getGraphToken|Authorization|Bearer/i.test(executableText);
  return hasFallback && hasGuardedEntries && avoidsExecution ? mapping.fallbackBaseUrl : null;
}

function readSameOriginPageReadHead(mapping) {
  if (!mapping || !mapping.sameOriginPageReadHandlerFile || !mapping.pageReadNamespace) { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', mapping.sameOriginPageReadHandlerFile);
  if (!existsSync(handlerFile)) { return null; }
  const text = readFileSync(handlerFile, 'utf8');
  const origin = String(mapping.fallbackBaseUrl || '');
  const namespace = String(mapping.pageReadNamespace || '');
  const hasOrigin = text.indexOf("var ORIGIN = '" + origin + "'") !== -1
    || text.indexOf('var ORIGIN = "' + origin + '"') !== -1;
  const hasFallback = /RECIPE_DOM_FALLBACK_PENDING/.test(text)
    && /fellBackToDom\s*:\s*true/.test(text);
  const hasPageRead = /function\s+readHandler\s*\(/.test(text)
    && /executeBoundPageRead/.test(text)
    && (text.indexOf("namespace: '" + namespace + "'") !== -1
      || text.indexOf('namespace: "' + namespace + '"') !== -1)
    && /action\s*:\s*action/.test(text);
  const hasNoDirectCredentialPath = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer/i.test(text);
  const hasNoBoundSpec = !/executeBoundSpec/.test(text);
  return hasOrigin && hasFallback && hasPageRead && hasNoDirectCredentialPath && hasNoBoundSpec
    ? origin
    : null;
}

const REVIEWED_SAME_ORIGIN_RELATIVE_HEADS = {
  threads: {
    handlerFile: 'threads.js',
    origin: 'https://www.threads.net',
    base: '/',
    required: [
      /function\s+getSpec\s*\(/,
      /url\s*:\s*ORIGIN\s*\+\s*path/,
      /\/threads\//,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerThreads\s*=\s*handlers/
    ]
  },
  grafana: {
    handlerFile: 'grafana.js',
    origin: 'https://grafana.com',
    base: '/api',
    required: [
      /var\s+API_BASE\s*=\s*ORIGIN\s*\+\s*['"]\/api['"]/,
      /url\s*:\s*API_BASE\s*\+\s*path/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerGrafana\s*=\s*handlers/
    ]
  },
  posthog: {
    handlerFile: 'posthog.js',
    origin: 'https://us.posthog.com',
    base: '/api',
    required: [
      /function\s+buildSpec\s*\(\s*path\s*,\s*query\s*\)/,
      /url\s*:\s*ORIGIN\s*\+\s*path/,
      /\/api\/users\/@me\//,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerPosthog\s*=\s*handlers/
    ]
  },
  ubereats: {
    handlerFile: 'ubereats.js',
    origin: 'https://www.ubereats.com',
    base: '/eats/v1',
    required: [
      /var\s+UBEREATS_ORIGIN\s*=\s*['"]https:\/\/www\.ubereats\.com['"]/,
      /url\s*:\s*UBEREATS_ORIGIN\s*\+\s*path/,
      /\/eats\/v1\/restaurants/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerUbereats\s*=\s*handlers/
    ]
  },
  uber: {
    handlerFile: 'uber.js',
    origin: 'https://www.uber.com',
    base: '/api',
    required: [
      /var\s+UBER_ORIGIN\s*=\s*['"]https:\/\/www\.uber\.com['"]/,
      /url\s*:\s*UBER_ORIGIN\s*\+\s*['"]\/api['"]\s*\+\s*endpoint/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerUber\s*=\s*handlers/
    ]
  },
  doordash: {
    handlerFile: 'doordash.js',
    origin: 'https://www.doordash.com',
    base: '/graphql',
    required: [
      /var\s+DOORDASH_ORIGIN\s*=\s*['"]https:\/\/www\.doordash\.com['"]/,
      /url\s*:\s*DOORDASH_ORIGIN\s*\+\s*['"]\/graphql\//,
      /csrfSource\s*:\s*\{\s*from\s*:\s*['"]cookie['"]/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerDoordash\s*=\s*handlers/
    ]
  },
  lyft: {
    handlerFile: 'lyft.js',
    origin: 'https://www.lyft.com',
    base: '/v1',
    required: [
      /var\s+API_BASE\s*=\s*LYFT_ORIGIN\s*\+\s*['"]\/v1['"]/,
      /url\s*:\s*API_BASE\s*\+\s*path/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerLyft\s*=\s*handlers/
    ]
  },
  linkedin: {
    handlerFile: 'linkedin.js',
    origin: 'https://www.linkedin.com',
    base: '/voyager/api',
    required: [
      /var\s+VOYAGER\s*=\s*['"]\/voyager\/api['"]/,
      /url\s*:\s*ORIGIN\s*\+\s*VOYAGER\s*\+\s*endpoint/,
      /csrfSource\s*:\s*\{\s*from\s*:\s*['"]cookie['"]/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerLinkedin\s*=\s*handlers/
    ]
  },
  amazon: {
    handlerFile: 'amazon.js',
    origin: 'https://www.amazon.com',
    base: '/',
    required: [
      /var\s+AMAZON_ORIGIN\s*=\s*['"]https:\/\/www\.amazon\.com['"]/,
      /url\s*:\s*AMAZON_ORIGIN\s*\+\s*path/,
      /\/gp\/your-account\/order-details/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerAmazon\s*=\s*handlers/
    ]
  },
  ebay: {
    handlerFile: 'ebay.js',
    origin: 'https://www.ebay.com',
    base: '/',
    required: [
      /var\s+EBAY_ORIGIN\s*=\s*['"]https:\/\/www\.ebay\.com['"]/,
      /url\s*:\s*EBAY_ORIGIN\s*\+\s*path/,
      /\/itm\//,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerEbay\s*=\s*handlers/
    ]
  },
  'google-docs': {
    handlerFile: 'gdocs.js',
    origin: 'https://docs.google.com',
    base: '/drive/v3',
    required: [
      /var\s+DRIVE_BASE\s*=\s*ORIGIN\s*\+\s*['"]\/drive\/v3['"]/,
      /return\s+spec\(DRIVE_BASE\s*\+\s*path/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerGdocs\s*=\s*handlers/
    ]
  },
  shopify: {
    handlerFile: 'shopify.js',
    origin: 'https://admin.shopify.com',
    base: '/admin/api',
    required: [
      /var\s+API_BASE\s*=\s*ORIGIN\s*\+\s*['"]\/admin\/api['"]/,
      /url\s*:\s*API_BASE\s*\+\s*path/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerShopify\s*=\s*handlers/
    ]
  },
  'google-maps': {
    handlerFile: 'gmaps.js',
    origin: 'https://www.google.com',
    base: '/',
    required: [
      /var\s+ORIGIN\s*=\s*['"]https:\/\/www\.google\.com['"]/,
      /executeBoundPageRead/,
      /namespace\s*:\s*['"]gmaps['"]/,
      /executeBoundSpec/,
      /htmlSpec\(ORIGIN\s*\+\s*['"]\/search\?/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerGmaps\s*=\s*handlers/
    ]
  },
  ticketmaster: {
    handlerFile: 'ticketmaster.js',
    origin: 'https://www.ticketmaster.com',
    base: '/',
    required: [
      /var\s+TICKETMASTER_ORIGIN\s*=\s*['"]https:\/\/www\.ticketmaster\.com['"]/,
      /url\s*:\s*TICKETMASTER_ORIGIN\s*\+\s*path/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerTicketmaster\s*=\s*handlers/
    ]
  },
  fiverr: {
    handlerFile: 'fiverr.js',
    origin: 'https://www.fiverr.com',
    base: '/',
    required: [
      /var\s+FIVERR_ORIGIN\s*=\s*['"]https:\/\/www\.fiverr\.com['"]/,
      /url\s*:\s*FIVERR_ORIGIN\s*\+\s*path/,
      /executeBoundSpec/,
      /authStrategy\s*:\s*['"]same-origin-cookie['"]/,
      /global\.FsbHandlerFiverr\s*=\s*handlers/
    ]
  }
};

function readReviewedSameOriginRelativeRuntimeBase(app, relativeRuntimeBaseUrl) {
  const spec = REVIEWED_SAME_ORIGIN_RELATIVE_HEADS[app];
  if (!spec || spec.base !== relativeRuntimeBaseUrl) { return null; }
  const handlerFile = join(ROOT, 'catalog', 'handlers', spec.handlerFile);
  if (!existsSync(handlerFile)) { return null; }
  const text = readFileSync(handlerFile, 'utf8');
  const hasFallback = /RECIPE_DOM_FALLBACK_PENDING/.test(text)
    && /fellBackToDom\s*:\s*true/.test(text);
  const hasOriginLiteral = text.indexOf("'" + spec.origin + "'") !== -1
    || text.indexOf('"' + spec.origin + '"') !== -1;
  const hasAllRequired = spec.required.every(function(pattern) { return pattern.test(text); });
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer/i.test(text);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(text);
  return hasFallback && hasOriginLiteral && hasAllRequired && avoidsDirectCredentialApis && avoidsSecretLogging
    ? relativeRuntimeBaseUrl
    : null;
}

function readPowerPointGraphBearerRuntimeBase(app, graphBearerRuntimeBaseUrl) {
  if (app !== 'powerpoint' || graphBearerRuntimeBaseUrl !== 'https://graph.microsoft.com/v1.0') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'powerpoint-api.ts');
  const preScriptFile = join(VENDOR_PLUGINS, app, 'src', 'pre-script.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'powerpoint.js');
  if (!existsSync(apiFile) || !existsSync(preScriptFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const preScriptText = readFileSync(preScriptFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendorOk = /GRAPH_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(apiText);
  const preScriptOk = /GRAPH_HOSTNAME\s*=\s*['"]graph\.microsoft\.com['"]/.test(preScriptText)
    && /LS_TOKEN_KEY\s*=\s*['"]__opentabs_powerpoint_graph_token['"]/.test(preScriptText)
    && /captureFromTokenResponse/.test(preScriptText);
  const handlerOk = /PowerPoint Microsoft Graph READ head/.test(handlerText)
    && /var\s+GRAPH_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(handlerText)
    && /namespace\s*:\s*['"]powerpoint['"]/.test(handlerText)
    && /action\s*:\s*['"]auth_context['"]/.test(handlerText)
    && /['"]Authorization['"]\s*:\s*['"]Bearer ['"]\s*\+\s*graphToken/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText)
    && !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|localStorage|sessionStorage|document\.cookie/.test(handlerText);
  return vendorOk && preScriptOk && handlerOk ? graphBearerRuntimeBaseUrl : null;
}

function readWordGraphBearerRuntimeBase(app, graphBearerRuntimeBaseUrl) {
  if (app !== 'microsoft-word' || graphBearerRuntimeBaseUrl !== 'https://graph.microsoft.com/v1.0') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'microsoft-word-api.ts');
  const preScriptFile = join(VENDOR_PLUGINS, app, 'src', 'pre-script.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'msword.js');
  const fetchFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(apiFile) || !existsSync(preScriptFile) || !existsSync(handlerFile) || !existsSync(fetchFile)) {
    return null;
  }
  const apiText = readFileSync(apiFile, 'utf8');
  const preScriptText = readFileSync(preScriptFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const fetchText = readFileSync(fetchFile, 'utf8');
  const vendorOk = /GRAPH_API_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(apiText)
    && /LS_TOKEN_KEY\s*=\s*['"]__opentabs_word_graph_token['"]/.test(apiText)
    && /resolveDocumentContext/.test(apiText);
  const preScriptOk = /GRAPH_HOSTNAME\s*=\s*['"]graph\.microsoft\.com['"]/.test(preScriptText)
    && /LS_TOKEN_KEY\s*=\s*['"]__opentabs_word_graph_token['"]/.test(preScriptText)
    && /captureFromTokenResponse/.test(preScriptText);
  const pageReadOk = /function\s+wordRead\s*\(action\)/.test(fetchText)
    && /readWordGraphToken/.test(fetchText)
    && /request\.namespace\s*!==\s*['"]microsoft-word['"]/.test(fetchText)
    && /graph_token\s*:\s*graphToken/.test(fetchText);
  const handlerOk = /Microsoft Word Microsoft Graph read head/.test(handlerText)
    && /var\s+GRAPH_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(handlerText)
    && /namespace\s*:\s*['"]microsoft-word['"]/.test(handlerText)
    && /action\s*:\s*['"]auth_context['"]/.test(handlerText)
    && /['"]Authorization['"]\s*:\s*['"]Bearer ['"]\s*\+\s*graphToken/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText)
    && /msword\.get_current_user/.test(handlerText)
    && /msword\.list_children/.test(handlerText)
    && /unverified-msword-update-document-mutation/.test(handlerText)
    && !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|localStorage|sessionStorage|document\.cookie/.test(handlerText);
  return vendorOk && preScriptOk && pageReadOk && handlerOk ? graphBearerRuntimeBaseUrl : null;
}

function readExcelGraphBearerRuntimeBase(app, graphBearerRuntimeBaseUrl) {
  if (app !== 'excel-online' || graphBearerRuntimeBaseUrl !== 'https://graph.microsoft.com/v1.0') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'excel-api.ts');
  const preScriptFile = join(VENDOR_PLUGINS, app, 'src', 'pre-script.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'excel.js');
  if (!existsSync(apiFile) || !existsSync(preScriptFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const preScriptText = readFileSync(preScriptFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendorOk = /GRAPH_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(apiText)
    && /resolveWorkbookContext/.test(apiText)
    && /workbookApi/.test(apiText);
  const preScriptOk = /GRAPH_HOSTNAME\s*=\s*['"]graph\.microsoft\.com['"]/.test(preScriptText)
    && /LS_TOKEN_KEY\s*=\s*['"]__opentabs_excel_graph_token['"]/.test(preScriptText)
    && /captureFromTokenResponse/.test(preScriptText);
  const handlerOk = /Excel Online Microsoft Graph read head/.test(handlerText)
    && /var\s+GRAPH_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(handlerText)
    && /namespace\s*:\s*['"]excel['"]/.test(handlerText)
    && /action\s*:\s*['"]auth_context['"]/.test(handlerText)
    && /['"]Authorization['"]\s*:\s*['"]Bearer ['"]\s*\+\s*graphToken/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText)
    && /excel\.get_range/.test(handlerText)
    && /excel\.list_worksheets/.test(handlerText)
    && /excel\.update_range/.test(handlerText)
    && /unverified-excel-update-range-mutation/.test(handlerText)
    && !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|localStorage|sessionStorage|document\.cookie/.test(handlerText);
  return vendorOk && preScriptOk && handlerOk ? graphBearerRuntimeBaseUrl : null;
}

function readOutlookGraphBearerRuntimeBase(app, graphBearerRuntimeBaseUrl) {
  if (app !== 'outlook' || graphBearerRuntimeBaseUrl !== 'https://graph.microsoft.com/v1.0') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'outlook-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'outlook.js');
  const fetchFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile) || !existsSync(fetchFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const fetchText = readFileSync(fetchFile, 'utf8');
  const vendorOk = /GRAPH_API_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(apiText)
    && /collectAuthCandidates/.test(apiText)
    && /scopeClaimHasHost/.test(apiText);
  const pageReadOk = /function\s+outlookRead\s*\(action\)/.test(fetchText)
    && /findOutlookGraphTokens/.test(fetchText)
    && /request\.namespace\s*!==\s*['"]outlook['"]/.test(fetchText)
    && /graph_tokens\s*:\s*graphTokens/.test(fetchText);
  const handlerOk = /Outlook Microsoft Graph READ head/.test(handlerText)
    && /var\s+GRAPH_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(handlerText)
    && /namespace\s*:\s*['"]outlook['"]/.test(handlerText)
    && /action\s*:\s*['"]auth_context['"]/.test(handlerText)
    && /['"]Authorization['"]\s*:\s*['"]Bearer ['"]\s*\+\s*graphToken/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText)
    && /outlook\.get_current_user/.test(handlerText)
    && /outlook\.list_messages/.test(handlerText)
    && /unverified-outlook-send-message-mutation/.test(handlerText)
    && !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|localStorage|sessionStorage|document\.cookie/.test(handlerText);
  return vendorOk && pageReadOk && handlerOk ? graphBearerRuntimeBaseUrl : null;
}

function readTeamsGraphBearerRuntimeBase(app, graphBearerRuntimeBaseUrl) {
  if (app !== 'teams' || graphBearerRuntimeBaseUrl !== 'https://graph.microsoft.com/v1.0') {
    return null;
  }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'teams.js');
  const fetchFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(handlerFile) || !existsSync(fetchFile)) { return null; }
  const handlerText = readFileSync(handlerFile, 'utf8');
  const fetchText = readFileSync(fetchFile, 'utf8');
  const pageReadOk = /function\s+teamsRead\s*\(action\)/.test(fetchText)
    && /findOutlookGraphTokens/.test(fetchText)
    && /request\.namespace\s*!==\s*['"]teams['"]/.test(fetchText)
    && /request\.namespace\s*===\s*['"]teams['"]/.test(fetchText)
    && /graph_tokens\s*:\s*graphTokens/.test(fetchText);
  const handlerOk = /Microsoft Teams Graph READ head/.test(handlerText)
    && /var\s+GRAPH_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(handlerText)
    && /namespace\s*:\s*['"]teams['"]/.test(handlerText)
    && /action\s*:\s*['"]auth_context['"]/.test(handlerText)
    && /['"]Authorization['"]\s*:\s*['"]Bearer ['"]\s*\+\s*graphToken/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText)
    && /teams\.get_current_user/.test(handlerText)
    && /teams\.list_conversations/.test(handlerText)
    && /teams\.read_messages/.test(handlerText)
    && /teams\.send_message/.test(handlerText)
    && /unverified-teams-mutation/.test(handlerText)
    && !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|localStorage|sessionStorage|document\.cookie/.test(handlerText);
  return pageReadOk && handlerOk ? graphBearerRuntimeBaseUrl : null;
}

function readOneNoteGraphBearerRuntimeBase(app, graphBearerRuntimeBaseUrl) {
  if (app !== 'onenote' || graphBearerRuntimeBaseUrl !== 'https://graph.microsoft.com/v1.0') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'onenote-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'onenote.js');
  const fetchFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile) || !existsSync(fetchFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const fetchText = readFileSync(fetchFile, 'utf8');
  const vendorOk = /GRAPH_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(apiText)
    && /MSAL_CLIENT_ID\s*=\s*['"]2821b473-fe24-4c86-ba16-62834d6e80c3['"]/.test(apiText)
    && /extractMsalToken/.test(apiText);
  const pageReadOk = /function\s+onenoteRead\s*\(action\)/.test(fetchText)
    && /findOneNoteGraphToken/.test(fetchText)
    && /request\.namespace\s*!==\s*['"]onenote['"]/.test(fetchText)
    && /graph_token\s*:\s*graphToken/.test(fetchText);
  const handlerOk = /OneNote Microsoft Graph READ head/.test(handlerText)
    && /var\s+GRAPH_BASE\s*=\s*['"]https:\/\/graph\.microsoft\.com\/v1\.0['"]/.test(handlerText)
    && /namespace\s*:\s*['"]onenote['"]/.test(handlerText)
    && /action\s*:\s*['"]auth_context['"]/.test(handlerText)
    && /['"]Authorization['"]\s*:\s*['"]Bearer ['"]\s*\+\s*graphToken/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText)
    && /onenote\.get_current_user/.test(handlerText)
    && /onenote\.list_notebooks/.test(handlerText)
    && /unverified-onenote-create-page-mutation/.test(handlerText)
    && !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|localStorage|sessionStorage|document\.cookie/.test(handlerText);
  return vendorOk && pageReadOk && handlerOk ? graphBearerRuntimeBaseUrl : null;
}

function readGoogleAnalyticsGapiPageBridgeBase(app, gapiPageBridgeBaseUrls) {
  const expected = [
    'https://analyticsdata.googleapis.com/v1beta',
    'https://analyticssuitefrontend-pa.clients6.google.com'
  ];
  const urls = Array.isArray(gapiPageBridgeBaseUrls) ? gapiPageBridgeBaseUrls.slice().sort() : [];
  const expectedSorted = expected.slice().sort();
  const urlsOk = urls.length === expectedSorted.length
    && urls.every(function(url, idx) { return url === expectedSorted[idx]; });
  if (app !== 'google-analytics' || !urlsOk) { return null; }

  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'ga-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'ganalytics.js');
  const fetchFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile) || !existsSync(fetchFile)) { return null; }

  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const fetchText = readFileSync(fetchFile, 'utf8');
  const vendorOk = /SUITE_BASE\s*=\s*['"]https:\/\/analyticssuitefrontend-pa\.clients6\.google\.com['"]/.test(apiText)
    && /DATA_BASE\s*=\s*['"]https:\/\/analyticsdata\.googleapis\.com\/v1beta['"]/.test(apiText)
    && /gapiRequest/.test(apiText)
    && /client\s*\.\s*request/.test(apiText)
    && /preload\.globals\.gmsSuiteApiKey/.test(apiText)
    && /getCookie\(['"]SAPISID['"]\)/.test(apiText);
  const pageBridgeOk = /GA_SUITE_BASE\s*=\s*['"]https:\/\/analyticssuitefrontend-pa\.clients6\.google\.com['"]/.test(fetchText)
    && /GA_DATA_BASE\s*=\s*['"]https:\/\/analyticsdata\.googleapis\.com\/v1beta['"]/.test(fetchText)
    && /function\s+gaGapiRequest\s*\(/.test(fetchText)
    && /gapi\s*&&\s*gapi\.client/.test(fetchText)
    && /client\.request/.test(fetchText)
    && /request\.namespace\s*!==\s*['"]ganalytics['"]/.test(fetchText)
    && /request\.namespace\s*===\s*['"]ganalytics['"]/.test(fetchText)
    && /ganalytics-gapi-client-unavailable/.test(fetchText)
    && /ganalytics-gapi-auth-failed/.test(fetchText);
  const handlerOk = /Google Analytics GAPI page-bridge READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/analytics\.google\.com['"]/.test(handlerText)
    && /namespace\s*:\s*['"]ganalytics['"]/.test(handlerText)
    && /executeBoundPageRead/.test(handlerText)
    && /global\.FsbHandlerGanalytics\s*=\s*handlers/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText)
    && /ganalytics\.run_report/.test(handlerText)
    && /ganalytics\.list_accounts/.test(handlerText)
    && !/executeBoundSpec|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|SAPISID|getCookie/.test(handlerText)
    && !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|sapisid)\b/i.test(handlerText);

  return vendorOk && pageBridgeOk && handlerOk ? expected[0] : null;
}

function readGdriveGapiPageReadBase(app, gapiPageReadBaseUrl) {
  if (app !== 'google-drive' || gapiPageReadBaseUrl !== 'https://content.googleapis.com/drive/v3') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'google-drive-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'gdrive.js');
  const fetchFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile) || !existsSync(fetchFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const fetchText = readFileSync(fetchFile, 'utf8');
  const vendorOk = /getPageGlobal\(['"]gapi\.client\.request['"]\)/.test(apiText)
    && /const\s+API_BASE\s*=\s*['"]\/drive\/v3['"]/.test(apiText)
    && /DRIVE_API_KEY/.test(apiText)
    && /method:\s*options\.method/.test(apiText);
  const pageReadOk = /function\s+gdriveRead\s*\(action,\s*args\)/.test(fetchText)
    && /function\s+gdriveRequest\s*\(path,\s*params\)/.test(fetchText)
    && /globalThis\.gapi/.test(fetchText)
    && /client\.request/.test(fetchText)
    && /method\s*:\s*['"]GET['"]/.test(fetchText)
    && /request\.namespace\s*!==\s*['"]gdrive['"]/.test(fetchText)
    && /request\.namespace\s*===\s*['"]gdrive['"]/.test(fetchText)
    && /\/drive\/v3\/files/.test(fetchText)
    && /\/drive\/v3\/about/.test(fetchText);
  const readSlugs = [
    'gdrive.get_current_user',
    'gdrive.get_file',
    'gdrive.get_storage_quota',
    'gdrive.list_files',
    'gdrive.list_permissions',
    'gdrive.search_files'
  ];
  const guardedSlugs = [
    'gdrive.copy_file',
    'gdrive.create_file',
    'gdrive.create_folder',
    'gdrive.create_permission',
    'gdrive.delete_file',
    'gdrive.delete_permission',
    'gdrive.empty_trash',
    'gdrive.move_file',
    'gdrive.restore_file',
    'gdrive.trash_file',
    'gdrive.update_file'
  ];
  const hasReviewedHandler = /Google Drive GAPI page-read READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/drive\.google\.com['"]/.test(handlerText)
    && /executeBoundPageRead/.test(handlerText)
    && /namespace\s*:\s*['"]gdrive['"]/.test(handlerText)
    && /origin\s*:\s*ORIGIN/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("guarded('" + slug + "'") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction
    && guardedFunction[0].indexOf('executeBoundSpec') === -1
    && guardedFunction[0].indexOf('executeBoundPageRead') === -1;
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|getPageGlobal/i.test(handlerText);
  return vendorOk && pageReadOk && hasReviewedHandler && readOk && guardedOk
    && guardedIsInert && avoidsDirectCredentialApis
    ? gapiPageReadBaseUrl
    : null;
}

// Bluesky's vendored helper uses an authenticated user PDS for the full plugin
// surface, but a reviewed subset of app.bsky.* GET endpoints is available through
// the public AppView host with CORS. Keep this accommodation Bluesky-only and
// source-proven against the exact read tools promoted by catalog/handlers/bsky.js.
function readBlueskyPublicAppViewBase(app, publicAppViewBaseUrl) {
  if (app !== 'bluesky' || publicAppViewBaseUrl !== 'https://api.bsky.app/xrpc') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'bluesky-api.ts');
  if (!existsSync(apiFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const hasXrpcCaller = /const\s+xrpc\s*=/.test(apiText) && /xrpc\/\$\{nsid\}/.test(apiText);
  const requiredTools = [
    ['get-author-feed.ts', 'app.bsky.feed.getAuthorFeed'],
    ['get-feed.ts', 'app.bsky.feed.getFeed'],
    ['get-followers.ts', 'app.bsky.graph.getFollowers'],
    ['get-follows.ts', 'app.bsky.graph.getFollows'],
    ['get-list-feed.ts', 'app.bsky.feed.getListFeed'],
    ['get-post-thread.ts', 'app.bsky.feed.getPostThread'],
    ['get-posts.ts', 'app.bsky.feed.getPosts'],
    ['get-user-profile.ts', 'app.bsky.actor.getProfile'],
    ['get-user-profiles.ts', 'app.bsky.actor.getProfiles'],
    ['search-posts.ts', 'app.bsky.feed.searchPosts'],
    ['search-users.ts', 'app.bsky.actor.searchActors'],
    ['search-users-typeahead.ts', 'app.bsky.actor.searchActorsTypeahead']
  ];
  let toolsOk = true;
  for (const pair of requiredTools) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath)) { toolsOk = false; break; }
    const text = readFileSync(toolPath, 'utf8');
    if (text.indexOf(pair[1]) === -1 || !/api<[\s\S]*>\(/.test(text)) {
      toolsOk = false;
      break;
    }
  }
  return hasXrpcCaller && toolsOk ? publicAppViewBaseUrl : null;
}

// Chipotle's vendored helper is mostly authenticated, but the promoted subset uses
// public restaurant/menu/status GET endpoints on services.chipotle.com. Prove the
// handler is the reviewed no-auth read head before accepting the public services host.
function readChipotlePublicServicesBase(app, publicCorsReadBaseUrl) {
  if (app !== 'chipotle' || publicCorsReadBaseUrl !== 'https://services.chipotle.com') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'chipotle-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'chipotle.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const hasServicesBase = /const\s+GATEWAY_URL\s*=\s*['"]https:\/\/services\.chipotle\.com['"]/.test(apiText);
  const requiredTools = [
    ['get-ordering-status.ts', '/onlineorderingstatus'],
    ['get-restaurant.ts', '/restaurant/v3/restaurant/${params.restaurant_id}'],
    ['get-menu.ts', '/menuinnovation/v1/restaurants/${params.restaurant_id}/onlinemenu'],
    ['get-preconfigured-meals.ts', '/menuinnovation/v1/restaurants/${params.restaurant_id}/onlinemeals']
  ];
  let toolsOk = true;
  for (const pair of requiredTools) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath)) { toolsOk = false; break; }
    const text = readFileSync(toolPath, 'utf8');
    if (text.indexOf(pair[1]) === -1 || !/api<[\s\S]*>\(/.test(text)) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'chipotle.get_ordering_status',
    'chipotle.get_restaurant',
    'chipotle.get_menu',
    'chipotle.get_preconfigured_meals'
  ];
  const excludedSlugs = [
    'chipotle.get_current_user',
    'chipotle.get_extras_campaigns',
    'chipotle.get_favorites',
    'chipotle.get_last_restaurant',
    'chipotle.get_loyalty_points',
    'chipotle.get_menu_groups',
    'chipotle.get_payment_methods',
    'chipotle.get_promotions',
    'chipotle.get_recent_orders',
    'chipotle.get_reward_categories',
    'chipotle.get_rewards',
    'chipotle.find_restaurants'
  ];
  const hasReviewedHandler = /Chipotle public services READ head/.test(handlerText)
    && /var\s+SERVICES_BASE\s*=\s*['"]https:\/\/services\.chipotle\.com['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]none['"]/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; });
  const avoidsPrivateRuntime = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|Authorization|Bearer|localStorage|sessionStorage|getLocalStorage|cmg-vuex|document\.cookie|csrfSource/i.test(handlerText);
  return hasServicesBase && toolsOk && hasReviewedHandler && promotedOk && excludedOk && avoidsPrivateRuntime
    ? publicCorsReadBaseUrl
    : null;
}

// Costco's promoted subset is limited to public product/inventory ecom reads on
// ecom-api.costco.com. Prove the vendored constants and the reviewed handler agree
// before accepting the public ecom host.
function readCostcoPublicEcomBase(app, publicCorsReadBaseUrl) {
  if (app !== 'costco' || publicCorsReadBaseUrl !== 'https://ecom-api.costco.com') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'costco-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'costco.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const hasPublicConstants =
    /PRODUCT_CLIENT_ID\s*=\s*['"]4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf['"]/.test(apiText)
    && /INVENTORY_CLIENT_ID\s*=\s*['"]481b1aec-aa3b-454b-b81b-48187e28f205['"]/.test(apiText)
    && /PRODUCT_API\s*=\s*['"]https:\/\/ecom-api\.costco\.com\/ebusiness\/product\/v1\/products\/graphql['"]/.test(apiText)
    && /INVENTORY_API\s*=\s*['"]https:\/\/ecom-api\.costco\.com\/ebusiness\/inventory\/v1\/inventorylevels\/availability\/batch['"]/.test(apiText);
  const productFn = apiText.match(/fetchProducts[\s\S]*?};/);
  const inventoryFn = apiText.match(/fetchInventory[\s\S]*?};/);
  const publicCalls = productFn && /credentials\s*:\s*['"]omit['"]/.test(productFn[0])
    && inventoryFn && /credentials\s*:\s*['"]omit['"]/.test(inventoryFn[0]);
  const requiredTools = [
    ['get-product.ts', 'fetchProducts([params.item_number], params.warehouse_number)'],
    ['get-products.ts', 'fetchProducts(items, params.warehouse_number)'],
    ['get-product-availability.ts', 'fetchInventory(items)']
  ];
  let toolsOk = true;
  for (const pair of requiredTools) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath) || readFileSync(toolPath, 'utf8').indexOf(pair[1]) === -1) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'costco.get_product',
    'costco.get_products',
    'costco.get_product_availability'
  ];
  const excludedSlugs = [
    'costco.add_to_list',
    'costco.create_list',
    'costco.delete_list',
    'costco.geocode_location',
    'costco.get_current_user',
    'costco.get_list_items',
    'costco.get_lists',
    'costco.navigate_to_cart',
    'costco.navigate_to_checkout',
    'costco.navigate_to_product',
    'costco.navigate_to_search',
    'costco.remove_list_item',
    'costco.search_products'
  ];
  const hasReviewedHandler = /Costco public ecom READ head/.test(handlerText)
    && /var\s+PRODUCT_API\s*=\s*['"]https:\/\/ecom-api\.costco\.com\/ebusiness\/product\/v1\/products\/graphql['"]/.test(handlerText)
    && /var\s+INVENTORY_API\s*=\s*['"]https:\/\/ecom-api\.costco\.com\/ebusiness\/inventory\/v1\/inventorylevels\/availability\/batch['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]none['"]/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const excludedOk = excludedSlugs.every(function(slug) { return handlerText.indexOf(slug) === -1; });
  const avoidsPrivateRuntime = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|window\.location|document\.querySelector|Authorization|Bearer|api\.digital\.costco\.com|getAuth|getCookie|getSessionStorage|setAuthCache|hashedUserId|memberNumber|document\.cookie|localStorage|sessionStorage|csrfSource/i.test(handlerText);
  return hasPublicConstants && publicCalls && toolsOk && hasReviewedHandler
    && promotedOk && excludedOk && avoidsPrivateRuntime
    ? publicCorsReadBaseUrl
    : null;
}

// Lucid uses authenticated first-party API subdomains under lucid.app. The vendored
// plugin gets user/account ids from cookies; the bundled head is narrower: it proves
// the exact three first-party read bases and bootstraps ids through a bound page read,
// while all mutations remain guarded fail-closed.
function readLucidFirstPartyAuthReadBase(app, firstPartyAuthReadBaseUrls) {
  if (app !== 'lucid' || !Array.isArray(firstPartyAuthReadBaseUrls)) { return null; }
  const expectedBases = [
    'https://users.lucid.app',
    'https://documents.lucid.app',
    'https://userdocslist.lucid.app'
  ];
  if (expectedBases.length !== firstPartyAuthReadBaseUrls.length ||
      !expectedBases.every((base) => firstPartyAuthReadBaseUrls.includes(base))) {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'lucid-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'lucid.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');

  const vendoredBasesOk = /const\s+USERS_API\s*=\s*['"]https:\/\/users\.lucid\.app['"]/.test(apiText)
    && /const\s+DOCS_API\s*=\s*['"]https:\/\/documents\.lucid\.app['"]/.test(apiText)
    && /const\s+DOCLIST_API\s*=\s*['"]https:\/\/userdocslist\.lucid\.app['"]/.test(apiText);
  const readTools = [
    ['get-current-user.ts', '/users/${userId}'],
    ['get-account.ts', '/accounts/${accountId}'],
    ['get-user-permissions.ts', '/users/${userId}/permissions'],
    ['list-account-users.ts', '/accounts/${accountId}/userList'],
    ['list-groups.ts', '/groups'],
    ['list-documents.ts', '/users/${userId}/documents/${product}'],
    ['get-document-count.ts', '/users/${userId}/documents/${product}/count'],
    ['get-document.ts', '/documents/${params.document_id}'],
    ['get-document-pages.ts', '/documents/${params.document_id}/pages'],
    ['get-document-role.ts', 'https://documents.lucid.app/documents/${params.document_id}/role'],
    ['get-document-status.ts', '/documents/${params.document_id}/status'],
    ['list-folder-entries.ts', '/users/${userId}/folderEntries/chart'],
    ['get-folder-entry.ts', '/users/${userId}/folderEntries/${params.entry_id}'],
    ['search-documents.ts', '/users/${userId}/documentList']
  ];
  let toolsOk = true;
  for (const pair of readTools) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath) || readFileSync(toolPath, 'utf8').indexOf(pair[1]) === -1) {
      toolsOk = false;
      break;
    }
  }
  const readSlugs = [
    'lucid.get_account',
    'lucid.get_current_user',
    'lucid.get_document',
    'lucid.get_document_count',
    'lucid.get_document_pages',
    'lucid.get_document_role',
    'lucid.get_document_status',
    'lucid.get_folder_entry',
    'lucid.get_user_permissions',
    'lucid.list_account_users',
    'lucid.list_documents',
    'lucid.list_folder_entries',
    'lucid.list_groups',
    'lucid.search_documents'
  ];
  const guardedSlugs = [
    'lucid.create_document',
    'lucid.create_folder',
    'lucid.delete_folder',
    'lucid.move_document_to_folder',
    'lucid.rename_folder',
    'lucid.trash_document'
  ];
  const handlerHasBases = /var\s+USERS_BASE\s*=\s*['"]https:\/\/users\.lucid\.app['"]/.test(handlerText)
    && /var\s+DOCS_BASE\s*=\s*['"]https:\/\/documents\.lucid\.app['"]/.test(handlerText)
    && /var\s+DOCLIST_BASE\s*=\s*['"]https:\/\/userdocslist\.lucid\.app['"]/.test(handlerText);
  const handlerHasSlugs = readSlugs.concat(guardedSlugs).every((slug) => handlerText.indexOf(slug) !== -1);
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1
    && guardedSlugs.every((slug) => handlerText.indexOf("guarded('" + slug + "'") !== -1);
  const urlMatches = handlerText.match(/https:\/\/[a-z0-9.-]+/gi) || [];
  const allowedOrigins = new Set([
    'https://lucid.app',
    'https://users.lucid.app',
    'https://documents.lucid.app',
    'https://userdocslist.lucid.app'
  ]);
  const urlsOk = urlMatches.every((url) => allowedOrigins.has(url.toLowerCase()));
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource/i.test(handlerText);
  return vendoredBasesOk && toolsOk && /FsbHandlerLucid/.test(handlerText) &&
    handlerHasBases && handlerHasSlugs && guardedIsInert && urlsOk && avoidsDirectCredentialApis
    ? expectedBases[0]
    : null;
}

// Linear's GraphQL host is a first-party same-registrable API subdomain with
// CORS explicitly allowing the linear.app page. The bundled head is restricted
// to read-only GraphQL queries through executeBoundSpec; page-owned Linear
// request headers are declared as fixed _authNeed storage markers and are read
// only inside capabilityFetchInPage.
function readLinearFirstPartyAuthReadBase(app, firstPartyAuthReadBaseUrls) {
  if (app !== 'linear' || !Array.isArray(firstPartyAuthReadBaseUrls)) { return null; }
  const expectedBases = ['https://client-api.linear.app'];
  if (expectedBases.length !== firstPartyAuthReadBaseUrls.length ||
      !expectedBases.every((base) => firstPartyAuthReadBaseUrls.includes(base))) {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'linear-api.ts');
  const toolsDir = join(VENDOR_PLUGINS, app, 'src', 'tools');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'linear.js');
  if (!existsSync(apiFile) || !existsSync(toolsDir) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');

  const vendoredGraphqlOk =
    /GRAPHQL_ENDPOINT\s*=\s*['"]https:\/\/client-api\.linear\.app\/graphql['"]/.test(apiText)
    && /access-control-allow-origin:\s*https:\/\/linear\.app/.test(apiText)
    && /access-control-allow-credentials:\s*true/.test(apiText)
    && /getLocalStorage\(['"]ApplicationStore['"]\)/.test(apiText)
    && /useraccount\s*:\s*auth\.userAccountId/.test(apiText)
    && /user\s*:\s*auth\.userId/.test(apiText)
    && /headers\.organization\s*=\s*auth\.organizationId/.test(apiText)
    && /headers\[['"]linear-client-id['"]\]\s*=\s*auth\.clientId/.test(apiText)
    && /credentials\s*:\s*['"]include['"]/.test(apiText);
  const readToolFiles = [
    'get-attachment.ts',
    'get-cycle.ts',
    'get-document.ts',
    'get-initiative.ts',
    'get-issue.ts',
    'get-milestone.ts',
    'get-project.ts',
    'get-team.ts',
    'get-user.ts',
    'get-viewer.ts',
    'list-attachments.ts',
    'list-comments.ts',
    'list-cycles.ts',
    'list-documents.ts',
    'list-initiatives.ts',
    'list-issue-history.ts',
    'list-issue-relations.ts',
    'list-labels.ts',
    'list-milestones.ts',
    'list-project-labels.ts',
    'list-project-updates.ts',
    'list-projects.ts',
    'list-sub-issues.ts',
    'list-team-members.ts',
    'list-teams.ts',
    'list-users.ts',
    'list-workflow-states.ts',
    'search-issues.ts'
  ];
  let readToolsOk = true;
  for (const name of readToolFiles) {
    const toolPath = join(toolsDir, name);
    if (!existsSync(toolPath)) { readToolsOk = false; break; }
    const text = readFileSync(toolPath, 'utf8');
    if (text.indexOf('graphql<') === -1 || /\bmutation\b/.test(text)) {
      readToolsOk = false;
      break;
    }
  }
  const readSlugs = [
    'linear.get_attachment',
    'linear.get_cycle',
    'linear.get_document',
    'linear.get_initiative',
    'linear.get_issue',
    'linear.get_milestone',
    'linear.get_project',
    'linear.get_team',
    'linear.get_user',
    'linear.get_viewer',
    'linear.list_attachments',
    'linear.list_comments',
    'linear.list_cycles',
    'linear.list_documents',
    'linear.list_initiatives',
    'linear.list_issue_history',
    'linear.list_issue_relations',
    'linear.list_labels',
    'linear.list_milestones',
    'linear.list_project_labels',
    'linear.list_project_updates',
    'linear.list_projects',
    'linear.list_sub_issues',
    'linear.list_team_members',
    'linear.list_teams',
    'linear.list_users',
    'linear.list_workflow_states',
    'linear.search_issues'
  ];
  const guardedSlugs = [
    'linear.add_issue_label',
    'linear.add_issue_subscriber',
    'linear.archive_issue',
    'linear.batch_update_issues',
    'linear.create_attachment',
    'linear.create_comment',
    'linear.create_document',
    'linear.create_initiative',
    'linear.create_issue',
    'linear.create_issue_relation',
    'linear.create_label',
    'linear.create_milestone',
    'linear.create_project',
    'linear.create_project_update',
    'linear.delete_attachment',
    'linear.delete_comment',
    'linear.delete_issue',
    'linear.delete_issue_relation',
    'linear.delete_label',
    'linear.delete_project_update',
    'linear.move_issue_to_project',
    'linear.remove_issue_label',
    'linear.remove_issue_subscriber',
    'linear.set_issue_cycle',
    'linear.update_comment',
    'linear.update_document',
    'linear.update_initiative',
    'linear.update_issue',
    'linear.update_label',
    'linear.update_milestone',
    'linear.update_project'
  ];
  const handlerOk = /Linear first-party authenticated READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/linear\.app['"]/.test(handlerText)
    && /var\s+GRAPHQL_ENDPOINT\s*=\s*['"]https:\/\/client-api\.linear\.app\/graphql['"]/.test(handlerText)
    && /executeBoundSpec/.test(handlerText)
    && /authStrategy\s*:\s*['"]same-origin-cookie['"]/.test(handlerText)
    && /credentials\s*:\s*['"]include['"]/.test(handlerText)
    && /_authNeed\s*:\s*authNeed\(\)/.test(handlerText)
    && /tokenKey\s*:\s*['"]ApplicationStore['"]/.test(handlerText)
    && /tokenPath\s*:\s*['"]currentUserAccountId['"]/.test(handlerText)
    && /header\s*:\s*['"]useraccount['"]/.test(handlerText)
    && /tokenPathTemplate\s*:\s*['"]userAccounts\.\{currentUserAccountId\}\.users\.0\.organization\.id['"]/.test(handlerText)
    && /header\s*:\s*['"]linear-client-id['"]/.test(handlerText);
  const readOk = readSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("guarded('" + slug + "'") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const urlMatches = handlerText.match(/https:\/\/[a-z0-9.-]+/g) || [];
  const allowedOrigins = new Set([
    'https://linear.app',
    'https://client-api.linear.app'
  ]);
  const urlsOk = urlMatches.every((url) => allowedOrigins.has(url.toLowerCase()));
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|getLocalStorage|Authorization|Bearer|csrfSource/.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session|useraccount)\b/i.test(handlerText);
  return vendoredGraphqlOk && readToolsOk && handlerOk && readOk && guardedOk
    && guardedIsInert && urlsOk && avoidsDirectCredentialApis && avoidsSecretLogging
    ? expectedBases[0] + '/graphql'
    : null;
}

// Home Depot reads use a first-party authenticated GraphQL host under
// homedepot.com plus a same-origin bootstrap page for store context. The
// bundled head excludes customer-cookie/profile and browser-navigation rows;
// add-to-cart is inert guarded fail-closed until live mutation evidence exists.
function readHomeDepotFirstPartyAuthReadBase(app, firstPartyAuthReadBaseUrls) {
  if (app !== 'homedepot' || !Array.isArray(firstPartyAuthReadBaseUrls)) { return null; }
  const expectedBases = ['https://apionline.homedepot.com'];
  if (expectedBases.length !== firstPartyAuthReadBaseUrls.length ||
      !expectedBases.every((base) => firstPartyAuthReadBaseUrls.includes(base))) {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'homedepot-api.ts');
  const toolsDir = join(VENDOR_PLUGINS, app, 'src', 'tools');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'homedepot.js');
  if (!existsSync(apiFile) || !existsSync(toolsDir) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');

  const vendoredGraphqlOk =
    /GRAPHQL_URL\s*=\s*['"]https:\/\/apionline\.homedepot\.com\/federation-gateway\/graphql['"]/.test(apiText)
    && /fetchJSON<GraphQLResponse<T>>/.test(apiText)
    && /X-Api-Cookies/.test(apiText)
    && /addToCartRest/.test(apiText)
    && /\/mcc-cart\/v2\/Cart\//.test(apiText);
  const readToolOps = [
    ['search-products.ts', 'searchModel'],
    ['get-product.ts', 'productClientOnlyProduct'],
    ['search-stores.ts', 'storeSearch'],
    ['get-cart.ts', 'getCart'],
    ['get-saved-items.ts', 'getAllSaveForLaterItems'],
    ['get-store-context.ts', '__EXPERIENCE_CONTEXT__']
  ];
  let readToolsOk = true;
  for (const pair of readToolOps) {
    const toolPath = join(toolsDir, pair[0]);
    if (!existsSync(toolPath) || readFileSync(toolPath, 'utf8').indexOf(pair[1]) === -1) {
      readToolsOk = false;
      break;
    }
  }
  const readSlugs = [
    'homedepot.search_products',
    'homedepot.get_product',
    'homedepot.search_stores',
    'homedepot.get_cart',
    'homedepot.get_saved_items',
    'homedepot.get_store_context'
  ];
  const guardedSlugs = ['homedepot.add_to_cart'];
  const excludedSlugs = [
    'homedepot.get_current_user',
    'homedepot.navigate_to_checkout',
    'homedepot.navigate_to_product'
  ];
  const handlerHasBases =
    /var\s+HOMEDEPOT_ORIGIN\s*=\s*['"]https:\/\/www\.homedepot\.com['"]/.test(handlerText)
    && /var\s+GQL_URL\s*=\s*['"]https:\/\/apionline\.homedepot\.com\/federation-gateway\/graphql['"]/.test(handlerText);
  const handlerHasSlugs = readSlugs.concat(guardedSlugs).every((slug) => handlerText.indexOf(slug) !== -1);
  const excludedStayAbsent = excludedSlugs.every((slug) => handlerText.indexOf(slug) === -1);
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1
    && guardedSlugs.every((slug) => handlerText.indexOf("'" + slug + "': guarded(") !== -1);
  const urlMatches = handlerText.match(/https:\/\/[a-z0-9.-]+/gi) || [];
  const allowedOrigins = new Set([
    'https://www.homedepot.com',
    'https://apionline.homedepot.com'
  ]);
  const urlsOk = urlMatches.every((url) => allowedOrigins.has(url.toLowerCase()));
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|getCookie|getPageGlobal|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|THD_CUSTOMER|THD_PERSIST|csrfSource/i.test(handlerText);
  const avoidsBrowserNavigation = !/window\.location|location\.href|document\.querySelector/i.test(handlerText);
  const descriptorsOk = readSlugs.concat(guardedSlugs).every((slug) => {
    const descriptorPath = join(ROOT, 'catalog', 'descriptors', 'opentabs__' + slug.replace('.', '__') + '.json');
    if (!existsSync(descriptorPath)) { return false; }
    return JSON.parse(readFileSync(descriptorPath, 'utf8')).backing === 'handler';
  }) && excludedSlugs.every((slug) => {
    const descriptorPath = join(ROOT, 'catalog', 'descriptors', 'opentabs__' + slug.replace('.', '__') + '.json');
    if (!existsSync(descriptorPath)) { return false; }
    return JSON.parse(readFileSync(descriptorPath, 'utf8')).backing === 'dom';
  });

  return vendoredGraphqlOk && readToolsOk && /FsbHandlerHomedepot/.test(handlerText)
    && handlerHasBases && handlerHasSlugs && excludedStayAbsent && guardedIsInert
    && urlsOk && avoidsDirectCredentialApis && avoidsBrowserNavigation && descriptorsOk
    ? expectedBases[0] + '/federation-gateway/graphql'
    : null;
}

// Craigslist's reviewed web tools call first-party API subdomains from the
// accounts.craigslist.org page context. This is a narrow same-registrable-domain
// accommodation: reads use executeBoundSpec, no direct credential APIs, and the
// posting/payment mutations are inert guarded fail-closed rows.
function readCraigslistFirstPartyAuthReadBase(app, firstPartyAuthReadBaseUrls) {
  if (app !== 'craigslist' || !Array.isArray(firstPartyAuthReadBaseUrls)) { return null; }
  const expectedBases = [
    'https://wapi.craigslist.org/web/v8',
    'https://capi.craigslist.org/web/v8',
    'https://accounts.craigslist.org'
  ];
  if (expectedBases.length !== firstPartyAuthReadBaseUrls.length ||
      !expectedBases.every((base) => firstPartyAuthReadBaseUrls.includes(base))) {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'craigslist-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'craigslist.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');

  const vendoredBasesOk = /const\s+WAPI_BASE\s*=\s*['"]https:\/\/wapi\.craigslist\.org\/web\/v8['"]/.test(apiText)
    && /const\s+CAPI_BASE\s*=\s*['"]https:\/\/capi\.craigslist\.org\/web\/v8['"]/.test(apiText)
    && /https:\/\/accounts\.craigslist\.org/.test(apiText);
  const readSlugs = [
    'craigslist.get_current_user',
    'craigslist.get_saved_search_counts',
    'craigslist.list_renewable_postings',
    'craigslist.list_payment_cards',
    'craigslist.list_chat_conversations',
    'craigslist.get_chat_messages'
  ];
  const guardedSlugs = [
    'craigslist.renew_all_postings',
    'craigslist.set_default_payment_card',
    'craigslist.delete_payment_card'
  ];
  const handlerHasBases = /var\s+ORIGIN\s*=\s*['"]https:\/\/accounts\.craigslist\.org['"]/.test(handlerText)
    && /var\s+WAPI_BASE\s*=\s*['"]https:\/\/wapi\.craigslist\.org\/web\/v8['"]/.test(handlerText)
    && /var\s+CAPI_BASE\s*=\s*['"]https:\/\/capi\.craigslist\.org\/web\/v8['"]/.test(handlerText);
  const handlerHasSlugs = readSlugs.concat(guardedSlugs).every((slug) => handlerText.indexOf(slug) !== -1);
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && guardedFunction[0].indexOf('executeBoundSpec') === -1;
  const urlMatches = handlerText.match(/https:\/\/[a-z0-9.-]+/gi) || [];
  const allowedOrigins = new Set([
    'https://accounts.craigslist.org',
    'https://wapi.craigslist.org',
    'https://capi.craigslist.org'
  ]);
  const urlsOk = urlMatches.every((url) => allowedOrigins.has(url.toLowerCase()));
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage|sessionStorage|Authorization|Bearer|csrfSource/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|session)\b/i.test(handlerText);
  return vendoredBasesOk && handlerHasBases && handlerHasSlugs && guardedIsInert &&
    urlsOk && avoidsDirectCredentialApis && avoidsSecretLogging
    ? expectedBases[0]
    : null;
}

// Hack2Hire's API is a reviewed cross-subdomain GET surface on the same
// registrable domain. It does not use first-party cookies; the page fetch
// primitive reads JSON-string localStorage token material inside the origin-pinned
// page and injects Authorization/x-user-id without returning those values.
function readHack2HireStorageBearerBase(app, storageBearerReadBaseUrl) {
  if (app !== 'hack2hire' || storageBearerReadBaseUrl !== 'https://api.hack2hire.com/algro/v1') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'hack2hire-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'hack2hire.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const vendoredHasStorageBearer = /const\s+API_BASE\s*=\s*['"]https:\/\/api\.hack2hire\.com\/algro\/v1['"]/.test(apiText)
    && /const\s+readJsonString\s*=\s*\(\s*key\s*:\s*string\s*\)\s*:\s*string\s*\|\s*null\s*=>[\s\S]*getLocalStorage\(key\)/.test(apiText)
    && /readJsonString\(['"]ALGRO_TOKEN['"]\)/.test(apiText)
    && /readJsonString\(['"]USER_ID['"]\)/.test(apiText)
    && /Authorization\s*:\s*`\s*Bearer\s+\$\{auth\.token\}`/.test(apiText)
    && /['"]x-user-id['"]\s*:\s*auth\.userId/.test(apiText)
    && /credentials\s*:\s*['"]omit['"]/.test(apiText);
  const promotedSlugs = [
    'hack2hire.get_comment',
    'hack2hire.get_company_question_stats',
    'hack2hire.get_completed_question_count',
    'hack2hire.get_current_user',
    'hack2hire.get_question',
    'hack2hire.get_question_neighbors',
    'hack2hire.get_subscription',
    'hack2hire.list_comment_replies',
    'hack2hire.list_companies',
    'hack2hire.list_my_bookmarks',
    'hack2hire.list_my_visits',
    'hack2hire.list_question_coding_problems',
    'hack2hire.list_question_comments',
    'hack2hire.list_questions'
  ];
  const slugMatches = handlerText.match(/hack2hire\.(?:get|list)_[a-z_]+/g) || [];
  const promotedSet = new Set(promotedSlugs);
  const onlyPromotedSlugs = slugMatches.every(function(slug) { return promotedSet.has(slug); });
  const hasReviewedHandler = /Hack2Hire storage-bearer READ head/.test(handlerText)
    && /var\s+API_BASE\s*=\s*['"]https:\/\/api\.hack2hire\.com\/algro\/v1['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]none['"]/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText)
    && /_authNeed\s*:\s*\{[\s\S]*kind\s*:\s*['"]bearer['"][\s\S]*tokenKey\s*:\s*['"]ALGRO_TOKEN['"][\s\S]*storageKey\s*:\s*['"]USER_ID['"]/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|method\s*:\s*['"]POST['"]|sideEffectClass\s*:\s*['"](?:write|delete|navigation)['"]/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|user[-_]?id)\b/i.test(handlerText);
  return vendoredHasStorageBearer && hasReviewedHandler && promotedOk && onlyPromotedSlugs
    && avoidsDirectCredentialApis && avoidsSecretLogging
    ? storageBearerReadBaseUrl
    : null;
}

// Tinder uses a storage token on www.tinder.com and sends GET reads to
// api.gotinder.com with X-Auth-Token plus persistent-device-id. This is intentionally
// narrower than the same-registrable storage-bearer accommodation: gotinder.com is a
// separate registrable domain, so only the reviewed Tinder handler can use it.
function readTinderStorageBearerBase(app, tinderStorageBearerReadBaseUrl) {
  if (app !== 'tinder' || tinderStorageBearerReadBaseUrl !== 'https://api.gotinder.com') { return null; }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'tinder-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'tinder.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');

  const vendoredHasStorageBearer = /const\s+API_BASE\s*=\s*['"]https:\/\/api\.gotinder\.com['"]/.test(apiText)
    && /getLocalStorage\(['"]TinderWeb\/APIToken['"]\)/.test(apiText)
    && /getLocalStorage\(['"]TinderWeb\/uuid['"]\)/.test(apiText)
    && /['"]X-Auth-Token['"]\s*:\s*auth\.token/.test(apiText)
    && /['"]persistent-device-id['"]\s*:\s*auth\.deviceId/.test(apiText)
    && /credentials\s*:\s*['"]omit['"]/.test(apiText);
  const promotedSlugs = [
    'tinder.get_current_user',
    'tinder.get_fast_match_count',
    'tinder.get_fast_match_preview',
    'tinder.get_recommendations',
    'tinder.get_user',
    'tinder.list_matches'
  ];
  const guardedSlugs = [
    'tinder.get_metadata',
    'tinder.get_updates',
    'tinder.like_message',
    'tinder.like_user',
    'tinder.pass_user',
    'tinder.send_message',
    'tinder.super_like_user',
    'tinder.unmatch',
    'tinder.update_location',
    'tinder.update_profile'
  ];
  const slugMatches = handlerText.match(/tinder\.(?:get|list|like|pass|send|super_like|unmatch|update)_[a-z_]+/g) || [];
  const allowedSet = new Set(promotedSlugs.concat(guardedSlugs));
  const onlyReviewedSlugs = slugMatches.every(function(slug) { return allowedSet.has(slug); });
  const hasReviewedHandler = /Tinder storage-bearer READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/www\.tinder\.com['"]/.test(handlerText)
    && /var\s+API_BASE\s*=\s*['"]https:\/\/api\.gotinder\.com['"]/.test(handlerText)
    && /authStrategy\s*:\s*['"]none['"]/.test(handlerText)
    && /credentials\s*:\s*['"]omit['"]/.test(handlerText)
    && /_authNeed\s*:\s*\{[\s\S]*kind\s*:\s*['"]bearer['"][\s\S]*tokenKey\s*:\s*['"]TinderWeb\/APIToken['"][\s\S]*storageKey\s*:\s*['"]TinderWeb\/uuid['"]/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("guardedHandler('" + slug + "'") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guardedHandler\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && !/executeBoundSpec|executeBoundPageRead/.test(guardedFunction[0]);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|method\s*:\s*['"]POST['"]/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|device)\b/i.test(handlerText);

  return vendoredHasStorageBearer && hasReviewedHandler && promotedOk && guardedOk &&
    guardedIsInert && onlyReviewedSlugs && avoidsDirectCredentialApis && avoidsSecretLogging
    ? tinderStorageBearerReadBaseUrl
    : null;
}

// ClickHouse Cloud uses an Auth0 access token stored by the first-party console
// page and a same-registrable control-plane API host. The bundled head is a
// storage-free dispatcher; the token is read only inside the origin-pinned
// page-read primitive and is never returned to the extension.
function readClickHouseStorageBearerBase(app, storageBearerReadBaseUrl) {
  if (app !== 'clickhouse' || storageBearerReadBaseUrl !== 'https://control-plane-internal.clickhouse.cloud') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'clickhouse-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'clickhouse.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');

  const vendoredHasStorageBearer = /AUTH0_STORAGE_KEY\s*=\s*['"]@@auth0spajs@@::IPpH4RND0qNXHVayepffgsGpbXQmFikr::control-plane-web::openid profile email['"]/.test(apiText)
    && /getLocalStorage\(AUTH0_STORAGE_KEY\)/.test(apiText)
    && /getPageGlobal\(['"]consoleConfig\.controlPlane\.apiHost['"]\)/.test(apiText)
    && /return\s+['"]https:\/\/control-plane-internal\.clickhouse\.cloud['"]/.test(apiText)
    && /Authorization\s*:\s*`\s*Bearer\s+\$\{auth\.accessToken\}`/.test(apiText)
    && /credentials\s*:\s*['"]include['"]/.test(apiText);
  const toolContracts = [
    ['get-private-endpoint-config.ts', "rpcAction: 'getPrivateEndpointConfig'"],
    ['get-scaling-limits.ts', "rpcAction: 'getLimits'"],
    ['list-backups.ts', "rpcAction: 'list'"],
    ['query-metrics.ts', '/api/metrics/queryMetrics'],
    ['get-organization.ts', "getFromCache<RawOrganization[]>('organizations')"],
    ['list-organization-members.ts', "getFromCache<RawOrganizationWithUsers[]>('organizations')"],
    ['list-services.ts', "getFromCache<RawInstance[]>('instances')"],
    ['get-service.ts', "getFromCache<RawService[]>('instances')"]
  ];
  let toolsOk = true;
  for (const pair of toolContracts) {
    const toolPath = join(VENDOR_PLUGINS, app, 'src', 'tools', pair[0]);
    if (!existsSync(toolPath) || readFileSync(toolPath, 'utf8').indexOf(pair[1]) === -1) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'clickhouse.get_organization',
    'clickhouse.get_private_endpoint_config',
    'clickhouse.get_scaling_limits',
    'clickhouse.get_service',
    'clickhouse.get_status',
    'clickhouse.list_backups',
    'clickhouse.list_organization_members',
    'clickhouse.list_services',
    'clickhouse.query_metrics'
  ];
  const slugMatches = handlerText.match(/clickhouse\.(?:get|list|query)_[a-z_]+/g) || [];
  const promotedSet = new Set(promotedSlugs);
  const onlyPromotedSlugs = slugMatches.every(function(slug) { return promotedSet.has(slug); });
  const hasReviewedHandler = /ClickHouse Cloud same-origin read head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/console\.clickhouse\.cloud['"]/.test(handlerText)
    && /namespace\s*:\s*['"]clickhouse['"]/.test(handlerText)
    && /global\.FsbHandlerClickhouse\s*=\s*handlers/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization\s*:|['"]Authorization['"]|Bearer\s+\$|['"]Bearer\s+['"]|method\s*:\s*['"]POST['"]|sideEffectClass\s*:\s*['"](?:write|delete|navigation)['"]/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|auth0)\b/i.test(handlerText);

  return vendoredHasStorageBearer && toolsOk && hasReviewedHandler && promotedOk
    && onlyPromotedSlugs && avoidsDirectCredentialApis && avoidsSecretLogging
    ? storageBearerReadBaseUrl
    : null;
}

// Azure Portal uses a first-party MSAL ARM token from sessionStorage and calls
// management.azure.com with bearer auth from the page-read primitive. Keep the
// accommodation app-specific and source-proven so unrelated cross-subdomain
// bearer reads cannot inherit it.
function readAzureArmStorageBearerBase(app, storageBearerReadBaseUrl) {
  if (app !== 'azure' || storageBearerReadBaseUrl !== 'https://management.azure.com') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'azure-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'azure.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');

  const vendoredHasArmBearer = /const\s+ARM_BASE\s*=\s*['"]https:\/\/management\.azure\.com['"]/.test(apiText)
    && /findMsalToken\(['"]management\.core\.windows\.net['"]\)/.test(apiText)
    && /Authorization\s*:\s*`\s*Bearer\s+\$\{auth\.armToken\}`/.test(apiText)
    && /credentials\s*:\s*['"]omit['"]/.test(apiText);
  const promotedSlugs = [
    'azure.get_current_user',
    'azure.get_deployment',
    'azure.get_policy_assignment',
    'azure.get_resource',
    'azure.get_resource_group',
    'azure.get_subscription',
    'azure.list_activity_logs',
    'azure.list_deployments',
    'azure.list_locations',
    'azure.list_locks',
    'azure.list_policy_assignments',
    'azure.list_resource_groups',
    'azure.list_resource_providers',
    'azure.list_resources',
    'azure.list_role_assignments',
    'azure.list_subscription_locations',
    'azure.list_subscriptions',
    'azure.list_tags',
    'azure.list_tenants'
  ];
  const guardedSlugs = [
    'azure.create_deployment',
    'azure.create_lock',
    'azure.create_resource_group',
    'azure.delete_deployment',
    'azure.delete_lock',
    'azure.delete_resource',
    'azure.delete_resource_group'
  ];
  const slugMatches = handlerText.match(/azure\.(?:get|list)_[a-z_]+/g) || [];
  const promotedSet = new Set(promotedSlugs);
  const onlyPromotedSlugs = slugMatches.every(function(slug) { return promotedSet.has(slug); });
  const hasReviewedHandler = /Azure Portal ARM read head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/portal\.azure\.com['"]/.test(handlerText)
    && /namespace\s*:\s*['"]azure['"]/.test(handlerText)
    && /global\.FsbHandlerAzure\s*=\s*handlers/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) {
    return handlerText.indexOf("guarded('" + slug + "'") !== -1;
  });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  \}/);
  const guardedIsInert = guardedFunction && !/executeBoundSpec|executeBoundPageRead/.test(guardedFunction[0]);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization\s*:|['"]Authorization['"]|Bearer\s+\$|method\s*:\s*['"]POST['"]/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|msal)\b/i.test(handlerText);

	  return vendoredHasArmBearer && hasReviewedHandler && promotedOk && onlyPromotedSlugs
	    && guardedOk && guardedIsInert && avoidsDirectCredentialApis && avoidsSecretLogging
	    ? storageBearerReadBaseUrl
	    : null;
}

function readClickUpPageBearerBase(app, pageBearerReadBaseUrl) {
  if (app !== 'clickup' || pageBearerReadBaseUrl !== 'https://api.clickup.com') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'clickup-api.ts');
  const toolsDir = join(VENDOR_PLUGINS, app, 'src', 'tools');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'clickup.js');
  const pageReadFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(apiFile) || !existsSync(toolsDir) || !existsSync(handlerFile) || !existsSync(pageReadFile)) {
    return null;
  }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const pageReadText = readFileSync(pageReadFile, 'utf8');

  const vendoredAuthOk = /installWsInterceptor/.test(apiText)
    && /__cu_captured_jwt/.test(apiText)
    && /getLocalStorage\(['"]cuHandshake['"]\)/.test(apiText)
    && /apiUrlBase/.test(apiText)
    && /Authorization\s*:\s*`\s*Bearer\s+\$\{auth\.token\}`/.test(apiText)
    && /fetchJSON<T>\(url,\s*init\)/.test(apiText);
  const toolContracts = [
    ['get-current-user.ts', '/user/v1/user/me'],
    ['get-workspace.ts', '/team/v1/team/'],
    ['get-workspace-members.ts', '/v1/team/'],
    ['get-spaces.ts', '/hierarchy/v1/project'],
    ['get-space.ts', '/hierarchy/v1/project/'],
    ['get-folders.ts', '/hierarchy/v1/project/'],
    ['get-folder.ts', '/hierarchy/v1/category/'],
    ['get-lists.ts', '/hierarchy/v1/category/'],
    ['get-list.ts', '/hierarchy/v1/subcategory/'],
    ['get-goals.ts', '/v1/team/'],
    ['get-custom-fields.ts', '/customFields/v1/team/']
  ];
  let toolsOk = true;
  for (const pair of toolContracts) {
    const toolPath = join(toolsDir, pair[0]);
    if (!existsSync(toolPath) || readFileSync(toolPath, 'utf8').indexOf(pair[1]) === -1) {
      toolsOk = false;
      break;
    }
  }
  const promotedSlugs = [
    'clickup.get_current_user',
    'clickup.get_custom_fields',
    'clickup.get_folder',
    'clickup.get_folders',
    'clickup.get_goals',
    'clickup.get_list',
    'clickup.get_lists',
    'clickup.get_space',
    'clickup.get_spaces',
    'clickup.get_workspace',
    'clickup.get_workspace_members'
  ];
  const slugMatches = handlerText.match(/clickup\.get_[a-z_]+/g) || [];
  const promotedSet = new Set(promotedSlugs);
  const onlyPromotedSlugs = slugMatches.every(function(slug) { return promotedSet.has(slug); });
  const handlerOk = /ClickUp page-bearer read head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/app\.clickup\.com['"]/.test(handlerText)
    && /namespace\s*:\s*['"]clickup['"]/.test(handlerText)
    && /global\.FsbHandlerClickup\s*=\s*handlers/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const pageReadOk = /var\s+CLICKUP_REPRESENTATIVE_API_BASE\s*=\s*['"]https:\/\/api\.clickup\.com['"]/.test(pageReadText)
    && /__cu_captured_jwt/.test(pageReadText)
    && /cuHandshake/.test(pageReadText)
    && /host\s*!==\s*['"]clickup\.com['"]\s*&&\s*host\.slice\(-12\)\s*!==\s*['"]\.clickup\.com['"]/.test(pageReadText)
    && /request\.namespace\s*===\s*['"]clickup['"]/.test(pageReadText)
    && /['"]Authorization['"]\s*:\s*['"]Bearer\s+['"]\s*\+\s*auth\.token/.test(pageReadText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization\s*:|['"]Authorization['"]|Bearer\s+\$|['"]Bearer\s+['"]|method\s*:\s*['"]POST['"]|sideEffectClass\s*:\s*['"](?:write|delete|navigation)['"]/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|jwt)\b/i.test(handlerText);

  return vendoredAuthOk && toolsOk && handlerOk && pageReadOk && promotedOk
    && onlyPromotedSlugs && avoidsDirectCredentialApis && avoidsSecretLogging
    ? pageBearerReadBaseUrl
    : null;
}

function readSpotifyPageBearerBase(app, pageBearerReadBaseUrl) {
  if (app !== 'spotify' || pageBearerReadBaseUrl !== 'https://api.spotify.com/v1') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'spotify-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'spotify.js');
  const pageReadFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile) || !existsSync(pageReadFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const pageReadText = readFileSync(pageReadFile, 'utf8');

  const vendoredHasPageBearer = /const\s+PUBLIC_API\s*=\s*['"]https:\/\/api\.spotify\.com\/v1['"]/.test(apiText)
    && /const\s+GRAPHQL_API\s*=\s*['"]https:\/\/api-partner\.spotify\.com\/pathfinder\/v2\/query['"]/.test(apiText)
    && /setAuthCache<SpotifyAuth>\(['"]spotify['"]/.test(apiText)
    && /Authorization\s*:\s*`\s*Bearer\s+\$\{auth\.token\}`/.test(apiText)
    && /fetchFromPage\(GRAPHQL_API/.test(apiText)
    && /fetchFromPage\(url,\s*init\)/.test(apiText)
    && /credentials\s*:\s*['"]omit['"]/.test(apiText);
  const promotedSlugs = [
    'spotify.get_album',
    'spotify.get_artist',
    'spotify.get_available_devices',
    'spotify.get_current_user',
    'spotify.get_currently_playing',
    'spotify.get_playback_state',
    'spotify.get_playlist',
    'spotify.get_queue',
    'spotify.get_recently_played',
    'spotify.get_saved_tracks',
    'spotify.search'
  ];
  const guardedSlugs = [
    'spotify.add_to_queue',
    'spotify.pause_playback',
    'spotify.seek_to_position',
    'spotify.set_repeat_mode',
    'spotify.set_volume',
    'spotify.skip_to_next',
    'spotify.skip_to_previous',
    'spotify.start_playback',
    'spotify.toggle_shuffle',
    'spotify.transfer_playback'
  ];
  const slugMatches = handlerText.match(/spotify\.(?:get_[a-z_]+|search|add_to_queue|pause_playback|seek_to_position|set_repeat_mode|set_volume|skip_to_next|skip_to_previous|start_playback|toggle_shuffle|transfer_playback)/g) || [];
  const allowedSet = new Set(promotedSlugs.concat(guardedSlugs));
  const onlyReviewedSlugs = slugMatches.every(function(slug) { return allowedSet.has(slug); });
  const hasReviewedHandler = /Spotify page-bearer read head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/open\.spotify\.com['"]/.test(handlerText)
    && /namespace\s*:\s*['"]spotify['"]/.test(handlerText)
    && /global\.FsbHandlerSpotify\s*=\s*handlers/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const pageReadHasSpotify = /var\s+SPOTIFY_PUBLIC_API\s*=\s*['"]https:\/\/api\.spotify\.com\/v1['"]/.test(pageReadText)
    && /var\s+SPOTIFY_GRAPHQL_API\s*=\s*['"]https:\/\/api-partner\.spotify\.com\/pathfinder\/v2\/query['"]/.test(pageReadText)
    && /function\s+spotifyToken\s*\(/.test(pageReadText)
    && /fetch\(['"]\/api\/token['"]/.test(pageReadText)
    && /namespace\s*!==\s*['"]spotify['"]/.test(pageReadText)
    && /namespace\s*===\s*['"]spotify['"]/.test(pageReadText)
    && /Authorization['"]?\s*:\s*['"]Bearer\s['"]\s*\+\s*token/.test(pageReadText);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization\s*:|['"]Authorization['"]|method\s*:\s*['"]POST['"]/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|access)\b/i.test(handlerText);

  return vendoredHasPageBearer && hasReviewedHandler && promotedOk && guardedOk
    && onlyReviewedSlugs && pageReadHasSpotify && avoidsDirectCredentialApis && avoidsSecretLogging
    ? pageBearerReadBaseUrl
    : null;
}

function readTwitchPageBearerBase(app, pageBearerReadBaseUrl) {
  if (app !== 'twitch' || pageBearerReadBaseUrl !== 'https://gql.twitch.tv') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'twitch-api.ts');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'twitch.js');
  const pageReadFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(apiFile) || !existsSync(handlerFile) || !existsSync(pageReadFile)) { return null; }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const pageReadText = readFileSync(pageReadFile, 'utf8');

  const vendoredHasPageBearer = /const\s+GQL_URL\s*=\s*['"]https:\/\/gql\.twitch\.tv\/gql['"]/.test(apiText)
    && /const\s+CLIENT_ID\s*=\s*['"]kimne78kx3ncx6brgo4mv6wki5h1ko['"]/.test(apiText)
    && /getCookie\(['"]auth-token['"]\)/.test(apiText)
    && /getCookie\(['"]twilight-user['"]\)/.test(apiText)
    && /Authorization\s*:\s*`\s*OAuth\s+\$\{auth\.token\}`/.test(apiText)
    && /fetchFromPage\(GQL_URL/.test(apiText)
    && /credentials\s*:\s*['"]omit['"]/.test(apiText);
  const promotedSlugs = [
    'twitch.get_channel_emotes',
    'twitch.get_current_user',
    'twitch.get_game',
    'twitch.get_game_clips',
    'twitch.get_stream',
    'twitch.get_streams_by_game',
    'twitch.get_top_games',
    'twitch.get_top_streams',
    'twitch.get_user_clips',
    'twitch.get_user_profile',
    'twitch.get_user_videos',
    'twitch.get_video',
    'twitch.search_categories',
    'twitch.search_channels'
  ];
  const slugMatches = handlerText.match(/twitch\.(?:get_[a-z_]+|search_categories|search_channels)/g) || [];
  const allowedSet = new Set(promotedSlugs);
  const onlyReviewedSlugs = slugMatches.every(function(slug) { return allowedSet.has(slug); });
  const hasReviewedHandler = /Twitch GraphQL page-bearer read head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/www\.twitch\.tv['"]/.test(handlerText)
    && /namespace\s*:\s*['"]twitch['"]/.test(handlerText)
    && /global\.FsbHandlerTwitch\s*=\s*handlers/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const pageReadHasTwitch = /var\s+TWITCH_GQL_URL\s*=\s*['"]https:\/\/gql\.twitch\.tv\/gql['"]/.test(pageReadText)
    && /var\s+TWITCH_CLIENT_ID\s*=\s*['"]kimne78kx3ncx6brgo4mv6wki5h1ko['"]/.test(pageReadText)
    && /function\s+twitchAuth\s*\(/.test(pageReadText)
    && /document\.cookie/.test(pageReadText)
    && /namespace\s*!==\s*['"]twitch['"]/.test(pageReadText)
    && /namespace\s*===\s*['"]twitch['"]/.test(pageReadText)
    && /Authorization['"]?\s*:\s*['"]OAuth\s['"]\s*\+\s*auth\.token/.test(pageReadText);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization\s*:|['"]Authorization['"]|method\s*:\s*['"]POST['"]/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|access|oauth)\b/i.test(handlerText);

  return vendoredHasPageBearer && hasReviewedHandler && promotedOk
    && onlyReviewedSlugs && pageReadHasTwitch && avoidsDirectCredentialApis && avoidsSecretLogging
    ? pageBearerReadBaseUrl
    : null;
}

function readSupabasePageBearerBase(app, pageBearerReadBaseUrl) {
  if (app !== 'supabase' || pageBearerReadBaseUrl !== 'https://api.supabase.com/v1') {
    return null;
  }
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'supabase.js');
  const pageReadFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(handlerFile) || !existsSync(pageReadFile)) { return null; }
  const handlerText = readFileSync(handlerFile, 'utf8');
  const pageReadText = readFileSync(pageReadFile, 'utf8');

  const promotedSlugs = [
    'supabase.generate_types',
    'supabase.get_api_keys',
    'supabase.get_function',
    'supabase.get_organization',
    'supabase.get_performance_advisors',
    'supabase.get_postgrest_config',
    'supabase.get_project',
    'supabase.get_project_health',
    'supabase.get_project_logs',
    'supabase.get_security_advisors',
    'supabase.list_backups',
    'supabase.list_buckets',
    'supabase.list_functions',
    'supabase.list_migrations',
    'supabase.list_organization_members',
    'supabase.list_organizations',
    'supabase.list_projects',
    'supabase.list_secrets',
    'supabase.list_sql_snippets'
  ];
  const guardedSlugs = [
    'supabase.create_secrets',
    'supabase.delete_function',
    'supabase.delete_secrets',
    'supabase.pause_project',
    'supabase.restore_project',
    'supabase.run_query',
    'supabase.run_read_only_query'
  ];
  const slugMatches = handlerText.match(/supabase\.(?:generate_types|get_[a-z_]+|list_[a-z_]+|create_secrets|delete_function|delete_secrets|pause_project|restore_project|run_query|run_read_only_query)/g) || [];
  const allowedSet = new Set(promotedSlugs.concat(guardedSlugs));
  const onlyReviewedSlugs = slugMatches.every(function(slug) { return allowedSet.has(slug); });
  const handlerOk = /Supabase Management API page-read head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/supabase\.com['"]/.test(handlerText)
    && /namespace\s*:\s*['"]supabase['"]/.test(handlerText)
    && /global\.FsbHandlerSupabase\s*=\s*handlers/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const promotedOk = promotedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedOk = guardedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const guardedFunction = handlerText.match(/function\s+guarded\s*\([\s\S]*?\n  }\n\n  var\s+handlers\s*=/);
  const guardedIsInert = guardedFunction
    && /return\s+fallback\(slug,\s*reason\)/.test(guardedFunction[0])
    && !/executeBound(?:Spec|PageRead)|\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|localStorage\.getItem|sessionStorage\.getItem|Authorization|Bearer/i.test(guardedFunction[0]);
  const pageReadOk = /function\s+supabaseAuth\s*\(/.test(pageReadText)
    && /storageGet\(['"]supabase\.dashboard\.auth\.token['"]\)/.test(pageReadText)
    && /fetch\(['"]https:\/\/api\.supabase\.com\/v1['"]\s*\+\s*endpoint/.test(pageReadText)
    && /method\s*:\s*['"]GET['"]/.test(pageReadText)
    && /credentials\s*:\s*['"]omit['"]/.test(pageReadText)
    && /redirect\s*:\s*['"]manual['"]/.test(pageReadText)
    && /Authorization['"]?\s*:\s*['"]Bearer\s['"]\s*\+\s*auth\.accessToken/.test(pageReadText)
    && /function\s+supabaseRead\s*\(/.test(pageReadText)
    && /namespace\s*===\s*['"]supabase['"]/.test(pageReadText);
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization|Bearer/i.test(handlerText);
  const avoidsSecretLogging = !/console\.\w+\([^)]*\b(token|secret|cookie|csrf|authorization|bearer|access)\b/i.test(handlerText);

  return handlerOk && promotedOk && guardedOk && onlyReviewedSlugs && guardedIsInert
    && pageReadOk && avoidsDirectCredentialApis && avoidsSecretLogging
    ? pageBearerReadBaseUrl
    : null;
}

function readGlamaPageStateRuntimeBase(app, runtimeBaseUrl) {
  if (app !== 'glama' || runtimeBaseUrl !== 'https://glama.ai') {
    return null;
  }
  const apiFile = join(VENDOR_PLUGINS, app, 'src', 'glama-api.ts');
  const toolsDir = join(VENDOR_PLUGINS, app, 'src', 'tools');
  const handlerFile = join(ROOT, 'catalog', 'handlers', 'glama.js');
  const pageReadFile = join(ROOT, 'extension', 'utils', 'capability-fetch.js');
  if (!existsSync(apiFile) || !existsSync(toolsDir) || !existsSync(handlerFile) || !existsSync(pageReadFile)) {
    return null;
  }
  const apiText = readFileSync(apiFile, 'utf8');
  const handlerText = readFileSync(handlerFile, 'utf8');
  const pageReadText = readFileSync(pageReadFile, 'utf8');
  const pageReadBlockMatch = pageReadText.match(/function\s+glamaString\s*\([\s\S]*?function\s+waRequire\s*\(/);
  const pageReadBlock = pageReadBlockMatch ? pageReadBlockMatch[0] : '';
  const toolTexts = readdirSync(toolsDir)
    .filter(function(name) { return /\.ts$/.test(name); })
    .map(function(name) { return readFileSync(join(toolsDir, name), 'utf8'); })
    .join('\n');

  const reviewedSlugs = [
    'glama.get_chat_session',
    'glama.get_current_user',
    'glama.get_server',
    'glama.get_server_score',
    'glama.list_available_models',
    'glama.list_gateway_models',
    'glama.list_mcp_clients',
    'glama.list_popular_servers',
    'glama.list_projects',
    'glama.list_recent_chats',
    'glama.list_server_categories',
    'glama.list_server_tools',
    'glama.list_servers_by_category',
    'glama.search_servers',
    'glama.search_tools'
  ];
  const reviewedRoutes = [
    'root',
    'routes/_authenticated/_app/_layout',
    'routes/_authenticated/_app/chat/~uid/_index/_route',
    'routes/_authenticated/_app/projects/_index/_route',
    'routes/_public/gateway/models/_index/_route',
    'routes/_public/mcp/clients/_index/_index/_route',
    'routes/_public/mcp/servers/categories/_index/_route',
    'routes/_public/mcp/servers/categories/~slug/_route',
    'routes/_public/mcp/servers/_index/_route',
    'routes/_public/mcp/tools/_index/_route',
    'routes/_public/mcp/servers/~namespace/~slug/_pages/_index/_route',
    'routes/_public/mcp/servers/~namespace/~slug/_pages/score/_route'
  ];
  const slugMatches = handlerText.match(/glama\.(?:get|list|search)_[a-z_]+/g) || [];
  const reviewedSet = new Set(reviewedSlugs);
  const onlyReviewedSlugs = slugMatches.every(function(slug) { return reviewedSet.has(slug); });
  const vendoredRouterOk = /getPageGlobal\(['"]__reactRouterDataRouter['"]\)/.test(apiText)
    && /router\.state\.loaderData/.test(apiText)
    && /await\s+router\.navigate\(path\)/.test(apiText)
    && /setAuthCache\s*\(\s*['"]glama['"]/.test(apiText)
    && reviewedRoutes.every(function(routeKey) { return toolTexts.indexOf(routeKey) !== -1; });
  const handlerOk = /Glama React Router loader-data READ head/.test(handlerText)
    && /var\s+ORIGIN\s*=\s*['"]https:\/\/glama\.ai['"]/.test(handlerText)
    && /namespace\s*:\s*['"]glama['"]/.test(handlerText)
    && /executeBoundPageRead/.test(handlerText)
    && /global\.FsbHandlerGlama\s*=\s*handlers/.test(handlerText)
    && /sideEffectClass\s*:\s*['"]read['"]/.test(handlerText);
  const pageReadOk = /function\s+glamaRouter\s*\(/.test(pageReadBlock)
    && /globalThis\.__reactRouterDataRouter/.test(pageReadBlock)
    && /router\.navigate\(path\)/.test(pageReadBlock)
    && /router\.state\.loaderData/.test(pageReadBlock)
    && /request\.namespace\s*!==\s*['"]glama['"]/.test(pageReadText)
    && /request\.namespace\s*===\s*['"]glama['"]/.test(pageReadText)
    && reviewedRoutes.every(function(routeKey) { return pageReadBlock.indexOf(routeKey) !== -1; });
  const promotedOk = reviewedSlugs.every(function(slug) { return handlerText.indexOf(slug) !== -1; });
  const avoidsDirectCredentialApis = !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization|Bearer|method\s*:\s*['"]POST['"]|sideEffectClass\s*:\s*['"](?:write|delete|navigation)['"]/i.test(handlerText);
  const pageReadAvoidsNetworkAndSecrets = pageReadBlock
    && !/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization|Bearer|method\s*:\s*['"]POST['"]/i.test(pageReadBlock);
  return vendoredRouterOk && handlerOk && pageReadOk && promotedOk && onlyReviewedSlugs
    && avoidsDirectCredentialApis && pageReadAvoidsNetworkAndSecrets
    ? runtimeBaseUrl
    : null;
}

function hasForbiddenSheetsNetworkPrimitive(source) {
  const text = String(source || '');
  return /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|Worker|SharedWorker|importScripts|axios|superagent)\b/i.test(text);
}

// The Sheets content action is a reviewed UI-only boundary. Keep this stricter than
// the session helper: the latter owns the one fixed page-gapi request, while content
// code may only inspect the pinned Sheets DOM and issue trusted keyboard gestures.
// Reject the primitive names themselves so aliases and bracket access cannot turn a
// harmless-looking operation argument into a generic authenticated network proxy.
function hasForbiddenSheetsContentNetworkSource(source) {
  const text = String(source || '');
  const dynamicOrProxyCall =
    /\b(?:globalThis|window|self|document|navigator|tools|chrome(?:Api)?|browser)\s*\[/i.test(text)
    || /\]\s*\(/.test(text)
    || /\.\s*request\s*\(/i.test(text)
    || /\b(?:gapi|postMessage|MessageChannel|BroadcastChannel)\b/i.test(text)
    || /\b(?:chrome(?:Api)?|browser)\s*\.\s*(?:runtime|tabs|scripting|webRequest|cookies|identity)\b/i.test(text)
    || /\bReflect\s*\.\s*(?:get|set|apply|construct)\s*\(/i.test(text);

  const urlLiteralOrBuilder =
    /['"`]\s*(?:https?|wss?|ftp|data|blob)\s*:/i.test(text)
    || /['"`]\s*\/\/(?![/*])/i.test(text)
    || /\b(?:url|uri|endpoint|baseUrl)\b/i.test(text)
    || /\b(?:encodeURI|decodeURI)(?:Component)?\s*\(/i.test(text)
    || /\b(?:params|args|request|payload|input)\s*(?:\.\s*(?:url|uri|href|src|endpoint|origin|host|path)\b|\[\s*['"`](?:url|uri|href|src|endpoint|origin|host|path)['"`]\s*\])/i.test(text);

  const domNetworkSink =
    /\b(?:new\s+)?(?:Image|Audio)\s*\(/i.test(text)
    || /\bdocument\s*\.\s*createElement(?:NS)?\s*\([\s\S]*?['"`](?:a|audio|embed|form|iframe|image|img|link|meta|object|script|source|track|video)\b/i.test(text)
    || /(?:\.\s*(?:src|srcdoc|srcset|href|action|formAction|poster|data)\b|\[\s*['"`](?:src|srcdoc|srcset|href|action|formAction|poster|data)['"`]\s*\])\s*=/i.test(text)
    || /\[[^\]\r\n]+\]\s*=/.test(text)
    || /\.\s*setAttribute(?:NS)?\s*\(/i.test(text)
    || /\bObject\s*\.\s*(?:assign|defineProperty|defineProperties)\s*\(/i.test(text)
    || /\.\s*(?:innerHTML|outerHTML|cssText|background|backgroundImage|borderImage|content|cursor|listStyle|listStyleImage|mask|maskImage)\s*=/i.test(text)
    || /\.\s*(?:createContextualFragment|insertAdjacentHTML|submit|requestSubmit|setProperty)\s*\(/i.test(text)
    || /\b(?:window|globalThis|self)\s*\.\s*open\s*\(/i.test(text)
    || /\b(?:window\s*\.\s*)?(?:document\s*\.\s*)?location\s*(?:\.\s*href\s*)?=/i.test(text)
    || /\blocation\s*\.\s*(?:assign|replace|reload)\s*\(/i.test(text);

  return hasForbiddenSheetsNetworkPrimitive(text)
    || dynamicOrProxyCall
    || urlLiteralOrBuilder
    || domNetworkSink;
}

export function verifyPageGapiUiSheetsSessionSources(sourceOverrides) {
  const overrides = sourceOverrides || {};
  const expectedBase = 'https://sheets.googleapis.com/v4';
  const sessionPath = join(ROOT, 'extension', 'utils', 'google-sheets-session.js');
  const handlerPath = join(ROOT, 'catalog', 'handlers', 'gsheets.js');
  const contentActionsPath = join(ROOT, 'extension', 'content', 'actions.js');
  const manifestPath = join(ROOT, 'extension', 'manifest.json');
  const failures = [];

  let manifest = overrides.manifest;
  if (manifest === undefined) {
    if (!existsSync(manifestPath)) {
      manifest = null;
    } else {
      try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch (_e) { manifest = null; }
    }
  }
  const permissions = manifest && Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const manifestOk = !!manifest
    && !permissions.includes('identity')
    && !Object.prototype.hasOwnProperty.call(manifest, 'oauth2');
  if (!manifestOk) { failures.push('MANIFEST_IDENTITY_OR_OAUTH2_PRESENT'); }

  const readSource = function(overrideKey, filePath) {
    if (Object.prototype.hasOwnProperty.call(overrides, overrideKey)) {
      return typeof overrides[overrideKey] === 'string' ? overrides[overrideKey] : '';
    }
    return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  };
  const sessionText = readSource('sessionText', sessionPath);
  const handlerText = readSource('handlerText', handlerPath);
  const contentActionsText = readSource('contentActionsText', contentActionsPath);
  if (!sessionText) { failures.push('SHEETS_SESSION_HELPER_MISSING'); }
  if (!handlerText) { failures.push('SHEETS_HANDLER_MISSING'); }
  if (!contentActionsText) { failures.push('SHEETS_CONTENT_ACTIONS_MISSING'); }

  const contentHelpersStart = contentActionsText.indexOf('// Google Sheets signed-in-tab UI transport');
  const contentHelpersEnd = contentActionsText.indexOf('// Tool functions for browser automation', contentHelpersStart);
  const contentActionStart = contentActionsText.search(/\bsheetsSession\s*:\s*async\b/);
  const contentActionEnd = contentActionsText.indexOf('// GOOGLE SHEETS: fillsheet', contentActionStart);
  const sheetsContentText = contentHelpersStart !== -1 && contentHelpersEnd > contentHelpersStart
    && contentActionStart !== -1 && contentActionEnd > contentActionStart
    ? contentActionsText.slice(contentHelpersStart, contentHelpersEnd)
      + '\n' + contentActionsText.slice(contentActionStart, contentActionEnd)
    : '';
  if (!sheetsContentText) { failures.push('SHEETS_CONTENT_ACTION_NOT_FIXED'); }

  const fixedMethods = ['getSpreadsheet', 'getValues', 'updateValues', 'appendValues', 'clearValues'];
  const sessionReturn = sessionText.match(
    /return\s*\{([\s\S]*?)\};\s*\}\s*var\s+session\s*=\s*createSession\s*\(\s*\)/
  );
  const exposedMethods = sessionReturn
    ? Array.from(sessionReturn[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*function\b/gm), function(match) { return match[1]; })
    : [];
  const fixedMethodSurfaceOk = exposedMethods.length === fixedMethods.length
    && fixedMethods.every(function(method, index) { return exposedMethods[index] === method; });
  if (!fixedMethodSurfaceOk) { failures.push('SHEETS_SESSION_METHOD_SURFACE_NOT_FIXED'); }

  const exactActiveTabPinOk = /SHEETS_ORIGIN\s*=\s*['"]https:\/\/docs\.google\.com['"]/.test(sessionText)
    && /SHEETS_URL_RE\s*=\s*\/\^\\\/spreadsheets\\\/d\\\//.test(sessionText)
    && /var\s+tabId\s*=\s*Number\(context\.tabId\)/.test(sessionText)
    && /chromeApi\.tabs\.get\(tabId\)/.test(sessionText)
    && /spreadsheetIdFromUrl\(tab\s*&&\s*tab\.url\)/.test(sessionText)
    && /explicit\s*!==\s*spreadsheetId/.test(sessionText)
    && /pageLocation\.origin\s*===\s*['"]https:\/\/docs\.google\.com['"]/.test(sessionText)
    && /pageMatch\[1\]\s*!==\s*spreadsheetId/.test(sessionText)
    && /target:\s*\{\s*tabId:\s*target\.tabId\s*\}/.test(sessionText)
    && /sendMessage\(target\.tabId,\s*\{/.test(sessionText)
    && !/chromeApi\.tabs\.(?:query|create|update)\s*\(/.test(sessionText);
  if (!exactActiveTabPinOk) { failures.push('SHEETS_ACTIVE_TAB_PIN_NOT_EXACT'); }

  const requestCalls = sessionText.match(
    /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.request\s*\(/g
  ) || [];
  const sourceUrls = sessionText.match(/https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&()*+,=%-]+/g) || [];
  const allowedUrls = new Set([
    'https://docs.google.com',
    expectedBase,
    expectedBase + '/spreadsheets/'
  ]);
  const fixedGapiRequestOk = /SHEETS_API_BASE\s*=\s*['"]https:\/\/sheets\.googleapis\.com\/v4['"]/.test(sessionText)
    && /var\s+gapiClient\s*=\s*globalThis\.gapi\s*&&\s*globalThis\.gapi\.client/.test(sessionText)
    && /gapiClient\.request\(\{\s*path:\s*path,\s*method:\s*method,\s*params:\s*params,\s*body:\s*body\s*\}\)/.test(sessionText)
    && requestCalls.length === 1
    && /^gapiClient\.request\s*\($/.test(requestCalls[0])
    && sourceUrls.length > 0
    && sourceUrls.every(function(url) { return allowedUrls.has(url); })
    && !/(?:request|args|params)\.(?:url|path|method|headers|body)\b/.test(sessionText);
  if (!fixedGapiRequestOk) { failures.push('SHEETS_GAPI_REQUEST_NOT_FIXED'); }

  const forbiddenSheetsSource = sessionText + '\n' + handlerText + '\n' + sheetsContentText;
  const hasForbiddenCredentialOrNetworkSource =
    /chrome(?:Api)?\.identity\b|\bgetAuthToken\b/i.test(forbiddenSheetsSource)
    || /\bgapi(?:Client)?\.(?:auth|load|init)\b|\bgoogle\.accounts\b|\binit(?:Token|Code)Client\b|\brequestAccessToken\b/i.test(forbiddenSheetsSource)
    || /\b(?:accessToken|authToken|refreshToken|idToken|token)\b/i.test(forbiddenSheetsSource)
    || /\bdocument\.cookie\b|chrome(?:Api)?\.cookies\b|\bcookies?\.(?:get|set|remove)\s*\(/i.test(forbiddenSheetsSource)
    || /\b(?:localStorage|sessionStorage|chrome(?:Api)?\.storage)\b/i.test(forbiddenSheetsSource)
    || /\bAuthorization\b|\bBearer\b/i.test(forbiddenSheetsSource)
    || hasForbiddenSheetsNetworkPrimitive(forbiddenSheetsSource)
    || hasForbiddenSheetsContentNetworkSource(sheetsContentText);
  if (hasForbiddenCredentialOrNetworkSource) { failures.push('FORBIDDEN_SHEETS_CREDENTIAL_OR_NETWORK_SOURCE'); }

  const contentActionOk = !!sheetsContentText
    && /\bsheetsSession\s*:\s*async\b/.test(sheetsContentText)
    && /isGoogleSheetsPage\(\)/.test(sheetsContentText)
    && /params\.spreadsheetId\s*&&\s*params\.spreadsheetId\s*!==\s*activeId/.test(sheetsContentText)
    && ['getSpreadsheet', 'getValues', 'updateValues', 'appendValues', 'clearValues'].every(function(operation) {
      return sheetsContentText.indexOf("operation === '" + operation + "'") !== -1;
    })
    && !/(?:params|args)\.(?:url|path|method|headers|body)\b/.test(sheetsContentText);
  if (!contentActionOk) { failures.push('SHEETS_SESSION_CONTENT_ACTION_MISSING'); }

  const slugs = [
    'gsheets.get_spreadsheet',
    'gsheets.get_values',
    'gsheets.update_values',
    'gsheets.append_values',
    'gsheets.clear_values'
  ];
  const handlerOk = /var\s+ORIGIN\s*=\s*['"]https:\/\/docs\.google\.com['"]/.test(handlerText)
    && slugs.every(function(slug) { return handlerText.indexOf("'" + slug + "'") !== -1; })
    && /ctx\s*&&\s*ctx\.googleSheets/.test(handlerText);
  if (!handlerOk) { failures.push('SHEETS_HANDLER_SESSION_CONTRACT_MISMATCH'); }

  const guardedWritesOk =
    /['"]gsheets\.update_values['"]\s*:\s*guarded\(\s*['"]gsheets\.update_values['"]\s*,\s*['"]write['"]/.test(handlerText)
    && /['"]gsheets\.append_values['"]\s*:\s*guarded\(\s*['"]gsheets\.append_values['"]\s*,\s*['"]write['"]/.test(handlerText)
    && /['"]gsheets\.clear_values['"]\s*:\s*guarded\(\s*['"]gsheets\.clear_values['"]\s*,\s*['"]destructive['"]/.test(handlerText)
    && /function\s+guarded\s*\([\s\S]*?code:\s*FALLBACK_CODE[\s\S]*?google-sheets-live-mutation-uat-required/.test(handlerText);
  if (!guardedWritesOk) { failures.push('SHEETS_WRITE_SLUGS_NOT_GUARDED'); }

  const expectedClasses = ['read', 'read', 'write', 'write', 'destructive'];
  const descriptorsOk = slugs.every(function(slug, index) {
    let descriptor;
    if (overrides.descriptors && Object.prototype.hasOwnProperty.call(overrides.descriptors, slug)) {
      descriptor = overrides.descriptors[slug];
    } else {
      const descriptorPath = join(ROOT, 'catalog', 'descriptors', slug.replace('.', '__') + '.json');
      if (!existsSync(descriptorPath)) { return false; }
      try { descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8')); } catch (_e) { return false; }
    }
    try {
      const idDescription = descriptor.params && descriptor.params.properties
        && descriptor.params.properties.spreadsheetId
        && descriptor.params.properties.spreadsheetId.description;
      return descriptor.backing === 'handler'
        && descriptor.sideEffectClass === expectedClasses[index]
        && descriptor.provenance && descriptor.provenance.signals
        && descriptor.provenance.signals.transportHelper === 'page-gapi-ui-sheets-session'
        && idDescription === 'Spreadsheet ID. When provided, it must match the spreadsheet open in the agent-owned Google Sheets tab.';
    } catch (_e) {
      return false;
    }
  });
  if (!descriptorsOk) { failures.push('SHEETS_DESCRIPTORS_CONTRACT_MISMATCH'); }

  return { ok: failures.length === 0, failures: failures };
}

function readPageGapiUiSheetsSessionBase(mapping) {
  const expectedBase = 'https://sheets.googleapis.com/v4';
  if (!mapping || mapping.app !== 'google-sheets'
      || mapping.pageGapiUiSheetsSessionBaseUrl !== expectedBase) {
    return null;
  }
  const verified = verifyPageGapiUiSheetsSessionSources();
  return verified.ok ? expectedBase : null;
}

/**
 * checkOriginClassification(headsOverride, opts) -> { results, failures }
 *
 * results: one classification row per head { global, handlerOrigin, apiBaseUrl,
 * classification }. failures: a string[] of the CORS_SEPARATE_ORIGIN reasons for every
 * head that is NOT same-origin (empty when all heads are same-origin). headsOverride
 * lets a test drive a synthetic head set; absent, the real HEAD_HANDLER_MODULES is
 * parsed from the catalog source. opts.appMap overrides HEAD_APP_MAP for a test.
 */
export function checkOriginClassification(headsOverride, opts) {
  const options = opts || {};
  const appMap = options.appMap || HEAD_APP_MAP;
  let heads = headsOverride;
  if (!Array.isArray(heads)) {
    const source = existsSync(CATALOG_PATH) ? readFileSync(CATALOG_PATH, 'utf8') : '';
    heads = parseHeadModules(source) || [];
  }

  const results = [];
  const failures = [];
  for (const head of heads) {
    const mapping = appMap[head.global];
    // An UNMAPPED head cannot be origin-verified -> fail closed (never silently pass).
    if (!mapping) {
      const reason = 'CORS_UNMAPPED_HEAD: head global ' + head.global + ' has no ' +
        'app -> API base-URL mapping in verify-origin-classification.mjs HEAD_APP_MAP; ' +
        'add its vendored <app>-api.ts (or documented base) before it can ship as a head';
      results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
        classification: { sameOrigin: false, separate: true, reason: reason } });
      failures.push(reason);
      continue;
    }
    if (mapping.guardedOnlyHandlerFile) {
      const guardedBase = readGuardedOnlyHead(mapping);
      if (!guardedBase) {
        const reason = 'CORS_GUARDED_ONLY_MISMATCH: head ' + head.global +
          ' requested guarded-only status, but its handler source was missing or ' +
          'contained an execution, network, token, or storage path -- refusing to ' +
          'treat a separate-origin app as guarded-only';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      const classification = classifyOriginPattern(head.origin, guardedBase, { guardedOnly: true });
      results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: guardedBase,
        classification: classification });
      if (!classification.sameOrigin) {
        failures.push(classification.reason);
      }
      continue;
    }
    // Prefer the vendored api.ts base-URL; fall back to the documented base for an app
    // with no vendored plugin (github).
    const vendored = mapping.ignoreVendoredBaseUrl ? null : readApiBaseUrl(mapping.app);
    const relativeVendored = mapping.ignoreVendoredBaseUrl ? null : readRelativeApiBase(mapping.app);
    const hasVendoredFile = mapping.app
      && existsSync(join(VENDOR_PLUGINS, mapping.app, 'src', mapping.app + '-api.ts'));

    let apiBaseUrl;
    let classifyOpts;
    if (mapping.pageGapiUiSheetsSessionBaseUrl) {
      const sheetsBase = readPageGapiUiSheetsSessionBase(mapping);
      if (!sheetsBase) {
        const reason = 'CORS_PAGE_GAPI_UI_SHEETS_SESSION_MISMATCH: head ' + head.global +
          ' requested Google Sheets API base "' + String(mapping.pageGapiUiSheetsSessionBaseUrl) +
          '" but the no-Identity manifest, fixed five-method session, active-tab pin, fixed ' +
          'gapi.client.request base, sheetsSession UI action, guarded writes, or descriptors ' +
          'did not match the reviewed source contract -- refusing a broader cross-origin ' +
          'accommodation';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = sheetsBase;
      classifyOpts = { pageGapiUiSheetsSession: true };
    } else if (mapping.graphBearerRuntimeBaseUrl) {
      let graphBase = null;
      if (mapping.pageBearerGraphApp === 'excel') {
        graphBase = readExcelGraphBearerRuntimeBase(mapping.app, mapping.graphBearerRuntimeBaseUrl);
      } else if (mapping.pageBearerGraphApp === 'microsoft-word') {
        graphBase = readWordGraphBearerRuntimeBase(mapping.app, mapping.graphBearerRuntimeBaseUrl);
      } else if (mapping.pageBearerGraphApp === 'outlook') {
        graphBase = readOutlookGraphBearerRuntimeBase(mapping.app, mapping.graphBearerRuntimeBaseUrl);
      } else if (mapping.pageBearerGraphApp === 'teams') {
        graphBase = readTeamsGraphBearerRuntimeBase(mapping.app, mapping.graphBearerRuntimeBaseUrl);
      } else if (mapping.pageBearerGraphApp === 'onenote') {
        graphBase = readOneNoteGraphBearerRuntimeBase(mapping.app, mapping.graphBearerRuntimeBaseUrl);
      } else {
        graphBase = readPowerPointGraphBearerRuntimeBase(mapping.app, mapping.graphBearerRuntimeBaseUrl);
      }
      if (!graphBase) {
        const reason = 'CORS_GRAPH_BEARER_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested Microsoft Graph page-bearer base "' + String(mapping.graphBearerRuntimeBaseUrl) +
          '" but the vendored Office source or handler did not match the reviewed ' +
          'GET-only page-read token bridge -- refusing a Graph bearer override that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = graphBase;
      classifyOpts = { pageBearerGraphRead: true, pageBearerGraphApp: mapping.pageBearerGraphApp };
    } else if (mapping.gapiPageBridgeBaseUrls) {
      const gapiBase = readGoogleAnalyticsGapiPageBridgeBase(
        mapping.app,
        mapping.gapiPageBridgeBaseUrls
      );
      if (!gapiBase) {
        const reason = 'CORS_GAPI_PAGE_BRIDGE_MISMATCH: head ' + head.global +
          ' requested Google Analytics GAPI page-bridge bases "' +
          String(mapping.gapiPageBridgeBaseUrls && mapping.gapiPageBridgeBaseUrls.join(', ')) +
          '" but the vendored Google Analytics source, handler, or page-read wrapper did ' +
          'not match the reviewed read-only gapi.client bridge -- refusing a GAPI override ' +
          'that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = gapiBase;
      classifyOpts = { gapiPageBridgeRead: true, gapiPageBridgeApp: mapping.app };
    } else if (mapping.gapiPageReadBaseUrl) {
      const gdriveBase = readGdriveGapiPageReadBase(
        mapping.app,
        mapping.gapiPageReadBaseUrl
      );
      if (!gdriveBase) {
        const reason = 'CORS_GDRIVE_GAPI_PAGE_READ_MISMATCH: head ' + head.global +
          ' requested Google Drive GAPI page-read base "' +
          String(mapping.gapiPageReadBaseUrl) +
          '" but the vendored Google Drive source, handler, or page-read wrapper did ' +
          'not match the reviewed GET-only gapi.client.request bridge -- refusing a ' +
          'Drive GAPI override that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = gdriveBase;
      classifyOpts = { gdriveGapiPageRead: true };
    } else if (mapping.snowflakePageContextRuntimeBaseUrl) {
      const snowflakeBase = readSnowflakePageContextRuntimeBase(
        mapping.app,
        mapping.snowflakePageContextRuntimeBaseUrl
      );
      if (!snowflakeBase) {
        const reason = 'CORS_SNOWFLAKE_PAGE_CONTEXT_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested Snowflake page-context runtime base "' +
          String(mapping.snowflakePageContextRuntimeBaseUrl) +
          '" but the vendored Snowflake source or handler did not match the reviewed ' +
          'Snowsight context + read-only SQL contract -- refusing an unproven runtime override';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = snowflakeBase;
      classifyOpts = undefined;
    } else if (mapping.glamaPageStateRuntimeBaseUrl) {
      const glamaBase = readGlamaPageStateRuntimeBase(
        mapping.app,
        mapping.glamaPageStateRuntimeBaseUrl
      );
      if (!glamaBase) {
        const reason = 'CORS_GLAMA_PAGE_STATE_RUNTIME_MISMATCH: head ' + head.global +
          ' requested Glama page-state runtime base "' +
          String(mapping.glamaPageStateRuntimeBaseUrl) +
          '" but the vendored Glama React Router source, handler, or page-read bridge did ' +
          'not match the reviewed read-only loader-data contract -- refusing a page-state ' +
          'runtime override that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = glamaBase;
      classifyOpts = { glamaPageStateRuntimeRead: true };
    } else if (mapping.sameOriginPageReadHandlerFile) {
      const pageReadBase = readSameOriginPageReadHead(mapping);
      if (!pageReadBase) {
        const reason = 'CORS_SAME_ORIGIN_PAGE_READ_MISMATCH: head ' + head.global +
          ' requested same-origin page-read status, but its handler source did not ' +
          'match the reviewed bounded executeBoundPageRead contract -- refusing an ' +
          'unproven page-read override';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = pageReadBase;
      classifyOpts = undefined;
    } else if (mapping.pageStateRuntime) {
      apiBaseUrl = mapping.fallbackBaseUrl;
      classifyOpts = undefined;
    } else if (mapping.publicAppViewBaseUrl) {
      const publicBase = readBlueskyPublicAppViewBase(mapping.app, mapping.publicAppViewBaseUrl);
      if (!publicBase) {
        const reason = 'CORS_PUBLIC_APPVIEW_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested public AppView base "' + String(mapping.publicAppViewBaseUrl) +
          '" but the vendored Bluesky read tools did not match the reviewed public ' +
          'app.bsky.* GET endpoint set -- refusing a public CORS read override that ' +
          'is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = publicBase;
      classifyOpts = { publicCorsRead: true };
    } else if (mapping.publicCorsReadBaseUrl) {
      const publicBase = readChipotlePublicServicesBase(mapping.app, mapping.publicCorsReadBaseUrl)
        || readCostcoPublicEcomBase(mapping.app, mapping.publicCorsReadBaseUrl);
      if (!publicBase) {
        const reason = 'CORS_PUBLIC_READ_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested public read base "' + String(mapping.publicCorsReadBaseUrl) +
          '" but the vendored tool files or handler source did not match the reviewed ' +
          'no-auth public endpoint set -- refusing a public CORS read override ' +
          'that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = publicBase;
      classifyOpts = { publicCorsRead: true };
    } else if (mapping.firstPartyAuthReadBaseUrls) {
      const firstPartyBase = readLucidFirstPartyAuthReadBase(mapping.app, mapping.firstPartyAuthReadBaseUrls)
        || readLinearFirstPartyAuthReadBase(mapping.app, mapping.firstPartyAuthReadBaseUrls)
        || readCraigslistFirstPartyAuthReadBase(mapping.app, mapping.firstPartyAuthReadBaseUrls)
        || readHomeDepotFirstPartyAuthReadBase(mapping.app, mapping.firstPartyAuthReadBaseUrls);
      if (!firstPartyBase) {
        const reason = 'CORS_FIRST_PARTY_AUTH_READ_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested first-party authenticated read bases "' +
          String(mapping.firstPartyAuthReadBaseUrls && mapping.firstPartyAuthReadBaseUrls.join(', ')) +
          '" but the vendored Linear/Lucid/Craigslist/Home Depot tool files or handler source did not match the reviewed ' +
          'same-registrable-domain read endpoint set -- refusing an authenticated read override ' +
          'that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = firstPartyBase;
      classifyOpts = { firstPartyAuthRead: true };
    } else if (mapping.storageBearerReadBaseUrl) {
      const storageBase = readHack2HireStorageBearerBase(mapping.app, mapping.storageBearerReadBaseUrl)
        || readClickHouseStorageBearerBase(mapping.app, mapping.storageBearerReadBaseUrl)
        || readAzureArmStorageBearerBase(mapping.app, mapping.storageBearerReadBaseUrl);
      if (!storageBase) {
        const reason = 'CORS_STORAGE_BEARER_READ_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested storage-bearer read base "' + String(mapping.storageBearerReadBaseUrl) +
          '" but the vendored auth helper or handler source did not match the reviewed ' +
          'app-specific storage-bearer read contract -- refusing a storage-bearer ' +
          'read override that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = storageBase;
      classifyOpts = { storageBearerRead: true };
    } else if (mapping.pageBearerReadBaseUrl) {
      const pageBearerBase = readClickUpPageBearerBase(mapping.app, mapping.pageBearerReadBaseUrl)
        || readSpotifyPageBearerBase(mapping.app, mapping.pageBearerReadBaseUrl)
        || readTwitchPageBearerBase(mapping.app, mapping.pageBearerReadBaseUrl)
        || readSupabasePageBearerBase(mapping.app, mapping.pageBearerReadBaseUrl);
      if (!pageBearerBase) {
        const reason = 'CORS_PAGE_BEARER_READ_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested page-bearer read base "' + String(mapping.pageBearerReadBaseUrl) +
          '" but the vendored ClickUp/Spotify/Twitch source, Supabase handler, or page-read bridge did not match ' +
          'the reviewed GET/GraphQL page-bearer contract -- refusing a page-bearer ' +
          'read override that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = pageBearerBase;
      classifyOpts = { pageBearerRead: true };
    } else if (mapping.tinderStorageBearerReadBaseUrl) {
      const tinderBase = readTinderStorageBearerBase(mapping.app, mapping.tinderStorageBearerReadBaseUrl);
      if (!tinderBase) {
        const reason = 'CORS_TINDER_STORAGE_BEARER_READ_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested Tinder storage-bearer read base "' +
          String(mapping.tinderStorageBearerReadBaseUrl) +
          '" but the vendored auth helper or handler source did not match the reviewed ' +
          'Tinder GET-only storage-token contract -- refusing a cross-registrable storage ' +
          'read override that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = tinderBase;
      classifyOpts = { tinderStorageBearerRead: true };
    } else if (mapping.observedRuntimeBaseUrl) {
      // Notion-only runtime migration override: the vendored OpenTabs snapshot still
      // carries www.notion.so/api/v3, while the live authenticated runtime verified on
      // 2026-06-29 uses app.notion.com/api/v3. Accept the observed base only when the
      // stale vendored base is exactly the expected Notion API path, so this cannot
      // become a generic same-registrable-domain or cross-origin bypass.
      const expectedStale = mapping.expectedStaleVendoredBaseUrl;
      const vendoredOk = typeof vendored === 'string'
        && typeof expectedStale === 'string'
        && vendored.indexOf(expectedStale) === 0;
      const observedOk = originHost(mapping.observedRuntimeBaseUrl) === originHost(mapping.fallbackBaseUrl);
      if (!vendoredOk || !observedOk) {
        const reason = 'CORS_OBSERVED_RUNTIME_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested observed runtime base "' + String(mapping.observedRuntimeBaseUrl) +
          '" but vendored base "' + String(vendored) + '" did not match expected stale base "' +
          String(expectedStale) + '" or observed/fallback origins diverged -- refusing a ' +
          'runtime override that is not explicitly pinned to the reviewed Notion migration';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: mapping.observedRuntimeBaseUrl,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = mapping.observedRuntimeBaseUrl;
      classifyOpts = undefined;
    } else if (vendored) {
      // A genuine extracted literal base (gitlab/notion) -> strict same-origin.
      apiBaseUrl = vendored;
      classifyOpts = undefined;
    } else if (mapping.dynamicWorkspace && readDynamicWorkspaceBase(mapping.app)) {
      // slack: no literal base, but the vendored source genuinely carries the dynamic
      // ${workspaceUrl}/api/ *.slack.com form -> assert SAME-REGISTRABLE-DOMAIN, NOT a
      // silent fallback (WR-01). The representative *.slack.com origin drives the
      // registrable-domain comparison against the head's app.slack.com.
      apiBaseUrl = readDynamicWorkspaceBase(mapping.app);
      classifyOpts = { dynamicWorkspace: true };
    } else if (hasVendoredFile && relativeVendored) {
      const fallbackOrigin = originHost(mapping.fallbackBaseUrl);
      apiBaseUrl = fallbackOrigin ? fallbackOrigin + relativeVendored : relativeVendored;
      classifyOpts = undefined;
    } else if (mapping.relativeRuntimeBaseUrl) {
      const relativeRuntimeBase = readRetoolRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readShortcutRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readHackerNewsRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readRedditRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readNpmRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readYelpRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readTripadvisorRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readRedfinRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readMastodonRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readMeticulousRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readMediumRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readCoinbaseRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readAmplitudeRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readNewrelicRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readDatadogRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readInstacartRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readXRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readInstagramRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readTiktokRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readFacebookRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readStackOverflowRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readTargetRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readWalmartRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readEtsyRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readExpediaRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readBookingRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readStubHubRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readKayakRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readOpentableRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readGrubhubRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readPinterestRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readDominosRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readPandaExpressRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readYnabRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readCalendlyRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readJiraRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readConfluenceRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readDockerHubRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readAirtableRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readSentryRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readZendeskRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readEventbriteRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl)
        || readReviewedSameOriginRelativeRuntimeBase(mapping.app, mapping.relativeRuntimeBaseUrl);
      const fallbackOrigin = originHost(mapping.fallbackBaseUrl);
      if (!relativeRuntimeBase || !fallbackOrigin) {
        const reason = 'CORS_RELATIVE_RUNTIME_OVERRIDE_MISMATCH: head ' + head.global +
          ' requested relative runtime base "' + String(mapping.relativeRuntimeBaseUrl) +
          '" but the vendored helper did not match a reviewed relative runtime pattern ' +
          '(Retool /api cookie-CSRF, Shortcut /backend/api/v3 tenant-header bootstrap, ' +
          'Hacker News relative HTML reads, Reddit same-origin .json GET reads, npm public Spiferack page reads, Yelp ' +
          'public relative page/autocomplete reads, TripAdvisor public relative ' +
          'SSR/GraphQL reads, Redfin relative Stingray reads, Mastodon same-origin API reads, Meticulous relative GraphQL reads, Medium relative GraphQL reads, Coinbase relative GraphQL reads, X public HTML reads, ' +
          'Amplitude relative GraphQL reads, New Relic same-origin NerdGraph reads, Datadog same-origin GET reads, Instagram public page/search reads, Facebook conservative HTML reads, Stack Overflow public HTML reads, Target/Walmart public HTML reads, Expedia public search-page reads, or ' +
          "Booking public HTML reads, Kayak metadata-only /v1 reads, OpenTable metadata-only /v1 reads, Grubhub metadata-only /v1 reads, Pinterest same-origin resource reads, Domino's same-origin GraphQL reads, Panda Express public Olo reads, YNAB same-origin internal API reads, Calendly same-origin internal API reads, Jira tenant REST reads, Docker Hub same-origin API reads, Airtable same-origin /v0.3 reads, Sentry same-origin /api/0 reads, Eventbrite same-origin /v3 reads, or Zendesk same-origin API reads) " +
          '-- refusing a relative runtime override that is not explicitly pinned';
        results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
          classification: { sameOrigin: false, separate: true, reason: reason } });
        failures.push(reason);
        continue;
      }
      apiBaseUrl = fallbackOrigin + relativeRuntimeBase;
      classifyOpts = undefined;
    } else if (hasVendoredFile) {
      // A MAPPED app WITH a vendored api.ts that yields NEITHER a literal base NOR (for a
      // dynamic-workspace app) the proven dynamic form -> do NOT silently fall back to the
      // documented base (that is the rubber-stamp WR-01 closed). Fail closed: the base is
      // unresolvable and the head must be re-reviewed before it can ship.
      const reason = 'CORS_UNRESOLVABLE_ORIGIN: head ' + head.global + ' maps to vendored ' +
        'app "' + mapping.app + '" whose <app>-api.ts yielded no extractable API base-URL ' +
        '(and no recognized dynamic-workspace form) -- refusing the silent documented-base ' +
        'fallback; resolve the vendored base or demote this head to T3-DOM';
      results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: null,
        classification: { sameOrigin: false, separate: true, reason: reason } });
      failures.push(reason);
      continue;
    } else {
      // No vendored plugin at all (github) -> the documented first-party fallback base.
      apiBaseUrl = mapping.fallbackBaseUrl;
      classifyOpts = undefined;
    }

    const classification = classifyOriginPattern(head.origin, apiBaseUrl, classifyOpts);
    results.push({ global: head.global, handlerOrigin: head.origin, apiBaseUrl: apiBaseUrl,
      classification: classification });
    if (!classification.sameOrigin) {
      failures.push(classification.reason);
    }
  }
  return { results, failures };
}

// ---- CLI entry (only on direct invocation, never on import) ------------------
function runCli() {
  const { results, failures } = checkOriginClassification();

  if (results.length === 0) {
    console.error('verify-origin-classification: FAIL -- no HEAD_HANDLER_MODULES heads ' +
      'parsed from the catalog source (the manifest moved or this gate cannot read it)');
    process.exit(1);
  }

  for (const r of results) {
    // A dynamic-workspace same-registrable-domain accommodation (slack) prints a
    // DISTINCT verdict so it is never mistaken for a plain same-origin pass (WR-01).
    const reason = r.classification && r.classification.reason;
    const isDynamic = typeof reason === 'string'
      && reason.indexOf('SAME_REGISTRABLE_DOMAIN_DYNAMIC_WORKSPACE') === 0;
    const isPublicCorsRead = typeof reason === 'string'
      && reason.indexOf('PUBLIC_CORS_READ_NO_AUTH') === 0;
    const isStorageBearerRead = typeof reason === 'string'
      && reason.indexOf('SAME_REGISTRABLE_DOMAIN_STORAGE_BEARER_READ') === 0;
    const isTinderStorageBearerRead = typeof reason === 'string'
      && reason.indexOf('TINDER_STORAGE_BEARER_READ') === 0;
    const isPageBearerRead = typeof reason === 'string'
      && reason.indexOf('SAME_REGISTRABLE_DOMAIN_PAGE_BEARER_READ') === 0;
    const isGuardedOnly = typeof reason === 'string'
      && reason.indexOf('GUARDED_ONLY_NO_EXECUTION') === 0;
    const isPageBearerGraph = typeof reason === 'string'
      && reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0;
    const isGapiPageBridge = typeof reason === 'string'
      && reason.indexOf('PAGE_GAPI_CLIENT_READ') === 0;
    const isPageGapiUiSheetsSession = typeof reason === 'string'
      && reason.indexOf('PAGE_GAPI_UI_SHEETS_SESSION') === 0;
    const isGlamaPageStateRuntime = typeof reason === 'string'
      && reason.indexOf('GLAMA_PAGE_STATE_RUNTIME_READ') === 0;
    const verdict = r.classification.sameOrigin
      ? (isDynamic
        ? 'SAME-REGISTRABLE (dynamic workspace)'
        : (isPublicCorsRead
          ? 'PUBLIC-CORS-READ (no auth)'
          : (isStorageBearerRead
            ? 'STORAGE-BEARER-READ'
            : (isTinderStorageBearerRead
              ? 'TINDER-STORAGE-BEARER-READ'
              : (isPageBearerRead
                ? 'PAGE-BEARER-READ'
                : (isGuardedOnly
                  ? 'GUARDED-ONLY (no execution)'
                  : (isPageBearerGraph
                    ? 'PAGE-BEARER-GRAPH'
                    : (isGapiPageBridge
                      ? 'PAGE-GAPI-CLIENT'
                      : (isPageGapiUiSheetsSession
                        ? 'PAGE-GAPI/UI-SHEETS-SESSION'
                        : (isGlamaPageStateRuntime ? 'PAGE-STATE-RUNTIME' : 'SAME-ORIGIN'))))))))))
      : 'SEPARATE';
    console.log('  ' + verdict + '  ' + r.global + '  head=' + String(r.handlerOrigin) +
      '  api=' + String(r.apiBaseUrl));
  }

  // ---- NEGATIVE-CONTROL: the linear separate-origin head MUST classify separate ----
  // Proof the gate's failure path actually fires (the linear/datadog/jira demote it
  // enforces). NOT a shipped head -- a synthetic fixture run only at CLI time.
  const linearCtl = classifyOriginPattern('https://linear.app', 'https://client-api.linear.app/graphql');
  const negOk = linearCtl.separate === true && linearCtl.sameOrigin === false;
  if (!negOk) {
    console.error('verify-origin-classification: FAIL -- the linear negative-control ' +
      'fixture (linear.app vs client-api.linear.app) did NOT classify separate; the gate ' +
      'would let a separate-origin head ship. ' + JSON.stringify(linearCtl));
    process.exit(1);
  }
  console.log('  NEGATIVE-CONTROL  linear.app vs client-api.linear.app -> separate (the ' +
    'gate enforces the linear/datadog/jira demote-to-T3)');

  if (failures.length > 0) {
    console.error(
      'verify-origin-classification: FAIL (' + failures.length + ' separate-origin / ' +
      'unverifiable head(s) -- a head whose API is not same-origin must be demoted to T3-DOM):'
    );
    for (const f of failures) {
      console.error('  - ' + f);
    }
    process.exit(1);
  }

  const publicCorsReads = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' && reason.indexOf('PUBLIC_CORS_READ_NO_AUTH') === 0;
  }).length;
  const guardedOnlyHeads = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' && reason.indexOf('GUARDED_ONLY_NO_EXECUTION') === 0;
  }).length;
  const storageBearerReads = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' && reason.indexOf('SAME_REGISTRABLE_DOMAIN_STORAGE_BEARER_READ') === 0;
  }).length;
  const pageBearerReads = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' && reason.indexOf('SAME_REGISTRABLE_DOMAIN_PAGE_BEARER_READ') === 0;
  }).length;
  const tinderStorageBearerReads = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' && reason.indexOf('TINDER_STORAGE_BEARER_READ') === 0;
  }).length;
  const pageBearerGraphReads = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' && reason.indexOf('PAGE_BEARER_GRAPH_READ') === 0;
  }).length;
  const firstPartyAuthReads = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' &&
      reason.indexOf('SAME_REGISTRABLE_DOMAIN_FIRST_PARTY_AUTH_READ') === 0;
  }).length;
  const gapiPageBridgeReads = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' && reason.indexOf('PAGE_GAPI_CLIENT_READ') === 0;
  }).length;
  const glamaPageStateRuntimeReads = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' && reason.indexOf('GLAMA_PAGE_STATE_RUNTIME_READ') === 0;
  }).length;
  const pageGapiUiSheetsSessions = results.filter(function(r) {
    const reason = r.classification && r.classification.reason;
    return typeof reason === 'string' && reason.indexOf('PAGE_GAPI_UI_SHEETS_SESSION') === 0;
  }).length;
  console.log(
    'verify-origin-classification: PASS (' + results.length + ' shipped head(s); ' +
    publicCorsReads + ' explicit public no-auth CORS read accommodation(s); ' +
    firstPartyAuthReads + ' explicit first-party authenticated read accommodation(s); ' +
    storageBearerReads + ' explicit storage-bearer read accommodation(s); ' +
    pageBearerReads + ' explicit page-bearer read accommodation(s); ' +
    tinderStorageBearerReads + ' explicit Tinder storage-bearer read accommodation(s); ' +
    guardedOnlyHeads + ' guarded-only no-execution head(s); ' +
    pageBearerGraphReads + ' page-bearer Graph read accommodation(s); ' +
    gapiPageBridgeReads + ' page GAPI client read accommodation(s); ' +
    pageGapiUiSheetsSessions + ' signed-in page-gapi/UI Sheets session accommodation(s); ' +
    glamaPageStateRuntimeReads + ' Glama page-state runtime read accommodation(s); linear ' +
    'separate-origin negative-control classifies separate; 0 silent cross-origin ports)'
  );
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('verify-origin-classification: ERROR ' + (err && err.message ? err.message : err));
    process.exit(1);
  }
}
