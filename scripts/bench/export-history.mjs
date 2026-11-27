#!/usr/bin/env node
/**
 * Phase 66 / Plan 01 (v1.0.0 Jev Fast Mode) -- sanitized metrics from the MCP
 * sessions recorded 2026-09-16..21 (MEAS-03, D-20, D-21).
 *
 * Input is the raw file that scripts/bench/history-export-snippet.js downloads
 * from the Web Store control panel (schema "fsb-history-export", v1). That
 * file can hold page content, typed values and URLs from real sites, so it
 * stays in the gitignored scripts/bench/.local/ tree and is never committed.
 *
 * Output is built from an allowlist only: session ordinals, client labels and
 * tool names that pass fixed patterns, counts, deltas, a date-only start day
 * and an outcome enum. assertNoLeak() stops the CLI before writing if any
 * session id, task text, request/result string or URL from the raw file would
 * appear in the metrics.
 *
 * Method (D-04 caveat): a delta is the gap between the journal timestamps of
 * two consecutive tool.call events. It includes the calling agent's own gap
 * and the IndexedDB write queue, so it is not FSB execution time. Timing
 * values are rounded to 0.1 ms. Start days use the time zone the exporting
 * browser reported (UTC when the export names none).
 *
 * Run: node scripts/bench/export-history.mjs --input <raw.json> --out <metrics.json>
 */

'use strict';

import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const HISTORY_METRICS_METHOD = 'journal event timestamp deltas between consecutive tool.call events; include caller gap and IndexedDB write-queue delay; not FSB execution time';

const EXPORT_SCHEMA = 'fsb-history-export';
const EXPORT_SCHEMA_VERSION = 1;
const WEB_STORE_EXTENSION_ID = 'badgafnfchcihdfnjneklogedcdkmjfk';

const OUTCOME_VALUES = Object.freeze(['completed', 'partial', 'failed', 'stopped', 'running']);
const STORAGE_JOURNAL = 'journal';
const STORAGE_LEGACY = 'legacy';
const OTHER = 'other';
const UNKNOWN_CLIENT = 'unknown';

const TOOL_NAME_PATTERN = /^[a-z0-9_:.-]{1,64}$/i;
const CLIENT_LABEL_PATTERN = /^[A-Za-z0-9 ._-]{1,40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const VERSION_PATTERN = /^\d{1,9}(?:\.\d{1,9}){0,3}$/;
const URL_PATTERN = /https?:\/\/\S+/g;
const URL_TRAILING_PUNCTUATION = /[)\]}>.,;:!?'"]+$/;
const JSON_STRING_LITERAL = /"((?:[^"\\]|\\.)*)"(\s*:)?/g;
const MIN_PAYLOAD_CHARS = 8;
const MAX_DATE_MS = 8.64e15;

// Every key the derivation can emit. Fixed schema text cannot carry raw data.
const SCHEMA_KEYS = Object.freeze([
  'byClient', 'callCount', 'calls', 'client', 'deltaMs', 'exportedAt',
  'extensionIsWebStore', 'extensionVersion', 'from', 'median', 'method', 'n',
  'ordinal', 'outcome', 'p90', 'sessionCount', 'sessionSpanMs', 'sessions',
  'source', 'spanMs', 'startDate', 'storage', 'to', 'toolCounts', 'v', 'window',
]);

// Free-text session fields that may quote page content (checked at 8+ chars).
const SESSION_TEXT_FIELDS = Object.freeze([
  'result', 'completionMessage', 'error', 'blocker', 'nextStep', 'outcomeDetails',
]);

// ---- small helpers ---------------------------------------------------------

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value) {
  return isRecord(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function defineEntry(target, key, value) {
  // defineProperty keeps a key such as "__proto__" an ordinary own property.
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) defineEntry(out, key, sortKeysDeep(value[key]));
  return out;
}

function mapToObject(map) {
  const out = {};
  for (const [key, value] of map) defineEntry(out, key, value);
  return out;
}

// Depth-first visit of every (key, value) pair; iterative so deep payloads
// cannot overflow the stack.
function visitAll(root, visit) {
  const stack = [[undefined, root]];
  const seen = new Set();
  while (stack.length) {
    const [key, value] = stack.pop();
    visit(key, value);
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i -= 1) stack.push([i, value[i]]);
    } else {
      const keys = Object.keys(value);
      for (let i = keys.length - 1; i >= 0; i -= 1) stack.push([keys[i], value[keys[i]]]);
    }
  }
}

