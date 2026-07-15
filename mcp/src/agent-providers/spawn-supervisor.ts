import { randomBytes, randomUUID } from 'node:crypto';
import {
  execFile as nodeExecFile,
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import type {
  AdapterDetection,
  AgentEvent,
  AgentProviderAdapter,
  ChildExit,
  SupervisedChild,
} from './adapter.js';
import { CLAUDE_CODE_ADAPTER_ID } from './adapter.js';
import type { AgentProviderRegistry } from './registry.js';
import { createProductionAdapterRegistry } from './registry.js';
import type {
  ActiveJournalEntry,
  AgentStartupRecovery,
  AgentStartupRecoveryResult,
  AgentRestartLossDisposition,
  JournalEntry,
  PreparedJournalEntry,
} from './runtime-files.js';
import type { AgentRuntimeFiles } from './runtime-files.js';
import { createAgentRuntimeFiles, createAgentStartupRecovery } from './runtime-files.js';
import type {
  ProcessInspection,
  ProcessInspector,
  ProcessTreeTerminator,
} from './process-tree.js';
import { createArgvSignature, TreeUnsettledError } from './process-tree.js';
import { createProcessInspector, createProcessTreeTerminator } from './process-tree.js';
import type {
  ExtEvent,
  ExtRequest,
  ExtRequestContext,
  ExtRequestHandler,
} from '../types.js';

const TASK_LIMIT_BYTES = 64 * 1024;
const EVENT_LIMIT_BYTES = 256 * 1024;
const STDERR_LIMIT_BYTES = 64 * 1024;
const PRE_AUTH_EVENT_LIMIT_BYTES = 2 * 1024 * 1024;
const PRE_AUTH_EVENT_LIMIT_COUNT = 1024;
const COMPLETED_RUN_LIMIT = 256;
const ACTIVE_STATUS_LIMIT = 64;
const RECOVERY_STATUS_LIMIT = 128;
const DEFAULT_ACTIVATION_ATTEMPTS = 80;
const DEFAULT_ACTIVATION_POLL_MS = 25;
const HOLD_EXPIRY_MS = 5 * 60 * 1000;
const PROCESS_TRANSITION_GRACE_MS = 500;
const PROCESS_TRANSITION_POLL_MS = 25;
const PROCESS_STATUS_LIMIT_BYTES = 2 * 1024 * 1024;

const DELEGATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const PROVIDER_KEY_NAMES = Object.freeze([
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
] as const);

const START_REQUEST_KEYS = Object.freeze(['id', 'method', 'payload', 'type']);
const START_PAYLOAD_KEYS = Object.freeze(['adapterId', 'task']);
const CANCEL_PAYLOAD_KEYS = Object.freeze(['delegationId']);
const STATUS_PAYLOAD_KEYS = Object.freeze([]);

const DelegateStartSchema = z.object({
  adapterId: z.literal(CLAUDE_CODE_ADAPTER_ID),
  task: z.string().min(1),
}).strict();

const DelegateCancelSchema = z.object({
  delegationId: z.string().regex(DELEGATION_ID_PATTERN),
}).strict();

const DelegateLifecycleSchema = z.object({
  delegationId: z.string().regex(DELEGATION_ID_PATTERN),
}).strict();

const AGENT_EVENT_TYPES = new Set([
  'init',
  'assistant',
  'assistant_delta',
  'user',
  'tool_use',
  'tool_result',
  'retry',
  'result',
  'diagnostic',
]);

export type DelegationRunState =
  | 'created'
  | 'spawning'
  | 'running'
  | 'holding'
  | 'held'
  | 'resuming'
  | 'stopping'
  | 'settled';

export const DELEGATION_HOLD_EXPIRY_MS = HOLD_EXPIRY_MS;
export const DELEGATION_PROCESS_TRANSITION_GRACE_MS = PROCESS_TRANSITION_GRACE_MS;
export const DELEGATION_PROCESS_TRANSITION_POLL_MS = PROCESS_TRANSITION_POLL_MS;

export type DelegationTerminalStatus = 'succeeded' | 'failed' | 'cancelled';

export type DelegationRestartLoss = AgentRestartLossDisposition;

export interface DelegationStatus {
  readonly [key: string]: unknown;
  readonly generation: string;
  readonly active: readonly Readonly<{
    delegationId: string;
    state: 'running' | 'held' | 'stopping';
  }>[];
  readonly restartLosses: readonly DelegationRestartLoss[];
}

export type DelegationFailureCode =
  | 'adapter_unavailable'
  | 'agent_protocol_drift'
  | 'spawn_failed'
  | 'activation_failed'
  | 'stdin_failed'
  | 'process_exit'
  | 'tree_unsettled'
  | 'runtime_cleanup_failed'
  | 'route_lost'
  | 'hold_failed'
  | 'hold_expired'
  | 'resume_failed'
  | 'daemon_shutdown';

export type DelegationProcessSignal = 'SIGSTOP' | 'SIGCONT';

export type ProcessGroupStatusInspection =
  | { readonly classification: 'running' }
  | { readonly classification: 'stopped' }
  | { readonly classification: 'stale' }
  | { readonly classification: 'ambiguous' };

export type ProcessGroupStatusInspector = (
  entry: ActiveJournalEntry,
  process: Extract<ProcessInspection, { classification: 'confirmed' }>['process'],
) => Promise<ProcessGroupStatusInspection>;

export interface SpawnInvocationOptions extends SpawnOptionsWithoutStdio {
  readonly shell: false;
  readonly detached: true;
  readonly windowsHide: true;
  readonly stdio: ['pipe', 'pipe', 'pipe'];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

export type AgentSpawnDependency = (
  command: string,
  argv: readonly string[],
  options: SpawnInvocationOptions,
) => ChildProcessWithoutNullStreams;

export interface SpawnSupervisorCloseResult {
  readonly cancelled: number;
  readonly failed: number;
  readonly alreadySettled: number;
}

export interface SpawnSupervisor {
  readonly handleExtRequest: ExtRequestHandler;
  recover(): Promise<AgentStartupRecoveryResult>;
  close(): Promise<SpawnSupervisorCloseResult>;
  journalEntryForChild(child: SupervisedChild): JournalEntry | null;
}

export interface SpawnSupervisorDependencies {
  readonly registry: AgentProviderRegistry;
  readonly runtimeFiles: Pick<
    AgentRuntimeFiles,
    'pathsFor' | 'prepareRun' | 'activateRun' | 'removeRun'
  >;
  readonly inspector: ProcessInspector;
  readonly terminator: ProcessTreeTerminator;
  readonly startupRecovery: AgentStartupRecovery;
  readonly endpoint: string;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly environment?: NodeJS.ProcessEnv;
  readonly spawn?: AgentSpawnDependency;
  readonly wallNow?: () => number;
  readonly monotonicNow?: () => number;
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly mintDelegationId?: () => string;
  readonly mintFingerprint?: () => string;
  readonly mintGeneration?: () => string;
  readonly signalProcessGroup?: (
    negativeProcessGroupId: number,
    signal: DelegationProcessSignal,
  ) => void;
  readonly inspectProcessGroupStatus?: ProcessGroupStatusInspector;
  readonly schedule?: (callback: () => void, milliseconds: number) => unknown;
  readonly clearScheduled?: (timer: unknown) => void;
  readonly terminationGrace?: number;
  readonly activationAttempts?: number;
  readonly allowSpawnOnPlatform?: (platform: NodeJS.Platform) => boolean;
  readonly onDegraded?: (
    code: 'tree_unsettled' | 'runtime_cleanup_failed',
  ) => void;
}

export interface ProductionSpawnSupervisorOptions {
  readonly endpoint: string;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly environment?: NodeJS.ProcessEnv;
  readonly terminationGrace?: number;
  readonly onDegraded?: SpawnSupervisorDependencies['onDegraded'];
}

interface RunTerminalResult {
  readonly delegationId: string;
  readonly status: DelegationTerminalStatus;
  readonly terminal: Readonly<Record<string, unknown>>;
}

interface RunStreams {
  parser: Promise<void>;
  stderr: Promise<void>;
  closed: Promise<ChildExit>;
}

interface DelegationRun {
  readonly delegationId: string;
  readonly requestId: string;
  readonly task: string;
  readonly emit: (event: ExtEvent) => void;
  readonly adapter: AgentProviderAdapter;
  profileVersion: string;
  readonly terminalPromise: Promise<RunTerminalResult>;
  readonly resolveTerminal: (result: RunTerminalResult) => void;
  readonly setupPromise: Promise<void>;
  readonly resolveSetup: () => void;
  state: DelegationRunState;
  settled: boolean;
  authorityGranted: boolean;
  stopRequested: boolean;
  failureCode: DelegationFailureCode | null;
  runtimeOwned: boolean;
  entry: JournalEntry | null;
  child: ChildProcessWithoutNullStreams | null;
  supervisedChild: SupervisedChild | null;
  streams: RunStreams | null;
  bufferedEvents: AgentEvent[];
  bufferedEventBytes: number;
  resultEvent: AgentEvent | null;
  parserError: unknown;
  terminationPromise: Promise<void> | null;
  cancelPromise: Promise<RunTerminalResult> | null;
  holdPromise: Promise<Readonly<Record<string, unknown>>> | null;
  resumePromise: Promise<Readonly<Record<string, unknown>>> | null;
  holdTimer: unknown | null;
  executionPromise: Promise<void> | null;
  routeSignal: AbortSignal | null;
  routeAbortListener: (() => void) | null;
}

export class InvalidDelegationRequestError extends Error {
  readonly code = 'invalid_ext_request' as const;

  constructor() {
    super('Delegation request is invalid');
    this.name = 'InvalidDelegationRequestError';
  }
}

function defaultSpawn(
  command: string,
  argv: readonly string[],
  options: SpawnInvocationOptions,
): ChildProcessWithoutNullStreams {
  return nodeSpawn(command, [...argv], options) as ChildProcessWithoutNullStreams;
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function inspectStateSet(states: readonly string[]): ProcessGroupStatusInspection {
  if (states.length === 0) return Object.freeze({ classification: 'stale' });
  const stopped = states.map((state) => state === 'T' || state === 't');
  if (stopped.every(Boolean)) return Object.freeze({ classification: 'stopped' });
  if (stopped.every((value) => !value)) return Object.freeze({ classification: 'running' });
  return Object.freeze({ classification: 'ambiguous' });
}

function parseLinuxProcessState(raw: string): { state: string; processGroupId: number } | null {
  if (Buffer.byteLength(raw, 'utf8') > 4096) return null;
  const closing = raw.lastIndexOf(') ');
  if (closing < 0) return null;
  const fields = raw.slice(closing + 2).trim().split(/\s+/);
  const processGroupId = Number(fields[2]);
  if (!fields[0] || !Number.isSafeInteger(processGroupId) || processGroupId < 1) return null;
  return { state: fields[0], processGroupId };
}

function readLinuxProcessGroupStatus(
  entry: ActiveJournalEntry,
  process: Extract<ProcessInspection, { classification: 'confirmed' }>['process'],
): ProcessGroupStatusInspection {
  const expectedIds = [process.pid, ...process.descendants]
    .sort((left, right) => left - right);
  const states: string[] = [];
  for (const pid of expectedIds) {
    let parsed;
    try {
      parsed = parseLinuxProcessState(readFileSync(`/proc/${pid}/stat`, 'utf8'));
    } catch {
      return Object.freeze({ classification: 'ambiguous' });
    }
    if (!parsed || parsed.processGroupId !== entry.processGroupId) {
      return Object.freeze({ classification: 'ambiguous' });
    }
    states.push(parsed.state);
  }
  return inspectStateSet(states);
}

function execDarwinProcessStates(): Promise<string> {
  return new Promise((resolve, reject) => {
    nodeExecFile(
      '/bin/ps',
      ['-axo', 'pid=,pgid=,state='],
      {
        timeout: 5000,
        windowsHide: true,
        maxBuffer: PROCESS_STATUS_LIMIT_BYTES,
        shell: false,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(stdout));
      },
    );
  });
}

async function readDarwinProcessGroupStatus(
  entry: ActiveJournalEntry,
  process: Extract<ProcessInspection, { classification: 'confirmed' }>['process'],
): Promise<ProcessGroupStatusInspection> {
  let output: string;
  try {
    output = await execDarwinProcessStates();
  } catch {
    return Object.freeze({ classification: 'ambiguous' });
  }
  if (Buffer.byteLength(output, 'utf8') > PROCESS_STATUS_LIMIT_BYTES) {
    return Object.freeze({ classification: 'ambiguous' });
  }
  const expectedIds = new Set([process.pid, ...process.descendants]);
  const seen = new Set<number>();
  const states: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const group = Number(match[2]);
    if (group !== entry.processGroupId) continue;
    if (!expectedIds.has(pid) || seen.has(pid)) {
      return Object.freeze({ classification: 'ambiguous' });
    }
    seen.add(pid);
    states.push(match[3][0]);
  }
  if (seen.size !== expectedIds.size) return Object.freeze({ classification: 'ambiguous' });
  return inspectStateSet(states);
}

export function createProcessGroupStatusInspector(
  platform: NodeJS.Platform = process.platform,
): ProcessGroupStatusInspector {
  if (platform === 'linux') {
    return async (entry, process) => readLinuxProcessGroupStatus(entry, process);
  }
  if (platform === 'darwin') return readDarwinProcessGroupStatus;
  return async () => Object.freeze({ classification: 'ambiguous' });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index]);
}

