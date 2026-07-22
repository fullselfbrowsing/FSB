import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  execFile as nodeExecFile,
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request as nodeHttpRequest } from 'node:http';
import { dirname, isAbsolute, join } from 'node:path';
import { TextDecoder } from 'node:util';
import { z } from 'zod';
import type {
  AdapterDetection,
  AgentEvent,
  AgentProviderId,
  AgentProviderAdapter,
  AttestationDescriptor,
  ChildExit,
  DirectRuntimeReference,
  ProcessSpec,
  SpawnPrivateRuntime,
  SpawnRuntimeRole,
  SpawnRuntimeScope,
  SpawnSecretEnvBinding,
  SpawnSpec,
  SupervisedChild,
} from './adapter.js';
import {
  CLAUDE_CODE_ADAPTER_ID,
  OPENCODE_SERVER_PASSWORD_ENV_KEY,
  OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
  freezeSpawnSpec,
} from './adapter.js';
import {
  acceptedAgentIdentitiesEqual,
  acceptedIdentityFromDetection,
  validateAcceptedAgentIdentity,
  type AcceptedAgentIdentity,
} from './accepted-identity.js';
import {
  AGENT_PROTOCOL_DRIFT_REASONS,
  AgentProtocolDriftError,
  freezeAgentEvent,
  type AgentProtocolDriftReason,
} from './protocol-drift.js';
import type {
  AgentProviderRegistry,
  ProductionAdapterRegistryDependencies,
} from './registry.js';
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
  BoundedProcessProbeDescriptor,
  BoundedProcessProbeResult,
} from './process-probe.js';
import { runBoundedProcessProbe } from './process-probe.js';
import type {
  ProcessInspection,
  ProcessInspector,
  ProcessTreeTerminator,
} from './process-tree.js';
import { createArgvSignature, TreeUnsettledError } from './process-tree.js';
import { createProcessInspector, createProcessTreeTerminator } from './process-tree.js';
import {
  verifyPolicyAttestation,
} from './policy-attestation.js';
import {
  classifyEffectiveAuthority,
  classifyPreSpawnIdentityProbe,
  validateDirectRuntimeReference,
} from './effective-authority.js';
import {
  buildSanitizedAgentEnvironment,
  DELEGATION_AGENT_ENVIRONMENT_POLICY,
  DELEGATION_PROVIDER_KEY_NAMES as SOURCE_PINNED_PROVIDER_KEY_NAMES,
  type SanitizedAgentEnvironment,
} from './spawn-environment.js';
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
const OWNED_SERVER_SECRET_BYTES = 32;
const OWNED_SERVER_HEALTH_LIMIT_BYTES = 16 * 1024;
const OWNED_SERVER_HEALTH_PATH = '/global/health';
const OWNED_SERVER_BASIC_USERNAME = 'opencode';
const TASK_STDERR_FALLBACK_SENTINELS = Object.freeze([
  'agent "fsb" not found. Falling back to default agent',
  'agent "fsb" is a subagent, not a primary agent. Falling back to default agent',
] as const);

const DELEGATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const PROVIDER_KEY_NAMES = SOURCE_PINNED_PROVIDER_KEY_NAMES;

const START_REQUEST_KEYS = Object.freeze(['id', 'method', 'payload', 'type']);
const START_PAYLOAD_KEYS = Object.freeze(['acceptedIdentity', 'task']);
const CANCEL_PAYLOAD_KEYS = Object.freeze(['delegationId']);
const STATUS_PAYLOAD_KEYS = Object.freeze([]);

type DriftExpected =
  | 'bounded_jsonl'
  | 'known_event_shape'
  | 'single_init_session'
  | 'single_terminal_result'
  | 'adapter_contract';

type DriftObserved = AgentProtocolDriftReason | 'protocol_drift';

interface DriftTerminalDetail {
  readonly adapterId: AgentProviderId;
  readonly expected: DriftExpected;
  readonly observed: DriftObserved;
}

const DRIFT_LABEL_LIMIT = 64;
const DRIFT_EXPECTED_BY_REASON = Object.freeze({
  configuration_surface: 'known_event_shape',
  counter_overflow: 'bounded_jsonl',
  duplicate_id: 'known_event_shape',
  duplicate_init: 'single_init_session',
  duplicate_result: 'single_terminal_result',
  event_after_result: 'single_terminal_result',
  event_before_init: 'single_init_session',
  invalid_json: 'bounded_jsonl',
  invalid_order: 'known_event_shape',
  invalid_shape: 'known_event_shape',
  invalid_utf8: 'bounded_jsonl',
  line_too_large: 'bounded_jsonl',
  missing_result: 'single_terminal_result',
  provider_error: 'adapter_contract',
  session_mismatch: 'single_init_session',
  stream_too_large: 'bounded_jsonl',
  unknown_event_type: 'known_event_shape',
  unknown_stream_event: 'known_event_shape',
  unknown_system_subtype: 'known_event_shape',
} satisfies Readonly<Record<AgentProtocolDriftReason, DriftExpected>>);

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

export interface DelegationRouteLoss {
  readonly delegationId: string;
  readonly code: 'route_lost';
  readonly lostAt: number;
}

export interface DelegationStatus {
  readonly [key: string]: unknown;
  readonly generation: string;
  readonly active: readonly Readonly<{
    delegationId: string;
    state: 'running' | 'held' | 'stopping';
  }>[];
  readonly restartLosses: readonly DelegationRestartLoss[];
  readonly routeLosses: readonly DelegationRouteLoss[];
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

export type AgentProcessProbeDependency = (
  descriptor: BoundedProcessProbeDescriptor,
) => Promise<BoundedProcessProbeResult>;

export interface OwnedServerHttpRequestOptions {
  readonly hostname: '127.0.0.1';
  readonly port: number;
  readonly path: string;
  readonly method: 'GET';
  readonly timeout: number;
  readonly maximumBytes: number;
  readonly agent: false;
  readonly headers: Record<string, string>;
}

export interface OwnedServerHttpResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly body: Buffer;
}

export type OwnedServerHttpRequestDependency = (
  options: OwnedServerHttpRequestOptions,
) => Promise<OwnedServerHttpResponse>;

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
  readonly directRuntimeReference?: DirectRuntimeReference;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly environment?: NodeJS.ProcessEnv;
  readonly spawn?: AgentSpawnDependency;
  readonly processProbe?: AgentProcessProbeDependency;
  readonly randomBytes?: (size: number) => Buffer;
  readonly requestOwnedServer?: OwnedServerHttpRequestDependency;
  readonly wallNow?: () => number;
  readonly monotonicNow?: () => number;
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly mintDelegationId?: () => string;
  readonly mintFingerprint?: () => string;
  readonly mintRuntimeId?: (role: Exclude<SpawnRuntimeRole, 'delegation'>) => string;
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
  readonly directRuntimeReference?: DirectRuntimeReference;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly environment?: NodeJS.ProcessEnv;
  readonly terminationGrace?: number;
  readonly onDegraded?: SpawnSupervisorDependencies['onDegraded'];
  readonly runtimeRootPath?: string;
  readonly processSeams?: Readonly<{
    openCodeDetect?: ProductionAdapterRegistryDependencies['openCodeDetect'];
    codexDetect?: ProductionAdapterRegistryDependencies['codexDetect'];
    spawn?: AgentSpawnDependency;
    processProbe?: AgentProcessProbeDependency;
    inspector?: ProcessInspector;
    terminator?: ProcessTreeTerminator;
  }>;
  readonly networkSeams?: Readonly<{
    requestOwnedServer?: OwnedServerHttpRequestDependency;
  }>;
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
  readonly adapterId: AgentProviderId;
  readonly requestedIdentity: AcceptedAgentIdentity;
  readonly task: string;
  readonly emit: (event: ExtEvent) => void;
  readonly adapter: AgentProviderAdapter;
  acceptedIdentity: AcceptedAgentIdentity | null;
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
  replayClosed: boolean;
  taskWriteStarted: boolean;
  ownedServerLease: OwnedServerLease | null;
}

type OwnedServerTopology = Extract<SpawnSpec['topology'], { readonly kind: 'owned_server' }>;

interface OwnedServerLease {
  readonly topologyKey: string;
  readonly configurationDigest: string;
  readonly endpoint: string;
  readonly profileVersion: string;
  readonly secretRef: typeof OWNED_SERVER_BASIC_PASSWORD_SECRET_REF;
  readonly healthTimeoutMs: number;
  readonly entry: ActiveJournalEntry;
  readonly child: ChildProcessWithoutNullStreams;
  readonly supervisedChild: SupervisedChild;
  readonly activity: {
    activeCount: number;
    lastUse: number;
    idleTimeoutMs: number;
    idleTimer: unknown | null;
    idleToken: number;
    exited: boolean;
    retiring: boolean;
  };
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

function defaultOwnedServerHttpRequest(
  options: OwnedServerHttpRequestOptions,
): Promise<OwnedServerHttpResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (): void => {
      if (settled) return;
      settled = true;
      reject(new Error('activation_failed'));
    };
    const request = nodeHttpRequest({
      hostname: options.hostname,
      port: options.port,
      path: options.path,
      method: options.method,
      timeout: options.timeout,
      agent: options.agent,
      headers: options.headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer | string) => {
        if (settled) return;
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
        bytes += value.length;
        if (bytes > options.maximumBytes) {
          response.destroy();
          request.destroy();
          fail();
          return;
        }
        chunks.push(Buffer.from(value));
      });
      response.once('aborted', fail);
      response.once('error', fail);
      response.once('end', () => {
        if (settled) return;
        settled = true;
        const contentType = response.headers['content-type'];
        resolve(Object.freeze({
          statusCode: response.statusCode ?? 0,
          headers: Object.freeze({
            ...(contentType === undefined ? {} : { 'content-type': contentType }),
          }),
          body: Buffer.concat(chunks),
        }));
      });
    });
    request.once('timeout', () => {
      request.destroy();
      fail();
    });
    request.once('error', fail);
    request.end();
  });
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

