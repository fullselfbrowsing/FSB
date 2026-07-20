import { randomBytes } from 'node:crypto';
import * as nodeFs from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  CLAUDE_CODE_ADAPTER_ID,
  OPENCODE_ADAPTER_ID,
  type AgentProviderId,
} from './adapter.js';
import type { ProcessInspector, ProcessTreeTerminator } from './process-tree.js';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const LEGACY_JOURNAL_VERSION = 1 as const;
const JOURNAL_VERSION = 2 as const;
const JOURNAL_FILENAME = 'agent-orphans.json';
const RECOVERY_VERSION = 1 as const;
const RECOVERY_FILENAME = 'agent-recovery.json';
const MCP_CONFIG_FILENAME = 'mcp-config.json';
const OPENCODE_CONFIG_ROOT_DIRECTORY = 'config';
const OPENCODE_CONFIG_DIRECTORY = 'opencode';
const OPENCODE_CONFIG_FILENAME = 'opencode.json';
const OPENCODE_TEST_HOME_DIRECTORY = 'test-home';
const OPENCODE_MANAGED_CONFIG_DIRECTORY = 'managed-config';
const JOURNAL_LIMIT_BYTES = 256 * 1024;
const RECOVERY_LIMIT_BYTES = 64 * 1024;
const MAX_JOURNAL_ENTRIES = 256;
const MAX_RECOVERY_DISPOSITIONS = 128;

const DELEGATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const PROFILE_VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,64}$/;
const FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const PROCESS_IDENTITY_PATTERN = /^[A-Za-z0-9_.:+-]{1,256}$/;
const GENERATION_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]{0,127}$/;
const SECRET_ENV_KEY_PATTERN = /(?:^|_)(?:API_KEY|AUTHORIZATION|CREDENTIALS?|PASSWORD|PRIVATE_KEY|SECRETS?|TOKENS?)(?:_|$)/i;
const SECRET_VALUE_PATTERNS = Object.freeze([
  /\b(?:Basic|Bearer)\s+\S+/i,
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\bAKIA[A-Z0-9]{12,}/,
  /\b(?:api[_ -]?key|authorization|credentials?|password|private[_ -]?key|secrets?|tokens?)\b\s*[:=]\s*\S+/i,
  /\b(?:AUTHORIZATION|PASSWORD|RAW_SECRET|SECRET|TOKEN)_CANARY(?:_|\b)/i,
]);

const RUNTIME_ROLES = Object.freeze(['delegation', 'provider_server'] as const);
const PRIVATE_ARTIFACT_KINDS = Object.freeze([
  'mcp_config',
  'opencode_config',
  'opencode_test_home',
  'opencode_managed_config',
] as const);

export type RuntimeRole = (typeof RUNTIME_ROLES)[number];
export type RuntimePrivateArtifactKind = (typeof PRIVATE_ARTIFACT_KINDS)[number];

const LEGACY_PREPARED_KEYS = Object.freeze([
  'adapterId',
  'argvSignature',
  'binaryRealPath',
  'createdAt',
  'delegationId',
  'envFingerprint',
  'generation',
  'profileVersion',
  'state',
]);
const LEGACY_ACTIVE_KEYS = Object.freeze([
  ...LEGACY_PREPARED_KEYS,
  'pid',
  'processGroupId',
  'processStartIdentity',
  'startedAt',
].sort());
const PREPARED_KEYS = Object.freeze([
  ...LEGACY_PREPARED_KEYS,
  'fixedEnv',
  'role',
].sort());
const ACTIVE_KEYS = Object.freeze([
  ...PREPARED_KEYS,
  'pid',
  'processGroupId',
  'processStartIdentity',
  'startedAt',
].sort());
const JOURNAL_KEYS = Object.freeze(['entries', 'version']);
const RECOVERY_KEYS = Object.freeze(['dispositions', 'version']);
const RECOVERY_DISPOSITION_KEYS = Object.freeze(['code', 'delegationId', 'recoveredAt']);
const LEGACY_PREPARE_INPUT_KEYS = Object.freeze([
  'adapterId',
  'argvSignature',
  'binaryRealPath',
  'createdAt',
  'delegationId',
  'endpoint',
  'envFingerprint',
  'generation',
  'profileVersion',
]);
const PREPARE_INPUT_KEYS = Object.freeze([
  'adapterId',
  'argvSignature',
  'binaryRealPath',
  'createdAt',
  'delegationId',
  'envFingerprint',
  'fixedEnv',
  'generation',
  'privateArtifacts',
  'profileVersion',
  'role',
]);
const LEGACY_ACTIVATE_INPUT_KEYS = Object.freeze([
  'delegationId',
  'pid',
  'processGroupId',
  'processStartIdentity',
  'startedAt',
]);
const ACTIVATE_INPUT_KEYS = Object.freeze([
  ...LEGACY_ACTIVATE_INPUT_KEYS,
  'role',
].sort());
const REMOVE_INPUT_KEYS = Object.freeze(['delegationId', 'role']);
const MCP_ARTIFACT_KEYS = Object.freeze(['endpoint', 'kind']);
const OPENCODE_CONFIG_ARTIFACT_KEYS = Object.freeze(['contents', 'kind']);
const DIRECTORY_ARTIFACT_KEYS = Object.freeze(['kind']);

export type RuntimeFilesErrorCode =
  | 'invalid_runtime_input'
  | 'runtime_target_unavailable'
  | 'journal_unavailable'
  | 'journal_conflict';

export class RuntimeFilesError extends Error {
  readonly code: RuntimeFilesErrorCode;

  constructor(code: RuntimeFilesErrorCode, message: string) {
    super(message);
    this.name = 'RuntimeFilesError';
    this.code = code;
  }
}

export interface PreparedJournalEntry {
  readonly state: 'prepared';
  readonly role: RuntimeRole;
  readonly delegationId: string;
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly createdAt: number;
  readonly binaryRealPath: string;
  readonly argvSignature: string;
  readonly fixedEnv: Readonly<Record<string, string>>;
  readonly envFingerprint: string;
  readonly generation: string;
}

export interface ActiveJournalEntry {
  readonly state: 'active';
  readonly role: RuntimeRole;
  readonly delegationId: string;
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly createdAt: number;
  readonly binaryRealPath: string;
  readonly argvSignature: string;
  readonly fixedEnv: Readonly<Record<string, string>>;
  readonly envFingerprint: string;
  readonly generation: string;
  readonly pid: number;
  readonly processGroupId: number;
  readonly startedAt: number;
  readonly processStartIdentity: string;
}

export type JournalEntry = PreparedJournalEntry | ActiveJournalEntry;

export interface AgentOrphanJournal {
  readonly version: typeof JOURNAL_VERSION;
  readonly entries: readonly JournalEntry[];
}

export interface AgentRestartLossDisposition {
  readonly delegationId: string;
  readonly code: 'daemon_restart_lost_run';
  readonly recoveredAt: number;
}

export interface AgentRecoveryDispositionJournal {
  readonly version: typeof RECOVERY_VERSION;
  readonly dispositions: readonly AgentRestartLossDisposition[];
}

export type JournalUnavailableReason = 'corrupt' | 'insecure' | 'io' | 'oversize';

export type JournalReadResult =
  | { readonly status: 'ok'; readonly journal: AgentOrphanJournal }
  | { readonly status: 'unavailable'; readonly reason: JournalUnavailableReason };

export type RecoveryDispositionReadResult =
  | { readonly status: 'ok'; readonly journal: AgentRecoveryDispositionJournal }
  | { readonly status: 'unavailable'; readonly reason: JournalUnavailableReason };

