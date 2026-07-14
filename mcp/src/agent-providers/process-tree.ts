import { createHash } from 'node:crypto';
import { execFile as nodeExecFile } from 'node:child_process';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  opendirSync,
  readSync,
} from 'node:fs';
import { win32 } from 'node:path';
import type { SupervisedChild } from './adapter.js';
import type { JournalEntry } from './runtime-files.js';

const MAX_PROCESS_COUNT = 4096;
const MAX_PROC_FILE_BYTES = 256 * 1024;
const MAX_NATIVE_OUTPUT_BYTES = 2 * 1024 * 1024;
const NATIVE_TIMEOUT_MS = 5000;
const DEFAULT_FINAL_WAIT_MS = 1000;

const FINGERPRINT_ENV_NAME = 'FSB_AGENT_FINGERPRINT';
const ARGV_SIGNATURE_ENV_NAME = 'FSB_AGENT_ARGV_SIGNATURE';

export type ProcessInspectionReason =
  | 'evidence_unavailable'
  | 'evidence_partial'
  | 'identity_mismatch'
  | 'multiple_matches'
  | 'group_still_present'
  | 'platform_unsupported';

export interface ConfirmedProcess {
  readonly pid: number;
  readonly parentPid: number;
  readonly processGroupId: number;
  readonly processStartIdentity: string;
  readonly descendants: readonly number[];
}

export type ProcessInspection =
  | { readonly classification: 'confirmed'; readonly process: ConfirmedProcess }
  | { readonly classification: 'stale' }
  | { readonly classification: 'ambiguous'; readonly reason: ProcessInspectionReason };

type AmbiguousInspection = Extract<ProcessInspection, { classification: 'ambiguous' }>;

export interface ProcessInspector {
  inspect(entry: JournalEntry): Promise<ProcessInspection>;
}

interface DirectoryReadResult {
  readonly names: readonly string[];
  readonly truncated: boolean;
}

interface ProcessFsDependencies {
  readonly exists: (path: string) => boolean;
  readonly readDirectory: (path: string, maximumEntries: number) => DirectoryReadResult;
  readonly readBoundedFile: (path: string, maximumBytes: number) => Buffer;
  readonly lstat: (path: string) => {
    isFile(): boolean;
    isSymbolicLink(): boolean;
  };
}

export interface NativeExecOptions {
  readonly timeout: number;
  readonly windowsHide: boolean;
  readonly maxBuffer: number;
  readonly shell: false;
}

export interface NativeExecResult {
  readonly stdout: string | Buffer;
  readonly stderr: string | Buffer;
}

export type NativeExec = (
  file: string,
  args: readonly string[],
  options: NativeExecOptions,
) => Promise<NativeExecResult>;

export interface ProcessInspectorOptions {
  readonly platform?: NodeJS.Platform;
  readonly fs?: Partial<ProcessFsDependencies>;
  readonly exec?: NativeExec;
  readonly systemRoot?: string;
}

interface ProcessRecord {
  readonly pid: number;
  readonly parentPid: number;
  readonly processGroupId: number;
  readonly startIdentity: string;
  readonly command?: string;
}

class InspectionFailure extends Error {
  readonly partial: boolean;

  constructor(partial = false) {
    super('Process evidence is unavailable');
    this.partial = partial;
  }
}

function boundedDirectory(path: string, maximumEntries: number): DirectoryReadResult {
  const directory = opendirSync(path);
  const names: string[] = [];
  let truncated = false;
  try {
    while (true) {
      const entry = directory.readSync();
      if (!entry) break;
      if (names.length >= maximumEntries) {
        truncated = true;
        break;
      }
      names.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  return { names, truncated };
}

function boundedFile(path: string, maximumBytes: number): Buffer {
  const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    if (metadata.size > maximumBytes) throw new InspectionFailure(true);
    const output = Buffer.alloc(Math.min(maximumBytes + 1, 64 * 1024));
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const remaining = maximumBytes + 1 - total;
      if (remaining <= 0) throw new InspectionFailure(true);
      const count = readSync(descriptor, output, 0, Math.min(output.length, remaining), null);
      if (count === 0) break;
      chunks.push(Buffer.from(output.subarray(0, count)));
      total += count;
      if (total > maximumBytes) throw new InspectionFailure(true);
    }
    return Buffer.concat(chunks, total);
  } finally {
    closeSync(descriptor);
  }
}