function hasNoSecretBindings(bindings: readonly SpawnSecretEnvBinding[]): boolean {
  return Array.isArray(bindings) && bindings.length === 0;
}

function directProcessArguments(process: ProcessSpec): readonly string[] | null {
  if (!Array.isArray(process.argv) || process.argv.some((value) => typeof value !== 'string')) {
    return null;
  }
  return process.argv as readonly string[];
}

function exactOwnWireDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expectedKeys.length
      || keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) return null;
    const record: Record<string, unknown> = {};
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
      ) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function parseStartRequest(request: ExtRequest): {
  acceptedIdentity: AcceptedAgentIdentity;
  task: string;
} {
  const requestRecord = exactOwnWireDataRecord(request, START_REQUEST_KEYS);
  const payload = requestRecord?.payload;
  const payloadRecord = exactOwnWireDataRecord(payload, START_PAYLOAD_KEYS);
  const acceptedIdentity = validateAcceptedAgentIdentity(payloadRecord?.acceptedIdentity);
  const task = payloadRecord?.task;
  if (
    !requestRecord
    || requestRecord.type !== 'ext:request'
    || requestRecord.method !== 'delegate.start'
    || !payloadRecord
    || !acceptedIdentity
    || typeof task !== 'string'
    || task.length === 0
    || !isWellFormedText(task)
    || Buffer.byteLength(task, 'utf8') > TASK_LIMIT_BYTES
  ) throw new InvalidDelegationRequestError();
  return Object.freeze({ acceptedIdentity, task });
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
  detail?: DriftTerminalDetail,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: 'diagnostic',
    code,
    ...(profileVersion ? { profileVersion } : {}),
    ...(code === 'agent_protocol_drift'
      ? { detail: detail ?? driftTerminalDetail(null, CLAUDE_CODE_ADAPTER_ID) }
      : {}),
  });
}

function isBoundedDriftLabel(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= DRIFT_LABEL_LIMIT;
}

function driftTerminalDetail(
  error: unknown,
  adapterId: unknown,
): DriftTerminalDetail {
  let expected: DriftExpected = 'adapter_contract';
  let observed: DriftObserved = 'protocol_drift';
  const safeAdapterId = typeof adapterId === 'string'
    && Object.hasOwn(AGENT_PROTOCOL_DRIFT_REASONS, adapterId)
    ? adapterId as AgentProviderId
    : CLAUDE_CODE_ADAPTER_ID;

  if (error instanceof AgentProtocolDriftError) {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
    const reason = descriptor && 'value' in descriptor ? descriptor.value : null;
    if (
      isBoundedDriftLabel(reason)
      && Object.hasOwn(DRIFT_EXPECTED_BY_REASON, reason)
      && (AGENT_PROTOCOL_DRIFT_REASONS[safeAdapterId] as readonly AgentProtocolDriftReason[])
        .includes(reason as AgentProtocolDriftReason)
    ) {
      const typedReason = reason as AgentProtocolDriftReason;
      expected = DRIFT_EXPECTED_BY_REASON[typedReason];
      observed = typedReason;
    }
  }

  if (
    !isBoundedDriftLabel(expected)
    || !isBoundedDriftLabel(observed)
  ) {
    expected = 'adapter_contract';
    observed = 'protocol_drift';
  }
  return Object.freeze({
    adapterId: safeAdapterId,
    expected,
    observed,
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

function exactOwnDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length
    || keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
  ) return null;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
  }
  return value as Readonly<Record<string, unknown>>;
}

