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
        const isNetlifyRest = isGet && url.indexOf('https://app.netlify.com/access-control/bb-api/api/v1') === 0;
        const isBitbucketRest = isGet && url.indexOf('https://bitbucket.org/!api/2.0') === 0;
        const isCircleciRest = isGet && url.indexOf('https://app.circleci.com/api/v2') === 0;
        const isVercelRest = isGet && url.indexOf('https://vercel.com/api') === 0;
        const isRetoolRest = isGet && url.indexOf('https://retool.com/api') === 0;
        const isProbe = isGet && !isGitlabRest && !isNetlifyRest && !isBitbucketRest && !isCircleciRest && !isVercelRest && !isRetoolRest;
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
        } else if (url.indexOf('https://app.netlify.com/access-control/bb-api/api/v1') === 0) {
          const pathOnly = url.split('?')[0];
          if (pathOnly.indexOf('/deploys') !== -1 || pathOnly.indexOf('/forms') !== -1 || /\/sites$/.test(pathOnly)) {
            data = [{ id: 'netlify-test', name: 'Test site' }];
          } else {
            data = { id: 'netlify-test', name: 'Test site' };
          }
        } else if (url.indexOf('https://bitbucket.org/!api/2.0') === 0) {
          const pathOnly = url.split('?')[0];
          const repoSegs = pathOnly.split('/repositories/')[1];
          if (pathOnly.indexOf('/workspaces') !== -1 || (repoSegs && repoSegs.split('/').length < 2)) {
            data = { values: [{ uuid: '{workspace-test}', slug: 'workspace-test', name: 'Workspace test' }] };
          } else {
            data = { uuid: '{repo-test}', slug: 'repo-test', name: 'Repository test' };
          }
        } else if (url.indexOf('https://app.circleci.com/api/v2') === 0) {
          const pathOnly = url.split('?')[0];
          if (pathOnly.indexOf('/pipeline/') !== -1 && /\/workflow$/.test(pathOnly)) {
            data = { items: [{ id: 'workflow-test', name: 'build', status: 'success' }] };
          } else if (pathOnly.indexOf('/pipeline/') !== -1) {
            data = { id: 'pipeline-test', number: 1, project_slug: 'gh/org/repo' };
          } else if (pathOnly.indexOf('/workflow/') !== -1 && /\/job$/.test(pathOnly)) {
            data = { items: [{ id: 'job-test', name: 'build', status: 'success', job_number: 42 }] };
          } else if (pathOnly.indexOf('/workflow/') !== -1) {
            data = { id: 'workflow-test', name: 'build', status: 'success' };
          } else if (pathOnly.indexOf('/artifacts') !== -1) {
            data = { items: [{ path: 'artifact.txt', url: 'https://example.invalid/artifact.txt' }] };
          } else if (pathOnly.indexOf('/tests') !== -1) {
            data = { items: [{ name: 'test passes', result: 'success' }] };
          } else if (pathOnly.indexOf('/project/') !== -1 && pathOnly.indexOf('/job/') !== -1) {
            data = { id: 'job-test', name: 'build', status: 'success', job_number: 42 };
          } else if (pathOnly.indexOf('/pipeline') !== -1) {
            data = { items: [{ id: 'pipeline-test', number: 1, project_slug: 'gh/org/repo' }] };
          } else if (url.indexOf('/me') !== -1) {
            data = { id: 'user-test', login: 'circle-user', name: 'Circle User' };
          } else {
            data = { id: 'project-test', slug: 'gh/org/repo', name: 'repo' };
          }
        } else if (url.indexOf('https://vercel.com/api') === 0) {
          const pathOnly = url.split('?')[0];
          if (pathOnly.indexOf('/www/user') !== -1) {
            data = { user: { uid: 'user-test', email: 'user@example.invalid', username: 'vercel-user' } };
          } else if (pathOnly.indexOf('/v2/teams') !== -1) {
            data = { teams: [{ id: 'team-test', slug: 'team-test', name: 'Team Test' }] };
          } else if (pathOnly.indexOf('/v9/projects/') !== -1 && /\/domains$/.test(pathOnly)) {
            data = { domains: [{ name: 'example.invalid', configured: true }] };
          } else if (pathOnly.indexOf('/v9/projects/') !== -1) {
            data = { id: 'prj-test', name: 'project-test' };
          } else if (pathOnly.indexOf('/v9/projects') !== -1) {
            data = { projects: [{ id: 'prj-test', name: 'project-test' }], pagination: { count: 1, next: null } };
          } else if (pathOnly.indexOf('/v6/deployments') !== -1) {
            data = { deployments: [{ uid: 'dpl-test', name: 'project-test', url: 'project-test.vercel.app' }], pagination: { count: 1, next: null } };
          } else if (pathOnly.indexOf('/v13/deployments/') !== -1) {
            data = { uid: 'dpl-test', name: 'project-test', url: 'project-test.vercel.app' };
          } else {
            data = { ok: true };
          }
        } else if (url.indexOf('https://retool.com/api') === 0) {
          const pathOnly = url.split('?')[0];
          if (pathOnly.indexOf('/user') !== -1) {
            data = { user: { id: 1, email: 'user@example.invalid', name: 'Retool User' } };
          } else if (pathOnly.indexOf('/organization/userSpaces') !== -1) {
            data = { userSpaces: [{ id: 1, name: 'Default space' }] };
          } else if (pathOnly.indexOf('/organization') !== -1) {
            data = { org: { id: 1, name: 'Retool Org', subdomain: 'fsb-test' } };
          } else if (pathOnly.indexOf('/sourceControl/settings') !== -1) {
            data = { settings: { enabled: false } };
          } else if (pathOnly.indexOf('/workflowRun/getCountByWorkflow') !== -1) {
            data = { workflowRunsCountByWorkflow: { wf_1: { workflowId: 'wf_1', count: 2 } } };
          } else if (pathOnly.indexOf('/workflow/workflowsConfiguration') !== -1) {
            data = { temporalEnabled: true, codeExecutorVersion: 'test' };
          } else if (pathOnly.indexOf('/agents') !== -1) {
            data = { agents: [{ id: 'agent-1', name: 'Agent' }] };
          } else if (pathOnly.indexOf('/pages') !== -1) {
            data = { pages: [{ uuid: 'page-1', name: 'App' }], folders: [] };
          } else if (pathOnly.indexOf('/branches') !== -1) {
            data = { branches: [{ name: 'main' }] };
          } else if (pathOnly.indexOf('/environments') !== -1) {
            data = { environments: [{ id: 1, name: 'production' }] };
          } else if (pathOnly.indexOf('/experiments') !== -1) {
            data = { featureA: true };
          } else if (pathOnly.indexOf('/grid') !== -1) {
            data = [{ id: 'grid-1', name: 'Grid' }];
          } else if (pathOnly.indexOf('/editor/pageNames') !== -1) {
            data = { pageNames: [{ uuid: 'page-1', name: 'App' }] };
          } else if (pathOnly.indexOf('/playground') !== -1) {
            data = { userQueries: [{ id: 'query-1', name: 'Query' }], orgQueries: [] };
          } else if (pathOnly.indexOf('/resources') !== -1) {
            data = { resources: [{ id: 1, name: 'Resource' }] };
          } else if (pathOnly.indexOf('/workflow/') !== -1) {
            data = { workflowsMetadata: [{ id: 'wf_1', name: 'Workflow' }], workflowFolders: [] };
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
  // Phase 46 (T1R-06) -- first same-origin read batch: Netlify, Bitbucket,
  // CircleCI. These are GET-only, cookie-backed first-party relative API ports.
  // =========================================================================
  const netlifyPath = path.join(HANDLERS_DIR, 'netlify.js');
  check(fs.existsSync(netlifyPath), 'catalog/handlers/netlify.js exists (Phase 46)');
  if (fs.existsSync(netlifyPath)) {
    const nf = require(netlifyPath);
    const nfSrc = readSource(netlifyPath);

    check(nf['netlify.list_sites'] && nf['netlify.list_sites'].tier === 'T1a'
      && nf['netlify.list_sites'].sideEffectClass === 'read'
      && typeof nf['netlify.list_sites'].handle === 'function',
      'netlify.list_sites is a tier:T1a READ entry with an async handle');
    check(nf['netlify.get_site'] && nf['netlify.get_site'].origin === 'https://app.netlify.com',
      'netlify.get_site targets the first-party origin https://app.netlify.com');
    check(nf['netlify.list_sites'] && nf['netlify.list_sites'].params
      && Array.isArray(nf['netlify.list_sites'].params.required)
      && nf['netlify.list_sites'].params.required.indexOf('account_slug') !== -1,
      'netlify.list_sites exposes a params schema requiring account_slug');
    check(!/chrome\.(scripting|tabs)/.test(nfSrc),
      'netlify.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(nfSrc),
      'netlify.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(nfSrc),
      'netlify.js does NOT console-log a secret-bearing variable');

    const nfList = makeCtx('https://app.netlify.com', 46);
    const nfListOut = await nf['netlify.list_sites'].handle({
      account_slug: 'team-test',
      page: 2,
      per_page: 50,
      name: 'docs'
    }, nfList.ctx);
    check(nfList.calls.length === 1 && nfList.calls[0].spec.method === 'GET',
      'netlify.list_sites builds one GET spec');
    check(nfList.calls.length === 1 && nfList.calls[0].spec.origin === 'https://app.netlify.com',
      'netlify.list_sites pins the spec to app.netlify.com');
    check(nfList.calls.length === 1 && nfList.calls[0].spec.url ===
      'https://app.netlify.com/access-control/bb-api/api/v1/team-test/sites?page=2&per_page=50&name=docs',
      'netlify.list_sites targets the vendored same-origin account sites path with query filters');
    check(nfListOut && nfListOut.success === true,
      'netlify.list_sites accepts a logged-in array body');

    const nfGet = makeCtx('https://app.netlify.com', 46);
    await nf['netlify.get_site'].handle({ site_id: 'site-123' }, nfGet.ctx);
    check(nfGet.calls.length === 1 && nfGet.calls[0].spec.url ===
      'https://app.netlify.com/access-control/bb-api/api/v1/sites/site-123',
      'netlify.get_site targets /sites/:site_id');

    const nfDeploys = makeCtx('https://app.netlify.com', 46);
    await nf['netlify.list_deploys'].handle({ site_id: 'site-123', page: 3, per_page: 10 }, nfDeploys.ctx);
    check(nfDeploys.calls.length === 1 && nfDeploys.calls[0].spec.url ===
      'https://app.netlify.com/access-control/bb-api/api/v1/sites/site-123/deploys?page=3&per_page=10',
      'netlify.list_deploys targets /sites/:site_id/deploys with pagination');

    const nfForms = makeCtx('https://app.netlify.com', 46);
    await nf['netlify.list_forms'].handle({ site_id: 'site-123' }, nfForms.ctx);
    check(nfForms.calls.length === 1 && nfForms.calls[0].spec.url ===
      'https://app.netlify.com/access-control/bb-api/api/v1/sites/site-123/forms',
      'netlify.list_forms targets /sites/:site_id/forms');

    const nfNeg = makeCtx('https://app.netlify.com', 46, { readData: { ok: false } });
    const nfNegOut = await nf['netlify.list_sites'].handle({ account_slug: 'team-test' }, nfNeg.ctx);
    check(nfNegOut && nfNegOut.success === false
      && nfNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && nfNegOut.fellBackToDom === true,
      'netlify.list_sites rejects a non-array logged-out body -> RECIPE_DOM_FALLBACK_PENDING');
  }

  const bitbucketPath = path.join(HANDLERS_DIR, 'bitbucket.js');
  check(fs.existsSync(bitbucketPath), 'catalog/handlers/bitbucket.js exists (Phase 46)');
  if (fs.existsSync(bitbucketPath)) {
    const bb = require(bitbucketPath);
    const bbSrc = readSource(bitbucketPath);

    check(bb['bitbucket.list_workspaces'] && bb['bitbucket.list_workspaces'].tier === 'T1a'
      && bb['bitbucket.list_workspaces'].sideEffectClass === 'read'
      && typeof bb['bitbucket.list_workspaces'].handle === 'function',
      'bitbucket.list_workspaces is a tier:T1a READ entry with an async handle');
    check(bb['bitbucket.get_repository'] && bb['bitbucket.get_repository'].origin === 'https://bitbucket.org',
      'bitbucket.get_repository targets the first-party origin https://bitbucket.org');
    check(bb['bitbucket.get_repository'] && bb['bitbucket.get_repository'].params
      && Array.isArray(bb['bitbucket.get_repository'].params.required)
      && bb['bitbucket.get_repository'].params.required.indexOf('workspace') !== -1
      && bb['bitbucket.get_repository'].params.required.indexOf('repo_slug') !== -1,
      'bitbucket.get_repository exposes a params schema requiring workspace + repo_slug');
    check(!/chrome\.(scripting|tabs)/.test(bbSrc),
      'bitbucket.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(bbSrc),
      'bitbucket.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(bbSrc),
      'bitbucket.js does NOT console-log a secret-bearing variable');

    const bbWorkspaces = makeCtx('https://bitbucket.org', 47);
    const bbWorkspacesOut = await bb['bitbucket.list_workspaces'].handle({ page: 2, pagelen: 25 }, bbWorkspaces.ctx);
    check(bbWorkspaces.calls.length === 1 && bbWorkspaces.calls[0].spec.method === 'GET',
      'bitbucket.list_workspaces builds one GET spec');
    check(bbWorkspaces.calls.length === 1 && bbWorkspaces.calls[0].spec.origin === 'https://bitbucket.org',
      'bitbucket.list_workspaces pins the spec to bitbucket.org');
    check(bbWorkspaces.calls.length === 1 && bbWorkspaces.calls[0].spec.url ===
      'https://bitbucket.org/!api/2.0/workspaces?page=2&pagelen=25',
      'bitbucket.list_workspaces targets /!api/2.0/workspaces with pagination');
    check(bbWorkspacesOut && bbWorkspacesOut.success === true,
      'bitbucket.list_workspaces accepts a logged-in values[] page');

    const bbRepos = makeCtx('https://bitbucket.org', 47);
    await bb['bitbucket.list_repositories'].handle({
      workspace: 'team-test',
      page: 1,
      pagelen: 10,
      query: 'name ~ "fsb"'
    }, bbRepos.ctx);
    check(bbRepos.calls.length === 1 && bbRepos.calls[0].spec.url ===
      'https://bitbucket.org/!api/2.0/repositories/team-test?page=1&pagelen=10&q=name%20~%20%22fsb%22',
      'bitbucket.list_repositories maps query to Bitbucket q and targets /repositories/:workspace');

    const bbGet = makeCtx('https://bitbucket.org', 47);
    await bb['bitbucket.get_repository'].handle({ workspace: 'team-test', repo_slug: 'fsb' }, bbGet.ctx);
    check(bbGet.calls.length === 1 && bbGet.calls[0].spec.url ===
      'https://bitbucket.org/!api/2.0/repositories/team-test/fsb',
      'bitbucket.get_repository targets /repositories/:workspace/:repo_slug');

    const bbNeg = makeCtx('https://bitbucket.org', 47, { readData: { type: 'error', error: { message: 'no auth' } } });
    const bbNegOut = await bb['bitbucket.get_repository'].handle({ workspace: 'team-test', repo_slug: 'fsb' }, bbNeg.ctx);
    check(bbNegOut && bbNegOut.success === false
      && bbNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && bbNegOut.fellBackToDom === true,
      'bitbucket.get_repository rejects a Bitbucket error envelope -> RECIPE_DOM_FALLBACK_PENDING');
  }

  const circleciPath = path.join(HANDLERS_DIR, 'circleci.js');
  check(fs.existsSync(circleciPath), 'catalog/handlers/circleci.js exists (Phase 46)');
  if (fs.existsSync(circleciPath)) {
    const cc = require(circleciPath);
    const ccSrc = readSource(circleciPath);

    check(cc['circleci.get_current_user'] && cc['circleci.get_current_user'].tier === 'T1a'
      && cc['circleci.get_current_user'].sideEffectClass === 'read'
      && typeof cc['circleci.get_current_user'].handle === 'function',
      'circleci.get_current_user is a tier:T1a READ entry with an async handle');
    check(cc['circleci.list_pipelines'] && cc['circleci.list_pipelines'].origin === 'https://app.circleci.com',
      'circleci.list_pipelines targets the first-party origin https://app.circleci.com');
    check(cc['circleci.list_pipelines'] && cc['circleci.list_pipelines'].params
      && Array.isArray(cc['circleci.list_pipelines'].params.required)
      && cc['circleci.list_pipelines'].params.required.indexOf('project_slug') !== -1,
      'circleci.list_pipelines exposes a params schema requiring project_slug');
    check(!/chrome\.(scripting|tabs)/.test(ccSrc),
      'circleci.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(ccSrc),
      'circleci.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(ccSrc),
      'circleci.js does NOT console-log a secret-bearing variable');

    const ccMe = makeCtx('https://app.circleci.com', 48);
    const ccMeOut = await cc['circleci.get_current_user'].handle({}, ccMe.ctx);
    check(ccMe.calls.length === 1 && ccMe.calls[0].spec.method === 'GET',
      'circleci.get_current_user builds one GET spec');
    check(ccMe.calls.length === 1 && ccMe.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/me',
      'circleci.get_current_user targets /api/v2/me');
    check(ccMeOut && ccMeOut.success === true,
      'circleci.get_current_user accepts a logged-in user object');

    const ccPipes = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.list_pipelines'].handle({
      project_slug: 'gh/org/repo',
      branch: 'main',
      mine: true,
      page_token: 'next-token'
    }, ccPipes.ctx);
    check(ccPipes.calls.length === 1 && ccPipes.calls[0].spec.origin === 'https://app.circleci.com',
      'circleci.list_pipelines pins the spec to app.circleci.com');
    check(ccPipes.calls.length === 1 && ccPipes.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo/pipeline?branch=main&mine=true&page-token=next-token',
      'circleci.list_pipelines preserves project_slug path segments and maps page_token to page-token');

    const ccProject = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_project'].handle({ project_slug: 'gh/org/repo' }, ccProject.ctx);
    check(ccProject.calls.length === 1 && ccProject.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo',
      'circleci.get_project targets /api/v2/project/:project_slug');

    check(cc['circleci.get_pipeline'] && cc['circleci.get_pipeline'].tier === 'T1a'
      && cc['circleci.get_pipeline'].sideEffectClass === 'read'
      && typeof cc['circleci.get_pipeline'].handle === 'function',
      'circleci.get_pipeline is a tier:T1a READ entry with an async handle');
    check(cc['circleci.get_job_tests'] && cc['circleci.get_job_tests'].tier === 'T1a'
      && cc['circleci.get_job_tests'].sideEffectClass === 'read'
      && typeof cc['circleci.get_job_tests'].handle === 'function',
      'circleci.get_job_tests is a tier:T1a READ entry with an async handle');

    const ccPipeline = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_pipeline'].handle({ pipeline_id: 'pipeline-123' }, ccPipeline.ctx);
    check(ccPipeline.calls.length === 1 && ccPipeline.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/pipeline/pipeline-123',
      'circleci.get_pipeline targets /api/v2/pipeline/:pipeline_id');

    const ccPipelineWorkflows = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_pipeline_workflows'].handle({ pipeline_id: 'pipeline-123', page_token: 'next-token' }, ccPipelineWorkflows.ctx);
    check(ccPipelineWorkflows.calls.length === 1 && ccPipelineWorkflows.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/pipeline/pipeline-123/workflow?page-token=next-token',
      'circleci.get_pipeline_workflows targets /api/v2/pipeline/:pipeline_id/workflow with page-token');

    const ccWorkflow = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_workflow'].handle({ workflow_id: 'workflow-123' }, ccWorkflow.ctx);
    check(ccWorkflow.calls.length === 1 && ccWorkflow.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/workflow/workflow-123',
      'circleci.get_workflow targets /api/v2/workflow/:workflow_id');

    const ccWorkflowJobs = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_workflow_jobs'].handle({ workflow_id: 'workflow-123', page_token: 'job-token' }, ccWorkflowJobs.ctx);
    check(ccWorkflowJobs.calls.length === 1 && ccWorkflowJobs.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/workflow/workflow-123/job?page-token=job-token',
      'circleci.get_workflow_jobs targets /api/v2/workflow/:workflow_id/job with page-token');

    const ccJob = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_job'].handle({ project_slug: 'gh/org/repo', job_number: 42 }, ccJob.ctx);
    check(ccJob.calls.length === 1 && ccJob.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo/job/42',
      'circleci.get_job targets /api/v2/project/:project_slug/job/:job_number');

    const ccArtifacts = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_job_artifacts'].handle({ project_slug: 'gh/org/repo', job_number: 42 }, ccArtifacts.ctx);
    check(ccArtifacts.calls.length === 1 && ccArtifacts.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo/42/artifacts',
      'circleci.get_job_artifacts targets /api/v2/project/:project_slug/:job_number/artifacts');

    const ccTests = makeCtx('https://app.circleci.com', 48);
    await cc['circleci.get_job_tests'].handle({ project_slug: 'gh/org/repo', job_number: 42 }, ccTests.ctx);
    check(ccTests.calls.length === 1 && ccTests.calls[0].spec.url ===
      'https://app.circleci.com/api/v2/project/gh/org/repo/42/tests',
      'circleci.get_job_tests targets /api/v2/project/:project_slug/:job_number/tests');

    const ccNeg = makeCtx('https://app.circleci.com', 48, { readData: { message: 'not authenticated' } });
    const ccNegOut = await cc['circleci.get_current_user'].handle({}, ccNeg.ctx);
    check(ccNegOut && ccNegOut.success === false
      && ccNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && ccNegOut.fellBackToDom === true,
      'circleci.get_current_user rejects an error envelope -> RECIPE_DOM_FALLBACK_PENDING');
  }

  const vercelPath = path.join(HANDLERS_DIR, 'vercel.js');
  check(fs.existsSync(vercelPath), 'catalog/handlers/vercel.js exists (Phase 48)');
  if (fs.existsSync(vercelPath)) {
    const vc = require(vercelPath);
    const vcSrc = readSource(vercelPath);

    check(vc['vercel.list_projects'] && vc['vercel.list_projects'].tier === 'T1a'
      && vc['vercel.list_projects'].sideEffectClass === 'read'
      && typeof vc['vercel.list_projects'].handle === 'function',
      'vercel.list_projects is a tier:T1a READ entry with an async handle');
    check(vc['vercel.get_project'] && vc['vercel.get_project'].origin === 'https://vercel.com',
      'vercel.get_project targets the first-party origin https://vercel.com');
    check(vc['vercel.get_project'] && vc['vercel.get_project'].params
      && Array.isArray(vc['vercel.get_project'].params.required)
      && vc['vercel.get_project'].params.required.indexOf('project') !== -1,
      'vercel.get_project exposes a params schema requiring project');
    check(!/chrome\.(scripting|tabs)/.test(vcSrc),
      'vercel.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(vcSrc),
      'vercel.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer)\b/i.test(vcSrc),
      'vercel.js does NOT console-log a secret-bearing variable');

    const vcUser = makeCtx('https://vercel.com', 49);
    const vcUserOut = await vc['vercel.get_user'].handle({}, vcUser.ctx);
    check(vcUser.calls.length === 1 && vcUser.calls[0].spec.method === 'GET',
      'vercel.get_user builds one GET spec');
    check(vcUser.calls.length === 1 && vcUser.calls[0].spec.origin === 'https://vercel.com',
      'vercel.get_user pins the spec to vercel.com');
    check(vcUser.calls.length === 1 && vcUser.calls[0].spec.url ===
      'https://vercel.com/api/www/user',
      'vercel.get_user targets /api/www/user');
    check(vcUserOut && vcUserOut.success === true,
      'vercel.get_user accepts a logged-in user payload');

    const vcTeams = makeCtx('https://vercel.com', 49);
    await vc['vercel.list_teams'].handle({ limit: 10, since: 'cursor-1' }, vcTeams.ctx);
    check(vcTeams.calls.length === 1 && vcTeams.calls[0].spec.url ===
      'https://vercel.com/api/v2/teams?limit=10&since=cursor-1',
      'vercel.list_teams targets /api/v2/teams with pagination');

    const vcProjects = makeCtx('https://vercel.com', 49);
    await vc['vercel.list_projects'].handle({ limit: 25, from: 'cursor-2', search: 'docs' }, vcProjects.ctx);
    check(vcProjects.calls.length === 1 && vcProjects.calls[0].spec.url ===
      'https://vercel.com/api/v9/projects?limit=25&from=cursor-2&search=docs',
      'vercel.list_projects targets /api/v9/projects with filters');

    const vcProject = makeCtx('https://vercel.com', 49);
    await vc['vercel.get_project'].handle({ project: 'project-test' }, vcProject.ctx);
    check(vcProject.calls.length === 1 && vcProject.calls[0].spec.url ===
      'https://vercel.com/api/v9/projects/project-test',
      'vercel.get_project targets /api/v9/projects/:project');

    const vcDeployments = makeCtx('https://vercel.com', 49);
    await vc['vercel.list_deployments'].handle({
      limit: 20,
      from: '1700000000000',
      project: 'project-test',
      target: 'production',
      state: 'READY'
    }, vcDeployments.ctx);
    check(vcDeployments.calls.length === 1 && vcDeployments.calls[0].spec.url ===
      'https://vercel.com/api/v6/deployments?limit=20&from=1700000000000&projectId=project-test&target=production&state=READY',
      'vercel.list_deployments maps project to projectId and targets /api/v6/deployments');

    const vcDeployment = makeCtx('https://vercel.com', 49);
    await vc['vercel.get_deployment'].handle({ deployment_id: 'dpl_123' }, vcDeployment.ctx);
    check(vcDeployment.calls.length === 1 && vcDeployment.calls[0].spec.url ===
      'https://vercel.com/api/v13/deployments/dpl_123',
      'vercel.get_deployment targets /api/v13/deployments/:deployment_id');

    const vcDomains = makeCtx('https://vercel.com', 49);
    await vc['vercel.list_domains'].handle({ project: 'project-test' }, vcDomains.ctx);
    check(vcDomains.calls.length === 1 && vcDomains.calls[0].spec.url ===
      'https://vercel.com/api/v9/projects/project-test/domains',
      'vercel.list_domains targets /api/v9/projects/:project/domains');

    const vcNeg = makeCtx('https://vercel.com', 49, { readData: { error: { message: 'not authenticated' } } });
    const vcNegOut = await vc['vercel.list_projects'].handle({}, vcNeg.ctx);
    check(vcNegOut && vcNegOut.success === false
      && vcNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && vcNegOut.fellBackToDom === true,
      'vercel.list_projects rejects an error envelope -> RECIPE_DOM_FALLBACK_PENDING');
  }

  const retoolPath = path.join(HANDLERS_DIR, 'retool.js');
  check(fs.existsSync(retoolPath), 'catalog/handlers/retool.js exists (Phase 51)');
  if (fs.existsSync(retoolPath)) {
    const rt = require(retoolPath);
    const rtSrc = readSource(retoolPath);
    const expectedRetoolSlugs = [
      'retool.get_current_user',
      'retool.get_organization',
      'retool.get_source_control_settings',
      'retool.get_workflow_run_count',
      'retool.get_workflows_config',
      'retool.list_agents',
      'retool.list_apps',
      'retool.list_branches',
      'retool.list_environments',
      'retool.list_experiments',
      'retool.list_grids',
      'retool.list_page_names',
      'retool.list_playground_queries',
      'retool.list_resources',
      'retool.list_user_spaces',
      'retool.list_workflows'
    ];

    check(expectedRetoolSlugs.every(function (slug) {
      return rt[slug] && rt[slug].tier === 'T1a'
        && rt[slug].sideEffectClass === 'read'
        && rt[slug].origin === 'https://retool.com'
        && rt[slug].params
        && rt[slug].params.type === 'object'
        && typeof rt[slug].handle === 'function';
    }), 'all 16 Retool selected no-param reads are tier:T1a READ entries pinned to https://retool.com');
    check(!/chrome\.(scripting|tabs)/.test(rtSrc),
      'retool.js references NO chrome.scripting/chrome.tabs');
    check(!/\bfetch\s*\(/.test(rtSrc),
      'retool.js performs no direct network call');
    check(!/console\.\w+\([^)]*\b(token|cookie|csrf|authorization|bearer|xsrf)\b/i.test(rtSrc),
      'retool.js does NOT console-log a secret-bearing variable');

    const rtUser = makeCtx('https://retool.com', 51);
    const rtUserOut = await rt['retool.get_current_user'].handle({}, rtUser.ctx);
    check(rtUser.calls.length === 1 && rtUser.calls[0].spec.method === 'GET',
      'retool.get_current_user builds one GET spec');
    check(rtUser.calls.length === 1 && rtUser.calls[0].spec.origin === 'https://retool.com',
      'retool.get_current_user pins the spec to retool.com');
    check(rtUser.calls.length === 1 && rtUser.calls[0].spec.url === 'https://retool.com/api/user',
      'retool.get_current_user targets /api/user');
    check(rtUser.calls.length === 1
      && rtUser.calls[0].spec.csrfSource
      && rtUser.calls[0].spec.csrfSource.from === 'cookie'
      && rtUser.calls[0].spec.csrfSource.selector === 'xsrfToken'
      && rtUser.calls[0].spec.csrfSource.header === 'X-Xsrf-Token',
      'retool.get_current_user uses the cookie csrfSource for X-Xsrf-Token');
    check(rtUserOut && rtUserOut.success === true,
      'retool.get_current_user accepts a logged-in user envelope');

    const rtApps = makeCtx('https://retool.com', 51);
    const rtAppsOut = await rt['retool.list_apps'].handle({}, rtApps.ctx);
    check(rtApps.calls.length === 1 && rtApps.calls[0].spec.url === 'https://retool.com/api/pages',
      'retool.list_apps targets /api/pages');
    check(rtAppsOut && rtAppsOut.success === true,
      'retool.list_apps accepts a pages/folders envelope');

    const rtGrids = makeCtx('https://retool.com', 51);
    const rtGridsOut = await rt['retool.list_grids'].handle({}, rtGrids.ctx);
    check(rtGrids.calls.length === 1 && rtGrids.calls[0].spec.url === 'https://retool.com/api/grid',
      'retool.list_grids targets /api/grid');
    check(rtGridsOut && rtGridsOut.success === true,
      'retool.list_grids accepts an array body');

    const rtWorkflows = makeCtx('https://retool.com', 51);
    const rtWorkflowsOut = await rt['retool.list_workflows'].handle({}, rtWorkflows.ctx);
    check(rtWorkflows.calls.length === 1 && rtWorkflows.calls[0].spec.url === 'https://retool.com/api/workflow/',
      'retool.list_workflows targets /api/workflow/');
    check(rtWorkflowsOut && rtWorkflowsOut.success === true,
      'retool.list_workflows accepts a workflows/folders envelope');

    const rtResources = makeCtx('https://retool.com', 51);
    await rt['retool.list_resources'].handle({}, rtResources.ctx);
    check(rtResources.calls.length === 1 && rtResources.calls[0].spec.url === 'https://retool.com/api/resources',
      'retool.list_resources targets /api/resources');

    const rtNeg = makeCtx('https://retool.com', 51, { readData: { error: 'not authenticated' } });
    const rtNegOut = await rt['retool.list_apps'].handle({}, rtNeg.ctx);
    check(rtNegOut && rtNegOut.success === false
      && rtNegOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && rtNegOut.errorCode === 'RECIPE_DOM_FALLBACK_PENDING'
      && rtNegOut.error === 'RECIPE_DOM_FALLBACK_PENDING'
      && rtNegOut.fellBackToDom === true,
      'retool.list_apps rejects an error envelope -> RECIPE_DOM_FALLBACK_PENDING');
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

  ['github.js', 'slack.js', 'notion.js', 'gitlab.js', 'netlify.js', 'bitbucket.js', 'circleci.js', 'vercel.js', 'retool.js'].forEach(function (name) {
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
