#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function loadModule(relPath) {
  return import(pathToFileURL(path.join(__dirname, '..', relPath)).href);
}

(async function run() {
  const readinessMod = await loadModule('scripts/report-t1-readiness.mjs');
  const worklistMod = await loadModule('scripts/report-t1-tail-worklist.mjs');

  const readiness = readinessMod.reportReadiness();
  const worklist = worklistMod.buildTailWorklist(readiness);
  const validation = worklistMod.validateTailWorklist(worklist, readiness);

  assert.deepEqual(validation.failures, []);

  const expectedTail = readiness.totals.learnPending +
    readiness.totals.discoveryPending +
    readiness.totals.blocked;
  assert.equal(worklist.rows.length, expectedTail);
  assert.equal(worklist.totals.tail, expectedTail);
  assert.equal(worklist.totals.blocked, readiness.totals.blocked);
  assert.equal(worklist.totals.actionable, expectedTail - readiness.totals.blocked);

  for (const row of worklist.rows) {
    assert.notEqual(row.readiness, 't1-ready', row.slug);
    assert.notEqual(row.readiness, 't1-guarded-fail-closed', row.slug);
    assert.ok(row.workstream, row.slug);
    assert.ok(row.requiredProof, row.slug);
    assert.ok(row.terminalTarget, row.slug);
  }

  const blocked = worklist.rows.filter((row) => row.readiness === 'blocked');
  assert.ok(blocked.length > 0, 'expected blocked policy rows to stay represented');
  assert.ok(blocked.every((row) => row.workstream === 'blocked-policy'));

  const netflixRows = worklist.rows.filter((row) => row.app === 'netflix');
  assert.equal(netflixRows.length, 18, 'Netflix blocked-policy coverage should account for all descriptors');
  assert.ok(netflixRows.every((row) =>
    row.readiness === 'blocked' &&
    row.originClass === 'denied' &&
    row.routeFeasibility === 'blocked' &&
    row.nextAction === 'keep blocked' &&
    row.workstream === 'blocked-policy' &&
    row.terminalTarget === 'blocked'
  ), 'Netflix rows stay non-actionable blocked-policy terminal rows');

  const actionable = worklist.rows.filter((row) => row.workstream !== 'blocked-policy');
  assert.ok(actionable.length > 0, 'expected actionable non-denied tail rows');
  assert.ok(actionable.every((row) => row.terminalTarget !== 'blocked'));

  console.log('t1-tail-worklist.test: PASS (' + worklist.rows.length + ' tail rows)');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
