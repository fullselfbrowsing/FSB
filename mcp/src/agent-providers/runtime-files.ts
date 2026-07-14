import { randomBytes } from 'node:crypto';
import * as nodeFs from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { CLAUDE_CODE_ADAPTER_ID, type AgentProviderId } from './adapter.js';
import type { ProcessInspector, ProcessTreeTerminator } from './process-tree.js';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const JOURNAL_VERSION = 1 as const;
const JOURNAL_FILENAME = 'agent-orphans.json';
const MCP_CONFIG_FILENAME = 'mcp-config.json';
const JOURNAL_LIMIT_BYTES = 256 * 1024;
const MAX_JOURNAL_ENTRIES = 256;

const DELEGATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const PROFILE_VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,64}$/;
const FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const PROCESS_IDENTITY_PATTERN = /^[A-Za-z0-9_.:+-]{1,256}$/;

const PREPARED_KEYS = Object.freeze([
  'adapterId',
  'argvSignature',
  'binaryRealPath',
  'createdAt',
  'delegationId',
  'envFingerprint',
  'profileVersion',
  'state',
]);
const ACTIVE_KEYS = Object.freeze([
  ...PREPARED_KEYS,
  'pid',
  'processGroupId',
  'processStartIdentity',
  'startedAt',
].sort());
const JOURNAL_KEYS = Object.freeze(['entries', 'version']);
const PREPARE_INPUT_KEYS = Object.freeze([
  'adapterId',
  'argvSignature',
  'binaryRealPath',
  'createdAt',
  'delegationId',
  'endpoint',
  'envFingerprint',
  'profileVersion',
]);
const ACTIVATE_INPUT_KEYS = Object.freeze([
  'delegationId',
  'pid',
  'processGroupId',
  'processStartIdentity',
  'startedAt',
]);

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
  readonly delegationId: string;
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly createdAt: number;
  readonly binaryRealPath: string;
  readonly argvSignature: string;
  readonly envFingerprint: string;
}

export interface ActiveJournalEntry {
  readonly state: 'active';
  readonly delegationId: string;
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly createdAt: number;
  readonly binaryRealPath: string;
  readonly argvSignature: string;
  readonly envFingerprint: string;
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

export type JournalUnavailableReason = 'corrupt' | 'insecure' | 'io' | 'oversize';

export type JournalReadResult =
  | { readonly status: 'ok'; readonly journal: AgentOrphanJournal }
  | { readonly status: 'unavailable'; readonly reason: JournalUnavailableReason };

export interface PrepareRunInput {
  readonly delegationId: string;
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly createdAt: number;
  readonly binaryRealPath: string;
  readonly argvSignature: string;
  readonly envFingerprint: string;
  readonly endpoint: string;
}

export interface ActivateRunInput {
  readonly delegationId: string;
  readonly pid: number;
  readonly processGroupId: number;
  readonly startedAt: number;
  readonly processStartIdentity: string;
}

export interface PreparedRun {
  readonly entry: PreparedJournalEntry;
  readonly runDirectory: string;
  readonly mcpConfigPath: string;
}

export interface AgentRecoveryProfileSummary {
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
}

export interface AgentStartupRecoveryDependencies {
  readonly runtimeFiles: Pick<AgentRuntimeFiles, 'readJournal' | 'removeRun'>;
  readonly inspector: ProcessInspector;
  readonly terminator: ProcessTreeTerminator;
  readonly terminationGrace: number;
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

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
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

function isPreparedEntry(value: unknown): value is PreparedJournalEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return exactKeys(entry, PREPARED_KEYS)
    && entry.state === 'prepared'
    && typeof entry.delegationId === 'string'
    && DELEGATION_ID_PATTERN.test(entry.delegationId)
    && entry.adapterId === CLAUDE_CODE_ADAPTER_ID
    && typeof entry.profileVersion === 'string'
    && PROFILE_VERSION_PATTERN.test(entry.profileVersion)
    && isSafeInteger(entry.createdAt)
    && isAbsoluteBoundedPath(entry.binaryRealPath)
    && typeof entry.argvSignature === 'string'
    && FINGERPRINT_PATTERN.test(entry.argvSignature)
    && typeof entry.envFingerprint === 'string'
    && FINGERPRINT_PATTERN.test(entry.envFingerprint);
}

function isActiveEntry(value: unknown): value is ActiveJournalEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (!exactKeys(entry, ACTIVE_KEYS)) return false;
  const preparedShape = {
    state: 'prepared',
    delegationId: entry.delegationId,
    adapterId: entry.adapterId,
    profileVersion: entry.profileVersion,
    createdAt: entry.createdAt,
    binaryRealPath: entry.binaryRealPath,
    argvSignature: entry.argvSignature,
    envFingerprint: entry.envFingerprint,
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
  return Object.freeze({ ...entry });
}

function freezeJournal(entries: readonly JournalEntry[]): AgentOrphanJournal {
  return Object.freeze({
    version: JOURNAL_VERSION,
    entries: Object.freeze(entries.map(freezeEntry)),
  });
}

function parseJournal(value: unknown): AgentOrphanJournal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const journal = value as Record<string, unknown>;
  if (!exactKeys(journal, JOURNAL_KEYS) || journal.version !== JOURNAL_VERSION) return null;
  if (!Array.isArray(journal.entries) || journal.entries.length > MAX_JOURNAL_ENTRIES) return null;