export interface LegacyPrepareRunInput {
  readonly delegationId: string;
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly createdAt: number;
  readonly binaryRealPath: string;
  readonly argvSignature: string;
  readonly envFingerprint: string;
  readonly generation: string;
  readonly endpoint: string;
}

export interface McpConfigRuntimeArtifact {
  readonly kind: 'mcp_config';
  readonly endpoint: string;
}

export interface OpenCodeConfigRuntimeArtifact {
  readonly kind: 'opencode_config';
  readonly contents: string;
}

export interface OpenCodeTestHomeRuntimeArtifact {
  readonly kind: 'opencode_test_home';
}

export interface OpenCodeManagedConfigRuntimeArtifact {
  readonly kind: 'opencode_managed_config';
}

export type RuntimePrivateArtifact =
  | McpConfigRuntimeArtifact
  | OpenCodeConfigRuntimeArtifact
  | OpenCodeTestHomeRuntimeArtifact
  | OpenCodeManagedConfigRuntimeArtifact;

export interface RoleAwarePrepareRunInput {
  readonly role: RuntimeRole;
  readonly delegationId: string;
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly createdAt: number;
  readonly binaryRealPath: string;
  readonly argvSignature: string;
  readonly fixedEnv: Readonly<Record<string, string>>;
  readonly envFingerprint: string;
  readonly generation: string;
  readonly privateArtifacts: readonly RuntimePrivateArtifact[];
}

export type PrepareRunInput = LegacyPrepareRunInput | RoleAwarePrepareRunInput;

export interface LegacyActivateRunInput {
  readonly delegationId: string;
  readonly pid: number;
  readonly processGroupId: number;
  readonly startedAt: number;
  readonly processStartIdentity: string;
}

export interface RoleAwareActivateRunInput extends LegacyActivateRunInput {
  readonly role: RuntimeRole;
}

export type ActivateRunInput = LegacyActivateRunInput | RoleAwareActivateRunInput;

export interface RoleAwareRemoveRunInput {
  readonly delegationId: string;
  readonly role: RuntimeRole;
}

export interface PreparedRun extends RuntimeRunPaths {
  readonly entry: PreparedJournalEntry;
}

export interface RuntimeRunPaths {
  readonly runDirectory: string;
  readonly mcpConfigPath: string;
  readonly opencodeConfigRoot: string;
  readonly opencodeConfigDirectory: string;
  readonly opencodeConfigPath: string;
  readonly opencodeTestHomePath: string;
  readonly opencodeManagedConfigPath: string;
}

export interface AgentRecoveryProfileSummary {
  readonly role: RuntimeRole;
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly confirmedKilled: number;
  readonly staleCleared: number;
  readonly ambiguousFailClosed: number;
}

export interface AgentStartupRecoveryResult {
  readonly confirmedKilled: number;
  readonly staleCleared: number;
  readonly ambiguousFailClosed: number;
  readonly spawnAvailable: boolean;
  readonly profiles: readonly AgentRecoveryProfileSummary[];
  readonly restartLosses: readonly AgentRestartLossDisposition[];
}

export interface AgentStartupRecoveryDependencies {
  readonly runtimeFiles: Pick<
    AgentRuntimeFiles,
    | 'readJournal'
    | 'readRecoveryDispositions'
    | 'recordRestartLossAndRemoveRun'
    | 'removeRecoveredRun'
  >;
  readonly inspector: ProcessInspector;
  readonly terminator: ProcessTreeTerminator;
  readonly terminationGrace: number;
  readonly generation: string;
  readonly now: () => number;
}

export interface AgentStartupRecovery {
  recover(): Promise<AgentStartupRecoveryResult>;
  recoverBeforeAdvertise(
    advertise: () => void | Promise<void>,
  ): Promise<AgentStartupRecoveryResult>;
}

interface RuntimeFsDependencies {
  readonly existsSync: typeof nodeFs.existsSync;
  readonly lstatSync: typeof nodeFs.lstatSync;
  readonly mkdirSync: typeof nodeFs.mkdirSync;
  readonly chmodSync: typeof nodeFs.chmodSync;
  readonly openSync: typeof nodeFs.openSync;
  readonly writeFileSync: typeof nodeFs.writeFileSync;
  readonly fsyncSync: typeof nodeFs.fsyncSync;
  readonly closeSync: typeof nodeFs.closeSync;
  readonly renameSync: typeof nodeFs.renameSync;
  readonly unlinkSync: typeof nodeFs.unlinkSync;
  readonly readFileSync: typeof nodeFs.readFileSync;
  readonly readdirSync: typeof nodeFs.readdirSync;
  readonly rmdirSync: typeof nodeFs.rmdirSync;
}

export interface RuntimeFilesOptions {
  readonly rootPath?: string;
  readonly platform?: NodeJS.Platform;
  readonly fs?: Partial<RuntimeFsDependencies>;
  readonly randomToken?: () => string;
}

const DEFAULT_FS: RuntimeFsDependencies = {
  existsSync: nodeFs.existsSync,
  lstatSync: nodeFs.lstatSync,
  mkdirSync: nodeFs.mkdirSync,
  chmodSync: nodeFs.chmodSync,
  openSync: nodeFs.openSync,
  writeFileSync: nodeFs.writeFileSync,
  fsyncSync: nodeFs.fsyncSync,
  closeSync: nodeFs.closeSync,
  renameSync: nodeFs.renameSync,
  unlinkSync: nodeFs.unlinkSync,
  readFileSync: nodeFs.readFileSync,
  readdirSync: nodeFs.readdirSync,
  rmdirSync: nodeFs.rmdirSync,
};

function isOwnDataRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every((key) => (
    typeof key === 'string'
    && descriptors[key]?.enumerable === true
    && 'value' in descriptors[key]
  ));
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  if (!isOwnDataRecord(value)) return false;
  const actual = Reflect.ownKeys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isDenseDataArray(value: unknown, maximumLength: number): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  if (value.length > maximumLength) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) return false;
  const expected = Array.from({ length: value.length }, (_, index) => String(index));
  const dataKeys = keys.filter((key) => key !== 'length');
  return dataKeys.length === expected.length
    && expected.every((key) => (
      dataKeys.includes(key)
      && descriptors[key]?.enumerable === true
      && 'value' in descriptors[key]
    ));
}

function isSafeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isAbsoluteBoundedPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 4096
    && !value.includes('\0')
    && isAbsolute(value);
}

function isRuntimeRole(value: unknown): value is RuntimeRole {
  return value === 'delegation' || value === 'provider_server';
}

function isAllowedRoleAdapter(role: RuntimeRole, adapterId: unknown): adapterId is AgentProviderId {
  if (role === 'provider_server') return adapterId === OPENCODE_ADAPTER_ID;
  return adapterId === CLAUDE_CODE_ADAPTER_ID || adapterId === OPENCODE_ADAPTER_ID;
}

function normalizedFieldName(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[- ]/g, '_').toUpperCase();
}

function containsCredentialUrl(value: string): boolean {
  for (const match of value.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    try {
      const parsed = new URL(match[0]);
      if (parsed.username !== '' || parsed.password !== '') return true;
    } catch {
      return true;
    }
  }
  return false;
}