function walkStrings(root, collect) {
  visitAll(root, (_key, value) => {
    if (typeof value === 'string') collect(value);
  });
}

// ---- statistics (linear interpolation, local to this file) -----------------
// The shared stats library ships in a parallel plan, so these stay local.

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (!n) return null;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(Math.ceil(h), sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

function roundMs(value) {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

// Fewer than one delta means nothing was measured: null, never 0.
function timingSummary(deltas) {
  if (!deltas.length) return { median: null, n: 0, p90: null };
  return { median: roundMs(median(deltas)), n: deltas.length, p90: roundMs(quantile(deltas, 0.9)) };
}

// ---- allowlisted labels ----------------------------------------------------

function toolLabel(value) {
  return typeof value === 'string' && TOOL_NAME_PATTERN.test(value) ? value : OTHER;
}

function clientLabel(value) {
  if (typeof value !== 'string' || value.trim() === '') return UNKNOWN_CLIENT;
  return CLIENT_LABEL_PATTERN.test(value) ? value : OTHER;
}

function outcomeLabel(value) {
  if (value === null || value === undefined) return null;
  return OUTCOME_VALUES.includes(value) ? value : OTHER;
}

function isoInstantOrNull(value) {
  return typeof value === 'string' && ISO_INSTANT_PATTERN.test(value) && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function versionOrNull(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value) ? value : null;
}

function dateOrNull(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value) ? value : null;
}

function windowOrNull(value) {
  return isRecord(value) ? { from: dateOrNull(value.from), to: dateOrNull(value.to) } : null;
}

function dateFormatterFor(timeZone) {
  if (typeof timeZone !== 'string' || timeZone === '' || timeZone.length > 64) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return null;
  }
}

// YYYY-MM-DD in the export's time zone; UTC when it named none.
function calendarDate(ms, formatter) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return null;
  let date = null;
  if (formatter) {
    try {
      const parts = {};
      for (const part of formatter.formatToParts(ms)) parts[part.type] = part.value;
      date = parts.year + '-' + parts.month + '-' + parts.day;
    } catch {
      date = null;
    }
  }
  if (!date || !DATE_PATTERN.test(date)) date = new Date(ms).toISOString().slice(0, 10);
  return DATE_PATTERN.test(date) ? date : null;
}

// ---- per-session call timing -----------------------------------------------

function eventTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  return typeof value === 'string' ? Date.parse(value) : NaN;
}

function sequenceOf(event) {
  return typeof event.sequence === 'number' && Number.isFinite(event.sequence) ? event.sequence : Infinity;
}

// Journal: tool.call events in sequence order, timed by their ISO timestamps.
function journalCalls(events) {
  return asArray(events)
    .map((event, position) => ({ event, position }))
    .filter(({ event }) => isRecord(event) && event.kind === 'tool.call')
    .sort((a, b) => {
      const sa = sequenceOf(a.event);
      const sb = sequenceOf(b.event);
      if (sa !== sb) return sa < sb ? -1 : 1;
      return a.position - b.position;
    })
    .map(({ event }) => {
      const metadata = asRecord(event.metadata);
      return { at: eventTime(event.timestamp), client: metadata.client, tool: metadata.tool };
    });
}

// Legacy: actionHistory rows in recorded order, timed by their numeric stamps.
function legacyCalls(session) {
  return asArray(asRecord(session).actionHistory)
    .filter(isRecord)
    .map((row) => ({
      at: typeof row.timestamp === 'number' && Number.isFinite(row.timestamp) ? row.timestamp : NaN,
      client: undefined,
      tool: row.tool,
    }));
}

