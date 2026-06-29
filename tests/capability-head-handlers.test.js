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
 *     web app's OWN first-party origin (github.com / app.slack.com / app.notion.com),
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
 *     if xoxc is missing it fails closed before POST. The GitHub create handler
 *     fails closed to DOM fallback while its mutation body remains unverified.
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
const EXT_HANDLERS_DIR = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers');
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

function parseSpecBody(spec) {
  if (!spec || spec.body === undefined || spec.body === null) { return {}; }
  if (typeof spec.body === 'string') {
    try { return JSON.parse(spec.body); } catch (e) { return {}; }
  }
  return spec.body;
}

function defaultNotionRecordValue(request) {
  const id = request && request.id ? request.id : 'record-test';
  const table = request && request.table ? request.table : 'block';
  if (table === 'collection') {
    return {
      id: id,
      name: [['Verified database']],
      parent_id: 'collection-view-page-test',
      schema: {
        title: { name: 'Name', type: 'title' },
        status: { name: 'Status', type: 'text' },
        choice: { name: 'Choice', type: 'select', options: [{ id: 'opt-a', value: 'Ready' }] }
      }
    };
  }
  return {
    id: id,
    type: 'page',
    properties: { title: [['Verified title']] },
    content: []
  };
}

// A recording stub ctx.executeBoundSpec: captures the spec(s) a handler builds,
// returns a canned logged-in 200. The handler must never call chrome.* -- it only
// touches this ctx member (the real pin lives in the real executeBoundSpec, proven
// in capability-router.test.js). A GET probe (the from:'response' token scrape) is
// answered with a canned token payload so the SUBSEQUENT mutation/POST spec actually
// carries the scraped token -- this exercises the real body-placement path (the
// handler only embeds a token it successfully scraped). The token strings here are
// synthetic test fixtures, NOT real credentials.
function makeCtx(origin, tabId, opts) {
  const calls = [];
  const options = opts || {};
  return {
    calls,
    ctx: {
      origin: origin,
      tabId: tabId,
      async executeBoundSpec(spec, tid) {
        calls.push({ spec: spec, tabId: tid });
        // Answer a read-only GET probe with a canned token payload (the scrape
        // source) so the handler's next spec carries the token it read. The
        // slack/github GET on their OWN origin is a from:'response' token probe;
        // the gitlab GET on /api/v4 is a real REST read (NOT a probe) -- it must
        // receive a logged-in body so the gitlab logged-out shape guard sees real
        // data (an array for list_*, an id-bearing object for get_*).
        const url = (spec && typeof spec.url === 'string') ? spec.url : '';
        const isGet = spec && spec.method === 'GET';
        const isGitlabRest = isGet && url.indexOf('/api/v4') !== -1;
        const isProbe = isGet && !isGitlabRest;
        let text = null;
        if (isProbe && url.indexOf('app.slack.com') !== -1) {
          text = Object.prototype.hasOwnProperty.call(options, 'slackProbeText')
            ? options.slackProbeText
            : '<html><script>window.boot = {"xoxc":"xoxc-TEST-SYNTHETIC"};</script></html>';
        } else if (isProbe && url.indexOf('github.com') !== -1) {
          text = Object.prototype.hasOwnProperty.call(options, 'githubProbeText')
            ? options.githubProbeText
            : '<html><head><meta name="csrf-token" content="csrf-TEST-SYNTHETIC"></head></html>';
        }
        let data;
        let status = 200;
        if (isProbe) {
          data = null;
        } else if (Object.prototype.hasOwnProperty.call(options, 'readData')) {
          // NEGATIVE-path override (IN-01): the caller drives the actual read/RPC
          // response body (NOT the probe -- the probe still answers with its canned
          // token text so the slack handler proceeds to the guarded POST). Lets a
          // test feed a logged-out body (a gitlab error envelope / null / { ok:false })
          // so the per-app shape guard's FAIL branch is exercised. `readData:null` is
          // honored (hasOwnProperty presence check, not a truthiness test).
          data = options.readData;
        } else if (isGitlabRest) {
          // A logged-in GitLab REST read: list_* endpoints return an array; a
          // single-resource path (.../issues/<iid> or .../projects/<id>) returns an
          // id-bearing object. Heuristic: a trailing numeric/encoded id segment ->
          // object, else array (mirrors the /api/v4 contract the guard checks).
          const tail = url.split('?')[0].replace(/\/+$/, '');
          const lastSeg = tail.substring(tail.lastIndexOf('/') + 1);
          const looksLikeId = /^\d+$/.test(lastSeg) || /%2F/i.test(lastSeg) || (/^[0-9]+$/.test(decodeURIComponent(lastSeg)));
          data = looksLikeId ? { id: 1, iid: 1 } : [{ id: 1 }];
        } else if (url.indexOf('https://app.notion.com/api/v3/') === 0) {
          const op = url.substring(url.lastIndexOf('/') + 1);
          if (op === 'getSpaces' || op === 'getSpacesInitial') {
            if (Object.prototype.hasOwnProperty.call(options, 'notionSessionText')) {
              data = null;
              text = options.notionSessionText;
            } else {
              data = options.notionNoSession ? {} : { 'user-test': { space: { 'space-test': {} } } };
            }
          } else if (op === 'saveTransactions') {
            status = Object.prototype.hasOwnProperty.call(options, 'notionSaveStatus')
              ? options.notionSaveStatus
              : 200;
            data = Object.prototype.hasOwnProperty.call(options, 'notionSaveData')
              ? options.notionSaveData
              : { ok: true };
          } else if (op === 'getRecordValues') {
            const body = parseSpecBody(spec);
            const requests = Array.isArray(body.requests) ? body.requests : [];
            data = { results: requests.map(function (request) {
              return { value: defaultNotionRecordValue(request) };
            }) };
          } else {
            data = { ok: true };
          }
        } else {
          data = { ok: true };
        }
        return {
          success: true,
          status: status,
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
    check(gh['github.issues.create'] && gh['github.issues.create'].params
      && Array.isArray(gh['github.issues.create'].params.required)
      && gh['github.issues.create'].params.required.indexOf('repositoryId') !== -1
      && gh['github.issues.create'].params.required.indexOf('title') !== -1,
      'github.issues.create exposes a params schema requiring repositoryId + title');

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

    // The create handler is intentionally fail-closed while GitHub's internal
    // mutation body remains unverified. It must not scrape CSRF or call /_graphql.
    const ghWrite = makeCtx('https://github.com', 11);
    const ghCreate = await gh['github.issues.create'].handle(
      { repositoryId: 'R_x', title: 't', body: 'b' }, ghWrite.ctx);
    check(ghWrite.calls.length === 0,
      'github.issues.create.handle makes no recipe calls while mutation body is unverified');
    check(ghCreate && ghCreate.success === false
      && ghCreate.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ghCreate.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && ghCreate.error === 'RECIPE_DOM_FALLBACK_PENDING',
      'github.issues.create returns the dual-field RECIPE_DOM_FALLBACK_PENDING failure');
    check(ghCreate && ghCreate.slug === 'github.issues.create'
      && ghCreate.reason === 'unverified-github-create-mutation'
      && ghCreate.fellBackToDom === true,
      'github.issues.create fallback carries slug, reason, and fellBackToDom marker');
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
    check(sl['slack.chat.postMessage'] && sl['slack.chat.postMessage'].params
      && Array.isArray(sl['slack.chat.postMessage'].params.required)
      && sl['slack.chat.postMessage'].params.required.indexOf('channel') !== -1
      && sl['slack.chat.postMessage'].params.required.indexOf('text') !== -1,
      'slack.chat.postMessage exposes a params schema requiring channel + text');

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

    const slMissingToken = makeCtx('https://app.slack.com', 21, {
      slackProbeText: '<html><script>window.boot = {"ok":true};</script></html>'
    });
    const slMissingOut = await sl['slack.conversations.list'].handle({}, slMissingToken.ctx);
    check(slMissingToken.calls.length === 1,
      'slack.conversations.list missing-token path performs only the probe');
    const missingTokenPost = slMissingToken.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
    check(!missingTokenPost,
      'slack.conversations.list missing-token path does not issue the Slack API POST');
    check(slMissingOut && slMissingOut.success === false
      && slMissingOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && slMissingOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && slMissingOut.error === 'RECIPE_DOM_FALLBACK_PENDING',
      'slack.conversations.list missing-token path returns the dual-field RECIPE_DOM_FALLBACK_PENDING failure');
    check(slMissingOut && slMissingOut.slug === 'slack.conversations.list'
      && slMissingOut.method === 'conversations.list'
      && slMissingOut.reason === 'missing-slack-xoxc'
      && slMissingOut.fellBackToDom === true,
      'slack.conversations.list missing-token fallback carries slug, method, reason, and fellBackToDom marker');
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
    check(nt['notion.getSpaces'] && nt['notion.getSpaces'].origin === 'https://app.notion.com',
      'notion.getSpaces targets the first-party origin https://app.notion.com');
    check(nt['notion.getSpaces'] && nt['notion.getSpaces'].sideEffectClass === 'read',
      'notion.getSpaces is a READ slug');
    check(nt['notion.loadPage'] && nt['notion.loadPage'].params
      && Array.isArray(nt['notion.loadPage'].params.required)
      && nt['notion.loadPage'].params.required.indexOf('pageId') !== -1,
      'notion.loadPage exposes a params schema requiring pageId');

    check(ntSrc.indexOf('api.notion.com') === -1,
      'notion.js references NO separate-origin api.notion.com (T-29-07)');
    check(!/chrome\.(scripting|tabs)/.test(ntSrc),
      'notion.js references NO chrome.scripting/chrome.tabs');

    const ntCtx = makeCtx('https://app.notion.com', 31);
    const ntOut = await nt['notion.getSpaces'].handle({}, ntCtx.ctx);
    check(ntCtx.calls.length >= 1,
      'notion.getSpaces.handle calls ctx.executeBoundSpec at least once');
    const ntPost = ntCtx.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
    check(!!ntPost, 'notion.getSpaces issues a POST spec (/api/v3 is POST-only RPC)');
    check(ntPost && typeof ntPost.spec.url === 'string' && ntPost.spec.url.indexOf('/api/v3') !== -1,
      'notion.getSpaces POSTs the same-origin /api/v3 RPC endpoint');
    check(ntPost && ntPost.spec.origin === 'https://app.notion.com',
      'notion.getSpaces POST spec is pinned to https://app.notion.com');
    check(ntOut && ntOut.success === true,
      'notion.getSpaces.handle returns the executeBoundSpec result');

    const ntCreate = makeCtx('https://app.notion.com', 31);
    const ntCreateOut = await nt['notion.create_page'].handle({
      title: 'Created page',
      content: 'Created body',
      icon: 'T'
    }, ntCreate.ctx);
    const ntCreateSave = ntCreate.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    const ntCreateVerify = ntCreate.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/getRecordValues';
    });
    const ntCreateBody = parseSpecBody(ntCreateSave && ntCreateSave.spec);
    const ntCreateOps = ntCreateBody.transactions && ntCreateBody.transactions[0]
      ? ntCreateBody.transactions[0].operations
      : [];
    const ntCreateTitleOp = ntCreateOps.find(function (op) {
      return op.command === 'set' && JSON.stringify(op.path) === JSON.stringify(['properties', 'title']);
    });
    check(!!ntCreateSave,
      'notion.create_page calls executeBoundSpec with /api/v3/saveTransactions');
    check(ntCreateSave && ntCreateSave.spec.headers
      && ntCreateSave.spec.headers['x-notion-active-user-header'] === 'user-test'
      && ntCreateSave.spec.headers['x-notion-space-id'] === 'space-test',
      'notion.create_page sends active user and space headers only inside the bound spec');
    check(ntCreateTitleOp && JSON.stringify(ntCreateTitleOp.args) === JSON.stringify([['Created page']]),
      'notion.create_page uses command:set for properties.title with the Notion title array');
    check(!!ntCreateVerify,
      'notion.create_page verifies the created page with getRecordValues');
    check(ntCreateOut && ntCreateOut.success === true && ntCreateOut.data && ntCreateOut.data.pageUrl
      && ntCreateOut.data.pageUrl.indexOf('https://app.notion.com/') === 0,
      'notion.create_page returns a success payload pinned to app.notion.com');

    const ntTextSession = makeCtx('https://app.notion.com', 31, {
      notionSessionText: '{"11111111-1111-4111-8111-111111111111":{"__version__":3,"notion_user":{"11111111-1111-4111-8111-111111111111":{}},"space":{"22222222-2222-4222-8222-222222222222":{}}'
    });
    await nt['notion.create_page'].handle({ title: 'Text session page' }, ntTextSession.ctx);
    const ntTextSessionSave = ntTextSession.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    check(ntTextSessionSave && ntTextSessionSave.spec.headers
      && ntTextSessionSave.spec.headers['x-notion-active-user-header'] === '11111111-1111-4111-8111-111111111111'
      && ntTextSessionSave.spec.headers['x-notion-space-id'] === '22222222-2222-4222-8222-222222222222',
      'notion.create_page resolves session ids from capped getSpaces text when parsed data is null');

    const ntUpdate = makeCtx('https://app.notion.com', 31);
    const ntUpdateOut = await nt['notion.update_page'].handle({
      page_id: 'page-test',
      title: 'Updated page',
      icon: 'U',
      cover: '/images/cover.png'
    }, ntUpdate.ctx);
    const ntUpdateSave = ntUpdate.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    const ntUpdateBody = parseSpecBody(ntUpdateSave && ntUpdateSave.spec);
    const ntUpdateOps = ntUpdateBody.transactions && ntUpdateBody.transactions[0]
      ? ntUpdateBody.transactions[0].operations
      : [];
    const ntUpdateSetPaths = ntUpdateOps.filter(function (op) { return op.command === 'set'; })
      .map(function (op) { return JSON.stringify(op.path); }).sort();
    check(!!ntUpdateSave,
      'notion.update_page calls executeBoundSpec with /api/v3/saveTransactions');
    check(ntUpdateSetPaths.indexOf(JSON.stringify(['properties', 'title'])) !== -1
      && ntUpdateSetPaths.indexOf(JSON.stringify(['format', 'page_icon'])) !== -1
      && ntUpdateSetPaths.indexOf(JSON.stringify(['format', 'page_cover'])) !== -1,
      'notion.update_page uses command:set for title, icon, and cover paths');
    check(ntUpdateOps.some(function (op) { return op.command === 'update' && JSON.stringify(op.path) === '[]'; }),
      'notion.update_page keeps command:update scoped to object-shaped metadata');
    check(ntUpdateOut && ntUpdateOut.success === true,
      'notion.update_page verifies and returns success');

    const ntDb = makeCtx('https://app.notion.com', 31);
    const ntDbOut = await nt['notion.create_database'].handle({
      parent_page_id: 'page-parent',
      title: 'Created database',
      properties: { Status: 'text' }
    }, ntDb.ctx);
    const ntDbSave = ntDb.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    const ntDbBody = parseSpecBody(ntDbSave && ntDbSave.spec);
    const ntDbOps = ntDbBody.transactions && ntDbBody.transactions[0]
      ? ntDbBody.transactions[0].operations
      : [];
    check(!!ntDbSave,
      'notion.create_database calls executeBoundSpec with /api/v3/saveTransactions');
    check(ntDbOps.some(function (op) { return op.pointer && op.pointer.table === 'collection' && op.command === 'set'; })
      && ntDbOps.some(function (op) { return op.pointer && op.pointer.table === 'collection_view' && op.command === 'set'; })
      && ntDbOps.some(function (op) { return op.args && op.args.type === 'collection_view_page' && op.command === 'set'; }),
      'notion.create_database creates collection, collection_view_page, and collection_view records');
    check(ntDbOut && ntDbOut.success === true && ntDbOut.data && ntDbOut.data.databaseId,
      'notion.create_database verifies the collection and returns a database id');

    const ntItem = makeCtx('https://app.notion.com', 31);
    const ntItemOut = await nt['notion.create_database_item'].handle({
      database_id: 'database-test',
      title: 'Created row',
      properties: { Status: 'Ready' }
    }, ntItem.ctx);
    const ntItemSave = ntItem.calls.find(function (c) {
      return c.spec && c.spec.url === 'https://app.notion.com/api/v3/saveTransactions';
    });
    const ntItemBody = parseSpecBody(ntItemSave && ntItemSave.spec);
    const ntItemOps = ntItemBody.transactions && ntItemBody.transactions[0]
      ? ntItemBody.transactions[0].operations
      : [];
    const ntItemBlock = ntItemOps.find(function (op) { return op.pointer && op.pointer.table === 'block' && op.command === 'set'; });
    check(!!ntItemSave,
      'notion.create_database_item calls executeBoundSpec with /api/v3/saveTransactions');
    check(ntItemBlock && ntItemBlock.args && ntItemBlock.args.properties
      && JSON.stringify(ntItemBlock.args.properties.status) === JSON.stringify([['Ready']]),
      'notion.create_database_item maps property names through the collection schema');
    check(ntItemOut && ntItemOut.success === true && ntItemOut.data && ntItemOut.data.itemId,
      'notion.create_database_item verifies the row and returns an item id');

    const ntNoSession = makeCtx('https://app.notion.com', 31, { notionNoSession: true });
    const ntNoSessionOut = await nt['notion.create_page'].handle({ title: 'No session' }, ntNoSession.ctx);
    check(ntNoSessionOut && ntNoSessionOut.success === false
      && ntNoSessionOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ntNoSessionOut.reason === 'notion-session-unavailable',
      'notion.create_page returns a typed fallback when session/space resolution fails');
    check(!ntNoSession.calls.some(function (c) { return c.spec && c.spec.url.indexOf('/api/v3/saveTransactions') !== -1; }),
      'notion.create_page missing-session path does not call saveTransactions');

    const ntSaveErr = makeCtx('https://app.notion.com', 31, {
      notionSaveStatus: 400,
      notionSaveData: { name: 'ValidationError', message: 'secret-id-redacted-by-handler-test' }
    });
    const ntSaveErrOut = await nt['notion.create_page'].handle({ title: 'Save error' }, ntSaveErr.ctx);
    check(ntSaveErrOut && ntSaveErrOut.success === false
      && ntSaveErrOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ntSaveErrOut.reason === 'notion-save-transactions-failed'
      && ntSaveErrOut.status === 400
      && JSON.stringify(ntSaveErrOut).indexOf('secret-id-redacted-by-handler-test') === -1,
      'notion saveTransactions error envelopes return typed fallback without exposing Notion error details');
  }

  // =========================================================================
  // Phase 40 (DEPTH-01) -- GitLab NEW head module -- catalog/handlers/gitlab.js
  // (5 READ T1a slugs on the first-party origin https://gitlab.com/api/v4).
  // Scaffolded in 40-01 so 40-02 edits ONLY catalog/handlers/gitlab.js. RED until
  // gitlab.js lands (existsSync-guarded so the suite does not crash pre-40-02).
  // =========================================================================
  const gitlabPath = path.join(HANDLERS_DIR, 'gitlab.js');
  check(fs.existsSync(gitlabPath), 'catalog/handlers/gitlab.js exists (Phase 40-02)');
  if (fs.existsSync(gitlabPath)) {
    const gl = require(gitlabPath);
    const glSrc = readSource(gitlabPath);

    check(gl['gitlab.list_projects'] && gl['gitlab.list_projects'].tier === 'T1a'
      && typeof gl['gitlab.list_projects'].handle === 'function',
      'gitlab.list_projects is a tier:T1a entry with an async handle');
    check(gl['gitlab.list_projects'] && gl['gitlab.list_projects'].origin === 'https://gitlab.com',
      'gitlab.list_projects targets the first-party origin https://gitlab.com');
    check(gl['gitlab.list_projects'] && gl['gitlab.list_projects'].sideEffectClass === 'read',
      'gitlab.list_projects is a READ slug');
    check(gl['gitlab.get_issue'] && gl['gitlab.get_issue'].tier === 'T1a'
      && gl['gitlab.get_issue'].sideEffectClass === 'read'
      && typeof gl['gitlab.get_issue'].handle === 'function',
      'gitlab.get_issue is a tier:T1a READ entry with an async handle');
    check(gl['gitlab.get_issue'] && gl['gitlab.get_issue'].origin === 'https://gitlab.com',
      'gitlab.get_issue targets https://gitlab.com (NOT api.gitlab.com)');
    check(gl['gitlab.get_issue'] && gl['gitlab.get_issue'].params
      && Array.isArray(gl['gitlab.get_issue'].params.required)
      && gl['gitlab.get_issue'].params.required.indexOf('project') !== -1
      && gl['gitlab.get_issue'].params.required.indexOf('issue_iid') !== -1,
      'gitlab.get_issue exposes a params schema requiring project + issue_iid');

    // SECURITY: same-origin /api/v4 only; NO separate api.gitlab.com host; no chrome.*.
    check(glSrc.indexOf('/api/v4') !== -1,
      'gitlab.js targets the same-origin /api/v4 path');
    check(glSrc.indexOf('api.gitlab.com') === -1,
      'gitlab.js references NO separate-origin api.gitlab.com (origin-pin correctness)');
    check(!/chrome\.(scripting|tabs)/.test(glSrc),
      'gitlab.js references NO chrome.scripting/chrome.tabs (the pin lives in executeBoundSpec)');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf)\b/i.test(glSrc),
      'gitlab.js does NOT console-log a token/cookie/csrf-bearing variable');

    // list_projects: a single same-origin GET to /api/v4/projects pinned to gitlab.com.
    const glList = makeCtx('https://gitlab.com', 41);
    const glListOut = await gl['gitlab.list_projects'].handle({}, glList.ctx);
    check(glList.calls.length === 1,
      'gitlab.list_projects.handle calls ctx.executeBoundSpec exactly once');
    check(glList.calls.length === 1 && glList.calls[0].spec
      && glList.calls[0].spec.method === 'GET',
      'gitlab.list_projects builds a GET spec');
    check(glList.calls.length === 1 && glList.calls[0].spec
      && glList.calls[0].spec.origin === 'https://gitlab.com',
      'gitlab.list_projects builds a spec pinned to origin https://gitlab.com');
    check(glList.calls.length === 1 && glList.calls[0].spec
      && typeof glList.calls[0].spec.url === 'string'
      && glList.calls[0].spec.url.indexOf('/api/v4/projects') !== -1,
      'gitlab.list_projects targets /api/v4/projects');
    check(glListOut && glListOut.success === true,
      'gitlab.list_projects.handle returns success for a logged-in array body');

    // NEGATIVE (IN-01): a logged-out /api/v4 read answers 200 with a non-array
    // (a sign-in/redirect body parsed to an object) -> guardShape(wantArray=true)
    // must reject it with the dual-field RECIPE_DOM_FALLBACK_PENDING (NOT success),
    // proving the wrong-shape branch actually fires. readData drives the REST body.
    const glListNeg = makeCtx('https://gitlab.com', 41, { readData: { ok: false } });
    const glListNegOut = await gl['gitlab.list_projects'].handle({}, glListNeg.ctx);
    check(glListNegOut && glListNegOut.success === false
      && glListNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && glListNegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && glListNegOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && glListNegOut.fellBackToDom === true,
      'gitlab.list_projects rejects a non-array logged-out body -> RECIPE_DOM_FALLBACK_PENDING');

    // NEGATIVE (IN-02): a GitLab error envelope that coincidentally carries an `id`
    // ({ id, message:"404 ..." }) must STILL be rejected by the tightened get_*
    // guard (looksLikeGitlabError) -> RECIPE_DOM_FALLBACK_PENDING, not a false success.
    const glGetNeg = makeCtx('https://gitlab.com', 41, {
      readData: { id: 7, message: '404 Project Not Found' }
    });
    const glGetNegOut = await gl['gitlab.get_project'].handle({ project: 'g/p' }, glGetNeg.ctx);
    check(glGetNegOut && glGetNegOut.success === false
      && glGetNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && glGetNegOut.fellBackToDom === true,
      'gitlab.get_project rejects an id-bearing GitLab error envelope -> RECIPE_DOM_FALLBACK_PENDING');
  }

  // =========================================================================
  // Phase 40 (DEPTH-01) -- Slack EXTEND -- catalog/handlers/slack.js
  // (3 new READ T1a slugs via callSlackMethod; token in BODY never logged).
  // Scaffolded in 40-01 so 40-03 edits ONLY catalog/handlers/slack.js. RED until
  // the new slugs land.
  // =========================================================================
  if (fs.existsSync(slackPath)) {
    const sl40 = require(slackPath);
    const sl40Src = readSource(slackPath);

    check(sl40['slack.list_channels'] && sl40['slack.list_channels'].tier === 'T1a'
      && sl40['slack.list_channels'].sideEffectClass === 'read'
      && typeof sl40['slack.list_channels'].handle === 'function',
      'slack.list_channels is a tier:T1a READ entry with an async handle');
    check(sl40['slack.list_channels'] && sl40['slack.list_channels'].origin === 'https://app.slack.com',
      'slack.list_channels targets the first-party origin https://app.slack.com');
    check(sl40['slack.get_channel_info'] && sl40['slack.get_channel_info'].tier === 'T1a'
      && sl40['slack.get_channel_info'].sideEffectClass === 'read'
      && typeof sl40['slack.get_channel_info'].handle === 'function',
      'slack.get_channel_info is a tier:T1a READ entry with an async handle');
    check(sl40['slack.get_channel_info'] && sl40['slack.get_channel_info'].origin === 'https://app.slack.com',
      'slack.get_channel_info targets https://app.slack.com');
    check(sl40['slack.get_channel_info'] && sl40['slack.get_channel_info'].params
      && Array.isArray(sl40['slack.get_channel_info'].params.required)
      && sl40['slack.get_channel_info'].params.required.indexOf('channel') !== -1,
      'slack.get_channel_info exposes a params schema requiring channel');

    // Token-in-body discipline still holds for the new slugs (no console name).
    check(!/console\.\w+\([^)]*\b(xoxc|xoxd|token)\b/i.test(sl40Src),
      'slack.js does NOT console-log an xoxc/xoxd/token-bearing variable (extends safe)');

    // list_channels: scrape xoxc, POST same-origin /api with the token in the BODY.
    // Guarded by slug presence so the suite REDs cleanly pre-40-03 (no FATAL crash
    // from invoking an undefined handle).
    if (sl40['slack.list_channels'] && typeof sl40['slack.list_channels'].handle === 'function') {
      const sl40Read = makeCtx('https://app.slack.com', 42);
      const sl40Out = await sl40['slack.list_channels'].handle({}, sl40Read.ctx);
      const sl40Post = sl40Read.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
      check(!!sl40Post, 'slack.list_channels issues a POST spec (Slack web API is POST)');
      check(sl40Post && sl40Post.spec.origin === 'https://app.slack.com',
        'slack.list_channels POST spec is pinned to https://app.slack.com');
      var sl40Body = '';
      if (sl40Post && sl40Post.spec) {
        sl40Body = (typeof sl40Post.spec.body === 'string') ? sl40Post.spec.body : JSON.stringify(sl40Post.spec.body || {});
      }
      check(sl40Body.indexOf('xoxc') !== -1 || sl40Body.indexOf('token') !== -1,
        'slack.list_channels places the xoxc token in the request BODY (not a header)');
      var sl40Headers = JSON.stringify((sl40Post && sl40Post.spec && sl40Post.spec.headers) || {});
      check(sl40Headers.indexOf('xoxc') === -1,
        'slack.list_channels does NOT place xoxc in a request header (body-only)');
      check(sl40Out && sl40Out.success === true,
        'slack.list_channels.handle returns the executeBoundSpec result');

      // NEGATIVE (IN-01 + WR-01): the xoxc probe still succeeds (a token is scraped),
      // but the web-API POST returns Slack's HTTP-200 auth-failure envelope
      // { ok:false } (a logged-out / stale-token response). guardSlackShape must
      // convert that masquerading "success" into the dual-field
      // RECIPE_DOM_FALLBACK_PENDING so DOM serves -- proving the WR-01 guard fires.
      const sl40Neg = makeCtx('https://app.slack.com', 42, { readData: { ok: false, error: 'not_authed' } });
      const sl40NegOut = await sl40['slack.list_channels'].handle({}, sl40Neg.ctx);
      const sl40NegPost = sl40Neg.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
      check(!!sl40NegPost,
        'slack.list_channels still issues the POST (the guard runs on its result, not before)');
      check(sl40NegOut && sl40NegOut.success === false
        && sl40NegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && sl40NegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
        && sl40NegOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
        && sl40NegOut.fellBackToDom === true,
        'slack.list_channels rejects an { ok:false } logged-out 200 -> RECIPE_DOM_FALLBACK_PENDING');
    } else {
      check(false, 'slack.list_channels.handle is invocable (Phase 40-03 -- behavioral checks pending)');
    }
  }

  // =========================================================================
  // Phase 40 (DEPTH-01) -- Notion EXTEND -- catalog/handlers/notion.js
  // (2 new READ T1a slugs via buildRpcSpec; same-origin /api/v3 POST).
  // Scaffolded in 40-01 so 40-04 edits ONLY catalog/handlers/notion.js. RED until
  // the new slugs land.
  // =========================================================================
  if (fs.existsSync(notionPath)) {
    const nt40 = require(notionPath);
    const nt40Src = readSource(notionPath);

    check(nt40['notion.search'] && nt40['notion.search'].tier === 'T1a'
      && nt40['notion.search'].sideEffectClass === 'read'
      && typeof nt40['notion.search'].handle === 'function',
      'notion.search is a tier:T1a READ entry with an async handle');
    check(nt40['notion.search'] && nt40['notion.search'].origin === 'https://app.notion.com',
      'notion.search targets the first-party origin https://app.notion.com');
    check(nt40['notion.search'] && nt40['notion.search'].params
      && Array.isArray(nt40['notion.search'].params.required)
      && nt40['notion.search'].params.required.indexOf('query') !== -1,
      'notion.search exposes a params schema requiring query');
    check(nt40['notion.get_database'] && nt40['notion.get_database'].tier === 'T1a'
      && nt40['notion.get_database'].sideEffectClass === 'read'
      && typeof nt40['notion.get_database'].handle === 'function',
      'notion.get_database is a tier:T1a READ entry with an async handle');
    check(nt40['notion.get_database'] && nt40['notion.get_database'].origin === 'https://app.notion.com',
      'notion.get_database targets https://app.notion.com');
    check(nt40['notion.get_database'] && nt40['notion.get_database'].params
      && Array.isArray(nt40['notion.get_database'].params.required)
      && nt40['notion.get_database'].params.required.indexOf('database_id') !== -1,
      'notion.get_database exposes a params schema requiring database_id');

    check(nt40Src.indexOf('api.notion.com') === -1,
      'notion.js references NO separate-origin api.notion.com (extends safe)');

    // search: a single same-origin POST to /api/v3 pinned to app.notion.com.
    // Guarded by slug presence so the suite REDs cleanly pre-40-04 (no FATAL crash).
    if (nt40['notion.search'] && typeof nt40['notion.search'].handle === 'function') {
      const nt40Ctx = makeCtx('https://app.notion.com', 43);
      const nt40Out = await nt40['notion.search'].handle({ query: 'roadmap' }, nt40Ctx.ctx);
      const nt40Post = nt40Ctx.calls.find(function (c) { return c.spec && c.spec.method === 'POST'; });
      check(!!nt40Post, 'notion.search issues a POST spec (/api/v3 is POST-only RPC)');
      check(nt40Post && typeof nt40Post.spec.url === 'string' && nt40Post.spec.url.indexOf('/api/v3') !== -1,
        'notion.search POSTs the same-origin /api/v3 RPC endpoint');
      check(nt40Post && nt40Post.spec.origin === 'https://app.notion.com',
        'notion.search POST spec is pinned to https://app.notion.com');
      check(nt40Out && nt40Out.success === true,
        'notion.search.handle returns the executeBoundSpec result');

      // NEGATIVE (IN-01): a logged-out app.notion.com /api/v3 RPC answers 200 with a
      // sign-in/redirect body that parses to null (not the expected recordMap/results
      // object) -> guardRpcShape must reject it with the dual-field
      // RECIPE_DOM_FALLBACK_PENDING (NOT success), proving the wrong-shape branch fires.
      const nt40Neg = makeCtx('https://app.notion.com', 43, { readData: null });
      const nt40NegOut = await nt40['notion.search'].handle({ query: 'roadmap' }, nt40Neg.ctx);
      check(nt40NegOut && nt40NegOut.success === false
        && nt40NegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && nt40NegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
        && nt40NegOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
        && nt40NegOut.fellBackToDom === true,
        'notion.search rejects a null logged-out RPC body -> RECIPE_DOM_FALLBACK_PENDING');
    } else {
      check(false, 'notion.search.handle is invocable (Phase 40-04 -- behavioral checks pending)');
    }
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
  // Descriptors -- the handler/search descriptors are valid JSON and carry schemas
  // =========================================================================
  const descriptorFiles = [
    'github-issues.json',
    'github-issues-create.json',
    'slack-message.json',
    'slack-conversations-list.json',
    'notion-load-page.json',
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
      if (name !== 'reddit-inbox.json') {
        check(d && d.params && d.params.type === 'object',
          'catalog/descriptors/' + name + ' carries a params schema for search/invoke');
      }
    }
  });

  ['github.js', 'slack.js', 'notion.js'].forEach(function (name) {
    const src = path.join(HANDLERS_DIR, name);
    const ext = path.join(EXT_HANDLERS_DIR, name);
    check(fs.existsSync(ext), 'extension/catalog/handlers/' + name + ' exists for unpacked dev loads');
    if (fs.existsSync(src) && fs.existsSync(ext)) {
      check(readSource(src) === readSource(ext),
        'extension/catalog/handlers/' + name + ' matches catalog/handlers/' + name);
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
