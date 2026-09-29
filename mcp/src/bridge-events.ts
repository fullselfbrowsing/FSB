/**
 * Every `[FSB Bridge]` line goes to console.error, which is the stderr of
 * whichever server won the race for the bridge port -- often a session that has
 * since died, leaving its output pointed at a socket nobody can read. A lockout
 * that lasts a day therefore leaves nothing on disk to look at afterwards, and
 * the failure has to be reconstructed from whichever MCP host happened to
 * capture its child's stderr.
 *
 * This is the bridge's own journal: a closed roster of transport events, each
 * carrying only identifiers that are already visible elsewhere -- an extension
 * id from the browser's extensions page, a close code, an instance id.
 * Credentials, headers, and message payloads never reach it.
 *
 * Coalesced on purpose. The events worth recording are exactly the ones that
 * fire in hot retry loops, so an uncoalesced journal would reproduce the
 * pathology it exists to explain.
 */

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const LOG_FILENAME = 'bridge-events.jsonl';
const ROTATED_FILENAME = 'bridge-events.1.jsonl';
const MAX_LOG_BYTES = 1024 * 1024;
const COALESCE_WINDOW_MS = 60_000;
const MAX_COALESCE_KEYS = 32;
const INSTANCE_PATTERN = /^[0-9a-f]{4,32}$/;
const ORIGIN_PATTERN = /^chrome-extension:\/\/[A-Za-z0-9._-]{1,64}$/;
const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const EVENTS = Object.freeze([
  'upgrade_rejected_host',
  'upgrade_rejected_origin_pin',
  'upgrade_accepted_unauthorized',
  'ext_authority_revoked',
  'extension_slot_refused',
  'extension_replaced',
  'extension_reaped',
  'extension_closed',
  'hub_server_error',
  'hub_listener_lost',
] as const);

export type BridgeLogEvent = typeof EVENTS[number];

export interface BridgeLogRecord {
  readonly event: BridgeLogEvent;
  readonly instanceId?: string;
  readonly origin?: string | null;
  readonly pinnedOrigin?: string | null;
  readonly closeCode?: number;
  readonly reason?: string;
}

const coalesced = new Map<string, { at: number; suppressed: number }>();

export function getBridgeLogPath(homeDir = homedir()): string {
  return join(homeDir, '.fsb', 'agent-runtime', LOG_FILENAME);
}

function boundedOrigin(value: unknown): string | null {
  return typeof value === 'string' && ORIGIN_PATTERN.test(value) ? value : null;
}

/** Drop anything that is not an own scalar from the roster above. */
function projectRecord(record: BridgeLogRecord): Record<string, unknown> | null {
  if (!EVENTS.includes(record.event)) return null;
  const projected: Record<string, unknown> = { event: record.event };
  if (
    typeof record.instanceId === 'string'
    && INSTANCE_PATTERN.test(record.instanceId)
  ) projected.instanceId = record.instanceId;
  const origin = boundedOrigin(record.origin);
  if (origin) projected.origin = origin;
  const pinnedOrigin = boundedOrigin(record.pinnedOrigin);
  if (pinnedOrigin) projected.pinnedOrigin = pinnedOrigin;
  if (
    typeof record.closeCode === 'number'
    && Number.isSafeInteger(record.closeCode)
    && record.closeCode >= 1000
    && record.closeCode <= 4999
  ) projected.closeCode = record.closeCode;
  if (
    typeof record.reason === 'string'
    && CODE_PATTERN.test(record.reason)
  ) projected.reason = record.reason;
  return projected;
}

/**
 * Synchronous and never throws -- a diagnostics file must not be able to fail a
 * bridge operation.
 *
 * Returns true when a line was actually written and false when it was coalesced
 * away, so callers can gate their own console output on the same decision and a
 * retry loop cannot flood stderr either.
 */
export function logBridgeEvent(
  record: BridgeLogRecord,
  options: Readonly<{ rootPath?: string; now?: () => number }> = {},
): boolean {
  try {
    const projected = projectRecord(record);
    if (!projected) return false;

    const stamp = options.now ? options.now() : Date.now();
    const key = `${projected.event as string}|${(projected.origin as string) ?? ''}`;
    const previous = coalesced.get(key);
    if (previous && stamp - previous.at < COALESCE_WINDOW_MS) {
      previous.suppressed += 1;
      return false;
    }
    if (previous && previous.suppressed > 0) projected.suppressed = previous.suppressed;
    if (!previous && coalesced.size >= MAX_COALESCE_KEYS) coalesced.clear();
    coalesced.set(key, { at: stamp, suppressed: 0 });

    const requested = options.rootPath ?? join(homedir(), '.fsb', 'agent-runtime');
    if (!isAbsolute(requested) || requested.includes('\0')) return false;
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
    const line = `${JSON.stringify({
      ts: new Date(Number.isSafeInteger(stamp) ? stamp : 0).toISOString(),
      ...projected,
    })}\n`;
    appendFileSync(logPath, line, { encoding: 'utf8', mode: FILE_MODE });
    return true;
  } catch {
    // Diagnostics are best-effort and never affect bridge behaviour.
    return false;
  }
}

/** Test seam: the coalescer is module state and outlives a single case. */
export function _resetBridgeEventCoalescing(): void {
  coalesced.clear();
}

export const BRIDGE_LOG_FILENAME = LOG_FILENAME;
export const BRIDGE_LOG_MAX_BYTES = MAX_LOG_BYTES;
export const BRIDGE_LOG_COALESCE_WINDOW_MS = COALESCE_WINDOW_MS;
