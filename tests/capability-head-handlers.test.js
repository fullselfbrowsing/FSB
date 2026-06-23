'use strict';

/**
 * Phase 29 Plan 03 (v0.9.99 Native Capability Catalog) -- bundled-head handler
 * unit suite (CAT-02). Covers the three T1a imperative handler modules under
 * catalog/handlers/ (github.js, slack.js, notion.js) and the Reddit T1b recipe +
 * the four new descriptors. The router-level T1a dispatch + origin-pin contract is
 * proven separately in tests/capability-router.test.js (with stub handlers); THIS
 * file is the per-handler behavioral gate:
 *
 *   - CAT-02 each T1a handler exposes its declared slugs with tier:'T1a', its
 *     web app's OWN first-party origin (github.com / app.slack.com / www.notion.so),
 *     a sideEffectClass, and an async handle(args, ctx).
 *   - CAT-02 handle(args, ctx) builds a bound spec pinned to the handler origin and
 *     calls ctx.executeBoundSpec EXACTLY ONCE for a single-call read, returning its
 *     result -- it NEVER calls chrome.scripting itself (the origin-pin lives inside
 *     executeBoundSpec; the handler is not a bypass). A stub ctx.executeBoundSpec
 *     records the spec(s) it receives.
 *   - SECURITY (T-29-07): no handler source references a separate-origin API host
 *     (api.github.com / oauth.reddit.com / api.notion.com / slack.com/api on a
 *     non-app origin) and no handler references chrome.scripting/chrome.tabs.
 *   - SECURITY (T-29-08): the Slack handler places the scraped xoxc token in the
 *     request BODY (not a header) and never console-logs a token-bearing variable;
 *     the GitHub create handler scrapes a CSRF token into the spec, not a log line.
 *   - CAT-03 the Reddit T1b recipe (catalog/recipes/reddit-inbox.json) is schema-
 *     valid: origin www.reddit.com, endpoint /message/unread.json, GET,
 *     same-origin-cookie; no oauth.reddit.com host anywhere.
 *   - the four new descriptors are valid JSON carrying the descriptor keys.
 *
 * Zero-framework FSB convention (tests/capability-fetch.test.js +
 * tests/capability-router.test.js): module-level passed/failed counters,
 * synchronous check(cond,msg), process.exit(failed>0?1:0).
 *
 * Run: node tests/capability-head-handlers.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.join(__dirname, '..');
const HANDLERS_DIR = path.join(REPO_ROOT, 'catalog', 'handlers');
const RECIPES_DIR = path.join(REPO_ROOT, 'catalog', 'recipes');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
const CFWORKER_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const SCHEMA_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-recipe-schema.js');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function readSource(p) {
  return fs.readFileSync(p, 'utf8');
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// A recording stub ctx.executeBoundSpec: captures the spec(s) a handler builds,
// returns a canned logged-in 200. The handler must never call chrome.* -- it only
// touches this ctx member (the real pin lives in the real executeBoundSpec, proven
// in capability-router.test.js). A GET probe (the from:'response' token scrape) is
// answered with a canned token payload so the SUBSEQUENT mutation/POST spec actually
// carries the scraped token -- this exercises the real body-placement path (the
// handler only embeds a token it successfully scraped). The token strings here are
// synthetic test fixtures, NOT real credentials.
function makeCtx(origin, tabId) {
  const calls = [];
  return {
    calls,
    ctx: {
      origin: origin,
      tabId: tabId,
      async executeBoundSpec(spec, tid) {
        calls.push({ spec: spec, tabId: tid });
        // Answer a read-only GET probe with a canned token payload (the scrape
        // source) so the handler's next spec carries the token it read.
        const isProbe = spec && spec.method === 'GET';
        let text = null;
        if (isProbe && spec && typeof spec.url === 'string' && spec.url.indexOf('app.slack.com') !== -1) {
          text = '<html><script>window.boot = {"xoxc":"xoxc-TEST-SYNTHETIC"};</script></html>';
        } else if (isProbe && spec && typeof spec.url === 'string' && spec.url.indexOf('github.com') !== -1) {
          text = '<html><head><meta name="csrf-token" content="csrf-TEST-SYNTHETIC"></head></html>';
        }
        const data = isProbe ? null : { ok: true };
        return {
          success: true,
          status: 200,
          finalUrl: (spec && spec.url) || null,
          redirected: false,
          data: data,
          text: text
        };
      },
      interpretRecipe() { throw new Error('handler must not call interpretRecipe for a code-built spec'); }
    }
  };
}

// ---- Load the recipe-schema validator (for the Reddit T1b recipe assertion) ----
vm.runInThisContext(readSource(CFWORKER_PATH));
const Schema = require(SCHEMA_PATH);

(async function run() {
  // =========================================================================
  // GitHub head -- catalog/handlers/github.js (issues T1a)
  // =========================================================================
  const githubPath = path.join(HANDLERS_DIR, 'github.js');
  check(fs.existsSync(githubPath), 'catalog/handlers/github.js exists');
  if (fs.existsSync(githubPath)) {
    const gh = require(githubPath);
    const ghSrc = readSource(githubPath);

    check(gh['github.issues.list'] && gh['github.issues.list'].tier === 'T1a'
      && typeof gh['github.issues.list'].handle === 'function',
      'github.issues.list is a tier:T1a entry with an async handle');
    check(gh['github.issues.list'] && gh['github.issues.list'].origin === 'https://github.com',
      'github.issues.list targets the first-party origin https://github.com');
    check(gh['github.issues.create'] && gh['github.issues.create'].tier === 'T1a'
      && gh['github.issues.create'].sideEffectClass === 'write',
      'github.issues.create is a tier:T1a WRITE entry (the mutating slug)');
    check(gh['github.issues.create'] && gh['github.issues.create'].origin === 'https://github.com',
      'github.issues.create targets https://github.com (NOT api.github.com)');

    // SECURITY T-29-07: no separate-origin API host, no chrome.* in the handler.
    check(ghSrc.indexOf('api.github.com') === -1,
      'github.js references NO separate-origin api.github.com (origin-pin correctness, T-29-07)');
    check(!/chrome\.(scripting|tabs)/.test(ghSrc),
      'github.js references NO chrome.scripting/chrome.tabs (the pin lives in executeBoundSpec)');

    // The read handler builds a github.com-pinned spec and calls executeBoundSpec once.
    const ghRead = makeCtx('https://github.com', 11);
    const ghOut = await gh['github.issues.list'].handle({}, ghRead.ctx);
    check(ghRead.calls.length === 1,
      'github.issues.list.handle calls ctx.executeBoundSpec exactly once');
    check(ghRead.calls.length === 1 && ghRead.calls[0].spec
      && ghRead.calls[0].spec.origin === 'https://github.com',
      'github.issues.list builds a spec pinned to origin https://github.com');
    check(ghOut && ghOut.success === true,
      'github.issues.list.handle returns the executeBoundSpec result');
    const ghReadQuery = makeCtx('https://github.com', 11);
    await gh['github.issues.list'].handle({ query: 'is:open label:bug' }, ghReadQuery.ctx);
    check(ghReadQuery.calls.length === 1 && ghReadQuery.calls[0].spec
      && ghReadQuery.calls[0].spec.url === 'https://github.com/issues?q=is%3Aopen%20label%3Abug',
      'github.issues.list folds args.query into the concrete /issues URL');

    // The create handler scrapes a CSRF token into the POST spec (a from:'response'
    // read first), targets a same-origin /_graphql POST, and never logs the token.
    const ghWrite = makeCtx('https://github.com', 11);
    const ghCreate = await gh['github.issues.create'].handle(
      { repositoryId: 'R_x', title: 't', body: 'b' }, ghWrite.ctx);
    check(ghWrite.calls.length >= 1,
      'github.issues.create.handle calls ctx.executeBoundSpec at least once');
    const postCall = ghWrite.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
    check(!!postCall, 'github.issues.create issues a POST spec (the mutation)');
    check(postCall && typeof postCall.spec.url === 'string'
      && postCall.spec.url.indexOf('/_graphql') !== -1,
      'github.issues.create POSTs the same-origin /_graphql persisted-query endpoint');
    check(postCall && postCall.spec.origin === 'https://github.com',
      'github.issues.create POST spec is pinned to https://github.com');
    check(postCall && postCall.spec.headers && postCall.spec.headers['X-CSRF-Token'] === 'csrf-TEST-SYNTHETIC',
      'github.issues.create scrapes CSRF from HTML text into the POST header');
    check(ghCreate && ghCreate.success === true,
      'github.issues.create.handle returns the executeBoundSpec result');
    // No literal console-log of a CSRF-token-bearing identifier.
    check(!/console\.\w+\([^)]*\b(csrf|token)\b/i.test(ghSrc),
      'github.js does NOT console-log a csrf/token-bearing variable (T-29-08, redactForLog discipline)');
  }

  // =========================================================================
  // Slack head -- catalog/handlers/slack.js (T1a split-token)
  // =========================================================================
  const slackPath = path.join(HANDLERS_DIR, 'slack.js');
  check(fs.existsSync(slackPath), 'catalog/handlers/slack.js exists');
  if (fs.existsSync(slackPath)) {
    const sl = require(slackPath);
    const slSrc = readSource(slackPath);

    check(sl['slack.conversations.list'] && sl['slack.conversations.list'].tier === 'T1a'
      && typeof sl['slack.conversations.list'].handle === 'function',
      'slack.conversations.list is a tier:T1a entry with an async handle');
    check(sl['slack.conversations.list'] && sl['slack.conversations.list'].origin === 'https://app.slack.com',
      'slack.conversations.list targets the first-party origin https://app.slack.com');
    check(sl['slack.chat.postMessage'] && sl['slack.chat.postMessage'].tier === 'T1a'
      && sl['slack.chat.postMessage'].sideEffectClass === 'write',
      'slack.chat.postMessage is a tier:T1a WRITE entry');
    check(sl['slack.chat.postMessage'] && sl['slack.chat.postMessage'].origin === 'https://app.slack.com',
      'slack.chat.postMessage targets https://app.slack.com');

    check(!/chrome\.(scripting|tabs)/.test(slSrc),
      'slack.js references NO chrome.scripting/chrome.tabs');

    // SECURITY T-29-08: the xoxc token goes in the BODY, not a header, and is never
    // console-logged. A source-level assertion: no console call names xoxc/xoxd/token.
    check(!/console\.\w+\([^)]*\b(xoxc|xoxd|token)\b/i.test(slSrc),
      'slack.js does NOT console-log an xoxc/xoxd/token-bearing variable (T-29-08)');

    // The read handler scrapes xoxc (from:'response'), places it in the BODY, and
    // calls executeBoundSpec. The xoxd cookie rides same-origin (no header set).
    const slRead = makeCtx('https://app.slack.com', 21);
    const slOut = await sl['slack.conversations.list'].handle({}, slRead.ctx);
    check(slRead.calls.length >= 1,
      'slack.conversations.list.handle calls ctx.executeBoundSpec at least once');
    const postSlack = slRead.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
    check(!!postSlack, 'slack.conversations.list issues a POST spec (Slack web API is POST)');
    check(postSlack && postSlack.spec.origin === 'https://app.slack.com',
      'slack POST spec is pinned to https://app.slack.com');
    // xoxc must be in the body, not a header. The body may be a string (form-encoded)
    // or an object; assert the token rides the body and NOT any header value.
    var bodyStr = '';
    if (postSlack && postSlack.spec) {
      bodyStr = (typeof postSlack.spec.body === 'string')
        ? postSlack.spec.body
        : JSON.stringify(postSlack.spec.body || {});
    }
    check(bodyStr.indexOf('xoxc') !== -1 || bodyStr.indexOf('token') !== -1,
      'slack places the xoxc token in the request BODY (not a header)');
    var headerStr = JSON.stringify((postSlack && postSlack.spec && postSlack.spec.headers) || {});
    check(headerStr.indexOf('xoxc') === -1,
      'slack does NOT place xoxc in a request header (split-token: body-only)');
    check(slOut && slOut.success === true,
      'slack.conversations.list.handle returns the executeBoundSpec result');
  }

  // =========================================================================
  // Notion head -- catalog/handlers/notion.js (T1a /api/v3 RPC)
  // =========================================================================
  const notionPath = path.join(HANDLERS_DIR, 'notion.js');
  check(fs.existsSync(notionPath), 'catalog/handlers/notion.js exists');
  if (fs.existsSync(notionPath)) {
    const nt = require(notionPath);
    const ntSrc = readSource(notionPath);

    check(nt['notion.getSpaces'] && nt['notion.getSpaces'].tier === 'T1a'
      && typeof nt['notion.getSpaces'].handle === 'function',
      'notion.getSpaces is a tier:T1a entry with an async handle');
    check(nt['notion.getSpaces'] && nt['notion.getSpaces'].origin === 'https://www.notion.so',
      'notion.getSpaces targets the first-party origin https://www.notion.so');
    check(nt['notion.getSpaces'] && nt['notion.getSpaces'].sideEffectClass === 'read',
      'notion.getSpaces is a READ slug');

    check(ntSrc.indexOf('api.notion.com') === -1,
      'notion.js references NO separate-origin api.notion.com (T-29-07)');
    check(!/chrome\.(scripting|tabs)/.test(ntSrc),
      'notion.js references NO chrome.scripting/chrome.tabs');

    const ntCtx = makeCtx('https://www.notion.so', 31);
    const ntOut = await nt['notion.getSpaces'].handle({}, ntCtx.ctx);
    check(ntCtx.calls.length >= 1,
      'notion.getSpaces.handle calls ctx.executeBoundSpec at least once');
    const ntPost = ntCtx.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
    check(!!ntPost, 'notion.getSpaces issues a POST spec (/api/v3 is POST-only RPC)');
    check(ntPost && typeof ntPost.spec.url === 'string' && ntPost.spec.url.indexOf('/api/v3') !== -1,
      'notion.getSpaces POSTs the same-origin /api/v3 RPC endpoint');
    check(ntPost && ntPost.spec.origin === 'https://www.notion.so',
      'notion.getSpaces POST spec is pinned to https://www.notion.so');
    check(ntOut && ntOut.success === true,
      'notion.getSpaces.handle returns the executeBoundSpec result');
  }

  // =========================================================================
  // Reddit T1b recipe -- catalog/recipes/reddit-inbox.json
  // =========================================================================
  const redditRecipePath = path.join(RECIPES_DIR, 'reddit-inbox.json');
  check(fs.existsSync(redditRecipePath), 'catalog/recipes/reddit-inbox.json exists');
  if (fs.existsSync(redditRecipePath)) {
    const recipe = readJson(redditRecipePath);
    const recipeSrc = readSource(redditRecipePath);
    check(recipe.origin === 'https://www.reddit.com',
      'reddit-inbox.json origin is the first-party https://www.reddit.com');
    check(recipe.endpoint === '/message/unread.json',
      'reddit-inbox.json endpoint is /message/unread.json');
    check(recipe.method === 'GET' && recipe.authStrategy === 'same-origin-cookie',
      'reddit-inbox.json is a GET with same-origin-cookie auth');
    check(recipeSrc.indexOf('oauth.reddit.com') === -1,
      'reddit-inbox.json references NO separate-origin oauth.reddit.com (T-29-07)');
    const v = Schema.validateRecipe(recipe);
    check(v && v.success === true,
      'reddit-inbox.json validates against the closed recipe schema (got '
      + JSON.stringify(v) + ')');
  }

  // =========================================================================
  // Descriptors -- the four new search descriptors are valid JSON
  // =========================================================================
  const descriptorFiles = [
    'github-issues.json',
    'slack-message.json',
    'notion-spaces.json',
    'reddit-inbox.json'
  ];
  descriptorFiles.forEach(function (name) {
    const p = path.join(DESCRIPTORS_DIR, name);
    check(fs.existsSync(p), 'catalog/descriptors/' + name + ' exists');
    if (fs.existsSync(p)) {
      var d = null;
      try { d = readJson(p); } catch (e) { d = null; }
      check(d && typeof d.slug === 'string' && typeof d.service === 'string'
        && typeof d.sideEffectClass === 'string',
        'catalog/descriptors/' + name + ' carries slug/service/sideEffectClass');
    }
  });

  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('FATAL (capability-head-handlers):', err && err.stack ? err.stack : err);
  console.log('  passed:', passed);
  console.log('  failed:', failed + 1);
  process.exit(1);
});