const DEFAULT_PROCESS_FS: ProcessFsDependencies = {
  exists: existsSync,
  readDirectory: boundedDirectory,
  readBoundedFile: boundedFile,
  lstat: lstatSync,
};

function defaultExec(
  file: string,
  args: readonly string[],
  options: NativeExecOptions,
): Promise<NativeExecResult> {
  return new Promise((resolve, reject) => {
    (nodeExecFile as unknown as (
      command: string,
      commandArgs: string[],
      commandOptions: NativeExecOptions,
      callback: (
        error: Error | null,
        stdout: string | Buffer,
        stderr: string | Buffer,
      ) => void,
    ) => unknown)(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

const NATIVE_EXEC_OPTIONS: NativeExecOptions = Object.freeze({
  timeout: NATIVE_TIMEOUT_MS,
  windowsHide: true,
  maxBuffer: MAX_NATIVE_OUTPUT_BYTES,
  shell: false,
});

function ambiguous(reason: ProcessInspectionReason): AmbiguousInspection {
  return Object.freeze({ classification: 'ambiguous', reason });
}

function stale(): ProcessInspection {
  return Object.freeze({ classification: 'stale' });
}

function confirmed(record: ProcessRecord, descendants: readonly number[]): ProcessInspection {
  return Object.freeze({
    classification: 'confirmed',
    process: Object.freeze({
      pid: record.pid,
      parentPid: record.parentPid,
      processGroupId: record.processGroupId,
      processStartIdentity: record.startIdentity,
      descendants: Object.freeze([...descendants].sort((left, right) => left - right)),
    }),
  });
}

function hashParts(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url');
}

/** Hash the retained executable and exact fixed argument vector, never task text. */
export function createArgvSignature(
  binaryRealPath: string,
  argv: readonly string[],
): string {
  return hashParts([binaryRealPath, ...argv]);
}

/** Convert a native start-time value into the journal's bounded token form. */
export function createProcessStartIdentity(nativeValue: string): string {
  return hashParts([nativeValue]);
}

function exactEnvValue(environment: Buffer, name: string, expected: string): boolean {
  const wanted = `${name}=${expected}`;
  return environment
    .toString('utf8')
    .split('\0')
    .some((entry) => entry === wanted);
}

function parseNullArguments(value: Buffer): string[] | null {
  if (value.length === 0 || value[value.length - 1] !== 0) return null;
  const entries = value.toString('utf8').split('\0');
  entries.pop();
  if (entries.length === 0 || entries.some((entry) => entry.includes('\u0000'))) return null;
  return entries;
}

/** Parse only the fields needed from the documented Linux proc stat layout. */
export function parseLinuxStat(value: string): ProcessRecord | null {
  const match = value.trim().match(/^(\d+) \((.*)\) ([A-Za-z]) (.+)$/);
  if (!match) return null;
  const fields = match[4].trim().split(/\s+/);
  if (fields.length < 19) return null;
  const pid = Number(match[1]);
  const parentPid = Number(fields[0]);
  const processGroupId = Number(fields[1]);
  const startTicks = fields[18];
  if (
    ![pid, parentPid, processGroupId].every(
      (entry) => Number.isSafeInteger(entry) && entry >= 0,
    )
    || !/^\d+$/.test(startTicks)
  ) return null;
  return { pid, parentPid, processGroupId, startIdentity: startTicks };
}

function descendantPids(records: readonly ProcessRecord[], rootPid: number): number[] {
  const descendants = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records) {
      if (
        record.pid !== rootPid
        && !descendants.has(record.pid)
        && (record.parentPid === rootPid || descendants.has(record.parentPid))
      ) {
        descendants.add(record.pid);
        changed = true;
      }
    }
  }
  return [...descendants];
}

class LinuxProcessInspector implements ProcessInspector {
  constructor(private readonly fs: ProcessFsDependencies) {}

  async inspect(entry: JournalEntry): Promise<ProcessInspection> {
    let records: ProcessRecord[];
    try {
      records = this.readProcessTable();
    } catch (error) {
      return ambiguous(error instanceof InspectionFailure && error.partial
        ? 'evidence_partial'
        : 'evidence_unavailable');
    }

    if (entry.state === 'active') {
      const record = records.find((candidate) => candidate.pid === entry.pid);
      if (!record) {
        return records.some((candidate) => candidate.processGroupId === entry.processGroupId)
          ? ambiguous('group_still_present')
          : stale();
      }
      if (
        record.processGroupId !== entry.processGroupId
        || record.startIdentity !== entry.processStartIdentity
      ) return ambiguous('identity_mismatch');
      const exact = this.hasExactEvidence(record.pid, entry);
      if (exact !== true) return exact;
      return confirmed(record, descendantPids(records, record.pid));
    }

    const matches: ProcessRecord[] = [];
    let partial = false;
    for (const record of records) {
      const exact = this.hasExactEvidence(record.pid, entry);
      if (exact === true) matches.push(record);
      else if (exact.classification === 'ambiguous' && exact.reason !== 'identity_mismatch') {
        partial = true;
      }
    }
    if (matches.length > 1) return ambiguous('multiple_matches');
    if (partial) return ambiguous('evidence_partial');
    if (matches.length === 0) return stale();
    return confirmed(matches[0], descendantPids(records, matches[0].pid));
  }

  private readProcessTable(): ProcessRecord[] {
    const listing = this.fs.readDirectory('/proc', MAX_PROCESS_COUNT);
    if (listing.truncated) throw new InspectionFailure(true);
    const numericNames = listing.names.filter((name) => /^\d+$/.test(name));
    if (numericNames.length > MAX_PROCESS_COUNT) throw new InspectionFailure(true);
    const records: ProcessRecord[] = [];
    for (const name of numericNames) {
      const processPath = `/proc/${name}`;
      try {
        const record = parseLinuxStat(
          this.fs.readBoundedFile(`${processPath}/stat`, MAX_PROC_FILE_BYTES).toString('utf8'),
        );
        if (!record || record.pid !== Number(name)) throw new InspectionFailure(true);
        records.push(record);
      } catch (error) {
        if (!this.fs.exists(processPath)) continue;
        if (error instanceof InspectionFailure) throw error;
        throw new InspectionFailure(false);
      }
    }
    return records;
  }

  private hasExactEvidence(
    pid: number,
    entry: JournalEntry,
  ): true | AmbiguousInspection {
    const processPath = `/proc/${pid}`;
    try {
      const argv = parseNullArguments(
        this.fs.readBoundedFile(`${processPath}/cmdline`, MAX_PROC_FILE_BYTES),
      );
      if (
        !argv
        || argv[0] !== entry.binaryRealPath
        || createArgvSignature(argv[0], argv.slice(1)) !== entry.argvSignature
      ) return ambiguous('identity_mismatch');
      const environment = this.fs.readBoundedFile(
        `${processPath}/environ`,
        MAX_PROC_FILE_BYTES,
      );
      if (!exactEnvValue(environment, FINGERPRINT_ENV_NAME, entry.envFingerprint)) {
        return ambiguous('identity_mismatch');
      }
      return true;
    } catch (error) {
      if (!this.fs.exists(processPath)) return ambiguous('evidence_partial');
      return ambiguous(error instanceof InspectionFailure && error.partial
        ? 'evidence_partial'
        : 'evidence_unavailable');
    }
  }
}

const DARWIN_TABLE_ARGS = Object.freeze([
  '-axo',
  'pid=,ppid=,pgid=,lstart=,command=',
]);

function textOutput(result: NativeExecResult): string {
  const stdout = Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout, 'utf8');
  const stderr = Buffer.isBuffer(result.stderr)
    ? result.stderr
    : Buffer.from(result.stderr, 'utf8');
  if (stdout.length > MAX_NATIVE_OUTPUT_BYTES || stderr.length > MAX_NATIVE_OUTPUT_BYTES) {
    throw new InspectionFailure(true);
  }
  return stdout.toString('utf8');
}

/** Parse the fixed Darwin ps table; any unparseable nonblank row fails the table. */
export function parseDarwinProcessTable(value: string): ProcessRecord[] | null {
  const records: ProcessRecord[] = [];
  const lines = value.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length > MAX_PROCESS_COUNT) return null;
  const rowPattern = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/;
  for (const line of lines) {
    const match = line.match(rowPattern);
    if (!match) return null;
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    const processGroupId = Number(match[3]);
    if (![pid, parentPid, processGroupId].every(Number.isSafeInteger)) return null;
    records.push({
      pid,
      parentPid,
      processGroupId,
      startIdentity: createProcessStartIdentity(match[4]),
      command: match[5],
    });
  }
  return records;
}

