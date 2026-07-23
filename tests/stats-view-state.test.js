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
const FSB_SERVICE_PATH = path.join(
  __dirname,
  '..',
  'showcase/angular/src/app/core/stats/fsb-telemetry.service.ts'
);
const FETCH_ERROR_PATH = path.join(
  __dirname,
  '..',
  'showcase/angular/src/app/core/stats/stats-fetch-error.ts'
);
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const fsbServiceSource = fs.readFileSync(FSB_SERVICE_PATH, 'utf8');
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
const fetchErrorCompiled = ts.transpileModule(fs.readFileSync(FETCH_ERROR_PATH, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: FETCH_ERROR_PATH,
});
const fetchErrorProduction = { exports: {} };
new Function('module', 'exports', 'require', fetchErrorCompiled.outputText)(
  fetchErrorProduction,
  fetchErrorProduction.exports,
  require
);

const {
  ACTIVE_FRESHNESS_SLA_MS,
  AGGREGATE_FRESHNESS_SLA_MS,
  GITHUB_FRESHNESS_SLA_MS,
  MAX_FUTURE_SKEW_MS,
  STATS_HARD_LIMIT_MS,
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
const {
  availabilityAfterFailure,
  httpStatsFetchError,
  retryAfterTimestamp,
} = fetchErrorProduction.exports;

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

function ready(data, snapshotAt = NOW, options = {}) {
  return {
    kind: 'ready',
    data,
    availability: {
      snapshotAt,
      checkedAt: options.checkedAt ?? NOW,
      upstreamStatus: options.upstreamStatus ?? '200',
      ...(options.nextRetryAt === undefined ? {} : { nextRetryAt: options.nextRetryAt }),
    },
  };
}

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
  states = updateStatsSourceState(states, 'commits', ready({ sentinel: 'commits' }));
  states = updateStatsSourceState(states, 'stars', {
    kind: 'error', message: 'stars failed',
  });

  assert.deepEqual(selectedStatsViewState('stars-cumulative', states, NOW), {
    kind: 'error', message: 'stars failed',
  });
  assert.deepEqual(selectedStatsViewState('commits-cumulative', states, NOW), {
    kind: 'ready', snapshotAt: NOW, checkedAt: NOW,
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
  previousVisit = updateStatsSourceState(
    previousVisit,
    'stars',
    ready({ sentinel: 'previous visit' })
  );
  assert.equal(selectedStatsViewState('stars-cumulative', previousVisit, NOW).kind, 'ready');
  assert.equal(
    selectedStatsViewState('stars-cumulative', initialStatsSourceStates(), NOW).kind,
    'loading'
  );
});

test('independent response ordering keeps a multi-source view honest', () => {
  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'fsb-headline', ready({ sentinel: 'headline first' }));
  assert.equal(selectedStatsViewState('fsb-tokens', states, NOW).kind, 'loading');

  states = updateStatsSourceState(states, 'fsb-series', {
    kind: 'error', message: 'series failed later',
  });
  assert.deepEqual(selectedStatsViewState('fsb-tokens', states, NOW), {
    kind: 'error', message: 'series failed later',
  });
});

test('Active now requires only the current request-time snapshot', () => {
  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'fsb-active', ready({ active_users_now: 32 }));

  assert.deepEqual(selectedStatsViewState('fsb-active-now', states, NOW), {
    kind: 'ready', snapshotAt: NOW, checkedAt: NOW,
  });

  states = updateStatsSourceState(states, 'fsb-headline', {
    kind: 'error', message: 'regional aggregate missing',
  });
  assert.equal(selectedStatsViewState('fsb-active-now', states, NOW).kind, 'ready');
});

test('history completeness and a failed retry do not downgrade a fresh GitHub snapshot', () => {
  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'stars', ready(
    { ...starPayload, history_complete: false },
    NOW - 5 * 60 * 1000,
    {
      checkedAt: NOW,
      upstreamStatus: '403',
      nextRetryAt: NOW + 60_000,
    }
  ));

  assert.equal(selectedStatsViewState('stars-cumulative', states, NOW).kind, 'ready');
});