function isSecretBearingString(value: string): boolean {
  return value.includes('\0')
    || containsCredentialUrl(value)
    || SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function cloneFixedEnv(value: unknown): Readonly<Record<string, string>> | null {
  if (!isOwnDataRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length > 64) return null;
  const clone: Record<string, string> = {};
  for (const key of keys) {
    const candidate = value[key];
    if (
      !ENV_KEY_PATTERN.test(key)
      || SECRET_ENV_KEY_PATTERN.test(key)
      || typeof candidate !== 'string'
      || candidate.length > 4096
      || isSecretBearingString(candidate)
    ) return null;
    clone[key] = candidate;
  }
  return Object.freeze(clone);
}

function isSafePublicDocument(
  value: unknown,
  state: { nodes: number },
  depth = 0,
): boolean {
  state.nodes += 1;
  if (state.nodes > 4096 || depth > 32) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    return value.length <= 64 * 1024 && !isSecretBearingString(value);
  }
  if (Array.isArray(value)) {
    return isDenseDataArray(value, 1024)
      && value.every((entry) => isSafePublicDocument(entry, state, depth + 1));
  }
  if (!isOwnDataRecord(value) || Object.keys(value).length > 256) return false;
  for (const [key, entry] of Object.entries(value)) {
    const normalized = normalizedFieldName(key);
    if (
      SECRET_ENV_KEY_PATTERN.test(normalized)
      || normalized === 'HEADERS'
      || normalized === 'RESOLVED_ENV'
      || normalized === 'SPAWN_SECRET_ENV_BINDINGS'
      || normalized === 'RAW_SECRET'
      || normalized === 'RAW_SECRET_BYTES'
      || normalized === 'ENDPOINT_CREDENTIALS'
    ) return false;
    if (!isSafePublicDocument(entry, state, depth + 1)) return false;
  }
  return true;
}

function isPreparedEntry(value: unknown): value is PreparedJournalEntry {
  if (!isOwnDataRecord(value)) return false;
  const entry = value;
  const fixedEnv = cloneFixedEnv(entry.fixedEnv);
  return exactKeys(entry, PREPARED_KEYS)
    && entry.state === 'prepared'
    && isRuntimeRole(entry.role)
    && typeof entry.delegationId === 'string'
    && DELEGATION_ID_PATTERN.test(entry.delegationId)
    && isAllowedRoleAdapter(entry.role, entry.adapterId)
    && typeof entry.profileVersion === 'string'
    && PROFILE_VERSION_PATTERN.test(entry.profileVersion)
    && isSafeInteger(entry.createdAt)
    && isAbsoluteBoundedPath(entry.binaryRealPath)
    && typeof entry.argvSignature === 'string'
    && FINGERPRINT_PATTERN.test(entry.argvSignature)
    && fixedEnv !== null
    && typeof entry.envFingerprint === 'string'
    && FINGERPRINT_PATTERN.test(entry.envFingerprint)
    && typeof entry.generation === 'string'
    && GENERATION_PATTERN.test(entry.generation);
}

function isActiveEntry(value: unknown): value is ActiveJournalEntry {
  if (!isOwnDataRecord(value)) return false;
  const entry = value;
  if (!exactKeys(entry, ACTIVE_KEYS)) return false;
  const preparedShape = {
    state: 'prepared',
    role: entry.role,
    delegationId: entry.delegationId,
    adapterId: entry.adapterId,
    profileVersion: entry.profileVersion,
    createdAt: entry.createdAt,
    binaryRealPath: entry.binaryRealPath,
    argvSignature: entry.argvSignature,
    fixedEnv: entry.fixedEnv,
    envFingerprint: entry.envFingerprint,
    generation: entry.generation,
  };
  return isPreparedEntry(preparedShape)
    && entry.state === 'active'
    && isSafeInteger(entry.pid, 1)
    && isSafeInteger(entry.processGroupId, 1)
    && isSafeInteger(entry.startedAt)
    && entry.startedAt >= (entry.createdAt as number)
    && typeof entry.processStartIdentity === 'string'
    && PROCESS_IDENTITY_PATTERN.test(entry.processStartIdentity);
}

function freezeEntry(entry: JournalEntry): JournalEntry {
  return Object.freeze({
    ...entry,
    fixedEnv: cloneFixedEnv(entry.fixedEnv)!,
  });
}

function freezeJournal(entries: readonly JournalEntry[]): AgentOrphanJournal {
  return Object.freeze({
    version: JOURNAL_VERSION,
    entries: Object.freeze(entries.map(freezeEntry)),
  });
}

function isRecoveryDisposition(value: unknown): value is AgentRestartLossDisposition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const disposition = value as Record<string, unknown>;
  return exactKeys(disposition, RECOVERY_DISPOSITION_KEYS)
    && typeof disposition.delegationId === 'string'
    && DELEGATION_ID_PATTERN.test(disposition.delegationId)
    && disposition.code === 'daemon_restart_lost_run'
    && isSafeInteger(disposition.recoveredAt);
}

function freezeRecoveryDispositions(
  dispositions: readonly AgentRestartLossDisposition[],
): AgentRecoveryDispositionJournal {
  return Object.freeze({
    version: RECOVERY_VERSION,
    dispositions: Object.freeze(dispositions.map((entry) => Object.freeze({ ...entry }))),
  });
}

function parseRecoveryDispositions(value: unknown): AgentRecoveryDispositionJournal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const journal = value as Record<string, unknown>;
  if (!exactKeys(journal, RECOVERY_KEYS) || journal.version !== RECOVERY_VERSION) return null;
  if (
    !isDenseDataArray(journal.dispositions, MAX_RECOVERY_DISPOSITIONS)
  ) return null;
  const delegationIds = new Set<string>();
  const dispositions: AgentRestartLossDisposition[] = [];
  for (const candidate of journal.dispositions) {
    if (!isRecoveryDisposition(candidate) || delegationIds.has(candidate.delegationId)) return null;
    delegationIds.add(candidate.delegationId);
    dispositions.push(candidate);
  }
  return freezeRecoveryDispositions(dispositions);
}

function sameJournalEntry(left: JournalEntry, right: JournalEntry): boolean {
  if (left.state !== right.state) return false;
  const keys = left.state === 'active' ? ACTIVE_KEYS : PREPARED_KEYS;
  return keys.every((key) => {
    const leftValue = (left as unknown as Record<string, unknown>)[key];
    const rightValue = (right as unknown as Record<string, unknown>)[key];
    if (key !== 'fixedEnv') return leftValue === rightValue;
    return JSON.stringify(leftValue) === JSON.stringify(rightValue);
  });
}

function isLegacyPreparedEntry(value: unknown): value is Record<string, unknown> {
  if (!isOwnDataRecord(value)) return false;
  return exactKeys(value, LEGACY_PREPARED_KEYS)
    && value.state === 'prepared'
    && typeof value.delegationId === 'string'
    && DELEGATION_ID_PATTERN.test(value.delegationId)
    && value.adapterId === CLAUDE_CODE_ADAPTER_ID
    && typeof value.profileVersion === 'string'
    && PROFILE_VERSION_PATTERN.test(value.profileVersion)
    && isSafeInteger(value.createdAt)
    && isAbsoluteBoundedPath(value.binaryRealPath)
    && typeof value.argvSignature === 'string'
    && FINGERPRINT_PATTERN.test(value.argvSignature)
    && typeof value.envFingerprint === 'string'
    && FINGERPRINT_PATTERN.test(value.envFingerprint)
    && typeof value.generation === 'string'
    && GENERATION_PATTERN.test(value.generation);
}

function isLegacyActiveEntry(value: unknown): value is Record<string, unknown> {
  if (!isOwnDataRecord(value) || !exactKeys(value, LEGACY_ACTIVE_KEYS)) return false;
  const prepared = Object.fromEntries(
    LEGACY_PREPARED_KEYS.map((key) => [key, key === 'state' ? 'prepared' : value[key]]),
  );
  return isLegacyPreparedEntry(prepared)
    && value.state === 'active'
    && isSafeInteger(value.pid, 1)
    && isSafeInteger(value.processGroupId, 1)
    && isSafeInteger(value.startedAt)
    && value.startedAt >= (value.createdAt as number)
    && typeof value.processStartIdentity === 'string'
    && PROCESS_IDENTITY_PATTERN.test(value.processStartIdentity);
}