function commandStartsWithBinary(command: string | undefined, binary: string): boolean {
  if (!command?.startsWith(binary)) return false;
  const next = command[binary.length];
  return next === undefined || /\s/.test(next);
}

class DarwinProcessInspector implements ProcessInspector {
  constructor(private readonly exec: NativeExec) {}

  async inspect(entry: JournalEntry): Promise<ProcessInspection> {
    let records: ProcessRecord[];
    try {
      const result = await this.exec('/bin/ps', DARWIN_TABLE_ARGS, NATIVE_EXEC_OPTIONS);
      records = parseDarwinProcessTable(textOutput(result)) ?? [];
      if (records.length === 0 && textOutput(result).trim() !== '') {
        return ambiguous('evidence_partial');
      }
    } catch {
      return ambiguous('evidence_unavailable');
    }

    if (entry.state === 'active') {
      const record = records.find((candidate) => candidate.pid === entry.pid);
      if (!record) {
        return records.some((candidate) => candidate.processGroupId === entry.processGroupId)
          ? ambiguous('group_still_present')
          : stale();
      }
      if (
        record.processGroupId !== entry.processGroupId
        || record.startIdentity !== entry.processStartIdentity
        || !commandStartsWithBinary(record.command, entry.binaryRealPath)
      ) return ambiguous('identity_mismatch');
      const evidence = await this.readExactEvidence(record, entry);
      if (evidence !== true) return evidence;
      return confirmed(record, descendantPids(records, record.pid));
    }

    const candidates = records.filter((record) => (
      commandStartsWithBinary(record.command, entry.binaryRealPath)
    ));
    const matches: ProcessRecord[] = [];
    for (const candidate of candidates) {
      const evidence = await this.readExactEvidence(candidate, entry);
      if (evidence === true) matches.push(candidate);
      else if (evidence.reason !== 'identity_mismatch') return evidence;
    }
    if (matches.length > 1) return ambiguous('multiple_matches');
    if (matches.length === 0) return stale();
    return confirmed(matches[0], descendantPids(records, matches[0].pid));
  }

