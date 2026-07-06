#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'lyft.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'lyft.js');
const DESCRIPTORS_DIR = path.join(REPO_ROOT, 'catalog', 'descriptors');
const GENERATED_INDEX_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const EVIDENCE_PATH = path.join(REPO_ROOT, 'catalog', 'write-activation-evidence.json');

const ORIGIN = 'https://www.lyft.com';
const READ_SLUGS = [
  'lyft.list_ride_types',
  'lyft.get_ride_estimate',
  'lyft.list_rides',
];
const GUARDED_SLUGS = [
  'lyft.request_ride',
  'lyft.cancel_ride',
];
const ALL_SLUGS = READ_SLUGS.concat(GUARDED_SLUGS);

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

function makeCtx(responses) {
  const calls = [];
  return {
    calls,
    ctx: {
      origin: ORIGIN,
      tabId: 77,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        const parsed = new URL(spec.url);
        const key = parsed.pathname + parsed.search;
        const value = Object.prototype.hasOwnProperty.call(responses, key)
          ? responses[key]
          : responses[parsed.pathname];
        if (value && value.__raw) return value.__raw;
        return { success: true, status: 200, data: value };
      },
    },
  };
}

function descriptorFor(slug) {
  return JSON.parse(fs.readFileSync(path.join(
    DESCRIPTORS_DIR,
    'opentabs__' + slug.replace('.', '__') + '.json'
  ), 'utf8'));
}