function sanitizeRestartLosses(value: unknown): readonly DelegationRestartLoss[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const byDelegation = new Map<string, DelegationRestartLoss>();
  for (const candidate of value) {
    if (
      !isPlainRecord(candidate)
      || !exactKeys(candidate, ['code', 'delegationId', 'recoveredAt'])
      || typeof candidate.delegationId !== 'string'
      || !DELEGATION_ID_PATTERN.test(candidate.delegationId)
      || candidate.code !== 'daemon_restart_lost_run'
      || typeof candidate.recoveredAt !== 'number'
      || !Number.isSafeInteger(candidate.recoveredAt)
      || candidate.recoveredAt < 0
    ) continue;
    const disposition = Object.freeze({
      delegationId: candidate.delegationId,
      code: candidate.code,
      recoveredAt: candidate.recoveredAt,
    });
    const previous = byDelegation.get(disposition.delegationId);
    if (!previous || previous.recoveredAt < disposition.recoveredAt) {
      byDelegation.set(disposition.delegationId, disposition);
    }
  }
  return Object.freeze(
    [...byDelegation.values()]
      .sort((left, right) => (
        left.recoveredAt - right.recoveredAt
        || left.delegationId.localeCompare(right.delegationId)
      ))
      .slice(-RECOVERY_STATUS_LIMIT),
  );
}