  private async readExactEvidence(
    record: ProcessRecord,
    entry: JournalEntry,
  ): Promise<true | AmbiguousInspection> {
    const args = [
      '-E',
      '-ww',
      '-p',
      String(record.pid),
      '-o',
      'pid=,ppid=,pgid=,lstart=,command=',
    ];
    try {
      const output = textOutput(await this.exec('/bin/ps', args, NATIVE_EXEC_OPTIONS));
      const parsed = parseDarwinProcessTable(output);
      if (!parsed || parsed.length !== 1) return ambiguous('evidence_partial');
      const evidence = parsed[0];
      if (
        evidence.pid !== record.pid
        || evidence.processGroupId !== record.processGroupId
        || evidence.startIdentity !== record.startIdentity
        || !commandStartsWithBinary(evidence.command, entry.binaryRealPath)
        || !evidence.command?.includes(
          `${ARGV_SIGNATURE_ENV_NAME}=${entry.argvSignature}`,
        )
        || !evidence.command.includes(
          `${FINGERPRINT_ENV_NAME}=${entry.envFingerprint}`,
        )
      ) return ambiguous('identity_mismatch');
      return true;
    } catch {
      return ambiguous('evidence_unavailable');
    }
  }
}

const WINDOWS_WMIC_ARGS = Object.freeze([
  'process',
  'get',
  'ProcessId,ParentProcessId,CreationDate,CommandLine',
  '/format:csv',
]);

class WindowsProcessInspector implements ProcessInspector {
  constructor(
    private readonly fs: ProcessFsDependencies,
    private readonly exec: NativeExec,
    private readonly systemRoot: string,
  ) {}