(async function run() {
  console.log('--- Lyft T1 handler proof ---');

  check(fs.existsSync(HANDLER_PATH), 'catalog/handlers/lyft.js exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/lyft.js exists');
  if (!fs.existsSync(HANDLER_PATH)) {
    console.log('\nlyft-t1-handler: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(1);
  }

  const src = fs.readFileSync(HANDLER_PATH, 'utf8');
  const extSrc = fs.existsSync(EXT_HANDLER_PATH) ? fs.readFileSync(EXT_HANDLER_PATH, 'utf8') : '';
  const lyft = require(HANDLER_PATH);

  check(extSrc === src, 'extension Lyft handler matches catalog handler byte-for-byte');
  check(Object.keys(lyft).sort().join(',') === ALL_SLUGS.slice().sort().join(','),
    'handler exports all five Lyft slugs');
  check(!/\bfetch\s*\(/.test(src), 'handler does not issue direct network calls');
  check(!/\bchrome\.(tabs|scripting|cookies|webRequest)\b/.test(src),
    'handler does not use direct chrome APIs');
  check(!/new\s+XMLHttpRequest|XMLHttpRequest\s*\(/.test(src),
    'handler does not construct XHR requests');
  check(!/Authorization|Bearer|getAuth|getCookie|document\.cookie|localStorage|sessionStorage/i.test(src),
    'handler contains no credential scraping path');

  for (const slug of ALL_SLUGS) {
    const descriptor = descriptorFor(slug);
    const entry = lyft[slug];
    check(entry && entry.tier === 'T1a', slug + ' is T1a');
    check(entry && entry.origin === ORIGIN, slug + ' pins www.lyft.com origin');
    check(entry && entry.params && entry.params.additionalProperties === false,
      slug + ' has a closed params schema');
    check(entry && typeof entry.handle === 'function', slug + ' exposes handle()');
    check(descriptor.backing === 'handler', slug + ' descriptor is handler-backed');
    check(entry && entry.sideEffectClass === descriptor.sideEffectClass,
      slug + ' sideEffectClass matches descriptor');
  }

  {
    const { ctx, calls } = makeCtx({
      '/v1/ride-types?pickup=501%20W%20Main&dropoff=SDF': {
        ride_types: [{ id: 'lyft', name: 'Lyft', eta_minutes: 4, seats: 4 }],
      },
    });
    const result = await lyft['lyft.list_ride_types'].handle({
      pickup: '501 W Main',
      dropoff: 'SDF',
    }, ctx);
    check(calls.length === 1
      && calls[0].spec.method === 'GET'
      && calls[0].spec.url === ORIGIN + '/v1/ride-types?pickup=501%20W%20Main&dropoff=SDF'
      && calls[0].spec.authStrategy === 'same-origin-cookie',
      'list_ride_types builds one origin-pinned JSON GET spec');
    check(result.success === true
      && result.data.ride_types[0].id === 'lyft'
      && result.data.ride_types[0].eta_minutes === 4,
      'list_ride_types maps ride type data');
  }

  {
    const { ctx, calls } = makeCtx({
      '/v1/ride-estimate?pickup=501%20W%20Main&dropoff=SDF&ride_type_id=lyft': {
        fare: 18.25,
        eta_minutes: 6,
        currency: 'USD',
        ride_type_id: 'lyft',
      },
    });
    const result = await lyft['lyft.get_ride_estimate'].handle({
      pickup: '501 W Main',
      dropoff: 'SDF',
      ride_type_id: 'lyft',
    }, ctx);
    check(calls.length === 1
      && calls[0].spec.url === ORIGIN + '/v1/ride-estimate?pickup=501%20W%20Main&dropoff=SDF&ride_type_id=lyft',
      'get_ride_estimate targets the ride estimate endpoint');
    check(result.success === true
      && result.data.estimate.fare === 18.25
      && result.data.estimate.eta_minutes === 6,
      'get_ride_estimate maps fare and ETA');
  }

  {
    const { ctx, calls } = makeCtx({
      '/v1/rides?status=completed&limit=5': {
        rides: [{
          id: 'ride-1',
          status: 'completed',
          ride_type_id: 'lyft',
          pickup: { address: '501 W Main' },
          dropoff: { address: 'SDF' },
          fare: 18.25,
        }],
      },
    });
    const result = await lyft['lyft.list_rides'].handle({ status: 'completed', limit: 5 }, ctx);
    check(calls.length === 1
      && calls[0].spec.url === ORIGIN + '/v1/rides?status=completed&limit=5',
      'list_rides targets the rides endpoint with filters');
    check(result.success === true
      && result.data.rides[0].id === 'ride-1'
      && result.data.rides[0].pickup === '501 W Main',
      'list_rides maps ride history data');
  }

  {
    const { ctx } = makeCtx({ '/v1/rides': { ok: true } });
    const result = await lyft['lyft.list_rides'].handle({}, ctx);
    check(result.success === false
      && result.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && result.reason === 'lyft-rides-missing',
      'list_rides rejects unexpected JSON shape');
  }

  {
    const request = makeCtx({});
    const requestOut = await lyft['lyft.request_ride'].handle({
      pickup: '501 W Main',
      dropoff: 'SDF',
      ride_type_id: 'lyft',
    }, request.ctx);
    const cancel = makeCtx({});
    const cancelOut = await lyft['lyft.cancel_ride'].handle({ ride_id: 'ride-1' }, cancel.ctx);
    check(request.calls.length === 0 && cancel.calls.length === 0
      && requestOut.success === false
      && requestOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && requestOut.errorCode === requestOut.code
      && requestOut.error === requestOut.code
      && requestOut.fellBackToDom === true
      && cancelOut.success === false
      && cancelOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && cancelOut.fellBackToDom === true,
      'Lyft request/cancel handlers are guarded fail-closed and call no executor');
  }

  const catalog = require(GENERATED_INDEX_PATH);
  const readiness = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs')).href);
  const report = readiness.reportReadiness(catalog);
  for (const slug of READ_SLUGS) {
    const row = report.rows.find((r) => r.slug === slug);
    check(row && row.readiness === 't1-ready' && row.proof === 'handler',
      slug + ' reports t1-ready with handler proof');
  }
  for (const slug of GUARDED_SLUGS) {
    const row = report.rows.find((r) => r.slug === slug);
    check(row && row.readiness === 't1-guarded-fail-closed' && row.proof === 'handler',
      slug + ' reports guarded fail-closed with handler proof');
  }

  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));
  const guardedSet = new Set((evidence.guardedWrites || []).map((record) => record.slug));
  check(GUARDED_SLUGS.every((slug) => guardedSet.has(slug)),
    'Lyft guarded writes are recorded in write activation evidence');

  console.log('\nlyft-t1-handler: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: lyft-t1-handler threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
