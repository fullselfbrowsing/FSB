'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('../showcase/angular/node_modules/typescript');

const MODEL_PATH = path.join(
  __dirname,
  '..',
  'showcase/angular/src/app/core/stats/stats-view.model.ts'
);
const SERVICE_PATH = path.join(
  __dirname,
  '..',
  'showcase/angular/src/app/core/stats/github-stats.service.ts'
);
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const compiled = ts.transpileModule(fs.readFileSync(MODEL_PATH, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: MODEL_PATH,
});
const production = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(
  production,
  production.exports,
  require
);

const {
  activeSnapshotDatasetState,
  aggregateDatasetState,
  initialStatsSourceStates,
  normalizeGitHubCommits,
  normalizeGitHubStars,
  rollingSevenDayStars,
  selectedStatsViewState,
  statsResponseFreshness,
  updateStatsSourceState,
} = production.exports;

const starPayload = {
  schema_version: 1,
  total: 108,
  history: [
    { day_utc: '2026-07-13', total: 100 },
    { day_utc: '2026-07-20', total: 108 },
  ],
  history_complete: true,
  source: 'stargazers',
  as_of: '2026-07-20T12:00:00.000Z',
};

test('one successful response cannot mask the selected dataset error', () => {
  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'commits', {
    kind: 'ready', data: { sentinel: 'commits' }, fetchedAt: 20,
  });
  states = updateStatsSourceState(states, 'stars', {
    kind: 'error', message: 'stars failed',
  });

  assert.deepEqual(selectedStatsViewState('stars-cumulative', states), {
    kind: 'error', message: 'stars failed',
  });
  assert.deepEqual(selectedStatsViewState('commits-cumulative', states), {
    kind: 'ready', fetchedAt: 20,
  });
});

test('stale prior data is scoped to the GitHub view that consumes its source', () => {
  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'stars', {
    kind: 'stale',
    data: { sentinel: 'old stars' },
    fetchedAt: 10,
    message: 'upstream unavailable',
  });
  states = updateStatsSourceState(states, 'commits', {
    kind: 'ready', data: { sentinel: 'commits' }, fetchedAt: 30,
  });

  assert.equal(selectedStatsViewState('stars-cumulative', states).kind, 'stale');
  assert.deepEqual(selectedStatsViewState('commits-cumulative', states), {
    kind: 'ready', fetchedAt: 30,
  });
});

test('source state has no retired Issues dataset', () => {
  assert.deepEqual(Object.keys(initialStatsSourceStates()).sort(), [
    'commits',
    'fsb-active',
    'fsb-headline',
    'fsb-series',
    'stars',
  ]);
});

test('a new route visit resets retained singleton snapshots to loading', () => {
  let previousVisit = initialStatsSourceStates();
  previousVisit = updateStatsSourceState(previousVisit, 'stars', {
    kind: 'ready', data: { sentinel: 'previous visit' }, fetchedAt: 10,
  });
  assert.equal(selectedStatsViewState('stars-cumulative', previousVisit).kind, 'ready');
  assert.equal(selectedStatsViewState('stars-cumulative', initialStatsSourceStates()).kind, 'loading');
});

test('independent response ordering keeps a multi-source view honest', () => {
  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'fsb-headline', {
    kind: 'ready', data: { sentinel: 'headline first' }, fetchedAt: 50,
  });
  assert.equal(selectedStatsViewState('fsb-tokens', states).kind, 'loading');

  states = updateStatsSourceState(states, 'fsb-series', {
    kind: 'error', message: 'series failed later',
  });
  assert.deepEqual(selectedStatsViewState('fsb-tokens', states), {
    kind: 'error', message: 'series failed later',
  });
});

test('Active view cannot be Live until both the snapshot and regional aggregate are fresh', () => {
  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'fsb-active', {
    kind: 'ready', data: { sentinel: 'request-time active snapshot' }, fetchedAt: 60,
  });
  assert.equal(selectedStatsViewState('fsb-active-now', states).kind, 'loading');

  states = updateStatsSourceState(states, 'fsb-headline', {
    kind: 'stale',
    data: { sentinel: 'old regional aggregate' },
    fetchedAt: 20,
    message: 'aggregate is old',
  });
  assert.deepEqual(selectedStatsViewState('fsb-active-now', states), {
    kind: 'stale', fetchedAt: 20, message: 'aggregate is old',
  });

  states = updateStatsSourceState(states, 'fsb-headline', {
    kind: 'ready', data: { sentinel: 'fresh regional aggregate' }, fetchedAt: 55,
  });
  assert.deepEqual(selectedStatsViewState('fsb-active-now', states), {
    kind: 'ready', fetchedAt: 55,
  });
});

test('partial history propagates to the selected view instead of becoming Live', () => {
  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'commits', {
    kind: 'partial',
    data: { sentinel: 'truncated history' },
    fetchedAt: 40,
    message: 'incomplete',
  });
  assert.deepEqual(selectedStatsViewState('commits-cumulative', states), {
    kind: 'partial', fetchedAt: 40, message: 'incomplete',
  });
});