  const entries: JournalEntry[] = [];
  const delegationIds = new Set<string>();
  const envFingerprints = new Set<string>();
  for (const candidate of journal.entries) {
    if (!isPreparedEntry(candidate) && !isActiveEntry(candidate)) return null;
    if (
      delegationIds.has(candidate.delegationId)
      || envFingerprints.has(candidate.envFingerprint)
    ) return null;
    delegationIds.add(candidate.delegationId);
    envFingerprints.add(candidate.envFingerprint);
    entries.push(candidate);
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

function validatePrepareInput(input: PrepareRunInput): PreparedJournalEntry {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
  }
  if (!exactKeys(input as unknown as Record<string, unknown>, PREPARE_INPUT_KEYS)) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
  }
  const entry: PreparedJournalEntry = {
    state: 'prepared',
    delegationId: input.delegationId,
    adapterId: input.adapterId,
    profileVersion: input.profileVersion,
    createdAt: input.createdAt,
    binaryRealPath: input.binaryRealPath,
    argvSignature: input.argvSignature,
    envFingerprint: input.envFingerprint,
  };
  if (!isPreparedEntry(entry)) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Prepared runtime state is invalid');
  }
  validateEndpoint(input.endpoint);
  return freezeEntry(entry) as PreparedJournalEntry;
}

function validateActivateInput(input: ActivateRunInput): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RuntimeFilesError('invalid_runtime_input', 'Active runtime state is invalid');
  }
  if (!exactKeys(input as unknown as Record<string, unknown>, ACTIVATE_INPUT_KEYS)) {
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
}

export function getAgentRuntimeRoot(homeDir = homedir()): string {
  return join(homeDir, '.fsb', 'agent-runtime');
}

export class AgentRuntimeFiles {
  readonly rootPath: string;
  readonly journalPath: string;

