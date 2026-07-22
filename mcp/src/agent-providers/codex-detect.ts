import { constants as fsConstants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { delimiter, extname, isAbsolute, join, win32 } from 'node:path';
import {
  CODEX_ADAPTER_ID,
  type AdapterAuthState,
  type AdapterDetection,
  type AdapterDiagnosticCode,
  type RetainedBinary,
} from './adapter.js';
import {
  classifyAdapterCompatibility,
  getAdapterCompatibilityContract,
} from './compatibility.js';
import {
  runBoundedProcessProbe,
  type BoundedProcessProbeDescriptor,
  type BoundedProcessProbeResult,
} from './process-probe.js';
import {
  buildSanitizedAgentEnvironment,
  DELEGATION_AGENT_ENVIRONMENT_POLICY,
} from './spawn-environment.js';

export const CODEX_PROFILE_VERSION = '0.142.5' as const;
export const CODEX_NATIVE_EXECUTABLE_NAMES = Object.freeze({
  posix: Object.freeze(['codex'] as const),
  win32: Object.freeze(['codex.exe', 'codex.com', 'codex.cmd', 'codex.bat'] as const),
});

const PROBE_TIMEOUT_MS = 3_000;
const VERSION_OUTPUT_LIMIT_BYTES = 64 * 1024;
const AUTH_OUTPUT_LIMIT_BYTES = 128;
const MAX_PATH_BYTES = 4_096;
const MAX_PREFIX_ARGUMENTS = 8;
const MAX_PREFIX_BYTES = 32 * 1024;
const EMPTY = Buffer.alloc(0);
const CHATGPT_STATUS = Buffer.from('Logged in using ChatGPT\n', 'utf8');
const UNAUTHENTICATED_STATUS = Buffer.from('Not logged in\n', 'utf8');
const API_KEY_PREFIX = Buffer.from('Logged in using an API key - ', 'utf8');
const API_KEY_SEPARATOR = Buffer.from('***', 'ascii');
const API_KEY_PREFIX_FRAGMENT_BYTES = 8;
const API_KEY_SUFFIX_FRAGMENT_BYTES = 5;

export interface CodexBinaryCandidate {
  readonly sourcePath: string;
  readonly realPath: string;
}

export interface VerifiedCodexWindowsShim {
  readonly verified: true;
  readonly command: string;
  readonly realPath: string;
  readonly argvPrefix: readonly string[];
}

export type CodexProbeDependency = (
  descriptor: BoundedProcessProbeDescriptor,
) => Promise<BoundedProcessProbeResult>;

export interface CodexDetectDependencies {
  readonly platform: NodeJS.Platform;
  readonly pathValue: string;
  readonly cwd: string;
  readonly sourceEnv: NodeJS.ProcessEnv;
  readonly resolveBinary: () => Promise<CodexBinaryCandidate | null>;
  readonly resolveRealPath: (path: string) => Promise<string>;
  readonly resolveWindowsShim: (
    candidate: CodexBinaryCandidate,
  ) => Promise<VerifiedCodexWindowsShim | null>;
  readonly probe: CodexProbeDependency;
}

function requireCompatibility() {
  const compatibility = getAdapterCompatibilityContract(CODEX_ADAPTER_ID);
  if (!compatibility || compatibility.profileVersion !== CODEX_PROFILE_VERSION) {
    throw new Error('Codex compatibility contract is unavailable');
  }
  return compatibility;
}

const CODEX_COMPATIBILITY = requireCompatibility();

function pathApi(platform: NodeJS.Platform): typeof win32 {
  return platform === 'win32' ? win32 : { delimiter, extname, isAbsolute, join } as typeof win32;
}

async function resolveFromPath(
  platform: NodeJS.Platform,
  pathValue: string,
): Promise<CodexBinaryCandidate | null> {
  const paths = pathApi(platform);
  const names = platform === 'win32'
    ? CODEX_NATIVE_EXECUTABLE_NAMES.win32
    : CODEX_NATIVE_EXECUTABLE_NAMES.posix;
  for (const directory of pathValue.split(paths.delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      const sourcePath = paths.join(directory, name);
      try {
        await access(sourcePath, fsConstants.X_OK);
        const resolved = await realpath(sourcePath);
        const metadata = await stat(resolved);
        if (metadata.isFile()) return Object.freeze({ sourcePath, realPath: resolved });
      } catch {
        // Continue through only the fixed native candidate names.
      }
    }
  }
  return null;
}

function defaultDependencies(): CodexDetectDependencies {
  const platform = process.platform;
  const pathValue = process.env.PATH ?? '';
  return {
    platform,
    pathValue,
    cwd: process.cwd(),
    sourceEnv: process.env,
    resolveBinary: () => resolveFromPath(platform, pathValue),
    resolveRealPath: realpath,
    resolveWindowsShim: async () => null,
    probe: runBoundedProcessProbe,
  };
}

interface UnavailableEvidence {
  readonly version?: string | null;
  readonly binary?: RetainedBinary | null;
}

function unavailable(
  code: AdapterDiagnosticCode,
  message: string,
  evidence: UnavailableEvidence = {},
): AdapterDetection {
  return Object.freeze({
    installed: false,
    version: evidence.version ?? null,
    authState: 'unknown',
    binary: evidence.binary ?? null,
    profileVersion: null,
    diagnostic: Object.freeze({ code, message }),
  });
}

function safeAbsolutePath(platform: NodeJS.Platform, value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('\0')
    && Buffer.byteLength(value, 'utf8') <= MAX_PATH_BYTES
    && pathApi(platform).isAbsolute(value);
}

function safePrefix(values: readonly string[]): boolean {
  if (values.length === 0 || values.length > MAX_PREFIX_ARGUMENTS) return false;
  let bytes = 0;
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return false;
    bytes += Buffer.byteLength(value, 'utf8');
    if (bytes > MAX_PREFIX_BYTES) return false;
  }
  return true;
}