  async inspect(_entry: JournalEntry): Promise<ProcessInspection> {
    const executable = win32.join(this.systemRoot, 'System32', 'wbem', 'wmic.exe');
    if (!win32.isAbsolute(executable)) return ambiguous('evidence_unavailable');
    try {
      const metadata = this.fs.lstat(executable);
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        return ambiguous('evidence_unavailable');
      }
      const output = textOutput(
        await this.exec(executable, WINDOWS_WMIC_ARGS, NATIVE_EXEC_OPTIONS),
      );
      const header = output.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
      const required = [
        'CommandLine',
        'CreationDate',
        'ParentProcessId',
        'ProcessId',
      ];
      if (!required.every((field) => header.split(',').includes(field))) {
        return ambiguous('evidence_partial');
      }
      if (output.split(/\r?\n/).length > MAX_PROCESS_COUNT + 2) {
        return ambiguous('evidence_partial');
      }
    } catch {
      return ambiguous('evidence_unavailable');
    }
    // The native zero-dependency query cannot prove a per-process environment value.
    return ambiguous('evidence_partial');
  }
}

class UnsupportedProcessInspector implements ProcessInspector {
  async inspect(_entry: JournalEntry): Promise<ProcessInspection> {
    return ambiguous('platform_unsupported');
  }
}

export function createProcessInspector(
  options: ProcessInspectorOptions = {},
): ProcessInspector {
  const platform = options.platform ?? process.platform;
  const fs = { ...DEFAULT_PROCESS_FS, ...options.fs };
  const exec = options.exec ?? defaultExec;
  if (platform === 'linux') return new LinuxProcessInspector(fs);
  if (platform === 'darwin') return new DarwinProcessInspector(exec);
  if (platform === 'win32') {
    return new WindowsProcessInspector(fs, exec, options.systemRoot ?? process.env.SystemRoot ?? '');
  }
  return new UnsupportedProcessInspector();
}

export type TreeSignal = 'SIGTERM' | 'SIGKILL';

export interface TreeTerminatorOptions {
  readonly grace: number;
}

export interface ProcessTreeTerminator {
  stop(
    entry: JournalEntry,
    child: SupervisedChild | null,
    options: TreeTerminatorOptions,
  ): Promise<void>;
}

export interface ProcessTreeTerminatorDependencies {
  readonly platform?: NodeJS.Platform;
  readonly inspector: ProcessInspector;
  readonly signalGroup?: (negativeProcessGroupId: number, signal: TreeSignal) => void;
  readonly taskkill?: (pid: number) => Promise<void>;
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly monotonicNow?: () => number;
  readonly systemRoot?: string;
  readonly fs?: Pick<ProcessFsDependencies, 'lstat'>;
  readonly exec?: NativeExec;
}

export class TreeUnsettledError extends Error {
  readonly code = 'tree_unsettled' as const;

  constructor(message = 'Agent process tree did not settle') {
    super(message);
    this.name = 'TreeUnsettledError';
  }
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function createNativeTaskkill(
  systemRoot: string,
  fs: Pick<ProcessFsDependencies, 'lstat'>,
  exec: NativeExec,
): (pid: number) => Promise<void> {
  return async (pid) => {
    const executable = win32.join(systemRoot, 'System32', 'taskkill.exe');
    if (!win32.isAbsolute(executable)) throw new TreeUnsettledError();
    let metadata: ReturnType<ProcessFsDependencies['lstat']>;
    try {
      metadata = fs.lstat(executable);
    } catch {
      throw new TreeUnsettledError();
    }
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new TreeUnsettledError();
    await exec(
      executable,
      ['/pid', String(pid), '/T', '/F'],
      NATIVE_EXEC_OPTIONS,
    );
  };
}

class VerifiedProcessTreeTerminator implements ProcessTreeTerminator {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly platform: NodeJS.Platform;
  private readonly signalGroup: (negativeProcessGroupId: number, signal: TreeSignal) => void;
  private readonly taskkill: (pid: number) => Promise<void>;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly monotonicNow: () => number;

  constructor(private readonly dependencies: ProcessTreeTerminatorDependencies) {
    this.platform = dependencies.platform ?? process.platform;
    this.signalGroup = dependencies.signalGroup
      ?? ((negativeProcessGroupId, signal) => process.kill(negativeProcessGroupId, signal));
    const fs = dependencies.fs ?? { lstat: DEFAULT_PROCESS_FS.lstat };
    this.taskkill = dependencies.taskkill ?? createNativeTaskkill(
      dependencies.systemRoot ?? process.env.SystemRoot ?? '',
      fs,
      dependencies.exec ?? defaultExec,
    );
    this.wait = dependencies.wait ?? defaultWait;
    this.monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  }