// Only adjacent calls that both carry a valid time yield a delta.
function consecutiveDeltas(calls) {
  const deltas = [];
  for (let i = 1; i < calls.length; i += 1) {
    const previous = calls[i - 1].at;
    const current = calls[i].at;
    if (Number.isFinite(previous) && Number.isFinite(current)) deltas.push(current - previous);
  }
  return deltas;
}

function callSpan(calls) {
  const times = calls.map((call) => call.at).filter(Number.isFinite);
  return times.length >= 2 ? times[times.length - 1] - times[0] : null;
}

function countTools(calls) {
  const counts = new Map();
  for (const call of calls) {
    const name = toolLabel(call.tool);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return mapToObject(counts);
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

function summarizeSession(entry, position, formatter) {
  const record = asRecord(entry);
  const indexEntry = asRecord(record.indexEntry);
  const session = asRecord(record.session);
  const legacy = record.legacy === true;
  const calls = legacy ? legacyCalls(session) : journalCalls(record.events);
  const startTime = firstFiniteNumber(session.startTime, indexEntry.startTime);
  return {
    position,
    startTime,
    client: clientLabel(firstNonEmptyString(
      session.mcpClient,
      indexEntry.mcpClient,
      ...calls.map((call) => call.client),
    )),
    storage: legacy ? STORAGE_LEGACY : STORAGE_JOURNAL,
    startDate: calendarDate(startTime, formatter),
    callCount: calls.length,
    toolCounts: countTools(calls),
    deltas: consecutiveDeltas(calls),
    spanMs: roundMs(callSpan(calls)),
    outcome: outcomeLabel(hasOwn(session, 'outcome') ? session.outcome : indexEntry.outcome),
  };
}

function assertExportShape(exportJson) {
  if (!isRecord(exportJson) || exportJson.schema !== EXPORT_SCHEMA) {
    throw new Error('history export: expected schema "' + EXPORT_SCHEMA + '"');
  }
  if (exportJson.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    throw new Error('history export: unsupported schemaVersion (expected ' + EXPORT_SCHEMA_VERSION + ')');
  }
  if (!Array.isArray(exportJson.sessions)) {
    throw new Error('history export: sessions must be an array');
  }
}

/**
 * Turn a raw fsb-history-export v1 object into sanitized, deterministic
 * per-session and per-client call-timing metrics.
 */
export function deriveHistoryMetrics(exportJson) {
  assertExportShape(exportJson);
  const formatter = dateFormatterFor(exportJson.timeZone);
  const rows = exportJson.sessions.map((entry, position) => summarizeSession(entry, position, formatter));
  rows.sort((a, b) => {
    const ta = a.startTime === null ? Infinity : a.startTime;
    const tb = b.startTime === null ? Infinity : b.startTime;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.position - b.position;
  });

  const groups = new Map();
  for (const row of rows) {
    let group = groups.get(row.client);
    if (!group) {
      group = { sessions: 0, calls: 0, deltas: [], spans: [] };
      groups.set(row.client, group);
    }
    group.sessions += 1;
    group.calls += row.callCount;
    for (const delta of row.deltas) group.deltas.push(delta);
    if (row.spanMs !== null) group.spans.push(row.spanMs);
  }
  const byClient = new Map();
  for (const [label, group] of groups) {
    byClient.set(label, {
      calls: group.calls,
      deltaMs: timingSummary(group.deltas),
      sessionSpanMs: { median: roundMs(median(group.spans)) },
      sessions: group.sessions,
    });
  }

  return sortKeysDeep({
    v: 1,
    method: HISTORY_METRICS_METHOD,
    source: {
      exportedAt: isoInstantOrNull(exportJson.exportedAt),
      extensionVersion: versionOrNull(exportJson.version),
      extensionIsWebStore: exportJson.extensionId === WEB_STORE_EXTENSION_ID,
      window: windowOrNull(exportJson.window),
    },
    sessionCount: rows.length,
    callCount: rows.reduce((sum, row) => sum + row.callCount, 0),
    byClient: mapToObject(byClient),
    sessions: rows.map((row, index) => ({
      ordinal: index + 1,
      client: row.client,
      storage: row.storage,
      startDate: row.startDate,
      callCount: row.callCount,
      toolCounts: row.toolCounts,
      deltaMs: timingSummary(row.deltas),
      spanMs: row.spanMs,
      outcome: row.outcome,
    })),
  });
}

// ---- leak check ------------------------------------------------------------

function collectDescriptorStrings(descriptor, collect) {
  if (!isRecord(descriptor)) return;
  if (hasOwn(descriptor, 'inline')) walkStrings(descriptor.inline, collect);
  if (typeof descriptor.preview !== 'string') return;
  collect(descriptor.preview);
  let parsed;
  try {
    parsed = JSON.parse(descriptor.preview);
  } catch {
    // Previews are cut at 2048 bytes, so most are not valid JSON; take every
    // complete string literal that is a value rather than an object key.
    for (const match of descriptor.preview.matchAll(JSON_STRING_LITERAL)) {
      if (match[2]) continue;
      let text;
      try {
        text = JSON.parse('"' + match[1] + '"');
      } catch {
        text = match[1];
      }
      collect(text);
    }
    return;
  }
  walkStrings(parsed, collect);
}

// Raw values that must never reach the metrics, in reporting priority order.
function collectForbidden(rawExport) {
  const forbidden = new Map();
  const add = (value, kind, minLength = 1) => {
    if (typeof value !== 'string' || value.trim() === '' || value.length < minLength) return;
    if (!forbidden.has(value)) forbidden.set(value, kind);
  };
  const raw = asRecord(rawExport);
  const sessions = asArray(raw.sessions).filter(isRecord);
  const records = asArray(raw.index).filter(isRecord);
  for (const entry of sessions) {
    if (isRecord(entry.indexEntry)) records.push(entry.indexEntry);
    if (isRecord(entry.session)) records.push(entry.session);
  }

  for (const record of records) {
    add(record.id, 'session id');
    add(record.taskRunId, 'session id');
    add(record.sessionId, 'session id');
  }
  for (const entry of sessions) {
    for (const event of asArray(entry.events)) add(asRecord(event).runId, 'session id');
  }

  visitAll(raw, (key, value) => {
    if (key === 'task' || key === 'lastTask') add(value, 'task');
  });

  visitAll(raw, (key, value) => {
    for (const text of [key, value]) {
      if (typeof text !== 'string') continue;
      for (const match of text.matchAll(URL_PATTERN)) {
        add(match[0], 'url');
        add(match[0].replace(URL_TRAILING_PUNCTUATION, ''), 'url');
      }
    }
  });

  const addPayload = (text) => add(text, 'payload', MIN_PAYLOAD_CHARS);
  for (const entry of sessions) {
    for (const event of asArray(entry.events)) {
      const metadata = asRecord(asRecord(event).metadata);
      collectDescriptorStrings(metadata.request, addPayload);
      collectDescriptorStrings(metadata.result, addPayload);
    }
    for (const row of asArray(asRecord(entry.session).actionHistory)) {
      if (!isRecord(row)) continue;
      walkStrings(row.params, addPayload);
      walkStrings(row.result, addPayload);
    }
  }

  for (const record of records) {
    for (const field of SESSION_TEXT_FIELDS) {
      walkStrings(record[field], (text) => add(text, 'session text', MIN_PAYLOAD_CHARS));
    }
  }
  return forbidden;
}

// Values the derivation legitimately emits (W13), each validated against the
// raw export independently of the derivation: fixed schema text and enums,
// plus tool names, client labels, dates and versions that pass their patterns.
function collectLegitimate(rawExport) {
  const legitimate = new Set([
    ...SCHEMA_KEYS,
    ...OUTCOME_VALUES,
    HISTORY_METRICS_METHOD,
    STORAGE_JOURNAL,
    STORAGE_LEGACY,
    OTHER,
    UNKNOWN_CLIENT,
  ]);
  const addIf = (value, pattern) => {
    if (typeof value === 'string' && pattern.test(value)) legitimate.add(value);
  };
  const raw = asRecord(rawExport);
  const formatter = dateFormatterFor(raw.timeZone);
  addIf(raw.exportedAt, ISO_INSTANT_PATTERN);
  addIf(raw.version, VERSION_PATTERN);
  addIf(asRecord(raw.window).from, DATE_PATTERN);
  addIf(asRecord(raw.window).to, DATE_PATTERN);
  for (const indexEntry of asArray(raw.index)) addIf(asRecord(indexEntry).mcpClient, CLIENT_LABEL_PATTERN);
  for (const entry of asArray(raw.sessions)) {
    const record = asRecord(entry);
    for (const holder of [asRecord(record.indexEntry), asRecord(record.session)]) {
      addIf(holder.mcpClient, CLIENT_LABEL_PATTERN);
      const day = calendarDate(holder.startTime, formatter);
      if (day) legitimate.add(day);
    }
    for (const event of asArray(record.events)) {
      if (!isRecord(event) || event.kind !== 'tool.call') continue;
      const metadata = asRecord(event.metadata);
      addIf(metadata.tool, TOOL_NAME_PATTERN);
      addIf(metadata.client, CLIENT_LABEL_PATTERN);
    }
    for (const row of asArray(asRecord(record.session).actionHistory)) {
      addIf(asRecord(row).tool, TOOL_NAME_PATTERN);
    }
  }
  return legitimate;
}

/**
 * Throw Error('history metrics leak: <kind>') when the metrics contain a
 * session id, task text, a URL, a request/result string of 8+ characters, or
 * a free-text session field from the raw export. Every key and string value
 * of the metrics is searched, except values the derivation legitimately emits
 * (W13); those are also removed from the forbidden set. Any "://" fails.
 */
export function assertNoLeak(rawExport, metrics) {
  if (!isRecord(metrics)) throw new Error('history metrics leak check: metrics must be an object');
  const forbidden = collectForbidden(rawExport);
  const legitimate = collectLegitimate(rawExport);
  for (const value of legitimate) forbidden.delete(value);

  const tokens = [];
  visitAll(metrics, (key, value) => {
    if (typeof key === 'string') tokens.push(key);
    if (typeof value === 'string') tokens.push(value);
  });
  for (const token of tokens) {
    if (legitimate.has(token)) continue;
    for (const [value, kind] of forbidden) {
      if (value.length <= token.length && token.includes(value)) {
        throw new Error('history metrics leak: ' + kind);
      }
    }
  }
  if (JSON.stringify(metrics).includes('://')) throw new Error('history metrics leak: url');
  return true;
}

// ---- CLI -------------------------------------------------------------------

const USAGE = 'usage: node scripts/bench/export-history.mjs --input <raw.json> --out <metrics.json>';

function parseArgs(argv) {
  const args = { input: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '--out') {
      const value = argv[i + 1];
      if (typeof value !== 'string' || value === '' || value.startsWith('--')) throw new Error(USAGE);
      args[arg.slice(2)] = value;
      i += 1;
    } else if (arg.startsWith('--input=')) {
      args.input = arg.slice('--input='.length);
    } else if (arg.startsWith('--out=')) {
      args.out = arg.slice('--out='.length);
    } else {
      throw new Error(USAGE);
    }
  }
  if (!args.input || !args.out) throw new Error(USAGE);
  return args;
}

function readExport(inputPath) {
  let text;
  try {
    text = readFileSync(inputPath, 'utf8');
  } catch (err) {
    throw new Error('cannot read input (' + (err && err.code ? err.code : 'read failed') + ')');
  }
  try {
    return JSON.parse(text);
  } catch {
    // Never echo the parser message: it can quote raw page content.
    throw new Error('input is not valid JSON');
  }
}

function writeMetrics(metrics, outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, JSON.stringify(metrics, null, 2) + '\n');
}

function runCli(argv) {
  const args = parseArgs(argv);
  const raw = readExport(args.input);
  const metrics = deriveHistoryMetrics(raw);
  assertNoLeak(raw, metrics);
  writeMetrics(metrics, args.out);
  console.log('history metrics: ' + metrics.sessionCount + ' sessions, ' + metrics.callCount + ' calls -> ' + args.out);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    runCli(process.argv.slice(2));
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error('export-history: ERROR ' + message.replace(/\s+/g, ' ').trim());
    process.exit(1);
  }
}