function normalizeLegacyEntry(value: Record<string, unknown>): JournalEntry {
  return freezeEntry({
    ...value,
    role: 'delegation',
    fixedEnv: Object.freeze({}),
  } as unknown as JournalEntry);
}

function parseJournal(value: unknown): AgentOrphanJournal | null {
  if (!isOwnDataRecord(value)) return null;
  const journal = value;
  if (!exactKeys(journal, JOURNAL_KEYS)) return null;
  if (journal.version !== JOURNAL_VERSION && journal.version !== LEGACY_JOURNAL_VERSION) return null;
  if (!isDenseDataArray(journal.entries, MAX_JOURNAL_ENTRIES)) return null;

  const entries: JournalEntry[] = [];
  const delegationIds = new Set<string>();
  const envFingerprints = new Set<string>();
  for (const candidate of journal.entries) {
    let entry: JournalEntry;
    if (journal.version === LEGACY_JOURNAL_VERSION) {
      if (!isLegacyPreparedEntry(candidate) && !isLegacyActiveEntry(candidate)) return null;
      entry = normalizeLegacyEntry(candidate);
    } else {
      if (!isPreparedEntry(candidate) && !isActiveEntry(candidate)) return null;
      entry = freezeEntry(candidate);
    }
    if (
      delegationIds.has(entry.delegationId)
      || envFingerprints.has(entry.envFingerprint)
    ) return null;
    delegationIds.add(entry.delegationId);
    envFingerprints.add(entry.envFingerprint);
    entries.push(entry);
  }
  return freezeJournal(entries);
}

function validateEndpoint(endpoint: unknown): string {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 2048) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Runtime MCP endpoint is invalid');
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new RuntimeFilesError('invalid_runtime_input', 'Runtime MCP endpoint is invalid');
  }
  const loopback = parsed.hostname === '127.0.0.1'
    || parsed.hostname === '[::1]'
    || parsed.hostname === '::1';
  const port = Number(parsed.port);
  if (
    parsed.protocol !== 'http:'
    || !loopback
    || !parsed.port
    || !Number.isInteger(port)
    || port < 1
    || port > 65535
    || parsed.pathname !== '/mcp'
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.username !== ''
    || parsed.password !== ''
  ) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Runtime MCP endpoint is invalid');
  }
  return parsed.toString();
}

interface ValidatedPrepareRun {
  readonly entry: PreparedJournalEntry;
  readonly privateArtifacts: readonly RuntimePrivateArtifact[];
}

function validatePrivateArtifacts(
  value: unknown,
  role: RuntimeRole,
  adapterId: AgentProviderId,
): readonly RuntimePrivateArtifact[] | null {
  if (!isDenseDataArray(value, PRIVATE_ARTIFACT_KINDS.length)) return null;
  const artifacts: RuntimePrivateArtifact[] = [];
  for (const candidate of value) {
    if (!isOwnDataRecord(candidate) || typeof candidate.kind !== 'string') return null;
    if (candidate.kind === 'mcp_config') {
      if (!exactKeys(candidate, MCP_ARTIFACT_KEYS)) return null;
      let endpoint: string;
      try {
        endpoint = validateEndpoint(candidate.endpoint);
      } catch {
        return null;
      }
      artifacts.push(Object.freeze({ kind: 'mcp_config', endpoint }));
      continue;
    }
    if (candidate.kind === 'opencode_config') {
      if (
        !exactKeys(candidate, OPENCODE_CONFIG_ARTIFACT_KEYS)
        || typeof candidate.contents !== 'string'
        || Buffer.byteLength(candidate.contents, 'utf8') > 128 * 1024
      ) return null;
      let document: unknown;
      try {
        document = JSON.parse(candidate.contents) as unknown;
      } catch {
        return null;
      }
      if (!isOwnDataRecord(document) || !isSafePublicDocument(document, { nodes: 0 })) return null;
      artifacts.push(Object.freeze({ kind: 'opencode_config', contents: candidate.contents }));
      continue;
    }
    if (
      candidate.kind === 'opencode_test_home'
      || candidate.kind === 'opencode_managed_config'
    ) {
      if (!exactKeys(candidate, DIRECTORY_ARTIFACT_KEYS)) return null;
      artifacts.push(Object.freeze({ kind: candidate.kind }));
      continue;
    }
    return null;
  }
  const kinds = artifacts.map((artifact) => artifact.kind);
  const expected = adapterId === CLAUDE_CODE_ADAPTER_ID && role === 'delegation'
    ? ['mcp_config']
    : adapterId === OPENCODE_ADAPTER_ID
      ? ['opencode_config', 'opencode_test_home', 'opencode_managed_config']
      : [];
  return kinds.length === expected.length
    && kinds.every((kind, index) => kind === expected[index])
    ? Object.freeze(artifacts)
    : null;
}

function validatePrepareInput(input: PrepareRunInput): ValidatedPrepareRun {
  if (!isOwnDataRecord(input)) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
  }
  const record = input as unknown as Record<string, unknown>;
  let role: RuntimeRole;
  let fixedEnv: Readonly<Record<string, string>>;
  let artifacts: readonly RuntimePrivateArtifact[] | null;
  if (exactKeys(record, LEGACY_PREPARE_INPUT_KEYS)) {
    if (record.adapterId !== CLAUDE_CODE_ADAPTER_ID) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
    }
    role = 'delegation';
    fixedEnv = Object.freeze({});
    let endpoint: string;
    try {
      endpoint = validateEndpoint(record.endpoint);
    } catch {
      throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
    }
    artifacts = Object.freeze([Object.freeze({ kind: 'mcp_config', endpoint })]);
  } else if (exactKeys(record, PREPARE_INPUT_KEYS) && isRuntimeRole(record.role)) {
    role = record.role;
    if (!isAllowedRoleAdapter(role, record.adapterId)) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
    }
    const clonedFixedEnv = cloneFixedEnv(record.fixedEnv);
    if (!clonedFixedEnv) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
    }
    fixedEnv = clonedFixedEnv;
    artifacts = validatePrivateArtifacts(record.privateArtifacts, role, record.adapterId);
  } else {
    throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
  }
  const entry: PreparedJournalEntry = {
    state: 'prepared',
    role,
    delegationId: record.delegationId as string,
    adapterId: record.adapterId as AgentProviderId,
    profileVersion: record.profileVersion as string,
    createdAt: record.createdAt as number,
    binaryRealPath: record.binaryRealPath as string,
    argvSignature: record.argvSignature as string,
    fixedEnv,
    envFingerprint: record.envFingerprint as string,
    generation: record.generation as string,
  };
  if (!isPreparedEntry(entry) || !artifacts) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
  }
  return Object.freeze({
    entry: freezeEntry(entry) as PreparedJournalEntry,
    privateArtifacts: artifacts,
  });
}

function validateActivateInput(input: ActivateRunInput): RuntimeRole | null {
  if (!isOwnDataRecord(input)) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Active runtime state is invalid');
  }
  const record = input as unknown as Record<string, unknown>;
  const role = exactKeys(record, LEGACY_ACTIVATE_INPUT_KEYS)
    ? null
    : exactKeys(record, ACTIVATE_INPUT_KEYS) && isRuntimeRole(record.role)
      ? record.role
      : undefined;
  if (role === undefined) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Active runtime state is invalid');
  }
  if (
    typeof input.delegationId !== 'string'
    || !DELEGATION_ID_PATTERN.test(input.delegationId)
    || !isSafeInteger(input.pid, 1)
    || !isSafeInteger(input.processGroupId, 1)
    || !isSafeInteger(input.startedAt)
    || typeof input.processStartIdentity !== 'string'
    || !PROCESS_IDENTITY_PATTERN.test(input.processStartIdentity)
  ) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Active runtime state is invalid');
  }
  return role;
}