test('GitHub snapshots cross the 15-minute and 24-hour age boundaries', () => {
  const stateForAge = (age) => {
    let states = initialStatsSourceStates();
    states = updateStatsSourceState(states, 'stars', ready(starPayload, NOW - age));
    return selectedStatsViewState('stars-cumulative', states, NOW).kind;
  };

  assert.equal(stateForAge(GITHUB_FRESHNESS_SLA_MS), 'ready');
  assert.equal(stateForAge(GITHUB_FRESHNESS_SLA_MS + 1), 'partial');
  assert.equal(stateForAge(STATS_HARD_LIMIT_MS), 'partial');
  assert.equal(stateForAge(STATS_HARD_LIMIT_MS + 1), 'error');
});

test('snapshot timestamps over five minutes in the future are unknown and Partial', () => {
  const stateForTimestamp = (snapshotAt) => {
    let states = initialStatsSourceStates();
    states = updateStatsSourceState(states, 'stars', ready(starPayload, snapshotAt));
    return selectedStatsViewState('stars-cumulative', states, NOW);
  };

  assert.equal(stateForTimestamp(NOW + MAX_FUTURE_SKEW_MS).kind, 'ready');
  assert.deepEqual(stateForTimestamp(NOW + MAX_FUTURE_SKEW_MS + 1), {
    kind: 'partial',
    snapshotAt: null,
    checkedAt: NOW,
    message: 'One or more required snapshots are outside the freshness window.',
  });
});

test('an unknown aggregate timestamp remains usable but Partial', () => {
  const transformed = aggregateDatasetState(
    { aggregate_updated_at: null, tokens_total_lifetime: 0 },
    ready(null).availability
  );
  assert.equal(transformed.kind, 'ready');
  assert.equal(transformed.availability.snapshotAt, null);

  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'fsb-headline', transformed);
  assert.equal(selectedStatsViewState('fsb-popular-mcp', states, NOW).kind, 'partial');
});

test('Tokens and Popular use the two-hour aggregate boundary', () => {
  const stateFor = (view, age) => {
    let states = initialStatsSourceStates();
    states = updateStatsSourceState(states, 'fsb-headline', ready({}, NOW - age));
    states = updateStatsSourceState(states, 'fsb-series', ready({}, NOW - age));
    return selectedStatsViewState(view, states, NOW).kind;
  };

  for (const view of ['fsb-tokens', 'fsb-popular-mcp']) {
    assert.equal(stateFor(view, AGGREGATE_FRESHNESS_SLA_MS), 'ready');
    assert.equal(stateFor(view, AGGREGATE_FRESHNESS_SLA_MS + 1), 'partial');
    assert.equal(stateFor(view, STATS_HARD_LIMIT_MS + 1), 'error');
  }
});

test('Active freshness is age-based and ignores agent-reporting coverage', () => {
  const active = {
    generated_at: new Date(NOW).toISOString(),
    active_users_now: 32,
    active_agents_reporting_users_now: 0,
  };
  const transformed = activeSnapshotDatasetState(
    active,
    ready(null, NOW).availability
  );
  assert.equal(transformed.kind, 'ready');

  let states = initialStatsSourceStates();
  states = updateStatsSourceState(states, 'fsb-active', transformed);
  assert.equal(
    selectedStatsViewState('fsb-active-now', states, NOW + ACTIVE_FRESHNESS_SLA_MS).kind,
    'ready'
  );
  assert.equal(
    selectedStatsViewState('fsb-active-now', states, NOW + ACTIVE_FRESHNESS_SLA_MS + 1).kind,
    'partial'
  );
});