  stop(
    entry: JournalEntry,
    child: SupervisedChild | null,
    options: TreeTerminatorOptions,
  ): Promise<void> {
    if (!Number.isFinite(options.grace) || options.grace < 0 || options.grace > 60_000) {
      return Promise.reject(new TreeUnsettledError());
    }
    const key = `${entry.delegationId}:${entry.state === 'active' ? entry.pid : 'prepared'}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const operation = this.stopOnce(entry, child, options);
    this.inFlight.set(key, operation);
    return operation;
  }

  private async stopOnce(
    entry: JournalEntry,
    child: SupervisedChild | null,
    options: TreeTerminatorOptions,
  ): Promise<void> {
    const initial = await this.dependencies.inspector.inspect(entry);
    if (initial.classification === 'ambiguous') throw new TreeUnsettledError();
    if (initial.classification === 'stale') {
      const childClosed = await this.waitForChild(child, options.grace);
      const final = await this.dependencies.inspector.inspect(entry);
      if (final.classification !== 'stale' || !childClosed) throw new TreeUnsettledError();
      return;
    }

    if (this.platform === 'win32') {
      try {
        await this.taskkill(initial.process.pid);
      } catch {
        throw new TreeUnsettledError();
      }
      const childClosed = await this.waitForChild(child, options.grace);
      const final = await this.dependencies.inspector.inspect(entry);
      if (final.classification !== 'stale' || !childClosed) throw new TreeUnsettledError();
      return;
    }

    if (this.platform !== 'linux' && this.platform !== 'darwin') {
      throw new TreeUnsettledError();
    }

    const negativeGroupId = -initial.process.processGroupId;
    try {
      this.signalGroup(negativeGroupId, 'SIGTERM');
    } catch (error) {
      if (errorCode(error) !== 'ESRCH') throw new TreeUnsettledError();
      const afterMissing = await this.dependencies.inspector.inspect(entry);
      if (afterMissing.classification !== 'stale') throw new TreeUnsettledError();
    }

    const started = this.monotonicNow();
    const childClosedDuringGrace = await this.waitForChild(child, options.grace);
    if (this.monotonicNow() < started) throw new TreeUnsettledError();
    let afterGrace = await this.dependencies.inspector.inspect(entry);
    if (afterGrace.classification === 'ambiguous') throw new TreeUnsettledError();
    if (afterGrace.classification === 'confirmed') {
      try {
        this.signalGroup(-afterGrace.process.processGroupId, 'SIGKILL');
      } catch (error) {
        if (errorCode(error) !== 'ESRCH') throw new TreeUnsettledError();
      }
      const childClosedAfterKill = childClosedDuringGrace
        || await this.waitForChild(child, Math.max(options.grace, DEFAULT_FINAL_WAIT_MS));
      afterGrace = await this.dependencies.inspector.inspect(entry);
      if (afterGrace.classification !== 'stale' || !childClosedAfterKill) {
        throw new TreeUnsettledError();
      }
      return;
    }
    if (!childClosedDuringGrace) throw new TreeUnsettledError();
  }

  private async waitForChild(
    child: SupervisedChild | null,
    milliseconds: number,
  ): Promise<boolean> {
    if (!child) {
      await this.wait(milliseconds);
      return true;
    }
    return Promise.race([
      child.closed.then(() => true, () => true),
      this.wait(milliseconds).then(() => false),
    ]);
  }
}

export function createProcessTreeTerminator(
  dependencies: ProcessTreeTerminatorDependencies,
): ProcessTreeTerminator {
  return new VerifiedProcessTreeTerminator(dependencies);
}

export const PROCESS_INSPECTION_MAX_PROCESSES = MAX_PROCESS_COUNT;
export const PROCESS_INSPECTION_MAX_OUTPUT_BYTES = MAX_NATIVE_OUTPUT_BYTES;
export const DARWIN_PROCESS_TABLE_ARGS = DARWIN_TABLE_ARGS;
export const WINDOWS_PROCESS_QUERY_ARGS = WINDOWS_WMIC_ARGS;
export const PROCESS_NATIVE_EXEC_OPTIONS = NATIVE_EXEC_OPTIONS;