export function getAgentRuntimeRoot(homeDir = homedir()): string {
  return join(homeDir, '.fsb', 'agent-runtime');
}

export class AgentRuntimeFiles {
  readonly rootPath: string;
  readonly journalPath: string;
  readonly recoveryPath: string;

  private readonly platform: NodeJS.Platform;
  private readonly fs: RuntimeFsDependencies;
  private readonly randomToken: () => string;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: RuntimeFilesOptions = {}) {
    const requestedRoot = options.rootPath ?? getAgentRuntimeRoot();
    if (!isAbsoluteBoundedPath(requestedRoot)) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Runtime root path is invalid');
    }
    this.rootPath = resolve(requestedRoot);
    this.journalPath = join(this.rootPath, JOURNAL_FILENAME);
    this.recoveryPath = join(this.rootPath, RECOVERY_FILENAME);
    this.platform = options.platform ?? process.platform;
    this.fs = { ...DEFAULT_FS, ...options.fs };
    this.randomToken = options.randomToken
      ?? (() => randomBytes(12).toString('hex'));
  }

  readJournal(): JournalReadResult {
    try {
      if (!this.fs.existsSync(this.rootPath)) {
        return { status: 'ok', journal: freezeJournal([]) };
      }
      const root = this.fs.lstatSync(this.rootPath);
      if (
        root.isSymbolicLink()
        || !root.isDirectory()
        || (this.platform !== 'win32' && (root.mode & 0o777) !== DIRECTORY_MODE)
      ) {
        return { status: 'unavailable', reason: 'insecure' };
      }
      if (!this.fs.existsSync(this.journalPath)) {
        return { status: 'ok', journal: freezeJournal([]) };
      }
      const target = this.fs.lstatSync(this.journalPath);
      if (
        target.isSymbolicLink()
        || !target.isFile()
        || (this.platform !== 'win32' && (target.mode & 0o777) !== FILE_MODE)
      ) {
        return { status: 'unavailable', reason: 'insecure' };
      }
      if (target.size > JOURNAL_LIMIT_BYTES) {
        return { status: 'unavailable', reason: 'oversize' };
      }
      const raw = this.fs.readFileSync(this.journalPath, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > JOURNAL_LIMIT_BYTES) {
        return { status: 'unavailable', reason: 'oversize' };
      }
      const journal = parseJournal(JSON.parse(raw) as unknown);
      return journal
        && journal.entries.every((entry) => this.hasValidRuntimePaths(entry))
        ? { status: 'ok', journal }
        : { status: 'unavailable', reason: 'corrupt' };
    } catch (error) {
      if (error instanceof SyntaxError) {
        return { status: 'unavailable', reason: 'corrupt' };
      }
      return { status: 'unavailable', reason: 'io' };
    }
  }

  readRecoveryDispositions(): RecoveryDispositionReadResult {
    try {
      if (!this.fs.existsSync(this.rootPath)) {
        return { status: 'ok', journal: freezeRecoveryDispositions([]) };
      }
      const root = this.fs.lstatSync(this.rootPath);
      if (
        root.isSymbolicLink()
        || !root.isDirectory()
        || (this.platform !== 'win32' && (root.mode & 0o777) !== DIRECTORY_MODE)
      ) {
        return { status: 'unavailable', reason: 'insecure' };
      }
      if (!this.fs.existsSync(this.recoveryPath)) {
        return { status: 'ok', journal: freezeRecoveryDispositions([]) };
      }
      const target = this.fs.lstatSync(this.recoveryPath);
      if (
        target.isSymbolicLink()
        || !target.isFile()
        || (this.platform !== 'win32' && (target.mode & 0o777) !== FILE_MODE)
      ) {
        return { status: 'unavailable', reason: 'insecure' };
      }
      if (target.size > RECOVERY_LIMIT_BYTES) {
        return { status: 'unavailable', reason: 'oversize' };
      }
      const raw = this.fs.readFileSync(this.recoveryPath, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > RECOVERY_LIMIT_BYTES) {
        return { status: 'unavailable', reason: 'oversize' };
      }
      const journal = parseRecoveryDispositions(JSON.parse(raw) as unknown);
      return journal
        ? { status: 'ok', journal }
        : { status: 'unavailable', reason: 'corrupt' };
    } catch (error) {
      if (error instanceof SyntaxError) {
        return { status: 'unavailable', reason: 'corrupt' };
      }
      return { status: 'unavailable', reason: 'io' };
    }
  }

  pathsFor(delegationId: string): RuntimeRunPaths {
    if (!DELEGATION_ID_PATTERN.test(delegationId)) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Delegation id is invalid');
    }
    const runDirectory = join(this.rootPath, delegationId);
    const opencodeConfigRoot = join(runDirectory, OPENCODE_CONFIG_ROOT_DIRECTORY);
    const opencodeConfigDirectory = join(opencodeConfigRoot, OPENCODE_CONFIG_DIRECTORY);
    const paths = Object.freeze({
      runDirectory,
      mcpConfigPath: join(runDirectory, MCP_CONFIG_FILENAME),
      opencodeConfigRoot,
      opencodeConfigDirectory,
      opencodeConfigPath: join(opencodeConfigDirectory, OPENCODE_CONFIG_FILENAME),
      opencodeTestHomePath: join(runDirectory, OPENCODE_TEST_HOME_DIRECTORY),
      opencodeManagedConfigPath: join(runDirectory, OPENCODE_MANAGED_CONFIG_DIRECTORY),
    });
    for (const path of Object.values(paths)) this.assertContainedPath(path);
    return paths;
  }

  prepareRun(input: PrepareRunInput): Promise<PreparedRun> {
    const validated = validatePrepareInput(input);
    const { entry, privateArtifacts } = validated;
    const paths = this.pathsFor(entry.delegationId);
    if (!this.hasValidRuntimePaths(entry)) {
      return Promise.reject(
        new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime paths are invalid'),
      );
    }
    return this.serializeMutation(() => {
      const journal = this.requireJournal();
      if (
        journal.entries.some((candidate) => (
          candidate.delegationId === entry.delegationId
          || candidate.envFingerprint === entry.envFingerprint
        ))
      ) {
        throw new RuntimeFilesError('journal_conflict', 'Prepared runtime identity conflicts');
      }
      this.ensureRoot();
      this.ensureRunDirectory(entry.delegationId);
      this.writePrivateArtifacts(paths, privateArtifacts);
      this.writeJournal([...journal.entries, entry]);
      return Object.freeze({ entry, ...paths });
    });
  }

  activateRun(input: ActivateRunInput): Promise<ActiveJournalEntry> {
    const requestedRole = validateActivateInput(input);
    return this.serializeMutation(() => {
      const journal = this.requireJournal();
      const index = journal.entries.findIndex(
        (entry) => entry.delegationId === input.delegationId,
      );
      const prepared = journal.entries[index];
      if (index < 0 || !prepared || prepared.state !== 'prepared') {
        throw new RuntimeFilesError('journal_conflict', 'Prepared runtime entry is unavailable');
      }
      if (
        (requestedRole === null && prepared.role !== 'delegation')
        || (requestedRole !== null && prepared.role !== requestedRole)
      ) {
        throw new RuntimeFilesError('journal_conflict', 'Prepared runtime role conflicts');
      }
      const active: ActiveJournalEntry = {
        ...prepared,
        state: 'active',
        pid: input.pid,
        processGroupId: input.processGroupId,
        startedAt: input.startedAt,
        processStartIdentity: input.processStartIdentity,
      };
      if (!isActiveEntry(active)) {
        throw new RuntimeFilesError('invalid_runtime_input', 'Active runtime state is invalid');
      }
      const entries = [...journal.entries];
      entries[index] = freezeEntry(active);
      this.writeJournal(entries);
      return freezeEntry(active) as ActiveJournalEntry;
    });
  }

  removeRun(input: string | RoleAwareRemoveRunInput): Promise<void> {
    const validated = this.validateRemoveInput(input);
    if (!validated) {
      return Promise.reject(
        new RuntimeFilesError('invalid_runtime_input', 'Runtime removal identity is invalid'),
      );
    }
    return this.serializeMutation(() => {
      const journal = this.requireJournal();
      const stored = journal.entries.find((entry) => entry.delegationId === validated.delegationId);
      if (!stored) return;
      if (stored.role !== validated.role) {
        throw new RuntimeFilesError('journal_conflict', 'Runtime removal role conflicts');
      }
      this.cleanupRunDirectory(stored);
      this.writeJournal(journal.entries.filter((entry) => entry !== stored));
    });
  }

  recordRestartLossAndRemoveRun(
    entry: JournalEntry,
    disposition: AgentRestartLossDisposition,
  ): Promise<readonly AgentRestartLossDisposition[]> {
    if (
      (!isPreparedEntry(entry) && !isActiveEntry(entry))
      || entry.role !== 'delegation'
      || !isRecoveryDisposition(disposition)
      || disposition.delegationId !== entry.delegationId
    ) {
      return Promise.reject(
        new RuntimeFilesError('invalid_runtime_input', 'Restart recovery state is invalid'),
      );
    }
    return this.serializeMutation(() => {
      const journal = this.requireJournal();
      const recovery = this.requireRecoveryDispositions();
      const stored = journal.entries.find(
        (candidate) => candidate.delegationId === entry.delegationId,
      );
      const existing = recovery.dispositions.find(
        (candidate) => candidate.delegationId === entry.delegationId,
      );
      if (!stored) {
        if (existing) return recovery.dispositions;
        throw new RuntimeFilesError('journal_conflict', 'Restart recovery entry is unavailable');
      }
      if (!sameJournalEntry(stored, entry)) {
        throw new RuntimeFilesError('journal_conflict', 'Restart recovery identity conflicts');
      }

      this.cleanupRunDirectory(entry);
      let dispositions = recovery.dispositions;
      if (!existing) {
        dispositions = Object.freeze([
          ...recovery.dispositions,
          Object.freeze({ ...disposition }),
        ].slice(-MAX_RECOVERY_DISPOSITIONS));
        this.writeRecoveryDispositions(dispositions);
      }
      this.writeJournal(journal.entries.filter(
        (candidate) => candidate.delegationId !== entry.delegationId,
      ));
      return dispositions;
    });
  }

  removeRecoveredRun(entry: JournalEntry): Promise<void> {
    if ((!isPreparedEntry(entry) && !isActiveEntry(entry)) || entry.role !== 'provider_server') {
      return Promise.reject(
        new RuntimeFilesError('invalid_runtime_input', 'Recovered runtime state is invalid'),
      );
    }
    return this.serializeMutation(() => {
      const journal = this.requireJournal();
      const stored = journal.entries.find(
        (candidate) => candidate.delegationId === entry.delegationId,
      );
      if (!stored) {
        throw new RuntimeFilesError('journal_conflict', 'Recovered runtime entry is unavailable');
      }
      if (!sameJournalEntry(stored, entry)) {
        throw new RuntimeFilesError('journal_conflict', 'Recovered runtime identity conflicts');
      }
      this.cleanupRunDirectory(entry);
      this.writeJournal(journal.entries.filter((candidate) => candidate !== stored));
    });
  }

  private serializeMutation<T>(operation: () => T): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private requireJournal(): AgentOrphanJournal {
    const result = this.readJournal();
    if (result.status !== 'ok') {
      throw new RuntimeFilesError('journal_unavailable', 'Agent orphan journal is unavailable');
    }
    return result.journal;
  }

  private requireRecoveryDispositions(): AgentRecoveryDispositionJournal {
    const result = this.readRecoveryDispositions();
    if (result.status !== 'ok') {
      throw new RuntimeFilesError(
        'journal_unavailable',
        'Agent recovery disposition journal is unavailable',
      );
    }
    return result.journal;
  }

  private validateRemoveInput(
    input: string | RoleAwareRemoveRunInput,
  ): Readonly<{ delegationId: string; role: RuntimeRole }> | null {
    if (typeof input === 'string') {
      return DELEGATION_ID_PATTERN.test(input)
        ? Object.freeze({ delegationId: input, role: 'delegation' })
        : null;
    }
    if (
      !isOwnDataRecord(input)
      || !exactKeys(input as unknown as Record<string, unknown>, REMOVE_INPUT_KEYS)
      || typeof input.delegationId !== 'string'
      || !DELEGATION_ID_PATTERN.test(input.delegationId)
      || !isRuntimeRole(input.role)
    ) return null;
    return Object.freeze({ delegationId: input.delegationId, role: input.role });
  }

  private hasValidRuntimePaths(entry: JournalEntry): boolean {
    if (entry.adapterId !== OPENCODE_ADAPTER_ID) return entry.role === 'delegation';
    const paths = this.pathsFor(entry.delegationId);
    const fixedEnv = entry.fixedEnv;
    return fixedEnv.XDG_CONFIG_HOME === paths.opencodeConfigRoot
      && fixedEnv.OPENCODE_TEST_HOME === paths.opencodeTestHomePath
      && fixedEnv.OPENCODE_TEST_MANAGED_CONFIG_DIR === paths.opencodeManagedConfigPath
      && fixedEnv.OPENCODE_DISABLE_PROJECT_CONFIG === '1'
      && fixedEnv.HOME === undefined
      && fixedEnv.XDG_DATA_HOME === undefined
      && fixedEnv.XDG_STATE_HOME === undefined
      && fixedEnv.XDG_CACHE_HOME === undefined;
  }

  private assertContainedPath(path: string): void {
    const relativePath = relative(this.rootPath, resolve(path));
    if (
      relativePath === ''
      || relativePath === '..'
      || relativePath.startsWith(`..${sep}`)
      || isAbsolute(relativePath)
    ) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Runtime path is outside its root');
    }
  }

  private ensureRoot(): void {
    this.ensureDirectory(this.rootPath);
  }

  private ensureRunDirectory(delegationId: string): string {
    const directory = this.pathsFor(delegationId).runDirectory;
    this.ensureDirectory(directory);
    return directory;
  }

  private ensureDirectory(path: string): void {
    this.assertContainedOrRoot(path);
    try {
      const existed = this.fs.existsSync(path);
      if (!existed) this.fs.mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE });
      const target = this.fs.lstatSync(path);
      if (target.isSymbolicLink() || !target.isDirectory()) {
        throw new RuntimeFilesError(
          'runtime_target_unavailable',
          'Runtime directory is unavailable',
        );
      }
      if (
        this.platform !== 'win32'
        && existed
        && (target.mode & 0o777) !== DIRECTORY_MODE
      ) {
        throw new RuntimeFilesError(
          'runtime_target_unavailable',
          'Runtime directory mode is unavailable',
        );
      }
      if (!existed) this.fs.chmodSync(path, DIRECTORY_MODE);
    } catch (error) {
      if (error instanceof RuntimeFilesError) throw error;
      throw new RuntimeFilesError('runtime_target_unavailable', 'Runtime directory is unavailable');
    }
  }

  private assertContainedOrRoot(path: string): void {
    if (resolve(path) === this.rootPath) return;
    this.assertContainedPath(path);
  }

  private writePrivateArtifacts(
    paths: RuntimeRunPaths,
    artifacts: readonly RuntimePrivateArtifact[],
  ): void {
    for (const artifact of artifacts) {
      if (artifact.kind === 'mcp_config') {
        const config = {
          mcpServers: {
            fsb: {
              type: 'http',
              url: artifact.endpoint,
            },
          },
        };
        this.atomicWrite(paths.mcpConfigPath, `${JSON.stringify(config)}\n`, false);
        continue;
      }
      if (artifact.kind === 'opencode_config') {
        this.ensureDirectory(paths.opencodeConfigRoot);
        this.ensureDirectory(paths.opencodeConfigDirectory);
        this.atomicWrite(paths.opencodeConfigPath, artifact.contents, false);
        continue;
      }
      if (artifact.kind === 'opencode_test_home') {
        this.ensureDirectory(paths.opencodeTestHomePath);
        continue;
      }
      this.ensureDirectory(paths.opencodeManagedConfigPath);
    }
  }

  private assertWritableFileTarget(path: string, allowExisting: boolean): void {
    this.assertContainedPath(path);
    if (!this.fs.existsSync(path)) return;
    const target = this.fs.lstatSync(path);
    if (
      target.isSymbolicLink()
      || !target.isFile()
      || !allowExisting
      || (this.platform !== 'win32' && (target.mode & 0o777) !== FILE_MODE)
    ) {
      throw new RuntimeFilesError('runtime_target_unavailable', 'Runtime file target is unavailable');
    }
  }

  private atomicWrite(path: string, value: string, allowExisting: boolean): void {
    this.assertWritableFileTarget(path, allowExisting);
    const tempPath = join(this.rootPath, `.${this.randomToken()}.agent-runtime.tmp`);
    this.assertContainedPath(tempPath);
    let descriptor: number | null = null;
    try {
      descriptor = this.fs.openSync(
        tempPath,
        nodeFs.constants.O_CREAT
          | nodeFs.constants.O_EXCL
          | nodeFs.constants.O_WRONLY
          | nodeFs.constants.O_NOFOLLOW,
        FILE_MODE,
      );
      this.fs.writeFileSync(descriptor, value, 'utf8');
      this.fs.fsyncSync(descriptor);
      this.fs.closeSync(descriptor);
      descriptor = null;
      this.fs.chmodSync(tempPath, FILE_MODE);
      this.assertWritableFileTarget(path, allowExisting);
      this.fs.renameSync(tempPath, path);
      this.fs.chmodSync(path, FILE_MODE);
    } catch (error) {
      if (descriptor !== null) {
        try {
          this.fs.closeSync(descriptor);
        } catch {
          // Preserve the original failure.
        }
      }
      try {
        this.fs.unlinkSync(tempPath);
      } catch {
        // The temporary path may not exist or may already be the final file.
      }
      if (error instanceof RuntimeFilesError) throw error;
      throw new RuntimeFilesError('runtime_target_unavailable', 'Runtime file write failed');
    }
  }

  private writeJournal(entries: readonly JournalEntry[]): void {
    const journal = freezeJournal(entries);
    const reparsed = parseJournal(journal);
    if (!reparsed || !reparsed.entries.every((entry) => this.hasValidRuntimePaths(entry))) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Agent orphan journal is invalid');
    }
    const serialized = `${JSON.stringify(journal)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > JOURNAL_LIMIT_BYTES) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Agent orphan journal is oversized');
    }
    this.ensureRoot();
    this.atomicWrite(this.journalPath, serialized, true);
  }

  private writeRecoveryDispositions(
    dispositions: readonly AgentRestartLossDisposition[],
  ): void {
    const journal = freezeRecoveryDispositions(dispositions);
    const reparsed = parseRecoveryDispositions(journal);
    if (!reparsed) {
      throw new RuntimeFilesError(
        'invalid_runtime_input',
        'Agent recovery disposition journal is invalid',
      );
    }
    const serialized = `${JSON.stringify(journal)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > RECOVERY_LIMIT_BYTES) {
      throw new RuntimeFilesError(
        'invalid_runtime_input',
        'Agent recovery disposition journal is oversized',
      );
    }
    this.ensureRoot();
    this.atomicWrite(this.recoveryPath, serialized, true);
  }

  private requireSecureDirectory(path: string, expectedChildren?: readonly string[]): void {
    this.assertContainedOrRoot(path);
    const target = this.fs.lstatSync(path);
    if (
      target.isSymbolicLink()
      || !target.isDirectory()
      || (this.platform !== 'win32' && (target.mode & 0o777) !== DIRECTORY_MODE)
    ) {
      throw new RuntimeFilesError(
        'runtime_target_unavailable',
        'Runtime directory cleanup is unavailable',
      );
    }
    if (expectedChildren) {
      const actual = this.fs.readdirSync(path).sort();
      const expected = [...expectedChildren].sort();
      if (
        actual.length !== expected.length
        || actual.some((name, index) => name !== expected[index])
      ) {
        throw new RuntimeFilesError(
          'runtime_target_unavailable',
          'Runtime directory cleanup is unavailable',
        );
      }
    }
  }

  private requireSecureFile(path: string): void {
    this.assertContainedPath(path);
    const target = this.fs.lstatSync(path);
    if (
      target.isSymbolicLink()
      || !target.isFile()
      || (this.platform !== 'win32' && (target.mode & 0o777) !== FILE_MODE)
    ) {
      throw new RuntimeFilesError(
        'runtime_target_unavailable',
        'Runtime file cleanup is unavailable',
      );
    }
  }

  private cleanupRunDirectory(entry: JournalEntry): void {
    const paths = this.pathsFor(entry.delegationId);
    const directory = paths.runDirectory;
    if (!this.fs.existsSync(directory)) return;
    try {
      this.requireSecureDirectory(this.rootPath);
      if (entry.adapterId === CLAUDE_CODE_ADAPTER_ID) {
        this.requireSecureDirectory(directory, [MCP_CONFIG_FILENAME]);
        this.requireSecureFile(paths.mcpConfigPath);
        this.fs.unlinkSync(paths.mcpConfigPath);
      } else {
        this.requireSecureDirectory(directory, [
          OPENCODE_CONFIG_ROOT_DIRECTORY,
          OPENCODE_TEST_HOME_DIRECTORY,
          OPENCODE_MANAGED_CONFIG_DIRECTORY,
        ]);
        this.requireSecureDirectory(paths.opencodeConfigRoot, [OPENCODE_CONFIG_DIRECTORY]);
        this.requireSecureDirectory(paths.opencodeConfigDirectory, [OPENCODE_CONFIG_FILENAME]);
        this.requireSecureFile(paths.opencodeConfigPath);
        this.requireSecureDirectory(paths.opencodeTestHomePath, []);
        this.requireSecureDirectory(paths.opencodeManagedConfigPath, []);

        this.fs.unlinkSync(paths.opencodeConfigPath);
        this.fs.rmdirSync(paths.opencodeConfigDirectory);
        this.fs.rmdirSync(paths.opencodeConfigRoot);
        this.fs.rmdirSync(paths.opencodeTestHomePath);
        this.fs.rmdirSync(paths.opencodeManagedConfigPath);
      }
      this.fs.rmdirSync(directory);
    } catch (error) {
      if (error instanceof RuntimeFilesError) throw error;
      throw new RuntimeFilesError(
        'runtime_target_unavailable',
        'Runtime directory cleanup is unavailable',
      );
    }
  }
}

