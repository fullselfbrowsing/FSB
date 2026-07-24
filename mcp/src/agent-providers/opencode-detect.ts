import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { delimiter, extname, isAbsolute, join, win32 } from 'node:path';
import {
  type AdapterDetection,
  type AdapterDiagnosticCode,
  type RetainedBinary,
} from './adapter.js';

export const OPENCODE_PROFILE_VERSION = '1.14.25' as const;

const PROBE_TIMEOUT_MS = 3_000;
const PROBE_OUTPUT_LIMIT_BYTES = 64 * 1024;
const MAX_PATH_BYTES = 4_096;
const MAX_PREFIX_ARGUMENTS = 8;
const MAX_PREFIX_BYTES = 32 * 1024;

export const OPENCODE_NATIVE_EXECUTABLE_NAMES = Object.freeze({
  posix: Object.freeze(['opencode'] as const),
  win32: Object.freeze([
    'opencode.exe',
    'opencode.com',
    'opencode.cmd',
    'opencode.bat',
  ] as const),
});

type ProbeError = Error & {
  code?: string | number;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
};

export interface OpenCodeBinaryCandidate {
  readonly sourcePath: string;
  readonly realPath: string;
}

export interface VerifiedOpenCodeWindowsShim {
  readonly verified: true;
  readonly command: string;
  readonly realPath: string;
  readonly argvPrefix: readonly string[];
}

export interface OpenCodeProbeOptions {
  readonly timeout: number;
  readonly windowsHide: boolean;
  readonly maxBuffer: number;
  readonly shell: false;
}

export interface OpenCodeProbeOutput {
  readonly stdout: string | Buffer;
  readonly stderr: string | Buffer;
}

type ExecFileDependency = (
  file: string,
  args: string[],
  options: OpenCodeProbeOptions,
  callback: (
    error: ProbeError | null,
    stdout: string | Buffer,
    stderr: string | Buffer,
  ) => void,
) => unknown;

export interface OpenCodeDetectDependencies {
  readonly platform: NodeJS.Platform;
  readonly pathValue: string;
  readonly resolveBinary: () => Promise<OpenCodeBinaryCandidate | null>;
  readonly resolveRealPath: (path: string) => Promise<string>;
  readonly resolveWindowsShim: (
    candidate: OpenCodeBinaryCandidate,
  ) => Promise<VerifiedOpenCodeWindowsShim | null>;
  readonly probe: (
    file: string,
    args: readonly string[],
    options: OpenCodeProbeOptions,
  ) => Promise<OpenCodeProbeOutput>;
}

export const OPENCODE_PROBE_OPTIONS: OpenCodeProbeOptions = Object.freeze({
  timeout: PROBE_TIMEOUT_MS,
  windowsHide: true,
  maxBuffer: PROBE_OUTPUT_LIMIT_BYTES,
  shell: false,
});

function pathApi(platform: NodeJS.Platform): typeof win32 {
  return platform === 'win32' ? win32 : { delimiter, extname, isAbsolute, join } as typeof win32;
}

async function resolveFromPath(
  platform: NodeJS.Platform,
  pathValue: string,
): Promise<OpenCodeBinaryCandidate | null> {
  const paths = pathApi(platform);
  const names = platform === 'win32'
    ? OPENCODE_NATIVE_EXECUTABLE_NAMES.win32
    : OPENCODE_NATIVE_EXECUTABLE_NAMES.posix;

  for (const directory of pathValue.split(paths.delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      const sourcePath = paths.join(directory, name);
      try {
        await access(sourcePath, fsConstants.X_OK);
        const resolved = await realpath(sourcePath);
        const metadata = await stat(resolved);
        if (!metadata.isFile()) continue;
        return Object.freeze({ sourcePath, realPath: resolved });
      } catch {
        // Continue through only the fixed native candidate names.
      }
    }
  }
  return null;
}

