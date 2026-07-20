/**
 * Knowledge Graph task-domain deduplication in simple and full detail modes.
 * Run: node tests/knowledge-graph-dedup.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GRAPH_PATH = path.resolve(__dirname, '..', 'extension', 'lib', 'visualization', 'knowledge-graph.js');
const source = fs.readFileSync(GRAPH_PATH, 'utf8');

const groupedGuides = {
  'E-Commerce & Shopping': [
    {
      site: 'Amazon',
      patterns: [/amazon\.(com|co\.\w+|in|de|fr|jp|ca|com\.au|com\.br|com\.mx)/i],
      selectors: { search: '#search' }
    },
    { site: 'Booking.com', patterns: [/booking\.com/i], selectors: { destination: '#destination' } }
  ],
  'Coding Platforms': [
    { site: 'GitHub', patterns: [/github\.com/i], selectors: { search: '#query' } }
  ],
  'Productivity Tools': [
    { site: 'Google Sheets', patterns: [/docs\.google\.com\/spreadsheets/i], selectors: { grid: '#grid' } }
  ]
};

const sandbox = {
  self: {},
  getSiteGuidesByCategory() { return groupedGuides; },
  console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const instrumentedSource = source.replace(
  '  return {\n    render: render,',
  '  self.__buildKnowledgeGraphDataForTests = buildKnowledgeGraphData;\n' +
  '  self.__normalizeSiteIdentityForTests = normalizeSiteIdentity;\n' +
  '  self.__patternSiteIdentitiesForTests = patternSiteIdentities;\n' +
  '  self.__getDefaultZoomForTests = getDefaultZoom;\n' +
  '  self.__getAutomaticZoomForTests = getAutomaticZoom;\n' +
  '  return {\n    render: render,'
);
vm.runInContext(instrumentedSource, sandbox, { filename: GRAPH_PATH });

const graph = sandbox.self.KnowledgeGraph;
const buildData = sandbox.self.__buildKnowledgeGraphDataForTests;
const normalizeIdentity = sandbox.self.__normalizeSiteIdentityForTests;
const patternIdentities = sandbox.self.__patternSiteIdentitiesForTests;
const getDefaultZoom = sandbox.self.__getDefaultZoomForTests;
const getAutomaticZoom = sandbox.self.__getAutomaticZoomForTests;
let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log('  PASS:', message);
  } else {
    failed++;
    console.error('  FAIL:', message);
  }
}

function taskMemory(domain, selectors) {
  return {
    typeData: {
      session: { domain },
      learned: { selectors: selectors || [] }
    },
    metadata: { domain }
  };
}

console.log('--- Knowledge Graph complete-registry duplicate identities ---');

check(!!graph && typeof buildData === 'function', 'test harness reaches the internal data builder');
check(normalizeIdentity('HTTPS://WWW.Example.COM./path?q=1') === 'example.com',
  'identity normalization removes case, protocol, www, path, and trailing dot');
const amazonPattern = groupedGuides['E-Commerce & Shopping'][0].patterns[0];
check(!patternIdentities(amazonPattern).some((identity) => ['com.au', 'com.br', 'com.mx'].includes(identity)),
  'real Amazon alternations do not expose public-suffix fragments as site identities');

graph.setTaskMemories([
  taskMemory('https://WWW.AMAZON.COM./products', ['#buy']),
  taskMemory('https://www.amazon.com.au/products', ['#buy-au']),
  taskMemory('BOOKING.COM./hotels', ['#hotel']),
  taskMemory('https://github.com/org/repo', ['#code']),
  taskMemory('https://docs.google.com/spreadsheets/d/example/edit', ['#sheet']),
  taskMemory('https://news.com.au/world', ['#headline']),
  taskMemory('https://www.genuinely-new.dev./docs', ['#one']),
  taskMemory('GENUINELY-NEW.DEV/path', ['#two'])
]);

for (const detailLevel of ['simple', 'full']) {
  const data = buildData(detailLevel);
  const taskSites = data.nodes.filter((node) => node.type === 'task-site');
  const discovered = taskSites.find((node) => node.label === 'genuinely-new.dev');
  const australianNews = taskSites.find((node) => node.label === 'news.com.au');
  check(taskSites.length === 2,
    `${detailLevel} mode suppresses known guide domains and keeps both unrelated discovered domains`);
  check(!!discovered,
    `${detailLevel} mode renders the normalized genuinely discovered domain`);
  check(discovered && discovered.selectorCount === 2,
    `${detailLevel} mode coalesces normalized aliases and merges learned selectors`);
  check(australianNews && australianNews.selectorCount === 1,
    `${detailLevel} mode does not mistake news.com.au for an Amazon identity`);
  check(!taskSites.some((node) => /amazon|booking|github|docs\.google/i.test(node.label)),
    `${detailLevel} mode never duplicates a known guide, including a path-specific guide`);
}

const simple = buildData('simple');
const full = buildData('full');
check(!simple.nodes.some((node) => node.id.startsWith('site:')),
  'simple mode does not need rendered site nodes for duplicate detection');
check(full.nodes.some((node) => node.label === 'Amazon' && node.type === 'site'),
  'full mode still renders the built-in guide nodes normally');

const mobileContainer = {
  clientWidth: 500,
  clientHeight: 300,
  getBoundingClientRect() { return { width: 500, height: 300 }; }
};
const expandedState = {
  container: mobileContainer,
  canvas: { width: 500, height: 300 },
  dpr: 1,
  nodes: full.nodes,
  detailLevel: 'full',
  rotY: 0,
  rotX: 0.15
};
check(getAutomaticZoom(expandedState) < getDefaultZoom(mobileContainer, 'full'),
  'automatic Expanded zoom fits outer nodes inside a mobile-sized canvas');
check((source.match(/state\.zoom = getAutomaticZoom\(state\)/g) || []).length === 2,
  'initial render and resize both apply automatic fit-to-view zoom');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