export function createAgentRuntimeFiles(options: RuntimeFilesOptions = {}): AgentRuntimeFiles {
  return new AgentRuntimeFiles(options);
}

type RecoveryCategory = 'confirmedKilled' | 'staleCleared' | 'ambiguousFailClosed';

interface MutableRecoveryProfileSummary {
  role: RuntimeRole;
  adapterId: AgentProviderId;
  profileVersion: string;
  confirmedKilled: number;
  staleCleared: number;
  ambiguousFailClosed: number;
}

class JournalStartupRecovery implements AgentStartupRecovery {
  private recoveryPromise: Promise<AgentStartupRecoveryResult> | null = null;
  private advertisePromise: Promise<AgentStartupRecoveryResult> | null = null;

  constructor(private readonly dependencies: AgentStartupRecoveryDependencies) {
    if (
      !Number.isFinite(dependencies.terminationGrace)
      || dependencies.terminationGrace < 0
      || dependencies.terminationGrace > 60_000
      || typeof dependencies.generation !== 'string'
      || !GENERATION_PATTERN.test(dependencies.generation)
      || typeof dependencies.now !== 'function'
    ) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Recovery configuration is invalid');
    }
  }

  recover(): Promise<AgentStartupRecoveryResult> {
    if (!this.recoveryPromise) this.recoveryPromise = this.recoverOnce();
    return this.recoveryPromise;
  }

  recoverBeforeAdvertise(
    advertise: () => void | Promise<void>,
  ): Promise<AgentStartupRecoveryResult> {
    if (!this.advertisePromise) {
      this.advertisePromise = this.recover().then(async (result) => {
        if (result.spawnAvailable) await advertise();
        return result;
      });
    }
    return this.advertisePromise;
  }

  private async recoverOnce(): Promise<AgentStartupRecoveryResult> {
    const profiles = new Map<string, MutableRecoveryProfileSummary>();
    const totals: Record<RecoveryCategory, number> = {
      confirmedKilled: 0,
      staleCleared: 0,
      ambiguousFailClosed: 0,
    };
    const recoveryJournal = this.dependencies.runtimeFiles.readRecoveryDispositions();
    if (recoveryJournal.status !== 'ok') {
      totals.ambiguousFailClosed = 1;
      return this.finish(totals, profiles, []);
    }
    let restartLosses = recoveryJournal.journal.dispositions;
    const journal = this.dependencies.runtimeFiles.readJournal();
    if (journal.status !== 'ok') {
      totals.ambiguousFailClosed = 1;
      return this.finish(totals, profiles, restartLosses);
    }

    for (const entry of journal.journal.entries) {
      const recoveryRequired = entry.generation !== this.dependencies.generation;
      if (!recoveryRequired) {
        this.increment(totals, profiles, entry, 'ambiguousFailClosed');
        continue;
      }
      let inspection;
      try {
        inspection = await this.dependencies.inspector.inspect(entry);
      } catch {
        this.increment(totals, profiles, entry, 'ambiguousFailClosed');
        continue;
      }

      if (inspection.classification === 'ambiguous') {
        this.increment(totals, profiles, entry, 'ambiguousFailClosed');
        continue;
      }

      if (inspection.classification === 'stale') {
        try {
          restartLosses = await this.clearRecoveredEntry(entry, restartLosses);
          this.increment(totals, profiles, entry, 'staleCleared');
        } catch {
          this.increment(totals, profiles, entry, 'ambiguousFailClosed');
        }
        continue;
      }

      try {
        await this.dependencies.terminator.stop(
          entry,
          null,
          { grace: this.dependencies.terminationGrace },
        );
        const settled = await this.dependencies.inspector.inspect(entry);
        if (settled.classification !== 'stale') {
          this.increment(totals, profiles, entry, 'ambiguousFailClosed');
          continue;
        }
        restartLosses = await this.clearRecoveredEntry(entry, restartLosses);
        this.increment(totals, profiles, entry, 'confirmedKilled');
      } catch {
        this.increment(totals, profiles, entry, 'ambiguousFailClosed');
      }
    }

    return this.finish(totals, profiles, restartLosses);
  }

  private clearRecoveredEntry(
    entry: JournalEntry,
    restartLosses: readonly AgentRestartLossDisposition[],
  ): Promise<readonly AgentRestartLossDisposition[]> {
    if (entry.role === 'provider_server') {
      return this.dependencies.runtimeFiles.removeRecoveredRun(entry).then(() => restartLosses);
    }
    const recoveredAt = this.dependencies.now();
    if (!isSafeInteger(recoveredAt)) {
      return Promise.reject(
        new RuntimeFilesError('invalid_runtime_input', 'Recovery timestamp is invalid'),
      );
    }
    return this.dependencies.runtimeFiles.recordRestartLossAndRemoveRun(entry, Object.freeze({
      delegationId: entry.delegationId,
      code: 'daemon_restart_lost_run',
      recoveredAt,
    }));
  }

  private increment(
    totals: Record<RecoveryCategory, number>,
    profiles: Map<string, MutableRecoveryProfileSummary>,
    entry: JournalEntry,
    category: RecoveryCategory,
  ): void {
    totals[category] += 1;
    const key = `${entry.role}\u0000${entry.adapterId}\u0000${entry.profileVersion}`;
    let profile = profiles.get(key);
    if (!profile) {
      profile = {
        role: entry.role,
        adapterId: entry.adapterId,
        profileVersion: entry.profileVersion,
        confirmedKilled: 0,
        staleCleared: 0,
        ambiguousFailClosed: 0,
      };
      profiles.set(key, profile);
    }
    profile[category] += 1;
  }

  private finish(
    totals: Record<RecoveryCategory, number>,
    profiles: Map<string, MutableRecoveryProfileSummary>,
    restartLosses: readonly AgentRestartLossDisposition[],
  ): AgentStartupRecoveryResult {
    const frozenProfiles = [...profiles.values()]
      .sort((left, right) => (
        left.role.localeCompare(right.role)
        || left.adapterId.localeCompare(right.adapterId)
        || left.profileVersion.localeCompare(right.profileVersion)
      ))
      .map((profile) => Object.freeze({ ...profile }));
    return Object.freeze({
      confirmedKilled: totals.confirmedKilled,
      staleCleared: totals.staleCleared,
      ambiguousFailClosed: totals.ambiguousFailClosed,
      spawnAvailable: totals.ambiguousFailClosed === 0,
      profiles: Object.freeze(frozenProfiles),
      restartLosses: Object.freeze(
        [...restartLosses]
          .sort((left, right) => (
            left.recoveredAt - right.recoveredAt
            || left.delegationId.localeCompare(right.delegationId)
          ))
          .slice(-MAX_RECOVERY_DISPOSITIONS)
          .map((entry) => Object.freeze({ ...entry })),
      ),
    });
  }
}

export function createAgentStartupRecovery(
  dependencies: AgentStartupRecoveryDependencies,
): AgentStartupRecovery {
  return new JournalStartupRecovery(dependencies);
}

export const AGENT_RUNTIME_DIRECTORY_MODE = DIRECTORY_MODE;
export const AGENT_RUNTIME_FILE_MODE = FILE_MODE;
export const AGENT_RUNTIME_JOURNAL_VERSION = JOURNAL_VERSION;
export const AGENT_RUNTIME_ROLES = RUNTIME_ROLES;
export const AGENT_RUNTIME_PRIVATE_ARTIFACT_KINDS = PRIVATE_ARTIFACT_KINDS;
export const AGENT_ORPHAN_JOURNAL_LIMIT_BYTES = JOURNAL_LIMIT_BYTES;
export const AGENT_RECOVERY_DISPOSITION_LIMIT_BYTES = RECOVERY_LIMIT_BYTES;
export const AGENT_RECOVERY_DISPOSITION_LIMIT = MAX_RECOVERY_DISPOSITIONS;