function execFileProbe(
  file: string,
  args: readonly string[],
  options: OpenCodeProbeOptions,
): Promise<OpenCodeProbeOutput> {
  return new Promise((resolve, reject) => {
    (execFile as unknown as ExecFileDependency)(
      file,
      [...args],
      options,
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function makeDefaultDependencies(): OpenCodeDetectDependencies {
  const platform = process.platform;
  const pathValue = process.env.PATH ?? '';
  return {
    platform,
    pathValue,
    resolveBinary: () => resolveFromPath(platform, pathValue),
    resolveRealPath: realpath,
    resolveWindowsShim: async () => null,
    probe: execFileProbe,
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

function safePrefix(argvPrefix: readonly string[]): boolean {
  if (argvPrefix.length === 0 || argvPrefix.length > MAX_PREFIX_ARGUMENTS) return false;
  let bytes = 0;
  for (const value of argvPrefix) {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return false;
    bytes += Buffer.byteLength(value, 'utf8');
    if (bytes > MAX_PREFIX_BYTES) return false;
  }
  return true;
}

async function identityMatches(
  dependencies: OpenCodeDetectDependencies,
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
  dependencies: OpenCodeDetectDependencies,
  candidate: OpenCodeBinaryCandidate,
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
    let shim: VerifiedOpenCodeWindowsShim | null;
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

function decodeProbeOutput(output: OpenCodeProbeOutput): string | null {
  const values = [output.stdout, output.stderr];
  if (!values.every((value) => typeof value === 'string' || Buffer.isBuffer(value))) return null;
  const combined = `${String(values[0])}\n${String(values[1])}`;
  return Buffer.byteLength(combined, 'utf8') <= PROBE_OUTPUT_LIMIT_BYTES ? combined : null;
}

function extractVersion(output: string): string | null {
  const matches = [...output.matchAll(/(?:^|[^0-9])v?([0-9]+\.[0-9]+\.[0-9]+)(?![0-9.])/g)];
  if (matches.length !== 1) return null;
  const version = matches[0]?.[1] ?? null;
  return version && version.length <= 64 ? version : null;
}

export function createOpenCodeDetector(
  overrides: Partial<OpenCodeDetectDependencies> = {},
): Readonly<{ detect: () => Promise<AdapterDetection> }> {
  const dependencies = Object.freeze({ ...makeDefaultDependencies(), ...overrides });

  return Object.freeze({
    async detect(): Promise<AdapterDetection> {
      let candidate: OpenCodeBinaryCandidate | null;
      try {
        candidate = await dependencies.resolveBinary();
      } catch {
        return unavailable('binary_missing', 'Agent provider executable was not found');
      }
      if (!candidate) {
        return unavailable('binary_missing', 'Agent provider executable was not found');
      }

      let binary: RetainedBinary | null;
      try {
        binary = await retainExecutable(dependencies, candidate);
      } catch {
        binary = null;
      }
      if (!binary) {
        return unavailable('binary_unsafe', 'Agent provider executable is not a supported native binary');
      }

      let output: OpenCodeProbeOutput;
      try {
        output = await dependencies.probe(
          binary.command,
          [...binary.argvPrefix, '--version'],
          OPENCODE_PROBE_OPTIONS,
        );
      } catch {
        return unavailable('adapter_unavailable', 'Agent provider version probe failed', { binary });
      }

      const combined = decodeProbeOutput(output);
      if (combined === null) {
        return unavailable('version_unparseable', 'Agent provider version output was invalid', { binary });
      }

      if (
        !await identityMatches(dependencies, candidate.sourcePath, candidate.realPath)
        || !await identityMatches(dependencies, binary.command, binary.realPath)
      ) {
        return unavailable('binary_changed', 'Agent provider executable identity changed during detection');
      }

      const version = extractVersion(combined);
      if (!version) {
        return unavailable('version_unparseable', 'Agent provider version could not be verified', { binary });
      }
      if (version !== OPENCODE_PROFILE_VERSION) {
        return unavailable(
          'version_unsupported',
          'Agent provider version is outside the verified execution profile',
          { binary, version },
        );
      }

      return Object.freeze({
        installed: true,
        version,
        authState: 'unknown',
        binary,
        profileVersion: OPENCODE_PROFILE_VERSION,
      });
    },
  });
}