function isWellFormedText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function parseStartRequest(request: ExtRequest): { adapterId: 'claude-code'; task: string } {
  if (
    !isPlainRecord(request)
    || !exactKeys(request, START_REQUEST_KEYS)
    || request.type !== 'ext:request'
    || request.method !== 'delegate.start'
    || !isPlainRecord(request.payload)
    || !exactKeys(request.payload, START_PAYLOAD_KEYS)
  ) throw new InvalidDelegationRequestError();
  const parsed = DelegateStartSchema.safeParse(request.payload);
  if (
    !parsed.success
    || !isWellFormedText(parsed.data.task)
    || Buffer.byteLength(parsed.data.task, 'utf8') > TASK_LIMIT_BYTES
  ) throw new InvalidDelegationRequestError();
  return parsed.data;
}

function parseCancelRequest(request: ExtRequest): { delegationId: string } {
  if (
    !isPlainRecord(request)
    || !exactKeys(request, START_REQUEST_KEYS)
    || request.type !== 'ext:request'
    || request.method !== 'delegate.cancel'
    || !isPlainRecord(request.payload)
    || !exactKeys(request.payload, CANCEL_PAYLOAD_KEYS)
  ) throw new InvalidDelegationRequestError();
  const parsed = DelegateCancelSchema.safeParse(request.payload);
  if (!parsed.success) throw new InvalidDelegationRequestError();
  return parsed.data;
}

function parseLifecycleRequest(
  request: ExtRequest,
  method: 'delegate.hold' | 'delegate.resume',
): { delegationId: string } {
  if (
    !isPlainRecord(request)
    || !exactKeys(request, START_REQUEST_KEYS)
    || request.type !== 'ext:request'
    || request.method !== method
    || !isPlainRecord(request.payload)
    || !exactKeys(request.payload, CANCEL_PAYLOAD_KEYS)
  ) throw new InvalidDelegationRequestError();
  const parsed = DelegateLifecycleSchema.safeParse(request.payload);
  if (!parsed.success) throw new InvalidDelegationRequestError();
  return parsed.data;
}

function parseStatusRequest(request: ExtRequest): void {
  if (
    !isPlainRecord(request)
    || !exactKeys(request, START_REQUEST_KEYS)
    || request.type !== 'ext:request'
    || request.method !== 'delegate.status'
    || !isPlainRecord(request.payload)
    || !exactKeys(request.payload, STATUS_PAYLOAD_KEYS)
  ) throw new InvalidDelegationRequestError();
}

function diagnosticTerminal(
  code: DelegationFailureCode | 'cancelled',
  profileVersion: string | null,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: 'diagnostic',
    code,
    ...(profileVersion ? { profileVersion } : {}),
  });
}

function eventTerminal(event: AgentEvent): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: event.type,
    sessionId: event.sessionId,
    payload: event.payload,
  });
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : null;
}

function validateDetection(detection: AdapterDetection): asserts detection is AdapterDetection & {
  binary: NonNullable<AdapterDetection['binary']>;
  profileVersion: string;
  version: string;
} {
  if (
    !detection.installed
    || !detection.binary
    || !detection.profileVersion
    || !detection.version
    || !isAbsolute(detection.binary.command)
  ) throw new Error('adapter_unavailable');
}

function observeChild(child: ChildProcessWithoutNullStreams): {
  ready: Promise<void>;
  closed: Promise<ChildExit>;
} {
  let readySettled = false;
  const ready = new Promise<void>((resolve, reject) => {
    child.once('spawn', () => {
      if (readySettled) return;
      readySettled = true;
      resolve();
    });
    child.once('error', () => {
      if (readySettled) return;
      readySettled = true;
      reject(new Error('spawn_failed'));
    });
  });

  let closeSettled = false;
  const closed = new Promise<ChildExit>((resolve) => {
    const settle = (exit: ChildExit): void => {
      if (closeSettled) return;
      closeSettled = true;
      resolve(Object.freeze(exit));
    };
    child.once('error', () => settle({ code: null, signal: null }));
    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
      settle({ code, signal });
    });
  });
  return { ready, closed };
}

function safeJson(value: unknown): string | null {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : null;
  } catch {
    return null;
  }
}

function validateNormalizedEvent(event: AgentEvent): string {
  if (
    !isPlainRecord(event)
    || !exactKeys(event, ['payload', 'sessionId', 'type'])
    || typeof event.type !== 'string'
    || !AGENT_EVENT_TYPES.has(event.type)
    || typeof event.sessionId !== 'string'
    || event.sessionId.length === 0
    || event.sessionId.length > 256
    || !isPlainRecord(event.payload)
  ) throw new Error('agent_protocol_drift');
  const serialized = safeJson(event);
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > EVENT_LIMIT_BYTES) {
    throw new Error('agent_protocol_drift');
  }
  return serialized;
}

function containsSensitiveValue(serialized: string, values: readonly string[]): boolean {
  return values.some((value) => (
    value.length >= 16 && serialized.includes(value)
  ));
}

class ExactOnceSpawnSupervisor implements SpawnSupervisor {
  readonly handleExtRequest: ExtRequestHandler;

  private readonly activeRuns = new Map<string, DelegationRun>();
  private readonly completedRuns = new Map<string, RunTerminalResult>();
  private readonly entriesByPid = new Map<number, JournalEntry>();
  private readonly spawnChild: AgentSpawnDependency;
  private readonly cwd: string;
  private readonly platform: NodeJS.Platform;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly wallNow: () => number;
  private readonly monotonicNow: () => number;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly mintDelegationId: () => string;
  private readonly mintFingerprint: () => string;
  private readonly generation: string;
  private readonly signalProcessGroup: NonNullable<SpawnSupervisorDependencies['signalProcessGroup']>;
  private readonly inspectProcessGroupStatus: ProcessGroupStatusInspector;
  private readonly schedule: NonNullable<SpawnSupervisorDependencies['schedule']>;
  private readonly clearScheduled: NonNullable<SpawnSupervisorDependencies['clearScheduled']>;
  private restartLosses: readonly DelegationRestartLoss[] = Object.freeze([]);
  private readonly terminationGrace: number;
  private readonly activationAttempts: number;
  private readonly allowSpawnOnPlatform: (platform: NodeJS.Platform) => boolean;
  private accepting = true;
  private degraded = false;
  private closePromise: Promise<SpawnSupervisorCloseResult> | null = null;

