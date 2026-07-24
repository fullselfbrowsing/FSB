#!/usr/bin/env node
/**
 * Phase 49 -- write activation evidence gate.
 *
 * This tooling gate keeps write/destructive activation honest: every t1-ready write
 * must have an active evidence or legacy-exception record, and every guarded
 * fail-closed write must be explicitly listed as still guarded with required live-UAT
 * fields. It does not enable any runtime behavior.
 */

'use strict';

import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

import { reportReadiness } from './report-t1-readiness.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

export const EVIDENCE_PATH = join(ROOT, 'catalog', 'write-activation-evidence.json');
const CATALOG_PATH = join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

const REQUIRED_ACTIVE_FIELDS = [
  'slug',
  'status',
  'observedAt',
  'evidenceRef',
  'method',
  'pathShape',
  'bodyShape',
  'authShape',
  'verification',
  'redaction',
];
const REQUIRED_GUARDED_FIELDS = [
  'slug',
  'status',
  'failClosedReason',
  'templateRef',
  'requiredEvidence',
];

function normalizeSideEffectClass(value) {
  const c = String(value || '').toLowerCase();
  if (c === 'destructive' || c === 'delete') return 'destructive';
  if (c === 'mutate' || c === 'mutating' || c === 'write' || c === 'writes') return 'write';
  return 'read';
}