async function identityMatches(
  dependencies: CodexDetectDependencies,
  path: string,
  expectedRealPath: string,
): Promise<boolean> {
  try {
    return await dependencies.resolveRealPath(path) === expectedRealPath;
  } catch {
    return false;
  }
}

async function retainExecutable(
  dependencies: CodexDetectDependencies,
  candidate: CodexBinaryCandidate,
): Promise<RetainedBinary | null> {
  if (
    !safeAbsolutePath(dependencies.platform, candidate.sourcePath)
    || !safeAbsolutePath(dependencies.platform, candidate.realPath)
    || !await identityMatches(dependencies, candidate.sourcePath, candidate.realPath)
  ) return null;
  if (dependencies.platform !== 'win32') {
    return Object.freeze({
      command: candidate.realPath,
      realPath: candidate.realPath,
      argvPrefix: Object.freeze([]),
    });
  }
  const extension = pathApi(dependencies.platform).extname(candidate.sourcePath).toLowerCase();
  if (extension === '.cmd' || extension === '.bat') {
    let shim: VerifiedCodexWindowsShim | null;
    try {
      shim = await dependencies.resolveWindowsShim(candidate);
    } catch {
      return null;
    }
    if (
      !shim
      || shim.verified !== true
      || !safeAbsolutePath(dependencies.platform, shim.command)
      || !safeAbsolutePath(dependencies.platform, shim.realPath)
      || !safePrefix(shim.argvPrefix)
      || !await identityMatches(dependencies, shim.command, shim.realPath)
    ) return null;
    return Object.freeze({
      command: shim.realPath,
      realPath: shim.realPath,
      argvPrefix: Object.freeze([...shim.argvPrefix]),
    });
  }
  if (extension !== '.exe' && extension !== '.com') return null;
  return Object.freeze({
    command: candidate.realPath,
    realPath: candidate.realPath,
    argvPrefix: Object.freeze([]),
  });
}

function safeApiFragmentByte(value: number): boolean {
  return (value >= 0x30 && value <= 0x39)
    || (value >= 0x41 && value <= 0x5a)
    || (value >= 0x61 && value <= 0x7a)
    || value === 0x2d
    || value === 0x5f;
}

function matchesApiStatus(value: Buffer): boolean {
  const expectedLength = API_KEY_PREFIX.length
    + API_KEY_PREFIX_FRAGMENT_BYTES
    + API_KEY_SEPARATOR.length
    + API_KEY_SUFFIX_FRAGMENT_BYTES
    + 1;
  if (value.length !== expectedLength) return false;
  if (!value.subarray(0, API_KEY_PREFIX.length).equals(API_KEY_PREFIX)) return false;
  let offset = API_KEY_PREFIX.length;
  const leading = value.subarray(offset, offset + API_KEY_PREFIX_FRAGMENT_BYTES);
  offset += API_KEY_PREFIX_FRAGMENT_BYTES;
  if (!leading.every(safeApiFragmentByte)) return false;
  if (!value.subarray(offset, offset + API_KEY_SEPARATOR.length).equals(API_KEY_SEPARATOR)) {
    return false;
  }
  offset += API_KEY_SEPARATOR.length;
  const trailing = value.subarray(offset, offset + API_KEY_SUFFIX_FRAGMENT_BYTES);
  offset += API_KEY_SUFFIX_FRAGMENT_BYTES;
  return trailing.every(safeApiFragmentByte) && value[offset] === 0x0a;
}