  constructor(private readonly dependencies: SpawnSupervisorDependencies) {
    this.spawnChild = dependencies.spawn ?? defaultSpawn;
    this.cwd = dependencies.cwd ?? process.cwd();
    this.platform = dependencies.platform ?? process.platform;
    this.environment = { ...(dependencies.environment ?? process.env) };
    this.wallNow = dependencies.wallNow ?? (() => Date.now());
    this.monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
    this.wait = dependencies.wait ?? defaultWait;
    this.mintDelegationId = dependencies.mintDelegationId
      ?? (() => `delegation_${randomBytes(16).toString('base64url')}`);
    this.mintFingerprint = dependencies.mintFingerprint
      ?? (() => randomBytes(32).toString('base64url'));
    this.generation = (dependencies.mintGeneration ?? randomUUID)();
    this.signalProcessGroup = dependencies.signalProcessGroup
      ?? ((negativeProcessGroupId, signal) => process.kill(negativeProcessGroupId, signal));
    this.inspectProcessGroupStatus = dependencies.inspectProcessGroupStatus
      ?? (async () => Object.freeze({ classification: 'ambiguous' }));
    this.schedule = dependencies.schedule
      ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.clearScheduled = dependencies.clearScheduled
      ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    this.terminationGrace = dependencies.terminationGrace ?? 2_000;
    this.activationAttempts = dependencies.activationAttempts ?? DEFAULT_ACTIVATION_ATTEMPTS;
    this.allowSpawnOnPlatform = dependencies.allowSpawnOnPlatform
      ?? ((platform) => platform === 'linux' || platform === 'darwin');
    if (
      !isAbsolute(this.cwd)
      || !Number.isSafeInteger(this.terminationGrace)
      || this.terminationGrace < 0
      || this.terminationGrace > 60_000
      || !Number.isSafeInteger(this.activationAttempts)
      || this.activationAttempts < 1
      || this.activationAttempts > 1000
      || !DELEGATION_ID_PATTERN.test(this.generation)
    ) throw new TypeError('Spawn supervisor configuration is invalid');

    this.handleExtRequest = async (request, emit, context) => {
      if (!this.accepting) throw new InvalidDelegationRequestError();
      if (request.method === 'delegate.start') {
        const payload = parseStartRequest(request);
        return this.start(request.id, payload.task, payload.adapterId, emit, context);
      }
      if (request.method === 'delegate.cancel') {
        const payload = parseCancelRequest(request);
        return this.cancel(payload.delegationId);
      }
      if (request.method === 'delegate.hold') {
        const payload = parseLifecycleRequest(request, 'delegate.hold');
        return this.hold(payload.delegationId);
      }
      if (request.method === 'delegate.resume') {
        const payload = parseLifecycleRequest(request, 'delegate.resume');
        return this.resume(payload.delegationId);
      }
      if (request.method === 'delegate.status') {
        parseStatusRequest(request);
        return this.status();
      }
      throw new InvalidDelegationRequestError();
    };
  }

  async recover(): Promise<AgentStartupRecoveryResult> {
    const result = await this.dependencies.startupRecovery.recover();
    this.restartLosses = sanitizeRestartLosses(result.restartLosses);
    if (this.allowSpawnOnPlatform(this.platform)) return result;
    return Object.freeze({
      confirmedKilled: result.confirmedKilled,
      staleCleared: result.staleCleared,
      ambiguousFailClosed: result.ambiguousFailClosed + 1,
      spawnAvailable: false,
      profiles: result.profiles,
      restartLosses: this.restartLosses,
    });
  }

  journalEntryForChild(child: SupervisedChild): JournalEntry | null {
    return this.entriesByPid.get(child.pid) ?? null;
  }

  close(): Promise<SpawnSupervisorCloseResult> {
    if (!this.closePromise) this.closePromise = this.closeOnce();
    return this.closePromise;
  }

  private async closeOnce(): Promise<SpawnSupervisorCloseResult> {
    this.accepting = false;
    const runs = [...this.activeRuns.values()];
    const results = await Promise.all(runs.map(async (run) => {
      if (run.settled) return 'alreadySettled' as const;
      const result = await this.cancelRun(run, 'daemon_shutdown');
      return result.status === 'cancelled' ? 'cancelled' as const : 'failed' as const;
    }));
    return Object.freeze({
      cancelled: results.filter((value) => value === 'cancelled').length,
      failed: results.filter((value) => value === 'failed').length,
      alreadySettled: results.filter((value) => value === 'alreadySettled').length,
    });
  }

  private async start(
    requestId: string,
    task: string,
    adapterId: string,
    emit: (event: ExtEvent) => void,
    context?: ExtRequestContext,
  ): Promise<Record<string, unknown>> {
    const delegationId = this.uniqueDelegationId();
    const adapter = this.dependencies.registry.require(adapterId);
    let resolveTerminal!: (result: RunTerminalResult) => void;
    const terminalPromise = new Promise<RunTerminalResult>((resolve) => {
      resolveTerminal = resolve;
    });
    let resolveSetup!: () => void;
    const setupPromise = new Promise<void>((resolve) => {
      resolveSetup = resolve;
    });
    const run: DelegationRun = {
      delegationId,
      requestId,
      task,
      emit,
      adapter,
      profileVersion: 'unknown',
      terminalPromise,
      resolveTerminal,
      setupPromise,
      resolveSetup,
      state: 'created',
      settled: false,
      authorityGranted: false,
      stopRequested: false,
      failureCode: null,
      runtimeOwned: false,
      entry: null,
      child: null,
      supervisedChild: null,
      streams: null,
      bufferedEvents: [],
      bufferedEventBytes: 0,
      resultEvent: null,
      parserError: null,
      terminationPromise: null,
      cancelPromise: null,
      holdPromise: null,
      resumePromise: null,
      holdTimer: null,
      executionPromise: null,
      routeSignal: context?.signal ?? null,
      routeAbortListener: null,
    };
    this.activeRuns.set(delegationId, run);
    run.executionPromise = this.executeRun(run);
    void run.executionPromise;
    if (run.routeSignal) {
      run.routeAbortListener = () => {
        void this.cancelRun(run, 'route_lost');
      };
      run.routeSignal.addEventListener('abort', run.routeAbortListener, { once: true });
      if (run.routeSignal.aborted) run.routeAbortListener();
    }
    return await terminalPromise as unknown as Record<string, unknown>;
  }