function ownDataValue(record: Readonly<Record<string, unknown>>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

class PolicyAttestationFailure extends Error {
  readonly code = 'adapter_unavailable' as const;

  constructor() {
    super('adapter_unavailable');
    this.name = 'PolicyAttestationFailure';
  }
}

class ExactOnceSpawnSupervisor implements SpawnSupervisor {
  readonly handleExtRequest: ExtRequestHandler;

  private readonly dependencies: SpawnSupervisorDependencies;
  private readonly activeRuns = new Map<string, DelegationRun>();
  private readonly completedRuns = new Map<string, RunTerminalResult>();
  private readonly entriesByPid = new Map<number, JournalEntry>();
  private readonly spawnChild: AgentSpawnDependency;
  private readonly processProbe: AgentProcessProbeDependency;
  private readonly randomSecretBytes: (size: number) => Buffer;
  private readonly requestOwnedServer: OwnedServerHttpRequestDependency;
  private readonly cwd: string;
  private readonly platform: NodeJS.Platform;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly wallNow: () => number;
  private readonly monotonicNow: () => number;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly mintDelegationId: () => string;
  private readonly mintFingerprint: () => string;
  private readonly mintRuntimeId: (role: Exclude<SpawnRuntimeRole, 'delegation'>) => string;
  private readonly generation: string;
  private readonly directRuntimeReference: DirectRuntimeReference | null;
  private readonly signalProcessGroup: NonNullable<SpawnSupervisorDependencies['signalProcessGroup']>;
  private readonly inspectProcessGroupStatus: ProcessGroupStatusInspector;
  private readonly schedule: NonNullable<SpawnSupervisorDependencies['schedule']>;
  private readonly clearScheduled: NonNullable<SpawnSupervisorDependencies['clearScheduled']>;
  private ownedServerLease: OwnedServerLease | null = null;
  private ownedServerWarmPromise: Promise<OwnedServerLease | null> | null = null;
  private ownedServerStopPromise: Promise<void> | null = null;
  private readonly ownedServerSecrets = new Map<string, Buffer>();
  private restartLosses: readonly DelegationRestartLoss[] = Object.freeze([]);
  private readonly routeLosses = new Map<string, DelegationRouteLoss>();
  private readonly terminationGrace: number;
  private readonly activationAttempts: number;
  private readonly allowSpawnOnPlatform: (platform: NodeJS.Platform) => boolean;
  private accepting = true;
  private degraded = false;
  private closePromise: Promise<SpawnSupervisorCloseResult> | null = null;

  constructor(dependencies: SpawnSupervisorDependencies) {
    const sanitizedEnvironment = buildSanitizedAgentEnvironment(
      dependencies.environment ?? process.env,
      Object.freeze({}),
      DELEGATION_AGENT_ENVIRONMENT_POLICY,
    );
    this.dependencies = Object.freeze({
      ...dependencies,
      environment: Object.freeze(sanitizedEnvironment),
    });
    this.spawnChild = dependencies.spawn ?? defaultSpawn;
    this.processProbe = dependencies.processProbe ?? runBoundedProcessProbe;
    this.randomSecretBytes = dependencies.randomBytes ?? randomBytes;
    this.requestOwnedServer = dependencies.requestOwnedServer ?? defaultOwnedServerHttpRequest;
    this.cwd = dependencies.cwd ?? process.cwd();
    this.platform = dependencies.platform ?? process.platform;
    this.environment = { ...sanitizedEnvironment };
    this.wallNow = dependencies.wallNow ?? (() => Date.now());
    this.monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
    this.wait = dependencies.wait ?? defaultWait;
    this.mintDelegationId = dependencies.mintDelegationId
      ?? (() => `delegation_${randomBytes(16).toString('base64url')}`);
    this.mintFingerprint = dependencies.mintFingerprint
      ?? (() => randomBytes(32).toString('base64url'));
    this.mintRuntimeId = dependencies.mintRuntimeId
      ?? ((role) => `${role}_${randomBytes(16).toString('base64url')}`);
    const directRuntimeReference = dependencies.directRuntimeReference === undefined
      ? null
      : validateDirectRuntimeReference(dependencies.directRuntimeReference);
    this.generation = directRuntimeReference?.generation
      ?? (dependencies.mintGeneration ?? randomUUID)();
    this.directRuntimeReference = directRuntimeReference === null
      ? null
      : validateDirectRuntimeReference(directRuntimeReference, this.generation);
    if (
      this.directRuntimeReference !== null
      && this.directRuntimeReference.endpoint !== dependencies.endpoint
    ) throw new TypeError('Direct runtime endpoint ownership is unavailable');
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
        return this.start(request.id, payload.task, payload.acceptedIdentity, emit, context);
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
    if (this.ownedServerWarmPromise) await this.ownedServerWarmPromise.catch(() => null);
    await this.stopOwnedServerLease();
    return Object.freeze({
      cancelled: results.filter((value) => value === 'cancelled').length,
      failed: results.filter((value) => value === 'failed').length,
      alreadySettled: results.filter((value) => value === 'alreadySettled').length,
    });
  }

  private async start(
    requestId: string,
    task: string,
    requestedIdentity: AcceptedAgentIdentity,
    emit: (event: ExtEvent) => void,
    context?: ExtRequestContext,
  ): Promise<Record<string, unknown>> {
    const delegationId = this.uniqueDelegationId();
    const adapterId = requestedIdentity.providerId;
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
      adapterId,
      requestedIdentity,
      task,
      emit,
      adapter,
      acceptedIdentity: null,
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
      replayClosed: false,
      taskWriteStarted: false,
      ownedServerLease: null,
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
      const detectedIdentity = acceptedIdentityFromDetection(run.adapterId, detection);
      if (!acceptedAgentIdentitiesEqual(run.requestedIdentity, detectedIdentity)) {
        throw new Error('adapter_unavailable');
      }
      run.acceptedIdentity = detectedIdentity;
      profileVersion = detection.profileVersion;
      run.profileVersion = profileVersion;
      this.throwIfStopped(run);

      const runtimeFingerprint = this.uniqueFingerprint();
      const paths = this.dependencies.runtimeFiles.pathsFor(run.delegationId);
      const runtimeScopes = Object.freeze([
        this.runtimeScope('delegation', run.delegationId),
        this.runtimeScope('provider_server', this.uniqueRuntimeId('provider_server')),
        this.runtimeScope('policy_preflight', this.uniqueRuntimeId('policy_preflight')),
      ]);
      if (new Set(runtimeScopes.map((scope) => scope.runtimeId)).size !== runtimeScopes.length) {
        throw new Error('Unable to mint private runtime identity');
      }
      run.runtimeOwned = true;
      const declaredSpec = await run.adapter.buildSpawn({ text: run.task }, {
        adapterId: run.adapterId,
        detection,
        delegationId: run.delegationId,
        runtimeFingerprint,
        cwd: this.cwd,
        privateMcpConfigPath: paths.mcpConfigPath,
        runtimeFiles: [paths.mcpConfigPath],
        runtimeScopes,
        ...(this.directRuntimeReference
          ? {
              directRuntimeReference: validateDirectRuntimeReference(
                this.directRuntimeReference,
                this.generation,
              ),
            }
          : {}),
      });
      this.throwIfStopped(run);
      const spec = freezeSpawnSpec(declaredSpec);
      this.validateSpawnSpec(run, detection, spec, runtimeScopes, paths.runDirectory);
      if (spec.preSpawnIdentityProbe !== undefined) run.runtimeOwned = false;
      let process: ProcessSpec;
      let argv: readonly string[];
      if (spec.topology.kind === 'direct') {
        process = this.requireDirectProcess(spec);
        const directArgv = directProcessArguments(process);
        if (!directArgv) throw new Error('adapter_unavailable');
        argv = directArgv;
      } else {
        await this.executePolicyAttestations(
          run,
          spec.attestations,
          'process_json',
          null,
          spec.privateRuntimes,
        );
        this.throwIfStopped(run);
        const selection = await this.selectOwnedServerTask(
          run,
          detection,
          spec.topology,
          spec.profileVersion,
          this.configurationDigest(spec),
          spec.attestations,
          spec.privateRuntimes,
        );
        process = selection.process;
        argv = selection.argv;
      }
      this.throwIfStopped(run);
      const argvSignature = createArgvSignature(process.command, argv);
      const environment = this.createEnvironment(process.fixedEnv, argvSignature);
      const directAuthorityBound = await this.executePreSpawnAuthorityBarrier(
        run,
        spec,
        process,
        environment,
      );
      this.throwIfStopped(run);
      const createdAt = this.wallNow();
      const delegationRuntime = this.privateRuntime(spec, 'delegation');
      const prepared = process.role === 'direct_task'
        ? directAuthorityBound
          ? await this.dependencies.runtimeFiles.prepareRun({
              role: 'direct',
              delegationId: run.delegationId,
              adapterId: run.adapterId,
              profileVersion,
              createdAt,
              binaryRealPath: process.command,
              argvSignature,
              fixedEnv: process.fixedEnv,
              envFingerprint: runtimeFingerprint,
              generation: this.generation,
              privateArtifacts: Object.freeze([]),
            })
          : await this.dependencies.runtimeFiles.prepareRun({
              delegationId: run.delegationId,
              adapterId: run.adapterId,
              profileVersion,
              createdAt,
              binaryRealPath: process.command,
              argvSignature,
              envFingerprint: runtimeFingerprint,
              generation: this.generation,
              endpoint: this.dependencies.endpoint,
            })
        : await this.dependencies.runtimeFiles.prepareRun({
            role: 'delegation',
            delegationId: run.delegationId,
            adapterId: run.adapterId,
            profileVersion,
            createdAt,
            binaryRealPath: process.command,
            argvSignature,
            fixedEnv: process.fixedEnv,
            envFingerprint: runtimeFingerprint,
            generation: this.generation,
            privateArtifacts: delegationRuntime?.privateArtifacts ?? Object.freeze([]),
          });
      run.entry = prepared.entry;
      run.runtimeOwned = true;
      this.throwIfStopped(run);

      const options: SpawnInvocationOptions = Object.freeze({
        shell: false,
        detached: true,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd,
        env: environment,
      });
      run.replayClosed = true;
      const child = process.spawnSecretEnvBindings.length === 0
        ? this.spawnChild(process.command, argv, options)
        : this.spawnWithSecretBindings(process, argv, options);
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
        stderr: this.drainStderr(child.stderr, true),
        closed: observed.closed,
      };
      await observed.ready;
      this.throwIfStopped(run);
      const identity = await this.resolveActivation(prepared.entry, supervisedChild.pid);
      this.throwIfStopped(run);
      const active = await this.dependencies.runtimeFiles.activateRun({
        ...(prepared.entry.role === 'direct' ? { role: 'direct' as const } : {}),
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
      await this.writeTask(run, process, child);
      await Promise.all([run.streams.parser, run.streams.stderr, run.streams.closed]);
      if (run.stopRequested) {
        run.resultEvent = null;
        return;
      }
      if (run.parserError) throw run.parserError;
      const resultEvent = this.takeResultEvent(run);
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
      validateNormalizedEvent(resultEvent);
      this.emitNormalizedEvent(run, resultEvent);
      this.settleOnce(run, 'succeeded', eventTerminal(resultEvent));
    } catch (error) {
      run.resultEvent = null;
      if (run.settled) return;
      if (run.stopRequested) return;
      const driftDetail = driftTerminalDetail(error, run.adapterId);
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
      this.settleOnce(
        run,
        'failed',
        diagnosticTerminal(
          code,
          profileVersion,
          code === 'agent_protocol_drift' ? driftDetail : undefined,
        ),
      );
    } finally {
      try {
        await this.releaseOwnedServerLease(run);
      } catch {
        this.markDegraded('runtime_cleanup_failed');
      } finally {
        run.resolveSetup();
      }
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
        && !this.routeLosses.has(value)
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

  private uniqueRuntimeId(role: Exclude<SpawnRuntimeRole, 'delegation'>): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const value = this.mintRuntimeId(role);
      if (
        DELEGATION_ID_PATTERN.test(value)
        && value !== this.ownedServerLease?.entry.delegationId
        && !this.activeRuns.has(value)
        && !this.completedRuns.has(value)
      ) return value;
    }
    throw new Error('Unable to mint private runtime identity');
  }

  private runtimeScope(role: SpawnRuntimeRole, runtimeId: string): SpawnRuntimeScope {
    const paths = this.dependencies.runtimeFiles.pathsFor(runtimeId);
    return Object.freeze({
      role,
      runtimeId,
      privateMcpConfigPath: paths.mcpConfigPath,
      runtimeFiles: Object.freeze([
        paths.opencodeConfigPath,
        paths.opencodeTestHomePath,
        paths.opencodeManagedConfigPath,
      ]),
    });
  }

  private privateRuntime(
    spec: SpawnSpec,
    role: SpawnRuntimeRole,
  ): SpawnPrivateRuntime | null {
    return spec.privateRuntimes?.find((runtime) => runtime.role === role) ?? null;
  }

  private requireDirectProcess(spec: SpawnSpec): ProcessSpec {
    if (
      !spec
      || typeof spec !== 'object'
      || spec.topology.kind !== 'direct'
      || spec.topology.task.role !== 'direct_task'
      || spec.topology.task.stdin !== 'task'
      || spec.topology.task.stdout !== 'agent_jsonl'
      || !hasNoSecretBindings(spec.topology.task.spawnSecretEnvBindings)
      || spec.attestations.length !== 0
    ) throw new Error('adapter_unavailable');
    return spec.topology.task;
  }

  private validateSpawnSpec(
    run: DelegationRun,
    detection: AdapterDetection & { binary: NonNullable<AdapterDetection['binary']> },
    spec: SpawnSpec,
    runtimeScopes: readonly SpawnRuntimeScope[],
    directScratchDirectory: string,
  ): void {
    const topologyProcesses = spec.topology.kind === 'direct'
      ? [spec.topology.task]
      : [spec.topology.server, spec.topology.coldTask, spec.topology.attachTask];
    const attestationProcesses = spec.attestations.flatMap((attestation) => (
      attestation.source === 'process_json' ? [attestation.process] : []
    ));
    const processes = [...topologyProcesses, ...attestationProcesses];
    const privateRuntimes = spec.privateRuntimes ?? Object.freeze([]);
    const descriptorBoundDirect = spec.preSpawnIdentityProbe !== undefined
      && spec.effectiveAuthorityAttestation !== undefined;
    const directTask = spec.topology.kind === 'direct' ? spec.topology.task : null;
    if (
      descriptorBoundDirect
      && (
        this.directRuntimeReference === null
        || directTask === null
        || directTask.privateFiles.length !== 0
        || privateRuntimes.length !== 0
      )
    ) throw new Error('adapter_unavailable');
    if (privateRuntimes.length > 0) {
      if (
        privateRuntimes.length !== runtimeScopes.length
        || privateRuntimes.some((runtime, index) => (
          runtime.role !== runtimeScopes[index].role
          || runtime.runtimeId !== runtimeScopes[index].runtimeId
          || JSON.stringify(runtime.privateFiles) !== JSON.stringify(runtimeScopes[index].runtimeFiles)
          || runtime.privateArtifacts.length === 0
        ))
        || processes.some((process) => {
          const role: SpawnRuntimeRole = process.role === 'owned_server'
            ? 'provider_server'
            : process.role === 'policy_preflight'
              ? 'policy_preflight'
              : 'delegation';
          const runtime = privateRuntimes.find((candidate) => candidate.role === role);
          return !runtime
            || JSON.stringify(process.privateFiles) !== JSON.stringify(runtime.privateFiles);
        })
      ) throw new Error('adapter_unavailable');
    }
    if (
      spec.adapterId !== run.adapterId
      || spec.profileVersion !== detection.profileVersion
      || processes.some((process) => (
        process.command !== detection.binary.command
        || process.cwd !== (
          descriptorBoundDirect && process === directTask
            ? directScratchDirectory
            : this.cwd
        )
        || !isPlainRecord(process.fixedEnv)
        || Object.keys(process.fixedEnv).some((key) => PROVIDER_KEY_NAMES.includes(
          key as typeof PROVIDER_KEY_NAMES[number],
        ))
      ))
    ) throw new Error('adapter_unavailable');
    const serialized = safeJson({
      topology: spec.topology,
      attestations: spec.attestations,
      privateRuntimes,
    });
    const sensitive = [run.task, ...PROVIDER_KEY_NAMES.map((name) => this.environment[name] ?? '')];
    if (!serialized || containsSensitiveValue(serialized, sensitive)) {
      throw new Error('adapter_unavailable');
    }
  }

  private requireOwnedServerTopology(topology: OwnedServerTopology): void {
    const serverBinding = topology.server.spawnSecretEnvBindings;
    const attachBinding = topology.attachTask.spawnSecretEnvBindings;
    if (
      topology.server.role !== 'owned_server'
      || topology.server.stdin !== 'none'
      || topology.server.stdout !== 'bounded_readiness'
      || topology.coldTask.role !== 'cold_task'
      || topology.coldTask.stdin !== 'task'
      || topology.coldTask.stdout !== 'agent_jsonl'
      || !hasNoSecretBindings(topology.coldTask.spawnSecretEnvBindings)
      || topology.attachTask.role !== 'attach_task'
      || topology.attachTask.stdin !== 'task'
      || topology.attachTask.stdout !== 'agent_jsonl'
      || serverBinding.length !== 1
      || serverBinding[0].envKey !== OPENCODE_SERVER_PASSWORD_ENV_KEY
      || serverBinding[0].secretRef !== OWNED_SERVER_BASIC_PASSWORD_SECRET_REF
      || attachBinding.length !== 1
      || attachBinding[0].envKey !== serverBinding[0].envKey
      || attachBinding[0].secretRef !== serverBinding[0].secretRef
    ) throw new Error('adapter_unavailable');
    const serverArgv = directProcessArguments(topology.server);
    const coldArgv = directProcessArguments(topology.coldTask);
    if (!serverArgv || serverArgv.length === 0 || !coldArgv || coldArgv.length === 0) {
      throw new Error('adapter_unavailable');
    }
  }

  private configurationDigest(spec: SpawnSpec): string {
    const serialized = safeJson(spec.attestations.map((attestation) => ({
      source: attestation.source,
      ...(attestation.source === 'owned_server_json'
        ? { method: attestation.method, path: attestation.path }
        : {}),
      assertions: attestation.assertions,
    })));
    if (!serialized) throw new Error('adapter_unavailable');
    return createHash('sha256').update(serialized, 'utf8').digest('hex');
  }

  private topologyKey(
    topology: OwnedServerTopology,
    profileVersion: string,
    configurationDigest: string,
  ): string {
    const serialized = safeJson({
      profileVersion,
      configurationDigest,
      server: {
        command: topology.server.command,
        argv: topology.server.argv,
      },
      attach: {
        command: topology.attachTask.command,
        argv: topology.attachTask.argv,
      },
      readiness: topology.readiness,
    });
    if (!serialized) throw new Error('adapter_unavailable');
    return createHash('sha256').update(serialized, 'utf8').digest('hex');
  }

  private resolveProcessArguments(process: ProcessSpec, endpoint: string | null): readonly string[] {
    const resolved = process.argv.map((argument) => {
      if (typeof argument === 'string') return argument;
      if (
        process.role !== 'attach_task'
        || argument.runtimeRef !== 'owned_server_endpoint'
        || endpoint === null
      ) throw new Error('adapter_unavailable');
      return endpoint;
    });
    if (resolved.length === 0) throw new Error('adapter_unavailable');
    return Object.freeze(resolved);
  }

  private async selectOwnedServerTask(
    run: DelegationRun,
    detection: AdapterDetection & {
      binary: NonNullable<AdapterDetection['binary']>;
      profileVersion: string;
      version: string;
    },
    topology: OwnedServerTopology,
    profileVersion: string,
    configurationDigest: string,
    attestations: readonly AttestationDescriptor[],
    privateRuntimes: readonly SpawnPrivateRuntime[] | undefined,
  ): Promise<Readonly<{ process: ProcessSpec; argv: readonly string[] }>> {
    this.requireOwnedServerTopology(topology);
    const topologyKey = this.topologyKey(topology, profileVersion, configurationDigest);
    const lease = await this.verifiedOwnedServerLease(topologyKey);
    if (lease && this.acquireOwnedServerLease(run, lease)) {
      return Object.freeze({
        process: topology.attachTask,
        argv: this.resolveProcessArguments(topology.attachTask, lease.endpoint),
      });
    }

    const selection = Object.freeze({
      process: topology.coldTask,
      argv: this.resolveProcessArguments(topology.coldTask, null),
    });
    try {
      await this.ensureOwnedServer(
        run,
        detection,
        topology,
        topologyKey,
        configurationDigest,
        attestations,
        privateRuntimes,
      );
    } catch (error) {
      if (error instanceof PolicyAttestationFailure) throw error;
    }
    return selection;
  }

  private async verifiedOwnedServerLease(topologyKey: string): Promise<OwnedServerLease | null> {
    const lease = this.ownedServerLease;
    const secret = lease ? this.ownedServerSecrets.get(lease.secretRef) : null;
    if (
      !lease
      || lease.topologyKey !== topologyKey
      || lease.entry.generation !== this.generation
      || !secret
      || secret.length < OWNED_SERVER_SECRET_BYTES
      || lease.activity.exited
      || lease.activity.retiring
    ) {
      if (lease) await this.retireOwnedServerLease(lease);
      return null;
    }
    let inspection: ProcessInspection;
    try {
      inspection = await this.dependencies.inspector.inspect(lease.entry);
    } catch {
      await this.retireOwnedServerLease(lease);
      return null;
    }
    if (inspection.classification === 'stale') {
      await this.retireOwnedServerLease(lease);
      return null;
    }
    if (
      inspection.classification !== 'confirmed'
      || inspection.process.pid !== lease.entry.pid
      || inspection.process.processGroupId !== lease.entry.processGroupId
      || inspection.process.processStartIdentity !== lease.entry.processStartIdentity
    ) {
      await this.retireOwnedServerLease(lease);
      return null;
    }
    try {
      await this.requireOwnedServerHealth(
        lease.endpoint,
        lease.secretRef,
        lease.profileVersion,
        lease.healthTimeoutMs,
      );
    } catch {
      await this.retireOwnedServerLease(lease);
      return null;
    }
    return lease;
  }

  private acquireOwnedServerLease(run: DelegationRun, lease: OwnedServerLease): boolean {
    if (
      this.ownedServerLease !== lease
      || this.ownedServerStopPromise
      || lease.activity.exited
      || lease.activity.retiring
    ) return false;
    this.clearOwnedServerIdle(lease);
    lease.activity.activeCount += 1;
    lease.activity.lastUse = this.monotonicNow();
    run.ownedServerLease = lease;
    return true;
  }

  private async releaseOwnedServerLease(run: DelegationRun): Promise<void> {
    const lease = run.ownedServerLease;
    if (!lease) return;
    run.ownedServerLease = null;
    if (lease.activity.activeCount < 1) throw new Error('runtime_cleanup_failed');
    lease.activity.activeCount -= 1;
    lease.activity.lastUse = this.monotonicNow();
    if (lease.activity.activeCount !== 0) return;
    if (
      lease.activity.retiring
      || lease.activity.exited
      || !this.accepting
    ) {
      if (this.ownedServerLease === lease) await this.stopOwnedServerLease();
      return;
    }
    this.armOwnedServerIdle(lease);
  }

  private async executePolicyAttestations(
    run: DelegationRun,
    descriptors: readonly AttestationDescriptor[],
    source: AttestationDescriptor['source'],
    endpoint: string | null,
    privateRuntimes: readonly SpawnPrivateRuntime[] | undefined,
  ): Promise<void> {
    for (const descriptor of descriptors) {
      if (descriptor.source !== source) continue;
      try {
        let document: unknown;
        if (descriptor.source === 'process_json') {
          document = await this.executeProcessJsonAttestation(
            run,
            descriptor,
            privateRuntimes?.find((runtime) => runtime.role === 'policy_preflight') ?? null,
          );
        } else if (descriptor.source === 'owned_server_json') {
          if (endpoint === null) throw new PolicyAttestationFailure();
          document = await this.executeOwnedServerJsonAttestation(endpoint, descriptor);
        } else {
          throw new PolicyAttestationFailure();
        }
        const verdict = verifyPolicyAttestation(document, descriptor.assertions);
        document = null;
        if (!Object.isFrozen(verdict) || !verdict.pass) {
          throw new PolicyAttestationFailure();
        }
      } catch (error) {
        if (error instanceof TreeUnsettledError) throw error;
        if (error instanceof PolicyAttestationFailure) throw error;
        throw new PolicyAttestationFailure();
      }
    }
  }

  private async executeProcessJsonAttestation(
    run: DelegationRun,
    descriptor: Extract<AttestationDescriptor, { source: 'process_json' }>,
    privateRuntime: SpawnPrivateRuntime | null,
  ): Promise<unknown> {
    const process = descriptor.process;
    const argv = directProcessArguments(process);
    if (
      process.role !== 'policy_preflight'
      || process.stdin !== 'none'
      || process.stdout !== 'bounded_json'
      || !hasNoSecretBindings(process.spawnSecretEnvBindings)
      || !argv
      || argv.length === 0
      || descriptor.assertions.length === 0
    ) throw new PolicyAttestationFailure();

    const argvSignature = createArgvSignature(process.command, argv);
    const runtimeFingerprint = this.uniqueFingerprint();
    const environment = this.createEnvironment(process.fixedEnv, argvSignature);
    environment.FSB_AGENT_FINGERPRINT = runtimeFingerprint;
    const options: SpawnInvocationOptions = Object.freeze({
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd,
      env: environment,
    });
    const createdAt = this.wallNow();
    const runtimeId = privateRuntime?.runtimeId ?? this.uniqueRuntimeId('policy_preflight');
    let entry: JournalEntry | null = null;
    let child: ChildProcessWithoutNullStreams | null = null;
    let supervisedChild: SupervisedChild | null = null;
    let body: Buffer | null = null;
    let treeStopAttempted = false;
    let treeSettled = false;
    let runtimePrepared = false;
    let runtimeRemoved = false;
    try {
      const prepared = await this.dependencies.runtimeFiles.prepareRun({
        role: 'policy_preflight',
        delegationId: runtimeId,
        adapterId: run.adapterId,
        profileVersion: run.profileVersion,
        createdAt,
        binaryRealPath: process.command,
        argvSignature,
        fixedEnv: process.fixedEnv,
        envFingerprint: runtimeFingerprint,
        generation: this.generation,
        privateArtifacts: privateRuntime?.privateArtifacts ?? Object.freeze([]),
      });
      entry = prepared.entry;
      runtimePrepared = true;
      child = this.spawnChild(process.command, argv, options);
      if (!Number.isSafeInteger(child.pid) || (child.pid ?? 0) < 1) {
        throw new PolicyAttestationFailure();
      }
      const observed = observeChild(child);
      supervisedChild = Object.freeze({
        pid: child.pid!,
        processGroupId: child.pid!,
        platform: this.platform,
        closed: observed.closed,
      });
      this.entriesByPid.set(supervisedChild.pid, entry);
      const stdout = this.readBoundedStream(child.stdout, descriptor.maxBytes);
      const stderr = this.readBoundedStream(child.stderr, STDERR_LIMIT_BYTES);
      await observed.ready;
      const ignoreStdinError = (): void => undefined;
      child.stdin.once('error', ignoreStdinError);
      try {
        child.stdin.end();
      } catch {
        child.stdin.off('error', ignoreStdinError);
        throw new PolicyAttestationFailure();
      }
      const identity = await this.resolveActivation(entry as PreparedJournalEntry, supervisedChild.pid);
      entry = await this.dependencies.runtimeFiles.activateRun({
        role: 'policy_preflight',
        delegationId: runtimeId,
        pid: supervisedChild.pid,
        processGroupId: identity.process.processGroupId,
        startedAt: Math.max(createdAt, this.wallNow()),
        processStartIdentity: identity.process.processStartIdentity,
      });
      this.entriesByPid.set(supervisedChild.pid, entry);
      const [boundedBody, discardedStderr, exit] = await this.withDeadline(
        Promise.all([stdout, stderr, observed.closed]),
        descriptor.timeoutMs,
      );
      discardedStderr.fill(0);
      child.stdin.off('error', ignoreStdinError);
      if (exit.code !== 0 || exit.signal !== null) throw new PolicyAttestationFailure();
      body = boundedBody;
      treeStopAttempted = true;
      try {
        await this.dependencies.terminator.stop(
          entry,
          supervisedChild,
          { grace: this.terminationGrace },
        );
        treeSettled = true;
      } catch {
        this.markDegraded('tree_unsettled');
        throw new TreeUnsettledError();
      }
      await this.dependencies.runtimeFiles.removeRun({
        delegationId: runtimeId,
        role: 'policy_preflight',
      });
      runtimeRemoved = true;
      return this.parseJsonDocument(body);
    } catch (error) {
      if (!treeStopAttempted && entry && supervisedChild) {
        treeStopAttempted = true;
        try {
          await this.dependencies.terminator.stop(
            entry,
            supervisedChild,
            { grace: this.terminationGrace },
          );
          treeSettled = true;
        } catch {
          this.markDegraded('tree_unsettled');
          throw new TreeUnsettledError();
        }
      }
      if (runtimePrepared && treeSettled && !runtimeRemoved) {
        try {
          await this.dependencies.runtimeFiles.removeRun({
            delegationId: runtimeId,
            role: 'policy_preflight',
          });
          runtimeRemoved = true;
        } catch {
          this.markDegraded('runtime_cleanup_failed');
        }
      } else if (runtimePrepared && !supervisedChild) {
        try {
          await this.dependencies.runtimeFiles.removeRun({
            delegationId: runtimeId,
            role: 'policy_preflight',
          });
          runtimeRemoved = true;
        } catch {
          this.markDegraded('runtime_cleanup_failed');
        }
      }
      if (error instanceof TreeUnsettledError) throw error;
      throw new PolicyAttestationFailure();
    } finally {
      if (body) body.fill(0);
      if (supervisedChild && (!runtimePrepared || runtimeRemoved)) {
        this.entriesByPid.delete(supervisedChild.pid);
      }
    }
  }

  private async executeOwnedServerJsonAttestation(
    endpoint: string,
    descriptor: Extract<AttestationDescriptor, { source: 'owned_server_json' }>,
  ): Promise<unknown> {
    if (
      descriptor.method !== 'GET'
      || descriptor.secretRef !== OWNED_SERVER_BASIC_PASSWORD_SECRET_REF
      || descriptor.assertions.length === 0
    ) throw new PolicyAttestationFailure();
    const secret = this.ownedServerSecrets.get(descriptor.secretRef);
    if (!secret || secret.length < OWNED_SERVER_SECRET_BYTES) {
      throw new PolicyAttestationFailure();
    }
    const parsed = new URL(endpoint);
    const port = Number(parsed.port);
    if (
      parsed.protocol !== 'http:'
      || parsed.hostname !== '127.0.0.1'
      || parsed.pathname !== '/'
      || parsed.search !== ''
      || parsed.hash !== ''
      || parsed.username !== ''
      || parsed.password !== ''
      || !Number.isSafeInteger(port)
      || port < 1
      || port > 65_535
    ) throw new PolicyAttestationFailure();

    let password: string | null = secret.toString('base64url');
    const credentialBytes = Buffer.from(
      `${OWNED_SERVER_BASIC_USERNAME}:${password}`,
      'utf8',
    );
    let authorization: string | null = `Basic ${credentialBytes.toString('base64')}`;
    credentialBytes.fill(0);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: authorization,
    };
    const requestOptions: OwnedServerHttpRequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: descriptor.path,
      method: 'GET',
      timeout: descriptor.timeoutMs,
      maximumBytes: descriptor.maxBytes,
      agent: false,
      headers,
    };
    let body: Buffer | null = null;
    try {
      const response = await this.withDeadline(
        this.requestOwnedServer(requestOptions),
        descriptor.timeoutMs,
      );
      const responseRecord = exactOwnDataRecord(response, ['statusCode', 'headers', 'body']);
      if (!responseRecord) throw new PolicyAttestationFailure();
      const responseHeaders = exactOwnDataRecord(
        ownDataValue(responseRecord, 'headers'),
        ['content-type'],
      );
      const responseBody = ownDataValue(responseRecord, 'body');
      const contentType = responseHeaders
        ? ownDataValue(responseHeaders, 'content-type')
        : null;
      if (
        ownDataValue(responseRecord, 'statusCode') !== 200
        || typeof contentType !== 'string'
        || !/^application\/json(?:\s*;.*)?$/i.test(contentType)
        || !Buffer.isBuffer(responseBody)
        || responseBody.length > descriptor.maxBytes
      ) throw new PolicyAttestationFailure();
      body = Buffer.from(responseBody);
      return this.parseJsonDocument(body);
    } catch (error) {
      if (error instanceof PolicyAttestationFailure) throw error;
      throw new PolicyAttestationFailure();
    } finally {
      if (body) body.fill(0);
      headers.Authorization = '';
      delete headers.Authorization;
      authorization = null;
      password = null;
    }
  }

  private async readBoundedStream(
    stream: NodeJS.ReadableStream,
    maximumBytes: number,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for await (const chunk of stream as AsyncIterable<Buffer | string>) {
        const value = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, 'utf8');
        bytes += value.length;
        if (bytes > maximumBytes) {
          value.fill(0);
          throw new PolicyAttestationFailure();
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks, bytes);
    } finally {
      for (const chunk of chunks) chunk.fill(0);
    }
  }

  private parseJsonDocument(bytes: Buffer): unknown {
    let text: string | null = null;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return JSON.parse(text) as unknown;
    } catch {
      throw new PolicyAttestationFailure();
    } finally {
      bytes.fill(0);
      text = null;
    }
  }

  private withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: unknown = null;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = this.schedule(() => reject(new PolicyAttestationFailure()), timeoutMs);
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        try {
          (timer as { unref?: () => void }).unref?.();
        } catch {
          // The policy deadline remains authoritative when unref is unavailable.
        }
      }
    });
    return Promise.race([operation, timeout]).finally(() => {
      if (timer !== null) this.clearScheduled(timer);
    });
  }

  private createEnvironment(
    fixedEnv: Readonly<Record<string, string>>,
    argvSignature: string,
  ): SanitizedAgentEnvironment {
    return buildSanitizedAgentEnvironment(
      this.environment,
      fixedEnv,
      {
        inheritedAllowRules: DELEGATION_AGENT_ENVIRONMENT_POLICY.inheritedAllowRules,
        strippedKeys: DELEGATION_AGENT_ENVIRONMENT_POLICY.strippedKeys,
        forcedValues: Object.freeze({
          ...DELEGATION_AGENT_ENVIRONMENT_POLICY.forcedValues,
          FSB_AGENT_ARGV_SIGNATURE: argvSignature,
        }),
      },
    );
  }

  private async executePreSpawnAuthorityBarrier(
    run: DelegationRun,
    spec: SpawnSpec,
    process: ProcessSpec,
    environment: SanitizedAgentEnvironment,
  ): Promise<boolean> {
    const identityDescriptor = spec.preSpawnIdentityProbe;
    const authorityDescriptor = spec.effectiveAuthorityAttestation;
    if (identityDescriptor === undefined && authorityDescriptor === undefined) return false;
    if (
      identityDescriptor === undefined
      || authorityDescriptor === undefined
      || run.acceptedIdentity === null
      || identityDescriptor.expectedAuthState !== run.acceptedIdentity.authState
      || this.directRuntimeReference === null
    ) throw new PolicyAttestationFailure();
    const directRuntime = validateDirectRuntimeReference(
      this.directRuntimeReference,
      this.generation,
    );

    let identityResult: BoundedProcessProbeResult | null = null;
    try {
      identityResult = await this.processProbe(Object.freeze({
        command: process.command,
        argv: identityDescriptor.argv,
        cwd: this.cwd,
        environment,
        timeoutMs: identityDescriptor.timeoutMs,
        stdoutLimitBytes: identityDescriptor.stdoutLimitBytes,
        stderrLimitBytes: identityDescriptor.stderrLimitBytes,
        ...(run.routeSignal ? { signal: run.routeSignal } : {}),
      }));
      const classification = classifyPreSpawnIdentityProbe(
        identityResult,
        identityDescriptor,
      );
      if (
        !Object.isFrozen(classification)
        || !classification.matched
        || classification.authState !== identityDescriptor.expectedAuthState
        || classification.authState !== run.acceptedIdentity.authState
      ) throw new PolicyAttestationFailure();
      const freshIdentity = acceptedIdentityFromDetection(run.adapterId, {
        authState: classification.authState,
        profileVersion: run.acceptedIdentity.profileVersion,
      });
      if (!acceptedAgentIdentitiesEqual(freshIdentity, run.acceptedIdentity)) {
        throw new PolicyAttestationFailure();
      }
    } catch (error) {
      if (error instanceof PolicyAttestationFailure) throw error;
      throw new PolicyAttestationFailure();
    } finally {
      identityResult?.zeroize();
    }

    let authorityResult: BoundedProcessProbeResult | null = null;
    let document: unknown = null;
    try {
      authorityResult = await this.processProbe(Object.freeze({
        command: process.command,
        argv: authorityDescriptor.argv,
        cwd: this.cwd,
        environment,
        timeoutMs: authorityDescriptor.timeoutMs,
        stdoutLimitBytes: authorityDescriptor.stdoutLimitBytes,
        stderrLimitBytes: authorityDescriptor.stderrLimitBytes,
        ...(run.routeSignal ? { signal: run.routeSignal } : {}),
      }));
      if (
        authorityResult.exit.code !== 0
        || authorityResult.exit.signal !== null
        || authorityResult.stderr.length !== 0
      ) throw new PolicyAttestationFailure();
      document = this.parseJsonDocument(authorityResult.stdout);
      const classification = classifyEffectiveAuthority(
        document,
        authorityDescriptor,
        directRuntime,
      );
      document = null;
      if (!Object.isFrozen(classification) || !classification.pass) {
        throw new PolicyAttestationFailure();
      }
    } catch (error) {
      if (error instanceof PolicyAttestationFailure) throw error;
      throw new PolicyAttestationFailure();
    } finally {
      document = null;
      authorityResult?.zeroize();
    }
    return true;
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
            run.resultEvent = freezeAgentEvent('result', event.sessionId, { ...event.payload });
          } else {
            this.publishOrBuffer(run, event, serialized);
          }
        }
        if (!run.resultEvent) throw new Error('agent_protocol_drift');
      } catch (error) {
        run.parserError = error;
        if (run.authorityGranted && run.child && run.entry && !run.terminationPromise) {
          void this.terminateAndCleanup(run).catch(() => undefined);
        }
      }
    })();
  }

  private async drainStderr(
    stream: NodeJS.ReadableStream,
    detectTaskFallback = false,
  ): Promise<void> {
    const sentinels = detectTaskFallback
      ? TASK_STDERR_FALLBACK_SENTINELS.map((value) => Buffer.from(value, 'utf8'))
      : [];
    const retainedLimit = sentinels.reduce(
      (maximum, sentinel) => Math.max(maximum, sentinel.length - 1),
      0,
    );
    let retained = Buffer.alloc(0);
    try {
      for await (const chunk of stream as AsyncIterable<Buffer | string>) {
        const value = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, 'utf8');
        try {
          for (let offset = 0; offset < value.length; offset += 4096) {
            const block = value.subarray(offset, Math.min(value.length, offset + 4096));
            const candidate = Buffer.concat([retained, block]);
            try {
              if (sentinels.some((sentinel) => candidate.indexOf(sentinel) >= 0)) {
                throw new Error('agent_protocol_drift');
              }
              retained.fill(0);
              retained = retainedLimit > 0
                ? Buffer.from(candidate.subarray(Math.max(0, candidate.length - retainedLimit)))
                : Buffer.alloc(0);
            } finally {
              candidate.fill(0);
            }
          }
        } finally {
          value.fill(0);
        }
      }
    } finally {
      retained.fill(0);
      for (const sentinel of sentinels) sentinel.fill(0);
    }
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
    const acceptedIdentity = run.acceptedIdentity;
    if (
      !acceptedIdentity
      || acceptedIdentity.providerId !== entry.adapterId
      || acceptedIdentity.profileVersion !== entry.profileVersion
    ) throw new Error('adapter_unavailable');
    try {
      run.emit({
        id: run.requestId,
        type: 'ext:event',
        event: 'delegation.started',
        payload: {
          delegationId: run.delegationId,
          acceptedIdentity,
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

  private async writeTask(
    run: DelegationRun,
    process: ProcessSpec,
    child: ChildProcessWithoutNullStreams,
  ): Promise<void> {
    if (
      !run.replayClosed
      || run.taskWriteStarted
      || run.child !== child
      || process.stdin !== 'task'
      || process.stdout !== 'agent_jsonl'
      || !['direct_task', 'cold_task', 'attach_task'].includes(process.role)
    ) throw new Error('stdin_failed');
    run.taskWriteStarted = true;
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
        const accepted = child.stdin.write(run.task, 'utf8', (error?: Error | null) => {
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

  private mintOwnedServerSecret(
    secretRef: typeof OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
  ): void {
    if (this.ownedServerSecrets.has(secretRef)) throw new Error('adapter_unavailable');
    const generated = this.randomSecretBytes(OWNED_SERVER_SECRET_BYTES);
    if (
      !Buffer.isBuffer(generated)
      || generated.length < OWNED_SERVER_SECRET_BYTES
      || generated.length > 256
    ) throw new Error('adapter_unavailable');
    const retained = Buffer.from(generated);
    generated.fill(0);
    this.ownedServerSecrets.set(secretRef, retained);
  }

  private clearOwnedServerSecret(secretRef: string): void {
    const secret = this.ownedServerSecrets.get(secretRef);
    if (secret) secret.fill(0);
    this.ownedServerSecrets.delete(secretRef);
  }

  private spawnWithSecretBindings(
    process: ProcessSpec,
    argv: readonly string[],
    options: SpawnInvocationOptions,
  ): ChildProcessWithoutNullStreams {
    const binding = process.spawnSecretEnvBindings[0];
    if (
      process.spawnSecretEnvBindings.length !== 1
      || !binding
      || binding.envKey !== OPENCODE_SERVER_PASSWORD_ENV_KEY
      || binding.secretRef !== OWNED_SERVER_BASIC_PASSWORD_SECRET_REF
    ) throw new Error('adapter_unavailable');
    const secret = this.ownedServerSecrets.get(binding.secretRef);
    if (!secret || secret.length < OWNED_SERVER_SECRET_BYTES) {
      throw new Error('adapter_unavailable');
    }
    let password: string | null = secret.toString('base64url');
    try {
      options.env[binding.envKey] = password;
      return this.spawnChild(process.command, argv, options);
    } finally {
      options.env[binding.envKey] = '';
      delete options.env[binding.envKey];
      password = null;
    }
  }

  private async requireOwnedServerHealth(
    endpoint: string,
    secretRef: typeof OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
    expectedVersion: string,
    timeoutMs: number,
  ): Promise<void> {
    const secret = this.ownedServerSecrets.get(secretRef);
    if (!secret || secret.length < OWNED_SERVER_SECRET_BYTES) {
      throw new Error('activation_failed');
    }
    const parsed = new URL(endpoint);
    const port = Number(parsed.port);
    if (
      parsed.protocol !== 'http:'
      || parsed.hostname !== '127.0.0.1'
      || parsed.pathname !== '/'
      || parsed.search !== ''
      || parsed.hash !== ''
      || parsed.username !== ''
      || parsed.password !== ''
      || !Number.isSafeInteger(port)
      || port < 1
      || port > 65_535
    ) throw new Error('activation_failed');

    let password: string | null = secret.toString('base64url');
    const credentialBytes = Buffer.from(
      `${OWNED_SERVER_BASIC_USERNAME}:${password}`,
      'utf8',
    );
    let authorization: string | null = `Basic ${credentialBytes.toString('base64')}`;
    credentialBytes.fill(0);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: authorization,
    };
    const requestOptions: OwnedServerHttpRequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: OWNED_SERVER_HEALTH_PATH,
      method: 'GET',
      timeout: timeoutMs,
      maximumBytes: OWNED_SERVER_HEALTH_LIMIT_BYTES,
      agent: false,
      headers,
    };
    try {
      const response = await this.requestOwnedServer(requestOptions);
      const contentType = response.headers['content-type'];
      if (
        response.statusCode !== 200
        || typeof contentType !== 'string'
        || !/^application\/json(?:\s*;.*)?$/i.test(contentType)
        || !Buffer.isBuffer(response.body)
        || response.body.length > OWNED_SERVER_HEALTH_LIMIT_BYTES
      ) throw new Error('activation_failed');
      const body = Buffer.from(response.body);
      try {
        const document = JSON.parse(body.toString('utf8')) as unknown;
        if (
          !isPlainRecord(document)
          || !exactKeys(document, ['healthy', 'version'])
          || document.healthy !== true
          || document.version !== expectedVersion
        ) throw new Error('activation_failed');
      } finally {
        body.fill(0);
      }
    } catch {
      throw new Error('activation_failed');
    } finally {
      headers.Authorization = '';
      delete headers.Authorization;
      authorization = null;
      password = null;
    }
  }

  private ensureOwnedServer(
    run: DelegationRun,
    detection: AdapterDetection & {
      binary: NonNullable<AdapterDetection['binary']>;
      profileVersion: string;
      version: string;
    },
    topology: OwnedServerTopology,
    topologyKey: string,
    configurationDigest: string,
    attestations: readonly AttestationDescriptor[],
    privateRuntimes: readonly SpawnPrivateRuntime[] | undefined,
  ): Promise<OwnedServerLease | null> {
    const retained = this.ownedServerLease;
    if (
      retained?.topologyKey === topologyKey
      && !retained.activity.exited
      && !retained.activity.retiring
    ) {
      return Promise.resolve(retained);
    }
    if (this.ownedServerWarmPromise) return this.ownedServerWarmPromise;
    const operation = (async (): Promise<OwnedServerLease | null> => {
      const stopping = this.ownedServerStopPromise;
      if (stopping) {
        try {
          await stopping;
        } catch {
          return null;
        }
      }
      if (!this.accepting || this.ownedServerLease) return null;
      return this.startOwnedServer(
        run,
        detection,
        topology,
        topologyKey,
        configurationDigest,
        attestations,
        privateRuntimes,
      );
    })();
    this.ownedServerWarmPromise = operation;
    void operation.then(() => {
      if (this.ownedServerWarmPromise === operation) this.ownedServerWarmPromise = null;
    }, () => {
      if (this.ownedServerWarmPromise === operation) this.ownedServerWarmPromise = null;
    });
    return operation;
  }

  private async startOwnedServer(
    run: DelegationRun,
    detection: AdapterDetection & {
      binary: NonNullable<AdapterDetection['binary']>;
      profileVersion: string;
      version: string;
    },
    topology: OwnedServerTopology,
    topologyKey: string,
    configurationDigest: string,
    attestations: readonly AttestationDescriptor[],
    privateRuntimes: readonly SpawnPrivateRuntime[] | undefined,
  ): Promise<OwnedServerLease | null> {
    const process = topology.server;
    const binding = process.spawnSecretEnvBindings[0];
    if (!binding) return null;
    const secretRef = binding.secretRef;
    const argv = this.resolveProcessArguments(process, null);
    const providerRuntime = privateRuntimes?.find(
      (runtime) => runtime.role === 'provider_server',
    ) ?? null;
    const serverId = providerRuntime?.runtimeId
      ?? `provider_server_${randomBytes(16).toString('base64url')}`;
    const runtimeFingerprint = this.uniqueFingerprint();
    const fixedEnv = Object.freeze({
      ...process.fixedEnv,
      FSB_AGENT_FINGERPRINT: runtimeFingerprint,
    });
    const argvSignature = createArgvSignature(process.command, argv);
    const createdAt = this.wallNow();
    let entry: JournalEntry | null = null;
    let child: ChildProcessWithoutNullStreams | null = null;
    let supervisedChild: SupervisedChild | null = null;
    try {
      this.mintOwnedServerSecret(secretRef);
      const prepared = await this.dependencies.runtimeFiles.prepareRun({
        role: 'provider_server',
        delegationId: serverId,
        adapterId: run.adapterId,
        profileVersion: detection.profileVersion,
        createdAt,
        binaryRealPath: process.command,
        argvSignature,
        fixedEnv,
        envFingerprint: runtimeFingerprint,
        generation: this.generation,
        privateArtifacts: providerRuntime?.privateArtifacts ?? Object.freeze([]),
      });
      entry = prepared.entry;
      const environment = this.createEnvironment(fixedEnv, argvSignature);
      const options: SpawnInvocationOptions = Object.freeze({
        shell: false,
        detached: true,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd,
        env: environment,
      });
      child = this.spawnWithSecretBindings(process, argv, options);
      if (!Number.isSafeInteger(child.pid) || (child.pid ?? 0) < 1) {
        throw new Error('spawn_failed');
      }
      const observed = observeChild(child);
      supervisedChild = Object.freeze({
        pid: child.pid!,
        processGroupId: child.pid!,
        platform: this.platform,
        closed: observed.closed,
      });
      this.entriesByPid.set(supervisedChild.pid, prepared.entry);
      const readiness = this.readOwnedServerReadiness(
        child.stdout,
        observed.closed,
        topology.readiness,
      );
      void readiness.catch(() => undefined);
      const stderr = this.drainStderr(child.stderr);
      void stderr.catch(() => undefined);
      await observed.ready;
      const identity = await this.resolveActivation(prepared.entry, supervisedChild.pid);
      const active = await this.dependencies.runtimeFiles.activateRun({
        role: 'provider_server',
        delegationId: serverId,
        pid: supervisedChild.pid,
        processGroupId: identity.process.processGroupId,
        startedAt: Math.max(createdAt, this.wallNow()),
        processStartIdentity: identity.process.processStartIdentity,
      });
      entry = active;
      this.entriesByPid.set(supervisedChild.pid, active);
      const endpoint = await readiness;
      await this.requireOwnedServerHealth(
        endpoint,
        secretRef,
        detection.profileVersion,
        topology.readiness.timeoutMs,
      );
      const retained = await this.dependencies.inspector.inspect(active);
      if (
        retained.classification !== 'confirmed'
        || retained.process.pid !== active.pid
        || retained.process.processGroupId !== active.processGroupId
        || retained.process.processStartIdentity !== active.processStartIdentity
      ) throw new Error('activation_failed');
      await this.executePolicyAttestations(
        run,
        attestations,
        'owned_server_json',
        endpoint,
        privateRuntimes,
      );
      if (!this.accepting) throw new Error('daemon_shutdown');
      child.stdout.resume();
      const lease = Object.freeze({
        topologyKey,
        configurationDigest,
        endpoint,
        profileVersion: detection.profileVersion,
        secretRef,
        healthTimeoutMs: topology.readiness.timeoutMs,
        entry: active,
        child,
        supervisedChild,
        activity: {
          activeCount: 0,
          lastUse: this.monotonicNow(),
          idleTimeoutMs: topology.idle.timeoutMs,
          idleTimer: null,
          idleToken: 0,
          exited: false,
          retiring: false,
        },
      });
      this.ownedServerLease = lease;
      void observed.closed.then(() => this.handleOwnedServerExit(lease));
      this.armOwnedServerIdle(lease);
      return lease;
    } catch (error) {
      if (entry) {
        try {
          await this.dependencies.terminator.stop(
            entry,
            supervisedChild,
            { grace: this.terminationGrace },
          );
          await this.dependencies.runtimeFiles.removeRun({
            delegationId: entry.delegationId,
            role: 'provider_server',
          });
        } catch {
          this.markDegraded('tree_unsettled');
        }
      }
      if (supervisedChild) this.entriesByPid.delete(supervisedChild.pid);
      this.clearOwnedServerSecret(secretRef);
      if (error instanceof PolicyAttestationFailure) throw error;
      return null;
    }
  }

  private readOwnedServerReadiness(
    stream: NodeJS.ReadableStream,
    closed: Promise<ChildExit>,
    policy: OwnedServerTopology['readiness'],
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let pending = '';
      let settled = false;
      let timer: unknown = null;
      const cleanup = (): void => {
        stream.off('data', onData);
        stream.off('error', onFailure);
        stream.off('end', onFailure);
        if (timer !== null) this.clearScheduled(timer);
      };
      const fail = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('activation_failed'));
      };
      const succeed = (endpoint: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(endpoint);
      };
      const onFailure = (): void => fail();
      const onData = (chunk: Buffer | string): void => {
        if (settled) return;
        pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        if (Buffer.byteLength(pending, 'utf8') > policy.maxBytes) {
          fail();
          return;
        }
        const newline = pending.indexOf('\n');
        if (newline < 0) return;
        const line = pending.slice(0, newline).replace(/\r$/, '');
        if (pending.slice(newline + 1) !== '' || !line.startsWith(policy.linePrefix)) {
          fail();
          return;
        }
        const urlOffset = policy.linePrefix.lastIndexOf('http://');
        const suffix = line.slice(policy.linePrefix.length);
        if (urlOffset < 0 || !/^(?:[1-9][0-9]{0,4})$/.test(suffix)) {
          fail();
          return;
        }
        const endpoint = `${policy.linePrefix.slice(urlOffset)}${suffix}`;
        let parsed: URL;
        try {
          parsed = new URL(endpoint);
        } catch {
          fail();
          return;
        }
        const port = Number(parsed.port);
        if (
          parsed.protocol !== 'http:'
          || parsed.hostname !== '127.0.0.1'
          || parsed.pathname !== '/'
          || parsed.search !== ''
          || parsed.hash !== ''
          || parsed.username !== ''
          || parsed.password !== ''
          || !Number.isSafeInteger(port)
          || port < 1
          || port > 65_535
          || parsed.origin !== endpoint
        ) {
          fail();
          return;
        }
        succeed(endpoint);
      };
      stream.on('data', onData);
      stream.once('error', onFailure);
      stream.once('end', onFailure);
      void closed.then(() => fail());
      timer = this.schedule(fail, policy.timeoutMs);
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        try {
          (timer as { unref?: () => void }).unref?.();
        } catch {
          // Readiness remains bounded even when the timer cannot be unref'd.
        }
      }
    });
  }

  private clearOwnedServerIdle(lease: OwnedServerLease): void {
    lease.activity.idleToken += 1;
    const timer = lease.activity.idleTimer;
    lease.activity.idleTimer = null;
    if (timer !== null) this.clearScheduled(timer);
  }

  private armOwnedServerIdle(lease: OwnedServerLease): void {
    if (
      this.ownedServerLease !== lease
      || lease.activity.activeCount !== 0
      || lease.activity.exited
      || lease.activity.retiring
      || !this.accepting
    ) return;
    this.clearOwnedServerIdle(lease);
    const token = lease.activity.idleToken;
    const timer = this.schedule(() => {
      if (
        this.ownedServerLease !== lease
        || lease.activity.idleToken !== token
        || lease.activity.activeCount !== 0
        || lease.activity.exited
        || lease.activity.retiring
        || !this.accepting
      ) return;
      lease.activity.idleTimer = null;
      void this.stopOwnedServerLease().catch(() => {
        this.markDegraded('runtime_cleanup_failed');
      });
    }, lease.activity.idleTimeoutMs);
    lease.activity.idleTimer = timer;
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      try {
        (timer as { unref?: () => void }).unref?.();
      } catch {
        // The generation-owned lease still has a bounded teardown timer.
      }
    }
  }

  private handleOwnedServerExit(lease: OwnedServerLease): void {
    lease.activity.exited = true;
    lease.activity.retiring = true;
    this.clearOwnedServerIdle(lease);
    if (this.ownedServerLease !== lease || lease.activity.activeCount !== 0) return;
    void this.stopOwnedServerLease().catch(() => {
      this.markDegraded('runtime_cleanup_failed');
    });
  }

  private async retireOwnedServerLease(lease: OwnedServerLease): Promise<void> {
    if (this.ownedServerLease !== lease) return;
    lease.activity.retiring = true;
    this.clearOwnedServerIdle(lease);
    if (lease.activity.activeCount === 0) await this.stopOwnedServerLease();
  }

  private stopOwnedServerLease(): Promise<void> {
    if (this.ownedServerStopPromise) return this.ownedServerStopPromise;
    const lease = this.ownedServerLease;
    if (!lease) return Promise.resolve();
    const operation = this.stopOwnedServerLeaseOnce(lease);
    this.ownedServerStopPromise = operation;
    void operation.then(() => {
      if (this.ownedServerStopPromise === operation) this.ownedServerStopPromise = null;
    }, () => {
      if (this.ownedServerStopPromise === operation) this.ownedServerStopPromise = null;
    });
    return operation;
  }

  private async stopOwnedServerLeaseOnce(lease: OwnedServerLease): Promise<void> {
    if (this.ownedServerLease === lease) this.ownedServerLease = null;
    lease.activity.retiring = true;
    this.clearOwnedServerIdle(lease);
    try {
      await this.dependencies.terminator.stop(
        lease.entry,
        lease.supervisedChild,
        { grace: this.terminationGrace },
      );
      lease.activity.exited = true;
      await this.dependencies.runtimeFiles.removeRun({
        delegationId: lease.entry.delegationId,
        role: 'provider_server',
      });
      this.entriesByPid.delete(lease.supervisedChild.pid);
    } catch (error) {
      this.markDegraded('runtime_cleanup_failed');
      throw error;
    } finally {
      this.clearOwnedServerSecret(lease.secretRef);
    }
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
      await this.dependencies.runtimeFiles.removeRun(
        entry.role === 'direct'
          ? Object.freeze({ delegationId: run.delegationId, role: 'direct' as const })
          : run.delegationId,
      );
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
    const routeLosses = [...this.routeLosses.values()]
      .sort((left, right) => (
        left.lostAt - right.lostAt
        || left.delegationId.localeCompare(right.delegationId)
      ))
      .slice(-RECOVERY_STATUS_LIMIT)
      .map((entry) => Object.freeze({ ...entry }));
    return Object.freeze({
      generation: this.generation,
      active: Object.freeze(active),
      restartLosses: Object.freeze(restartLosses),
      routeLosses: Object.freeze(routeLosses),
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

  private takeResultEvent(run: DelegationRun): AgentEvent {
    const event = this.requireResultEvent(run);
    run.resultEvent = null;
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
    if (status === 'failed'
      && terminal.type === 'diagnostic'
      && terminal.code === 'route_lost') {
      const lostAt = this.wallNow();
      if (Number.isSafeInteger(lostAt) && lostAt >= 0) {
        this.routeLosses.set(run.delegationId, Object.freeze({
          delegationId: run.delegationId,
          code: 'route_lost',
          lostAt,
        }));
        while (this.routeLosses.size > RECOVERY_STATUS_LIMIT) {
          const first = this.routeLosses.keys().next().value as string | undefined;
          if (!first) break;
          this.routeLosses.delete(first);
        }
      }
    }
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
  const runtimeFiles = createAgentRuntimeFiles({
    platform,
    ...(options.runtimeRootPath ? { rootPath: options.runtimeRootPath } : {}),
  });
  const inspector = options.processSeams?.inspector ?? createProcessInspector({ platform });
  const inspectProcessGroupStatus = createProcessGroupStatusInspector(platform);
  const terminator = options.processSeams?.terminator
    ?? createProcessTreeTerminator({ platform, inspector });
  const directRuntimeReference = options.directRuntimeReference === undefined
    ? null
    : validateDirectRuntimeReference(options.directRuntimeReference);
  if (directRuntimeReference && directRuntimeReference.endpoint !== options.endpoint) {
    throw new TypeError('Direct runtime endpoint ownership is unavailable');
  }
  const generation = directRuntimeReference?.generation ?? randomUUID();
  const environment = options.environment ?? process.env;
  const dataHome = environment.XDG_DATA_HOME;
  const home = environment.HOME;
  const opencodeDataRoot = typeof dataHome === 'string' && isAbsolute(dataHome)
    ? join(dataHome, 'opencode')
    : typeof home === 'string' && isAbsolute(home)
      ? join(home, '.local', 'share', 'opencode')
      : null;
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
    openCodeDetect: options.processSeams?.openCodeDetect,
    codexDetect: options.processSeams?.codexDetect,
    resolveOpenCodeProfileRuntime: (_context, _role, scope) => {
      if (!scope || scope.runtimeFiles.length !== 3 || !opencodeDataRoot) {
        throw new TypeError('OpenCode production runtime graph is unavailable');
      }
      const [opencodeConfigPath, opencodeTestHomePath, opencodeManagedConfigPath] = scope.runtimeFiles;
      return Object.freeze({
        fsbMcpEndpoint: options.endpoint,
        opencodeConfigRoot: dirname(dirname(opencodeConfigPath)),
        opencodeConfigPath,
        opencodeTestHomePath,
        opencodeManagedConfigPath,
        opencodeDataRoot,
      });
    },
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
    ...(directRuntimeReference ? { directRuntimeReference } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    platform,
    ...(options.environment ? { environment: options.environment } : {}),
    ...(options.processSeams?.spawn ? { spawn: options.processSeams.spawn } : {}),
    ...(options.processSeams?.processProbe
      ? { processProbe: options.processSeams.processProbe }
      : {}),
    ...(options.networkSeams?.requestOwnedServer
      ? { requestOwnedServer: options.networkSeams.requestOwnedServer }
      : {}),
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