/** Classify only exact bounded byte outcomes and erase both owned channels. */
export function classifyCodexAuthProbe(result: BoundedProcessProbeResult): AdapterAuthState {
  try {
    if (result.exit.signal !== null || !result.stdout.equals(EMPTY)) return 'unknown';
    if (result.exit.code === 0 && result.stderr.equals(CHATGPT_STATUS)) return 'chatgpt';
    if (result.exit.code === 0 && matchesApiStatus(result.stderr)) return 'api_key';
    if (result.exit.code === 1 && result.stderr.equals(UNAUTHENTICATED_STATUS)) {
      return 'unauthenticated';
    }
    return 'unknown';
  } finally {
    result.zeroize();
  }
}

function decodeVersion(result: BoundedProcessProbeResult): string | null {
  try {
    if (result.exit.code !== 0 || result.exit.signal !== null) return null;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const stdout = decoder.decode(result.stdout);
    const stderr = decoder.decode(result.stderr);
    const combined = `${stdout}\n${stderr}`;
    const matches = [...combined.matchAll(
      /(?:^|[^0-9A-Za-z.-])((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?=$|[^0-9A-Za-z.-])/g,
    )];
    return matches.length === 1 ? matches[0]?.[1] ?? null : null;
  } catch {
    return null;
  } finally {
    result.zeroize();
  }
}

function probeDescriptor(
  dependencies: CodexDetectDependencies,
  binary: RetainedBinary,
  argv: readonly string[],
  limit: number,
): BoundedProcessProbeDescriptor {
  return {
    command: binary.command,
    argv: Object.freeze([...binary.argvPrefix, ...argv]),
    cwd: dependencies.cwd,
    environment: buildSanitizedAgentEnvironment(
      dependencies.sourceEnv,
      Object.freeze({}),
      DELEGATION_AGENT_ENVIRONMENT_POLICY,
    ),
    timeoutMs: PROBE_TIMEOUT_MS,
    stdoutLimitBytes: limit,
    stderrLimitBytes: limit,
  };
}

export function createCodexDetector(
  overrides: Partial<CodexDetectDependencies> = {},
): Readonly<{ detect: () => Promise<AdapterDetection> }> {
  const dependencies = Object.freeze({ ...defaultDependencies(), ...overrides });
  return Object.freeze({
    async detect(): Promise<AdapterDetection> {
      let candidate: CodexBinaryCandidate | null;
      try {
        candidate = await dependencies.resolveBinary();
      } catch {
        return unavailable('binary_missing', 'Codex executable was not found');
      }
      if (!candidate) return unavailable('binary_missing', 'Codex executable was not found');

      let binary: RetainedBinary | null;
      try {
        binary = await retainExecutable(dependencies, candidate);
      } catch {
        binary = null;
      }
      if (!binary) {
        return unavailable('binary_unsafe', 'Codex executable is not a supported native binary');
      }

      let versionResult: BoundedProcessProbeResult;
      try {
        versionResult = await dependencies.probe(probeDescriptor(
          dependencies,
          binary,
          ['--version'],
          VERSION_OUTPUT_LIMIT_BYTES,
        ));
      } catch {
        return unavailable('adapter_unavailable', 'Codex version probe failed', { binary });
      }
      const version = decodeVersion(versionResult);
      if (!version) {
        return unavailable('version_unparseable', 'Codex version could not be verified', { binary });
      }
      if (
        !await identityMatches(dependencies, candidate.sourcePath, candidate.realPath)
        || !await identityMatches(dependencies, binary.command, binary.realPath)
      ) return unavailable('binary_changed', 'Codex executable identity changed during detection');

      const compatibility = classifyAdapterCompatibility(CODEX_ADAPTER_ID, version);
      if (compatibility.status === 'unsupported') {
        return unavailable(
          'version_unsupported',
          'Codex version is outside the verified compatibility range',
          { binary, version },
        );
      }

      let authState: AdapterAuthState = 'unknown';
      try {
        const authResult = await dependencies.probe(probeDescriptor(
          dependencies,
          binary,
          ['login', 'status'],
          AUTH_OUTPUT_LIMIT_BYTES,
        ));
        authState = classifyCodexAuthProbe(authResult);
      } catch {
        authState = 'unknown';
      }
      if (
        !await identityMatches(dependencies, candidate.sourcePath, candidate.realPath)
        || !await identityMatches(dependencies, binary.command, binary.realPath)
      ) return unavailable('binary_changed', 'Codex executable identity changed during detection');

      return Object.freeze({
        installed: true,
        version,
        authState,
        binary,
        profileVersion: CODEX_COMPATIBILITY.profileVersion,
      });
    },
  });
}