  private async executeRun(run: DelegationRun): Promise<void> {
    let profileVersion: string | null = null;
    try {
      this.throwIfStopped(run);
      if (!this.allowSpawnOnPlatform(this.platform)) throw new Error('adapter_unavailable');
      run.state = 'spawning';
      const detection = await run.adapter.detect();
      validateDetection(detection);
      profileVersion = detection.profileVersion;
      run.profileVersion = profileVersion;
      this.throwIfStopped(run);

      const runtimeFingerprint = this.uniqueFingerprint();
      const paths = this.dependencies.runtimeFiles.pathsFor(run.delegationId);
      run.runtimeOwned = true;
      const spec = await run.adapter.buildSpawn({ text: run.task }, {
        adapterId: CLAUDE_CODE_ADAPTER_ID,
        detection,
        delegationId: run.delegationId,
        runtimeFingerprint,
        cwd: this.cwd,
        privateMcpConfigPath: paths.mcpConfigPath,
        runtimeFiles: [paths.mcpConfigPath],
      });
      this.throwIfStopped(run);
      this.validateSpawnSpec(run, detection, spec.command, spec.argv, spec.cwd, spec.fixedEnv);
      const argvSignature = createArgvSignature(spec.command, spec.argv);
      const createdAt = this.wallNow();
      const prepared = await this.dependencies.runtimeFiles.prepareRun({
        delegationId: run.delegationId,
        adapterId: CLAUDE_CODE_ADAPTER_ID,
        profileVersion,
        createdAt,
        binaryRealPath: spec.command,
        argvSignature,
        envFingerprint: runtimeFingerprint,
        generation: this.generation,
        endpoint: this.dependencies.endpoint,
      });
      run.entry = prepared.entry;
      this.throwIfStopped(run);

      const environment = this.createEnvironment(spec.fixedEnv, argvSignature);
      const options: SpawnInvocationOptions = Object.freeze({
        shell: false,
        detached: true,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
        cwd: spec.cwd,
        env: environment,
      });
      const child = this.spawnChild(spec.command, spec.argv, options);
      run.child = child;
      if (!Number.isSafeInteger(child.pid) || (child.pid ?? 0) < 1) {
        throw new Error('spawn_failed');
      }
      const observed = observeChild(child);
      const supervisedChild: SupervisedChild = Object.freeze({
        pid: child.pid!,
        processGroupId: child.pid!,
        platform: this.platform,
        closed: observed.closed,
      });
      run.supervisedChild = supervisedChild;
      this.entriesByPid.set(supervisedChild.pid, prepared.entry);
      run.streams = {
        parser: this.consumeEvents(run, child.stdout),
        stderr: this.drainStderr(child.stderr),
        closed: observed.closed,
      };
      await observed.ready;
      this.throwIfStopped(run);
      const identity = await this.resolveActivation(prepared.entry, supervisedChild.pid);
      this.throwIfStopped(run);
      const active = await this.dependencies.runtimeFiles.activateRun({
        delegationId: run.delegationId,
        pid: supervisedChild.pid,
        processGroupId: identity.process.processGroupId,
        startedAt: Math.max(createdAt, this.wallNow()),
        processStartIdentity: identity.process.processStartIdentity,
      });
      run.entry = active;
      this.entriesByPid.set(supervisedChild.pid, active);
      this.throwIfStopped(run);
      if (run.parserError) throw run.parserError;
      if (run.resultEvent) throw new Error('agent_protocol_drift');

      this.emitStarted(run, active);
      run.authorityGranted = true;
      this.flushBufferedEvents(run);
      this.throwIfStopped(run);
      if (run.parserError) throw run.parserError;
      run.state = 'running';
      run.resolveSetup();
      await this.writeTask(child, run.task);
      await Promise.all([run.streams.parser, run.streams.stderr, run.streams.closed]);
      if (run.stopRequested) return;
      if (run.parserError) throw run.parserError;
      const resultEvent = this.requireResultEvent(run);
      const exit = await run.streams.closed;
      if (resultEvent.payload.is_error === true) {
        await this.terminateAndCleanup(run);
        if (run.stopRequested) return;
        this.settleOnce(run, 'failed', eventTerminal(resultEvent));
        return;
      }
      if (exit.code !== 0 || exit.signal !== null) throw new Error('process_exit');
      await this.terminateAndCleanup(run);
      if (run.stopRequested) return;
      this.settleOnce(run, 'succeeded', eventTerminal(resultEvent));
    } catch (error) {
      if (run.settled) return;
      if (run.stopRequested) return;
      let code = this.failureCode(error);
      try {
        await this.terminateAndCleanup(run);
        if (run.stopRequested) return;
      } catch (cleanupError) {
        code = errorCode(cleanupError) === 'tree_unsettled'
          ? 'tree_unsettled'
          : 'runtime_cleanup_failed';
      }
      if (code === 'tree_unsettled' || code === 'runtime_cleanup_failed') {
        this.markDegraded(code);
      }
      this.settleOnce(run, 'failed', diagnosticTerminal(code, profileVersion));
    } finally {
      run.resolveSetup();
    }
  }

  private throwIfStopped(run: DelegationRun): void {
    if (run.stopRequested) throw new Error(run.failureCode ?? 'daemon_shutdown');
  }