test('FSB aggregate timestamp distinguishes ready, partial, and stale snapshots', () => {
  const now = Date.parse('2026-07-20T12:00:00.000Z');
  assert.equal(aggregateDatasetState({ aggregate_updated_at: null }, now, now).kind, 'partial');
  assert.equal(aggregateDatasetState({
    aggregate_updated_at: '2026-07-20T09:59:59.000Z',
  }, now, now).kind, 'stale');
  assert.equal(aggregateDatasetState({
    aggregate_updated_at: '2026-07-20T10:00:00.000Z',
  }, now, now).kind, 'ready');
});

test('v2 active snapshots are Partial until every active user reports an agent count', () => {
  const checkedAt = Date.parse('2026-07-20T12:00:00.000Z');
  assert.equal(activeSnapshotDatasetState({
    active_users_now: 4,
    active_agents_reporting_users_now: 3,
    active_count_version: 2,
    active_metric_semantics: 'reported_registry_count_v2',
  }, checkedAt).kind, 'partial');
  assert.equal(activeSnapshotDatasetState({
    active_users_now: 4,
    active_agents_reporting_users_now: 4,
    active_count_version: 2,
    active_metric_semantics: 'reported_registry_count_v2',
  }, checkedAt).kind, 'ready');
  assert.equal(activeSnapshotDatasetState({
    active_users_now: 4,
    active_agents_reporting_users_now: 4,
    active_count_version: 2,
  }, checkedAt).kind, 'partial');
  assert.equal(activeSnapshotDatasetState({
    active_users_now: 0,
  }, checkedAt).kind, 'partial');
});

test('rolling seven-day stars uses UTC calendar days and preserves unstars', () => {
  assert.equal(rollingSevenDayStars(normalizeGitHubStars(starPayload)), 8);
  const unstarred = normalizeGitHubStars({
    ...starPayload,
    history: [
      { day_utc: '2026-07-13', total: 110 },
      { day_utc: '2026-07-20', total: 108 },
    ],
  });
  assert.equal(rollingSevenDayStars(unstarred), -2);
});

test('rolling seven-day stars is unavailable whenever history is incomplete', () => {
  assert.equal(
    rollingSevenDayStars(normalizeGitHubStars({ ...starPayload, history_complete: false })),
    null
  );
});

test('aggregate normalizers reject inconsistent cross-field totals', () => {
  assert.throws(() => normalizeGitHubStars({ ...starPayload, total: 109 }), /inconsistent/);
  assert.throws(() => normalizeGitHubCommits({
    schema_version: 1,
    total: 3,
    last_30_days: 4,
    history: [{ day_utc: '2026-07-20', total: 3 }],
    history_complete: true,
    as_of: starPayload.as_of,
  }), /inconsistent/);
});

test('freshness metadata preserves the server timestamp for 200/304 handling', () => {
  const values = new Map([
    ['x-fsb-stats-cache', 'stale'],
    ['x-fsb-stats-fetched-at', '2026-07-20T11:00:00.000Z'],
  ]);
  assert.deepEqual(
    statsResponseFreshness({ get: (name) => values.get(name) ?? null }),
    {
      cacheState: 'stale',
      fetchedAt: Date.parse('2026-07-20T11:00:00.000Z'),
    }
  );
});

test('GitHub service applies freshness metadata on both 200 and 304 paths', () => {
  assert.match(
    serviceSource,
    /response\.status\s*===\s*304[\s\S]*statsResponseFreshness\(response\.headers\)/
  );
  assert.match(
    serviceSource,
    /return\s*\{\s*data:\s*parsed,\s*\.\.\.statsResponseFreshness\(response\.headers\)\s*\}/
  );
  assert.match(serviceSource, /result\.cacheState\s*===\s*'stale'/);
  assert.match(serviceSource, /fetchedAt:\s*result\.fetchedAt/);
});

test('GitHub service fetches only datasets used by the page and resets on start', () => {
  const refreshStart = serviceSource.indexOf('  async refreshAll()');
  const refreshEnd = serviceSource.indexOf('  private startPoller()', refreshStart);
  const refreshBlock = serviceSource.slice(refreshStart, refreshEnd);
  for (const endpoint of ['stars', 'commits']) {
    assert.match(refreshBlock, new RegExp(`API_ROOT}/\\$\\{?${endpoint}`.replace('/\\$\\{?', '\\/')));
  }
  assert.doesNotMatch(refreshBlock, /issues|forks|pulls|releases|repo-summary/);
  assert.doesNotMatch(serviceSource, /issues\$|normalizeGitHubIssues/);
  assert.match(serviceSource, /this\.stars\$\.next\(\{\s*kind:\s*'loading'\s*\}\)/);
  assert.match(serviceSource, /for\s*\(const controller of this\.controllers\) controller\.abort\(\)/);
});