test('Active with a missing or invalid generated_at remains usable but Partial', () => {
  for (const generated_at of [undefined, 'not-a-date']) {
    const transformed = activeSnapshotDatasetState(
      { generated_at, active_users_now: 4 },
      ready(null, null).availability
    );
    let states = initialStatsSourceStates();
    states = updateStatsSourceState(states, 'fsb-active', transformed);
    assert.equal(selectedStatsViewState('fsb-active-now', states, NOW).kind, 'partial');
  }
  assert.match(fsbServiceSource, /snapshotAt:\s*generatedAt\(value\)/);
  assert.doesNotMatch(fsbServiceSource, /snapshotAt:\s*generatedAt\(value\)\s*\?\?/);
});

test('failed HTTP refreshes preserve status and Retry-After metadata', () => {
  const checkedAt = NOW;
  assert.equal(retryAfterTimestamp('45', checkedAt), checkedAt + 45_000);
  assert.equal(
    retryAfterTimestamp(new Date(checkedAt + 90_000).toUTCString(), checkedAt),
    checkedAt + 90_000
  );

  const failure = httpStatsFetchError('temporarily unavailable', 503, '45', checkedAt);
  assert.deepEqual(
    availabilityAfterFailure(
      { snapshotAt: checkedAt - 60_000, checkedAt: checkedAt - 30_000, upstreamStatus: '200' },
      failure
    ),
    {
      snapshotAt: checkedAt - 60_000,
      checkedAt,
      upstreamStatus: '503',
      nextRetryAt: checkedAt + 45_000,
    }
  );
});

test('client-side failures use request-error without inventing a retry time', () => {
  assert.deepEqual(
    availabilityAfterFailure(
      {
        snapshotAt: NOW,
        checkedAt: NOW,
        upstreamStatus: '403',
        nextRetryAt: NOW + 10_000,
      },
      new TypeError('network down'),
      NOW + 1_000
    ),
    {
      snapshotAt: NOW,
      checkedAt: NOW + 1_000,
      upstreamStatus: 'request-error',
    }
  );
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

test('freshness headers include checked time, upstream status, and retry time', () => {
  const values = new Map([
    ['x-fsb-stats-cache', 'stale'],
    ['x-fsb-stats-fetched-at', '2026-07-20T11:00:00.000Z'],
    ['x-fsb-stats-checked-at', '2026-07-20T11:05:00.000Z'],
    ['x-fsb-stats-upstream-status', '403'],
    ['x-fsb-stats-next-retry-at', '2026-07-20T11:10:00.000Z'],
  ]);
  assert.deepEqual(
    statsResponseFreshness({ get: (name) => values.get(name) ?? null }),
    {
      cacheState: 'stale',
      snapshotAt: Date.parse('2026-07-20T11:00:00.000Z'),
      checkedAt: Date.parse('2026-07-20T11:05:00.000Z'),
      upstreamStatus: '403',
      nextRetryAt: Date.parse('2026-07-20T11:10:00.000Z'),
    }
  );
});

test('freshness parser rejects incomplete metadata', () => {
  const values = new Map([
    ['x-fsb-stats-cache', 'fresh'],
    ['x-fsb-stats-fetched-at', '2026-07-20T11:00:00.000Z'],
  ]);
  assert.throws(
    () => statsResponseFreshness({ get: (name) => values.get(name) ?? null }),
    /freshness metadata/
  );
});

test('GitHub service preserves response metadata on both 200 and 304 paths', () => {
  assert.match(
    serviceSource,
    /response\.status\s*===\s*304[\s\S]*statsResponseFreshness\(response\.headers\)/
  );
  assert.match(
    serviceSource,
    /return\s*\{\s*data:\s*parsed,\s*\.\.\.statsResponseFreshness\(response\.headers\)\s*\}/
  );
  assert.match(serviceSource, /availability:\s*availabilityFromResponse\(result\)/);
  assert.doesNotMatch(serviceSource, /result\.cacheState\s*===/);
  assert.match(serviceSource, /httpStatsFetchError\(/);
  assert.match(serviceSource, /availabilityAfterFailure\(previous\.availability, err\)/);
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