  private uniqueDelegationId(): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const value = this.mintDelegationId();
      if (
        DELEGATION_ID_PATTERN.test(value)
        && !this.activeRuns.has(value)
        && !this.completedRuns.has(value)
      ) return value;
    }
    throw new Error('Unable to mint delegation identity');
  }

  private uniqueFingerprint(): string {
    const value = this.mintFingerprint();
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(value)) {
      throw new Error('Unable to mint runtime fingerprint');
    }
    return value;
  }

  private validateSpawnSpec(
    run: DelegationRun,
    detection: AdapterDetection & { binary: NonNullable<AdapterDetection['binary']> },
    command: string,
    argv: readonly string[],
    cwd: string,
    fixedEnv: Readonly<Record<string, string>>,
  ): void {
    if (
      command !== detection.binary.command
      || cwd !== this.cwd
      || !Array.isArray(argv)
      || argv.length === 0
      || !isPlainRecord(fixedEnv)
      || Object.keys(fixedEnv).some((key) => PROVIDER_KEY_NAMES.includes(
        key as typeof PROVIDER_KEY_NAMES[number],
      ))
    ) throw new Error('adapter_unavailable');
    const serialized = safeJson({ command, argv, cwd, fixedEnv });
    const sensitive = [run.task, ...PROVIDER_KEY_NAMES.map((name) => this.environment[name] ?? '')];
    if (!serialized || containsSensitiveValue(serialized, sensitive)) {
      throw new Error('adapter_unavailable');
    }
  }

  private createEnvironment(
    fixedEnv: Readonly<Record<string, string>>,
    argvSignature: string,
  ): NodeJS.ProcessEnv {
    const environment = { ...this.environment };
    for (const key of PROVIDER_KEY_NAMES) delete environment[key];
    for (const [key, value] of Object.entries(fixedEnv)) environment[key] = value;
    environment.FSB_AGENT_ARGV_SIGNATURE = argvSignature;
    for (const key of PROVIDER_KEY_NAMES) delete environment[key];
    return Object.freeze(environment);
  }

  private async resolveActivation(
    entry: PreparedJournalEntry,
    expectedPid: number,
  ): Promise<Extract<ProcessInspection, { classification: 'confirmed' }>> {
    const started = this.monotonicNow();
    for (let attempt = 0; attempt < this.activationAttempts; attempt += 1) {
      const inspection = await this.dependencies.inspector.inspect(entry);
      if (inspection.classification === 'confirmed') {
        if (
          inspection.process.pid !== expectedPid
          || (this.platform !== 'win32' && inspection.process.processGroupId !== expectedPid)
        ) throw new Error('activation_failed');
        return inspection;
      }
      if (
        inspection.classification === 'ambiguous'
        && (inspection.reason === 'identity_mismatch' || inspection.reason === 'multiple_matches')
      ) throw new Error('activation_failed');
      if (attempt + 1 < this.activationAttempts) {
        await this.wait(DEFAULT_ACTIVATION_POLL_MS);
        if (this.monotonicNow() < started) throw new Error('activation_failed');
      }
    }
    throw new Error('activation_failed');
  }

  private consumeEvents(run: DelegationRun, stream: NodeJS.ReadableStream): Promise<void> {
    return (async () => {
      try {
        for await (const event of run.adapter.parseEvents(stream)) {
          const serialized = validateNormalizedEvent(event);
          const sensitive = [
            run.task,
            ...PROVIDER_KEY_NAMES.map((name) => this.environment[name] ?? ''),
          ];
          if (containsSensitiveValue(serialized, sensitive)) {
            throw new Error('agent_protocol_drift');
          }
          if (event.type === 'result') {
            if (run.resultEvent) throw new Error('agent_protocol_drift');
            run.resultEvent = event;
          } else {
            this.publishOrBuffer(run, event, serialized);
          }
        }
        if (!run.resultEvent) throw new Error('agent_protocol_drift');
        this.publishOrBuffer(run, run.resultEvent, validateNormalizedEvent(run.resultEvent));
      } catch (error) {
        run.parserError = error;
        if (run.authorityGranted && run.child && run.entry && !run.terminationPromise) {
          void this.terminateAndCleanup(run).catch(() => undefined);
        }
      }
    })();
  }

  private async drainStderr(stream: NodeJS.ReadableStream): Promise<void> {
    let retainedBytes = 0;
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      const bytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, 'utf8');
      retainedBytes = Math.min(STDERR_LIMIT_BYTES, retainedBytes + bytes);
    }
    void retainedBytes;
  }

  private publishOrBuffer(run: DelegationRun, event: AgentEvent, serialized: string): void {
    if (run.authorityGranted) {
      this.emitNormalizedEvent(run, event);
      return;
    }
    run.bufferedEventBytes += Buffer.byteLength(serialized, 'utf8');
    if (
      run.bufferedEvents.length >= PRE_AUTH_EVENT_LIMIT_COUNT
      || run.bufferedEventBytes > PRE_AUTH_EVENT_LIMIT_BYTES
    ) throw new Error('agent_protocol_drift');
    run.bufferedEvents.push(event);
  }

  private emitStarted(run: DelegationRun, entry: ActiveJournalEntry): void {
    try {
      run.emit({
        id: run.requestId,
        type: 'ext:event',
        event: 'delegation.started',
        payload: {
          delegationId: run.delegationId,
          adapterId: entry.adapterId,
          profileVersion: entry.profileVersion,
        },
      });
    } catch {
      throw new Error('route_lost');
    }
  }

  private emitNormalizedEvent(run: DelegationRun, event: AgentEvent): void {
    if (run.settled) return;
    try {
      run.emit({
        id: run.requestId,
        type: 'ext:event',
        event: 'delegation.event',
        payload: { delegationId: run.delegationId, event },
      });
    } catch {
      throw new Error('route_lost');
    }
  }

  private flushBufferedEvents(run: DelegationRun): void {
    const events = run.bufferedEvents;
    run.bufferedEvents = [];
    run.bufferedEventBytes = 0;
    for (const event of events) this.emitNormalizedEvent(run, event);
  }

  private async writeTask(child: ChildProcessWithoutNullStreams, task: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let writeCallbackDone = false;
      let drainDone = true;
      let endStarted = false;
      let endCallbackDone = false;
      let finishDone = false;
      let settled = false;
      const cleanup = (keepPendingErrorListener = false): void => {
        if (!keepPendingErrorListener) child.stdin.off('error', onError);
        child.stdin.off('close', onClose);
        child.stdin.off('drain', onDrain);
        child.stdin.off('finish', onFinish);
      };
      const fail = (keepPendingErrorListener = false): void => {
        if (settled) return;
        settled = true;
        cleanup(keepPendingErrorListener);
        reject(new Error('stdin_failed'));
      };
      const onError = (): void => {
        fail();
      };
      const complete = (): void => {
        if (settled || !endCallbackDone || !finishDone) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onClose = (): void => {
        if (!endCallbackDone || !finishDone) fail();
      };
      const onFinish = (): void => {
        finishDone = true;
        complete();
      };
      const end = (): void => {
        if (settled || endStarted || !writeCallbackDone || !drainDone) return;
        endStarted = true;
        try {
          child.stdin.end(() => {
            endCallbackDone = true;
            complete();
          });
        } catch {
          fail();
        }
      };
      const onDrain = (): void => {
        drainDone = true;
        end();
      };
      child.stdin.once('error', onError);
      child.stdin.once('close', onClose);
      child.stdin.once('finish', onFinish);
      try {
        const accepted = child.stdin.write(task, 'utf8', (error?: Error | null) => {
          if (error) {
            fail(true);
            return;
          }
          writeCallbackDone = true;
          end();
        });
        if (!accepted) {
          drainDone = false;
          child.stdin.once('drain', onDrain);
        }
      } catch {
        fail();
      }
    });
  }

  private async terminateAndCleanup(run: DelegationRun): Promise<void> {
    if (run.terminationPromise) return run.terminationPromise;
    run.terminationPromise = (async () => {
      const entry = run.entry;
      if (!entry) {
        if (run.runtimeOwned) {
          await this.dependencies.runtimeFiles.removeRun(run.delegationId);
          run.runtimeOwned = false;
        }
        return;
      }
      if (run.supervisedChild) {
        await this.dependencies.terminator.stop(
          entry,
          run.supervisedChild,
          { grace: this.terminationGrace },
        );
      } else {
        const inspection = await this.dependencies.inspector.inspect(entry);
        if (inspection.classification === 'confirmed') {
          await this.dependencies.terminator.stop(
            entry,
            null,
            { grace: this.terminationGrace },
          );
        } else if (inspection.classification !== 'stale') {
          throw new TreeUnsettledError();
        }
      }
      await this.dependencies.runtimeFiles.removeRun(run.delegationId);
      run.runtimeOwned = false;
      if (run.supervisedChild) this.entriesByPid.delete(run.supervisedChild.pid);
      run.entry = null;
    })();
    return run.terminationPromise;
  }

  private async cancel(delegationId: string): Promise<Record<string, unknown>> {
    const run = this.activeRuns.get(delegationId);
    if (!run) {
      return Object.freeze({
        delegationId,
        status: this.completedRuns.has(delegationId) ? 'already_terminal' : 'not_found',
      });
    }
    const result = await this.cancelRun(run, 'daemon_shutdown');
    return Object.freeze({
      delegationId,
      status: result.status === 'cancelled' ? 'cancelled' : 'failed',
    });
  }

  private status(): DelegationStatus {
    const active = [...this.activeRuns.values()]
      .filter((run) => !run.settled && (
        run.state === 'running'
        || run.state === 'held'
        || run.state === 'stopping'
        || run.state === 'holding'
        || run.state === 'resuming'
      ))
      .sort((left, right) => left.delegationId.localeCompare(right.delegationId))
      .slice(0, ACTIVE_STATUS_LIMIT)
      .map((run) => Object.freeze({
        delegationId: run.delegationId,
        state: run.state === 'held'
          ? 'held' as const
          : (run.state === 'stopping' ? 'stopping' as const : 'running' as const),
      }));
    const restartLosses = [...this.restartLosses]
      .sort((left, right) => (
        left.recoveredAt - right.recoveredAt
        || left.delegationId.localeCompare(right.delegationId)
      ))
      .slice(-RECOVERY_STATUS_LIMIT)
      .map((entry) => Object.freeze({ ...entry }));
    return Object.freeze({
      generation: this.generation,
      active: Object.freeze(active),
      restartLosses: Object.freeze(restartLosses),
    });
  }

  private clearHoldTimer(run: DelegationRun): void {
    if (run.holdTimer === null) return;
    try {
      this.clearScheduled(run.holdTimer);
    } finally {
      run.holdTimer = null;
    }
  }

  private armHoldTimer(run: DelegationRun): void {
    this.clearHoldTimer(run);
    let timer: unknown = null;
    timer = this.schedule(() => {
      if (run.holdTimer !== timer) return;
      run.holdTimer = null;
      if (run.settled || run.stopRequested || run.state !== 'held') return;
      void this.cancelRun(run, 'hold_expired');
    }, HOLD_EXPIRY_MS);
    run.holdTimer = timer;
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      try {
        (timer as { unref?: () => void }).unref?.();
      } catch {
        // Timer ownership and expiry remain valid when unref is unavailable.
      }
    }
  }

  private async confirmProcessState(
    run: DelegationRun,
    expected: 'running' | 'stopped',
    transitionGraceMs = 0,
  ): Promise<void> {
    const entry = run.entry;
    const child = run.supervisedChild;
    if (!entry || entry.state !== 'active' || !child || run.settled || run.stopRequested) {
      throw new TreeUnsettledError();
    }

    const started = this.monotonicNow();
    if (!Number.isFinite(started)) throw new TreeUnsettledError();
    const deadline = started + transitionGraceMs;
    const maximumAttempts = transitionGraceMs > 0
      ? Math.ceil(transitionGraceMs / PROCESS_TRANSITION_POLL_MS) + 1
      : 1;

    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      if (
        run.entry !== entry
        || run.supervisedChild !== child
        || entry.state !== 'active'
        || child.pid !== entry.pid
        || child.processGroupId !== entry.processGroupId
        || run.settled
        || run.stopRequested
      ) throw new TreeUnsettledError();

      let inspection: ProcessInspection;
      try {
        inspection = await this.dependencies.inspector.inspect(entry);
      } catch {
        if (transitionGraceMs <= 0) throw new TreeUnsettledError();
        inspection = { classification: 'ambiguous', reason: 'evidence_unavailable' };
      }

      if (inspection.classification === 'stale') throw new TreeUnsettledError();
      if (
        inspection.classification === 'ambiguous'
        && (inspection.reason === 'identity_mismatch' || inspection.reason === 'multiple_matches')
      ) throw new TreeUnsettledError();

      if (inspection.classification === 'confirmed') {
        if (
          inspection.process.pid !== entry.pid
          || inspection.process.processGroupId !== entry.processGroupId
          || inspection.process.processStartIdentity !== entry.processStartIdentity
          || run.entry !== entry
          || run.supervisedChild !== child
          || run.settled
          || run.stopRequested
        ) throw new TreeUnsettledError();

        let status: ProcessGroupStatusInspection;
        try {
          status = await this.inspectProcessGroupStatus(entry, inspection.process);
        } catch {
          if (transitionGraceMs <= 0) throw new TreeUnsettledError();
          status = { classification: 'ambiguous' };
        }
        if (
          run.entry !== entry
          || run.supervisedChild !== child
          || run.settled
          || run.stopRequested
          || status.classification === 'stale'
        ) throw new TreeUnsettledError();
        if (status.classification === expected) return;
      } else if (transitionGraceMs <= 0) {
        throw new TreeUnsettledError();
      }

      const observed = this.monotonicNow();
      if (
        !Number.isFinite(observed)
        || observed < started
        || observed >= deadline
        || attempt + 1 >= maximumAttempts
      ) throw new TreeUnsettledError();
      const remaining = deadline - observed;
      await this.wait(Math.min(PROCESS_TRANSITION_POLL_MS, remaining));
    }
    throw new TreeUnsettledError();
  }

  private async signalAndConfirm(
    run: DelegationRun,
    signal: DelegationProcessSignal,
    before: 'running' | 'stopped',
    after: 'running' | 'stopped',
  ): Promise<void> {
    if (this.platform !== 'linux' && this.platform !== 'darwin') {
      throw new TreeUnsettledError();
    }
    await this.confirmProcessState(run, before);
    if (run.settled || run.stopRequested || !run.entry || run.entry.state !== 'active') {
      throw new TreeUnsettledError();
    }
    try {
      this.signalProcessGroup(-run.entry.processGroupId, signal);
    } catch {
      throw new TreeUnsettledError();
    }
    await this.confirmProcessState(run, after, PROCESS_TRANSITION_GRACE_MS);
  }

  private hold(delegationId: string): Promise<Readonly<Record<string, unknown>>> {
    const run = this.activeRuns.get(delegationId);
    if (!run) return Promise.resolve(Object.freeze({
      delegationId,
      status: this.completedRuns.has(delegationId) ? 'already_terminal' : 'not_found',
    }));
    if (run.holdPromise) return run.holdPromise;
    if (run.state === 'held') {
      return Promise.resolve(Object.freeze({ delegationId, status: 'held' }));
    }
    if (run.state !== 'running' || !run.entry || run.entry.state !== 'active' || !run.supervisedChild) {
      return Promise.resolve(Object.freeze({ delegationId, status: 'invalid_state' }));
    }
    const operation = (async () => {
      run.state = 'holding';
      try {
        await this.signalAndConfirm(run, 'SIGSTOP', 'running', 'stopped');
        if (run.settled || run.stopRequested) return Object.freeze({
          delegationId,
          status: 'already_terminal',
        });
        run.state = 'held';
        this.armHoldTimer(run);
        return Object.freeze({ delegationId, status: 'held' });
      } catch {
        if (!run.settled && !run.stopRequested) await this.cancelRun(run, 'hold_failed');
        return Object.freeze({ delegationId, status: 'hold_failed' });
      }
    })();
    run.holdPromise = operation;
    void operation.finally(() => {
      if (run.holdPromise === operation) run.holdPromise = null;
    });
    return operation;
  }

  private resume(delegationId: string): Promise<Readonly<Record<string, unknown>>> {
    const run = this.activeRuns.get(delegationId);
    if (!run) return Promise.resolve(Object.freeze({
      delegationId,
      status: this.completedRuns.has(delegationId) ? 'already_terminal' : 'not_found',
    }));
    if (run.resumePromise) return run.resumePromise;
    if (run.state === 'running') {
      return Promise.resolve(Object.freeze({ delegationId, status: 'running' }));
    }
    if (run.state !== 'held' || !run.entry || run.entry.state !== 'active' || !run.supervisedChild) {
      return Promise.resolve(Object.freeze({ delegationId, status: 'invalid_state' }));
    }
    const operation = (async () => {
      run.state = 'resuming';
      this.clearHoldTimer(run);
      try {
        await this.signalAndConfirm(run, 'SIGCONT', 'stopped', 'running');
        if (run.settled || run.stopRequested) return Object.freeze({
          delegationId,
          status: 'already_terminal',
        });
        run.state = 'running';
        return Object.freeze({ delegationId, status: 'running' });
      } catch {
        if (!run.settled && !run.stopRequested) await this.cancelRun(run, 'resume_failed');
        return Object.freeze({ delegationId, status: 'resume_failed' });
      }
    })();
    run.resumePromise = operation;
    void operation.finally(() => {
      if (run.resumePromise === operation) run.resumePromise = null;
    });
    return operation;
  }

  private cancelRun(
    run: DelegationRun,
    reason: 'daemon_shutdown' | 'route_lost' | 'hold_failed' | 'hold_expired' | 'resume_failed',
  ): Promise<RunTerminalResult> {
    if (run.cancelPromise) return run.cancelPromise;
    this.clearHoldTimer(run);
    run.stopRequested = true;
    run.failureCode = reason;
    run.state = 'stopping';
    run.cancelPromise = this.cancelLifecycle(run, reason);
    return run.cancelPromise;
  }

  private async cancelLifecycle(
    run: DelegationRun,
    reason: DelegationFailureCode,
  ): Promise<RunTerminalResult> {
    if (run.settled) return run.terminalPromise;
    try {
      await run.setupPromise;
      if (run.entry || run.runtimeOwned) await this.terminateAndCleanup(run);
      if (run.executionPromise) await run.executionPromise;
      if (run.streams) {
        await Promise.allSettled([run.streams.parser, run.streams.stderr, run.streams.closed]);
      }
      if (reason === 'daemon_shutdown') {
        this.settleOnce(run, 'cancelled', diagnosticTerminal('cancelled', run.profileVersion));
      } else {
        this.settleOnce(run, 'failed', diagnosticTerminal(reason, run.profileVersion));
      }
    } catch (error) {
      const code = errorCode(error) === 'tree_unsettled'
        ? 'tree_unsettled'
        : 'runtime_cleanup_failed';
      this.markDegraded(code);
      this.settleOnce(run, 'failed', diagnosticTerminal(code, run.profileVersion));
    }
    if (!run.settled) {
      this.settleOnce(run, 'failed', diagnosticTerminal(reason, run.profileVersion));
    }
    return run.terminalPromise;
  }

  private failureCode(error: unknown): DelegationFailureCode {
    const code = errorCode(error) ?? (error instanceof Error ? error.message : '');
    if (code === 'agent_protocol_drift') return 'agent_protocol_drift';
    if (code === 'adapter_unavailable') return 'adapter_unavailable';
    if (code === 'activation_failed') return 'activation_failed';
    if (code === 'stdin_failed') return 'stdin_failed';
    if (code === 'process_exit') return 'process_exit';
    if (code === 'tree_unsettled') return 'tree_unsettled';
    if (code === 'daemon_shutdown') return 'daemon_shutdown';
    if (code === 'route_lost') return 'route_lost';
    if (code === 'hold_failed') return 'hold_failed';
    if (code === 'hold_expired') return 'hold_expired';
    if (code === 'resume_failed') return 'resume_failed';
    return 'spawn_failed';
  }

  private markDegraded(code: 'tree_unsettled' | 'runtime_cleanup_failed'): void {
    this.accepting = false;
    if (this.degraded) return;
    this.degraded = true;
    try {
      this.dependencies.onDegraded?.(code);
    } catch {
      // The fail-closed latch is authoritative even if its owner cannot shut down cleanly.
    }
  }

  private requireResultEvent(run: DelegationRun): AgentEvent {
    const event = run.resultEvent as AgentEvent | null;
    if (!event) throw new Error('agent_protocol_drift');
    return event;
  }

  private settleOnce(
    run: DelegationRun,
    status: DelegationTerminalStatus,
    terminal: Readonly<Record<string, unknown>>,
  ): boolean {
    if (run.settled) return false;
    this.clearHoldTimer(run);
    run.settled = true;
    if (run.routeSignal && run.routeAbortListener) {
      run.routeSignal.removeEventListener('abort', run.routeAbortListener);
      run.routeAbortListener = null;
    }
    run.state = 'settled';
    const result = Object.freeze({
      delegationId: run.delegationId,
      status,
      terminal,
    });
    this.activeRuns.delete(run.delegationId);
    this.completedRuns.set(run.delegationId, result);
    while (this.completedRuns.size > COMPLETED_RUN_LIMIT) {
      const first = this.completedRuns.keys().next().value as string | undefined;
      if (!first) break;
      this.completedRuns.delete(first);
    }
    run.resolveTerminal(result);
    return true;
  }
}

