#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(ROOT, 'catalog', 'handlers', 'glama.js');
const EXT_HANDLER_PATH = path.join(ROOT, 'extension', 'catalog', 'handlers', 'glama.js');
const FETCH_PATH = path.join(ROOT, 'extension', 'utils', 'capability-fetch.js');
const CATALOG_PATH = path.join(ROOT, 'extension', 'utils', 'capability-catalog.js');
const INDEX_PATH = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const REPORT_PATH = path.join(ROOT, 'scripts', 'report-t1-readiness.mjs');
const ORIGIN_CLASSIFICATION_PATH = path.join(ROOT, 'scripts', 'verify-origin-classification.mjs');

const GLAMA_READ_SLUGS = [
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
  'glama.search_tools',
];

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

function freshRequire(filePath) {
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function bySlug(rows, slug) {
  return rows.find((row) => row && row.slug === slug) || null;
}

function fakeServer() {
  return {
    uid: 'srv-1',
    slug: 'postgres',
    displayName: 'Postgres MCP',
    namespace: { slug: 'acme' },
    descriptionPlainText: 'Postgres tools',
    descriptionMarkdown: '# Postgres tools',
    toolCount: 2,
    repository: {
      githubRepository: {
        stargazers: 42,
        language: 'TypeScript',
        spdxLicense: { name: 'MIT' },
        fullName: 'acme/postgres-mcp',
        defaultBranch: 'main',
      },
      githubProject: { url: 'https://github.com/acme/postgres-mcp' },
      npmPackage: { name: '@acme/postgres-mcp' },
      supportedPlatforms: ['MACOS', 'LINUX'],
    },
    scores: { license: 100, quality: 91, security: 87 },
    integrations: [{ brand: { name: 'PostgreSQL', slug: 'postgres' }, description: 'Database' }],
    addedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-06-30T00:00:00Z',
    recentUsage: 7,
    attributes: ['database'],
  };
}

function fakeTool() {
  return {
    uid: 'tool-1',
    name: 'query',
    description: 'Run a read query',
    mcpServer: {
      displayName: 'Postgres MCP',
      namespace: { slug: 'acme' },
      slug: 'postgres',
    },
  };
}

function installGlamaRouter() {
  const priorRouter = globalThis.__reactRouterDataRouter;
  const priorLocation = globalThis.location;
  globalThis.location = { origin: 'https://glama.ai' };

  const loaderData = {
    root: {
      visitor: {
        visitorSession: {
          attributes: ['authenticated'],
          userAccount: {
            referenceId: 'user-1',
            emailAddress: 'ada@example.test',
            fullName: 'Ada Lovelace',
          },
          membership: {
            role: { name: 'Owner' },
            workspace: { name: 'Analytical Engine', id: 1843 },
          },
        },
      },
    },
  };

  const router = {
    state: {
      location: { pathname: '/', search: '' },
      loaderData,
      navigation: { state: 'idle' },
      errors: null,
    },
    async navigate(target) {
      const url = new URL(target, 'https://glama.ai');
      this.state.location = { pathname: url.pathname, search: url.search };
      const server = fakeServer();
      const tool = fakeTool();

      if (url.pathname === '/mcp/servers') {
        loaderData['routes/_public/mcp/servers/_index/_route'] = {
          serverSearchResult: { results: [server] },
          stats: { totalServerCount: 123, lastUpdated: '2026-06-30T12:00:00Z' },
        };
      } else if (url.pathname === '/mcp/servers/acme/postgres') {
        loaderData['routes/_public/mcp/servers/~namespace/~slug/_pages/_index/_route'] = {
          mcpServer: server,
          tools: [tool],
          discussionCommentCount: 3,
        };
      } else if (url.pathname === '/mcp/servers/acme/postgres/score') {
        loaderData['routes/_public/mcp/servers/~namespace/~slug/_pages/score/_route'] = {
          score: { license: 100, quality: 91, security: 87 },
        };
      } else if (url.pathname === '/mcp/tools') {
        loaderData['routes/_public/mcp/tools/_index/_route'] = {
          toolSearchResult: { results: [{ sourceType: 'mcp_tool', tool }] },
        };
      } else if (url.pathname === '/mcp/servers/categories') {
        loaderData['routes/_public/mcp/servers/categories/_index/_route'] = {
          categories: [{ name: 'Databases', lookupKey: 'category:databases', icon: 'database', description: 'Database servers' }],
        };
      } else if (url.pathname === '/mcp/servers/categories/databases') {
        loaderData['routes/_public/mcp/servers/categories/~slug/_route'] = {
          mcpServers: [server],
        };
      } else if (url.pathname === '/mcp/clients') {
        loaderData['routes/_public/mcp/clients/_index/_index/_route'] = {
          mcpClients: [{ name: 'Claude Desktop', slug: 'claude-desktop', description: 'Desktop client', githubRepository: { stargazers: 100 }, attributes: ['desktop'] }],
        };
      } else if (url.pathname === '/gateway/models') {
        loaderData['routes/_public/gateway/models/_index/_route'] = {
          llmModelProfiles: [{
            model: 'claude-sonnet-4-6',
            author: { displayName: 'Anthropic' },
            provider: { displayName: 'Google Vertex' },
            capabilities: ['input:text'],
            maxTokens: { input: 200000, output: 64000 },
            pricePerToken: { input: '0.000003', output: '0.000015' },
          }],
        };
      } else if (url.pathname === '/chat') {
        loaderData['routes/_authenticated/_app/_layout'] = {
          recentChatSessions: [{ uid: 'chat-1', title: 'Planning' }],
        };
        loaderData['routes/_authenticated/_app/chat/~uid/_index/_route'] = {
          availableHostedLlmModels: [{ name: 'claude-sonnet-4-6' }],
        };
      } else if (url.pathname === '/chat/chat-1') {
        loaderData['routes/_authenticated/_app/chat/~uid/_index/_route'] = {
          chatSession: {
            uid: 'chat-1',
            title: 'Planning',
            hostedLlmModel: { name: 'claude-sonnet-4-6' },
            project: { name: 'Migration' },
            reasoningEffort: 'high',
          },
          availableHostedLlmModels: [{ name: 'claude-sonnet-4-6' }],
        };
      } else if (url.pathname === '/projects') {
        loaderData['routes/_authenticated/_app/projects/_index/_route'] = {
          projects: [{ uid: 'proj-1', name: 'Migration' }],
        };
      }
    },
  };

  globalThis.__reactRouterDataRouter = router;
  return function restore() {
    if (priorRouter === undefined) delete globalThis.__reactRouterDataRouter;
    else globalThis.__reactRouterDataRouter = priorRouter;
    if (priorLocation === undefined) delete globalThis.location;
    else globalThis.location = priorLocation;
  };
}

async function testHandler() {
  check(fs.existsSync(HANDLER_PATH), 'catalog/handlers/glama.js exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/glama.js exists');
  check(fs.readFileSync(HANDLER_PATH, 'utf8') === fs.readFileSync(EXT_HANDLER_PATH, 'utf8'),
    'extension Glama handler mirrors catalog handler');

  const src = fs.readFileSync(HANDLER_PATH, 'utf8');
  check(!/chrome\.(?:scripting|tabs|cookies|webRequest)|\bfetch\s*\(|\bXMLHttpRequest\s*\(|document\.cookie|localStorage|sessionStorage/.test(src),
    'Glama handler has no direct network, browser credential, or storage APIs');

  const handlers = freshRequire(HANDLER_PATH);
  check(GLAMA_READ_SLUGS.every((slug) => handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://glama.ai'
      && handlers[slug].sideEffectClass === 'read'
      && handlers[slug].params
      && handlers[slug].params.type === 'object'
      && typeof handlers[slug].handle === 'function'),
    'all Glama descriptors expose T1a read handlers pinned to glama.ai');

  const pageCalls = [];
  const out = await handlers['glama.search_servers'].handle({ q: 'postgres', sort: 'search-relevance:desc' }, {
    tabId: 77,
    async executeBoundPageRead(request, tabId) {
      pageCalls.push({ request, tabId });
      return { success: true, status: 200, data: { servers: [] } };
    },
    async executeBoundSpec() {
      throw new Error('Glama reads must not call executeBoundSpec');
    },
  });
  check(out && out.success === true
      && pageCalls.length === 1
      && pageCalls[0].tabId === 77
      && pageCalls[0].request.origin === 'https://glama.ai'
      && pageCalls[0].request.namespace === 'glama'
      && pageCalls[0].request.action === 'search_servers'
      && pageCalls[0].request.args.q === 'postgres',
    'glama.search_servers dispatches one bounded Glama page-read request');

  const noPrimitive = await handlers['glama.get_server'].handle({ namespace: 'acme', slug: 'postgres' }, {});
  check(noPrimitive && noPrimitive.success === false
      && noPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && noPrimitive.reason === 'glama-page-read-primitive-unavailable',
    'Glama reads fail closed when the page-read primitive is unavailable');
}

async function testPageRead() {
  const fetchMod = freshRequire(FETCH_PATH);
  const restore = installGlamaRouter();
  try {
    const currentUser = await fetchMod.capabilityPageReadInPage({
      origin: 'https://glama.ai',
      namespace: 'glama',
      action: 'get_current_user',
      args: {},
    });
    check(currentUser && currentUser.success === true
        && currentUser.data.user.email === 'ada@example.test'
        && currentUser.data.user.workspaceId === 1843,
      'Glama page-read maps authenticated root visitor session');

    const search = await fetchMod.capabilityPageReadInPage({
      origin: 'https://glama.ai',
      namespace: 'glama',
      action: 'search_servers',
      args: { q: 'postgres', sort: 'search-relevance:desc' },
    });
    check(search && search.success === true
        && search.data.servers[0].namespace === 'acme'
        && search.data.stats.totalServerCount === 123,
      'Glama page-read navigates search route and maps server summaries');

    const detail = await fetchMod.capabilityPageReadInPage({
      origin: 'https://glama.ai',
      namespace: 'glama',
      action: 'get_server',
      args: { namespace: 'acme', slug: 'postgres' },
    });
    check(detail && detail.success === true
        && detail.data.server.githubRepoFullName === 'acme/postgres-mcp'
        && detail.data.tools[0].name === 'query'
        && detail.data.discussionCommentCount === 3,
      'Glama page-read maps server detail route data');

    const chat = await fetchMod.capabilityPageReadInPage({
      origin: 'https://glama.ai',
      namespace: 'glama',
      action: 'get_chat_session',
      args: { uid: 'chat-1' },
    });
    check(chat && chat.success === true
        && chat.data.chat.projectName === 'Migration'
        && chat.data.availableModels[0] === 'claude-sonnet-4-6',
      'Glama page-read maps authenticated chat route data');
  } finally {
    restore();
  }
}

async function testReadiness() {
  delete globalThis.FsbRecipeIndex;
  delete globalThis.FsbCapabilityCatalog;
  const catalog = freshRequire(INDEX_PATH);
  globalThis.FsbRecipeIndex = catalog;
  const Catalog = freshRequire(CATALOG_PATH);
  freshRequire(EXT_HANDLER_PATH);
  if (typeof Catalog.seedHeadHandlers === 'function') Catalog.seedHeadHandlers();

  const resolved = Catalog.resolve('glama.search_servers', 'https://glama.ai');
  check(resolved && resolved.tier === 'T1a'
      && resolved.handler
      && typeof resolved.handler.handle === 'function',
    'resolver upgrades glama.search_servers to T1a handler');

  const reportMod = await import(pathToFileURL(REPORT_PATH).href);
  const report = reportMod.reportReadiness(catalog);
  const offenders = GLAMA_READ_SLUGS.filter((slug) => {
    const row = bySlug(report.rows, slug);
    return !row || row.readiness !== 't1-ready' || row.resolvedTier !== 'T1a' || row.hasHandlerProof !== true;
  });
  check(offenders.length === 0,
    'all Glama descriptors are t1-ready with handler proof' +
    (offenders.length ? ': ' + offenders.join(', ') : ''));
}

async function testOriginClassification() {
  const gateMod = await import(pathToFileURL(ORIGIN_CLASSIFICATION_PATH).href);
  const out = gateMod.checkOriginClassification([{ global: 'FsbHandlerGlama', origin: 'https://glama.ai' }]);
  const row = out.results && out.results[0];
  check(out.failures.length === 0
      && row
      && row.apiBaseUrl === 'https://glama.ai'
      && row.classification
      && row.classification.sameOrigin === true
      && typeof row.classification.reason === 'string'
      && row.classification.reason.indexOf('GLAMA_PAGE_STATE_RUNTIME_READ') === 0,
    'origin classifier accepts Glama page-state runtime proof');
}

(async function run() {
  console.log('--- Glama T1 readiness proof ---');
  await testHandler();
  await testPageRead();
  await testReadiness();
  await testOriginClassification();
  console.log('\nglama-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('FATAL (glama-t1-ready):', err && err.stack ? err.stack : err);
  process.exit(1);
});
