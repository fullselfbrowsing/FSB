/**
 * The delegation daemon is spawned with `stdio: 'ignore'`, so anything it
 * writes to the console is discarded. Without a file of its own, a run that
 * fails inside the supervisor -- or a degraded latch that terminates the whole
 * daemon -- leaves nothing behind but the absence of a journal entry, and the
 * only surviving reason has to be inferred from file mtimes.
 *
 * This is a deliberately narrow record: a closed roster of events, each with a
 * fixed set of identifier and code fields drawn from enums the supervisor
 * already owns. Task text, environment values, binary paths, and error text
 * never reach it, so the file carries no more than the extension's own
 * failure card already shows.
 */

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const LOG_FILENAME = 'delegation-events.jsonl';
const ROTATED_FILENAME = 'delegation-events.1.jsonl';
const MAX_LOG_BYTES = 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const PROFILE_VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,64}$/;
const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const ADAPTER_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

const EVENTS = Object.freeze([
  'run_started',
  'run_settled',
  'degraded',
  'daemon_shutdown',
] as const);

export type DelegationLogEvent = typeof EVENTS[number];

export interface DelegationLogRecord {
  readonly event: DelegationLogEvent;
  readonly delegationId?: string;
  readonly adapterId?: string;
  readonly profileVersion?: string | null;
  readonly status?: string;
  readonly code?: string;
  readonly maskedCode?: string;
  readonly reason?: string;
  readonly exitCode?: 0 | 1;
  readonly degraded?: boolean;
}

export function getDelegationLogPath(homeDir = homedir()): string {
  return join(homeDir, '.fsb', 'agent-runtime', LOG_FILENAME);
}

function boundedId(value: unknown): string | null {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
}

function boundedCode(value: unknown): string | null {
  return typeof value === 'string' && CODE_PATTERN.test(value) ? value : null;
}

/** Drop anything that is not an own scalar from the roster above. */
function projectRecord(record: DelegationLogRecord): Record<string, unknown> | null {
  if (!EVENTS.includes(record.event)) return null;
  const projected: Record<string, unknown> = { event: record.event };
  const delegationId = boundedId(record.delegationId);
  if (delegationId) projected.delegationId = delegationId;
  if (
    typeof record.adapterId === 'string'
    && ADAPTER_PATTERN.test(record.adapterId)
  ) projected.adapterId = record.adapterId;
  if (
    typeof record.profileVersion === 'string'
    && PROFILE_VERSION_PATTERN.test(record.profileVersion)
  ) projected.profileVersion = record.profileVersion;
  const status = boundedCode(record.status);
  if (status) projected.status = status;
  const code = boundedCode(record.code);
  if (code) projected.code = code;
  const maskedCode = boundedCode(record.maskedCode);
  if (maskedCode) projected.maskedCode = maskedCode;
  const reason = boundedCode(record.reason);
  if (reason) projected.reason = reason;
  if (record.exitCode === 0 || record.exitCode === 1) projected.exitCode = record.exitCode;
  if (typeof record.degraded === 'boolean') projected.degraded = record.degraded;
  return projected;
}

/**
 * Synchronous on purpose: the degraded latch calls process.exit(), which
 * discards pending async writes, and that is exactly the event worth keeping.
 * Never throws -- a diagnostics file must not be able to fail a run.
 */
export function logDelegationEvent(
  record: DelegationLogRecord,
  options: Readonly<{ rootPath?: string; now?: () => number }> = {},
): void {
  try {
    const projected = projectRecord(record);
    if (!projected) return;
    const requested = options.rootPath ?? join(homedir(), '.fsb', 'agent-runtime');
    if (!isAbsolute(requested) || requested.includes('\0')) return;
    const root = resolve(requested);
    const logPath = join(root, LOG_FILENAME);
    mkdirSync(root, { recursive: true, mode: DIRECTORY_MODE });
    try {
      if (statSync(logPath).size > MAX_LOG_BYTES) {
        renameSync(logPath, join(root, ROTATED_FILENAME));
      }
    } catch {
      // No log yet, or it cannot be rotated; appending below is still correct.
    }
    const stamp = options.now ? options.now() : Date.now();
    const line = `${JSON.stringify({
      ts: new Date(Number.isSafeInteger(stamp) ? stamp : 0).toISOString(),
      ...projected,
    })}\n`;
    appendFileSync(logPath, line, { encoding: 'utf8', mode: FILE_MODE });
  } catch {
    // Diagnostics are best-effort and never affect delegation outcomes.
  }
}

export const DELEGATION_LOG_FILENAME = LOG_FILENAME;
export const DELEGATION_LOG_MAX_BYTES = MAX_LOG_BYTES;