export function createSpawnSupervisor(
  dependencies: SpawnSupervisorDependencies,
): SpawnSupervisor {
  return new ExactOnceSpawnSupervisor(dependencies);
}

export function createProductionSpawnSupervisor(
  options: ProductionSpawnSupervisorOptions,
): SpawnSupervisor {
  const platform = options.platform ?? process.platform;
  const runtimeFiles = createAgentRuntimeFiles({ platform });
  const inspector = createProcessInspector({ platform });
  const inspectProcessGroupStatus = createProcessGroupStatusInspector(platform);
  const terminator = createProcessTreeTerminator({ platform, inspector });
  const generation = randomUUID();
  const startupRecovery = createAgentStartupRecovery({
    runtimeFiles,
    inspector,
    terminator,
    terminationGrace: options.terminationGrace ?? 2_000,
    generation,
    now: () => Date.now(),
  });

  let supervisor: SpawnSupervisor | null = null;
  const registry = createProductionAdapterRegistry({
    kill: async (child, killOptions) => {
      const entry = supervisor?.journalEntryForChild(child) ?? null;
      if (!entry) throw new TreeUnsettledError();
      await terminator.stop(entry, child, killOptions);
    },
  });
  supervisor = createSpawnSupervisor({
    registry,
    runtimeFiles,
    inspector,
    terminator,
    startupRecovery,
    mintGeneration: () => generation,
    inspectProcessGroupStatus,
    endpoint: options.endpoint,
    ...(options.cwd ? { cwd: options.cwd } : {}),
    platform,
    ...(options.environment ? { environment: options.environment } : {}),
    terminationGrace: options.terminationGrace,
    onDegraded: options.onDegraded,
  });
  return supervisor;
}

export const DELEGATION_TASK_LIMIT_BYTES = TASK_LIMIT_BYTES;
export const DELEGATION_STDERR_LIMIT_BYTES = STDERR_LIMIT_BYTES;
export const DELEGATION_PROVIDER_KEY_NAMES = PROVIDER_KEY_NAMES;
export const DELEGATION_ACTIVE_STATUS_LIMIT = ACTIVE_STATUS_LIMIT;
export const DELEGATION_RECOVERY_STATUS_LIMIT = RECOVERY_STATUS_LIMIT;