  private readonly platform: NodeJS.Platform;
  private readonly fs: RuntimeFsDependencies;
  private readonly randomToken: () => string;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: RuntimeFilesOptions = {}) {
    this.rootPath = options.rootPath ?? getAgentRuntimeRoot();
    if (!isAbsoluteBoundedPath(this.rootPath)) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Runtime root path is invalid');
    }
    this.journalPath = join(this.rootPath, JOURNAL_FILENAME);
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
        || (this.platform !== 'win32' && (root.mode & 0o077) !== 0)
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
        || (this.platform !== 'win32' && (target.mode & 0o077) !== 0)
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
        ? { status: 'ok', journal }
        : { status: 'unavailable', reason: 'corrupt' };
    } catch (error) {
      if (error instanceof SyntaxError) {
        return { status: 'unavailable', reason: 'corrupt' };
      }
      return { status: 'unavailable', reason: 'io' };
    }
  }

  prepareRun(input: PrepareRunInput): Promise<PreparedRun> {
    const entry = validatePrepareInput(input);
    const endpoint = validateEndpoint(input.endpoint);
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
      const runDirectory = this.ensureRunDirectory(entry.delegationId);
      const mcpConfigPath = join(runDirectory, MCP_CONFIG_FILENAME);
      const config = {
        mcpServers: {
          fsb: {
            type: 'http',
            url: endpoint,
          },
        },
      };
      this.atomicWrite(mcpConfigPath, `${JSON.stringify(config)}\n`, false);
      this.writeJournal([...journal.entries, entry]);
      return Object.freeze({ entry, runDirectory, mcpConfigPath });
    });
  }

  activateRun(input: ActivateRunInput): Promise<ActiveJournalEntry> {
    validateActivateInput(input);
    return this.serializeMutation(() => {
      const journal = this.requireJournal();
      const index = journal.entries.findIndex(
        (entry) => entry.delegationId === input.delegationId,
      );
      const prepared = journal.entries[index];
      if (index < 0 || !prepared || prepared.state !== 'prepared') {
        throw new RuntimeFilesError('journal_conflict', 'Prepared runtime entry is unavailable');
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

  removeRun(delegationId: string): Promise<void> {
    if (!DELEGATION_ID_PATTERN.test(delegationId)) {
      return Promise.reject(
        new RuntimeFilesError('invalid_runtime_input', 'Delegation id is invalid'),
      );
    }
    return this.serializeMutation(() => {
      const journal = this.requireJournal();
      const entries = journal.entries.filter((entry) => entry.delegationId !== delegationId);
      this.cleanupRunDirectory(delegationId);
      if (entries.length !== journal.entries.length) this.writeJournal(entries);
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

  private ensureRoot(): void {
    this.ensureDirectory(this.rootPath);
  }

  private ensureRunDirectory(delegationId: string): string {
    if (!DELEGATION_ID_PATTERN.test(delegationId)) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Delegation id is invalid');
    }
    const directory = join(this.rootPath, delegationId);
    this.ensureDirectory(directory);
    return directory;
  }

  private ensureDirectory(path: string): void {
    try {
      this.fs.mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE });
      const target = this.fs.lstatSync(path);
      if (target.isSymbolicLink() || !target.isDirectory()) {
        throw new RuntimeFilesError(
          'runtime_target_unavailable',
          'Runtime directory is unavailable',
        );
      }
      this.fs.chmodSync(path, DIRECTORY_MODE);
    } catch (error) {
      if (error instanceof RuntimeFilesError) throw error;
      throw new RuntimeFilesError('runtime_target_unavailable', 'Runtime directory is unavailable');
    }
  }

  private assertWritableFileTarget(path: string, allowExisting: boolean): void {
    if (!this.fs.existsSync(path)) return;
    const target = this.fs.lstatSync(path);
    if (target.isSymbolicLink() || !target.isFile() || !allowExisting) {
      throw new RuntimeFilesError('runtime_target_unavailable', 'Runtime file target is unavailable');
    }
  }

  private atomicWrite(path: string, value: string, allowExisting: boolean): void {
    this.assertWritableFileTarget(path, allowExisting);
    const tempPath = join(this.rootPath, `.${this.randomToken()}.agent-runtime.tmp`);
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
    if (!reparsed) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Agent orphan journal is invalid');
    }
    const serialized = `${JSON.stringify(journal)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > JOURNAL_LIMIT_BYTES) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Agent orphan journal is oversized');
    }
    this.ensureRoot();
    this.atomicWrite(this.journalPath, serialized, true);
  }

  private cleanupRunDirectory(delegationId: string): void {
    const directory = join(this.rootPath, delegationId);
    if (!this.fs.existsSync(directory)) return;
    try {
      const target = this.fs.lstatSync(directory);
      if (target.isSymbolicLink() || !target.isDirectory()) {
        throw new RuntimeFilesError(
          'runtime_target_unavailable',
          'Runtime directory cleanup is unavailable',
        );
      }
      const children = this.fs.readdirSync(directory);
      for (const child of children) {
        if (child !== MCP_CONFIG_FILENAME) {
          throw new RuntimeFilesError(
            'runtime_target_unavailable',
            'Runtime directory cleanup is unavailable',
          );
        }
        const childPath = join(directory, child);
        const childTarget = this.fs.lstatSync(childPath);
        if (childTarget.isSymbolicLink() || !childTarget.isFile()) {
          throw new RuntimeFilesError(
            'runtime_target_unavailable',
            'Runtime directory cleanup is unavailable',
          );
        }
        this.fs.unlinkSync(childPath);
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
    ) {
      throw new RuntimeFilesError('invalid_runtime_input', 'Recovery grace is invalid');
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
    const journal = this.dependencies.runtimeFiles.readJournal();
    if (journal.status !== 'ok') {
      totals.ambiguousFailClosed = 1;
      return this.finish(totals, profiles);
    }

    for (const entry of journal.journal.entries) {
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
          await this.dependencies.runtimeFiles.removeRun(entry.delegationId);
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
        await this.dependencies.runtimeFiles.removeRun(entry.delegationId);
        this.increment(totals, profiles, entry, 'confirmedKilled');
      } catch {
        this.increment(totals, profiles, entry, 'ambiguousFailClosed');
      }
    }

    return this.finish(totals, profiles);
  }

  private increment(
    totals: Record<RecoveryCategory, number>,
    profiles: Map<string, MutableRecoveryProfileSummary>,
    entry: JournalEntry,
    category: RecoveryCategory,
  ): void {
    totals[category] += 1;
    const key = `${entry.adapterId}\u0000${entry.profileVersion}`;
    let profile = profiles.get(key);
    if (!profile) {
      profile = {
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
  ): AgentStartupRecoveryResult {
    const frozenProfiles = [...profiles.values()]
      .sort((left, right) => (
        left.adapterId.localeCompare(right.adapterId)
        || left.profileVersion.localeCompare(right.profileVersion)
      ))
      .map((profile) => Object.freeze({ ...profile }));
    return Object.freeze({
      confirmedKilled: totals.confirmedKilled,
      staleCleared: totals.staleCleared,
      ambiguousFailClosed: totals.ambiguousFailClosed,
      spawnAvailable: totals.ambiguousFailClosed === 0,
      profiles: Object.freeze(frozenProfiles),
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
export const AGENT_ORPHAN_JOURNAL_LIMIT_BYTES = JOURNAL_LIMIT_BYTES;