function isWriteLike(value) {
  const c = normalizeSideEffectClass(value);
  return c === 'write' || c === 'destructive';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function mapBySlug(records, label, failures) {
  const out = new Map();
  const list = Array.isArray(records) ? records : [];
  for (const record of list) {
    const slug = record && record.slug;
    if (!isNonEmptyString(slug)) {
      failures.push(label + ' record missing slug');
      continue;
    }
    if (out.has(slug)) {
      failures.push(label + ' duplicate record for ' + slug);
      continue;
    }
    out.set(slug, record);
  }
  return out;
}

function scanForSecretLiterals(evidence) {
  const text = JSON.stringify(evidence || {});
  const failures = [];
  const patterns = [
    { name: 'xox token literal', re: /\bxox[abcdprs]-[A-Za-z0-9-]{8,}/ },
    { name: 'bearer token literal', re: /\bBearer\s+[A-Za-z0-9._-]{12,}/i },
    { name: 'github token literal', re: /\bgh[pousr]_[A-Za-z0-9_]{12,}/ },
    { name: 'notion token literal', re: /\bsecret_[A-Za-z0-9]{12,}/ },
  ];
  for (const pattern of patterns) {
    if (pattern.re.test(text)) failures.push('evidence contains possible ' + pattern.name);
  }
  return failures;
}

function requireFields(record, fields, label, failures) {
  for (const field of fields) {
    if (field === 'requiredEvidence') {
      if (!Array.isArray(record[field]) || record[field].length === 0) {
        failures.push(label + ' missing requiredEvidence list');
      }
      continue;
    }
    if (!isNonEmptyString(record[field])) {
      failures.push(label + ' missing ' + field);
    }
  }
}

function validateRepositoryFileReferences(records, field, failures) {
  const seen = new Set();
  for (const record of records) {
    const reference = record && record[field];
    if (!isNonEmptyString(reference)) continue;
    const normalized = reference.trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (isAbsolute(normalized)) {
      failures.push(field + ' must be repository-relative: ' + normalized);
      continue;
    }

    const resolvedReference = resolve(ROOT, normalized);
    const repositoryRelative = relative(ROOT, resolvedReference);
    if (repositoryRelative === '..' ||
        repositoryRelative.startsWith('..' + sep) ||
        isAbsolute(repositoryRelative)) {
      failures.push(field + ' must stay inside the repository: ' + normalized);
      continue;
    }

    try {
      if (!statSync(resolvedReference).isFile()) {
        failures.push(field + ' must reference a regular file: ' + normalized);
      }
    } catch (_error) {
      failures.push(field + ' references a missing repository file: ' + normalized);
    }
  }
}

export function writeRowsFromReport(report) {
  const rows = report && Array.isArray(report.rows) ? report.rows : [];
  const activeWrites = [];
  const guardedWrites = [];
  for (const row of rows) {
    if (!row || !isWriteLike(row.sideEffectClass)) continue;
    if (row.readiness === 't1-ready') activeWrites.push(row);
    if (row.readiness === 't1-guarded-fail-closed') guardedWrites.push(row);
  }
  return { activeWrites, guardedWrites };
}

export function loadEvidence(filePath = EVIDENCE_PATH) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function validateWriteActivationEvidence(evidence, report) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { failures: ['evidence is not an object'], activeCount: 0, guardedCount: 0 };
  }
  if (evidence.schemaVersion !== 1) {
    failures.push('schemaVersion must be 1');
  }

  failures.push(...scanForSecretLiterals(evidence));

  const activeRecords = Array.isArray(evidence.activeWrites) ? evidence.activeWrites : [];
  const guardedRecords = Array.isArray(evidence.guardedWrites) ? evidence.guardedWrites : [];
  if (!Array.isArray(evidence.activeWrites)) failures.push('activeWrites must be an array');
  if (!Array.isArray(evidence.guardedWrites)) failures.push('guardedWrites must be an array');

  const activeBySlug = mapBySlug(activeRecords, 'activeWrites', failures);
  const guardedBySlug = mapBySlug(guardedRecords, 'guardedWrites', failures);
  validateRepositoryFileReferences(activeRecords, 'evidenceRef', failures);
  validateRepositoryFileReferences(guardedRecords, 'templateRef', failures);
  const rows = writeRowsFromReport(report);
  const activeRowSet = new Set(rows.activeWrites.map((row) => row.slug));
  const guardedRowSet = new Set(rows.guardedWrites.map((row) => row.slug));

  for (const row of rows.activeWrites) {
    const record = activeBySlug.get(row.slug);
    if (!record) {
      failures.push(row.slug + ' is t1-ready write/destructive but has no active evidence record');
      continue;
    }
    requireFields(record, REQUIRED_ACTIVE_FIELDS, row.slug, failures);
    if (record.status !== 'active' && record.status !== 'legacy-active') {
      failures.push(row.slug + ' active evidence status must be active or legacy-active');
    }
    if (record.status === 'active' && !/^\d{4}-\d{2}-\d{2}$/.test(record.observedAt || '')) {
      failures.push(row.slug + ' active evidence observedAt must be YYYY-MM-DD');
    }
    if (record.status === 'legacy-active' && !isNonEmptyString(record.legacyReason)) {
      failures.push(row.slug + ' legacy-active evidence requires legacyReason');
    }
  }

  for (const record of activeRecords) {
    if (isNonEmptyString(record && record.slug) && !activeRowSet.has(record.slug)) {
      failures.push(record.slug + ' has active evidence but is not currently a t1-ready write/destructive row');
    }
  }

  for (const row of rows.guardedWrites) {
    const record = guardedBySlug.get(row.slug);
    if (!record) {
      failures.push(row.slug + ' is guarded fail-closed but has no guarded evidence record');
      continue;
    }
    requireFields(record, REQUIRED_GUARDED_FIELDS, row.slug, failures);
    if (record.status !== 'guarded-fail-closed') {
      failures.push(row.slug + ' guarded evidence status must be guarded-fail-closed');
    }
    if (activeBySlug.has(row.slug)) {
      failures.push(row.slug + ' cannot be both active and guarded in evidence');
    }
  }

  for (const record of guardedRecords) {
    if (isNonEmptyString(record && record.slug) && !guardedRowSet.has(record.slug)) {
      failures.push(record.slug + ' has guarded evidence but is not currently a guarded fail-closed row');
    }
  }

  return {
    failures,
    activeCount: rows.activeWrites.length,
    guardedCount: rows.guardedWrites.length,
  };
}

function runCli() {
  const catalog = require(CATALOG_PATH);
  const report = reportReadiness(catalog);
  const evidence = loadEvidence();
  const result = validateWriteActivationEvidence(evidence, report);
  if (result.failures.length) {
    console.error('verify-write-activation-evidence: FAIL (' + result.failures.length + ' failure' +
      (result.failures.length === 1 ? '' : 's') + ')');
    for (const failure of result.failures) console.error('  - ' + failure);
    process.exit(1);
  }
  console.log('verify-write-activation-evidence: PASS (' + result.activeCount +
    ' active write record(s); ' + result.guardedCount +
    ' guarded fail-closed record(s); 0 unrecorded write activations)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli();
  } catch (err) {
    console.error('verify-write-activation-evidence: ERROR ' +
      (err && err.message ? err.message : String(err)));
    process.exit(1);
  }
}
