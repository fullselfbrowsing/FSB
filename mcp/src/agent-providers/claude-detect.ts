import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { delimiter, extname, isAbsolute, join, win32 } from 'node:path';
import {
  CLAUDE_CODE_ADAPTER_ID,
  type AdapterDetection,
  type AdapterDiagnosticCode,
  type RetainedBinary,
} from './adapter.js';
import {
  classifyAdapterCompatibility,
  extractAdapterVersion,
  getAdapterCompatibilityContract,
} from './compatibility.js';

function requireClaudeCompatibility() {
  const compatibility = getAdapterCompatibilityContract(CLAUDE_CODE_ADAPTER_ID);
  if (!compatibility) {
    throw new Error('Claude Code compatibility contract is unavailable');
  }
  return compatibility;
}

const CLAUDE_COMPATIBILITY = requireClaudeCompatibility();

const PROBE_TIMEOUT_MS = 3000;
const PROBE_OUTPUT_LIMIT_BYTES = 64 * 1024;

type ProbeError = Error & {
  code?: string | number;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
};

export interface ClaudeBinaryCandidate {
  readonly sourcePath: string;
  readonly realPath: string;
}

export interface VerifiedWindowsShim {
  readonly verified: true;
  readonly command: string;
  readonly realPath: string;
  readonly argvPrefix: readonly string[];
}

export interface ClaudeProbeOptions {
  readonly timeout: number;
  readonly windowsHide: boolean;
  readonly maxBuffer: number;
  readonly shell: false;
}

export interface ClaudeProbeOutput {
  readonly stdout: string | Buffer;
  readonly stderr: string | Buffer;
}

type ExecFileDependency = (
  file: string,
  args: string[],
  options: ClaudeProbeOptions,
  callback: (
    error: ProbeError | null,
    stdout: string | Buffer,
    stderr: string | Buffer,
  ) => void,
) => unknown;

export interface ClaudeDetectDependencies {
  readonly platform: NodeJS.Platform;
  readonly pathValue: string;
  readonly resolveBinary: () => Promise<ClaudeBinaryCandidate | null>;
  readonly resolveRealPath: (path: string) => Promise<string>;
  readonly resolveWindowsShim: (
    candidate: ClaudeBinaryCandidate,
  ) => Promise<VerifiedWindowsShim | null>;
  readonly probe: (
    file: string,
    args: readonly string[],
    options: ClaudeProbeOptions,
  ) => Promise<ClaudeProbeOutput>;
}

export const CLAUDE_PROBE_OPTIONS: ClaudeProbeOptions = Object.freeze({
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
): Promise<ClaudeBinaryCandidate | null> {
  const paths = pathApi(platform);
  const names = platform === 'win32'
    ? ['claude.exe', 'claude.com', 'claude.cmd', 'claude.bat']
    : ['claude'];

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
        // Continue through the fixed PATH candidate list.
      }
    }
  }
  return null;
}

function execFileProbe(
  file: string,
  args: readonly string[],
  options: ClaudeProbeOptions,
): Promise<ClaudeProbeOutput> {
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

function makeDefaultDependencies(): ClaudeDetectDependencies {
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

async function identityMatches(
  dependencies: ClaudeDetectDependencies,
  path: string,
  expectedRealPath: string,
): Promise<boolean> {
  try {
    return await dependencies.resolveRealPath(path) === expectedRealPath;
  } catch {
    return false;
  }
}

function hasSafeAbsolutePath(platform: NodeJS.Platform, value: string): boolean {
  return pathApi(platform).isAbsolute(value) && value.length <= 4096;
}

async function retainExecutable(
  dependencies: ClaudeDetectDependencies,
  candidate: ClaudeBinaryCandidate,
): Promise<RetainedBinary | null> {
  if (
    !hasSafeAbsolutePath(dependencies.platform, candidate.sourcePath)
    || !hasSafeAbsolutePath(dependencies.platform, candidate.realPath)
    || !await identityMatches(dependencies, candidate.sourcePath, candidate.realPath)
  ) {
    return null;
  }

  if (dependencies.platform !== 'win32') {
    return Object.freeze({
      command: candidate.realPath,
      realPath: candidate.realPath,
      argvPrefix: Object.freeze([]),
    });
  }

  const extension = pathApi(dependencies.platform).extname(candidate.sourcePath).toLowerCase();
  if (extension === '.cmd' || extension === '.bat') {
    const resolution = await dependencies.resolveWindowsShim(candidate);
    if (
      !resolution
      || resolution.verified !== true
      || !hasSafeAbsolutePath(dependencies.platform, resolution.command)
      || !hasSafeAbsolutePath(dependencies.platform, resolution.realPath)
      || resolution.argvPrefix.length === 0
      || !resolution.argvPrefix.every((value) => typeof value === 'string' && value.length > 0)
      || !await identityMatches(dependencies, resolution.command, resolution.realPath)
    ) {
      return null;
    }
    return Object.freeze({
      command: resolution.realPath,
      realPath: resolution.realPath,
      argvPrefix: Object.freeze([...resolution.argvPrefix]),
    });
  }

  if (extension !== '.exe' && extension !== '.com') return null;
  return Object.freeze({
    command: candidate.realPath,
    realPath: candidate.realPath,
    argvPrefix: Object.freeze([]),
  });
}

export function createClaudeCodeDetector(
  overrides: Partial<ClaudeDetectDependencies> = {},
): Readonly<{ detect: () => Promise<AdapterDetection> }> {
  const dependencies = Object.freeze({ ...makeDefaultDependencies(), ...overrides });

  return Object.freeze({
    async detect(): Promise<AdapterDetection> {
      let candidate: ClaudeBinaryCandidate | null;
      try {
        candidate = await dependencies.resolveBinary();
      } catch {
        return unavailable('binary_missing', 'Claude Code executable was not found');
      }
      if (!candidate) {
        return unavailable('binary_missing', 'Claude Code executable was not found');
      }

      const binary = await retainExecutable(dependencies, candidate);
      if (!binary) {
        return unavailable('binary_unsafe', 'Claude Code executable is not a supported native binary');
      }

      let output: ClaudeProbeOutput;
      try {
        output = await dependencies.probe(
          binary.command,
          [...binary.argvPrefix, '--version'],
          CLAUDE_PROBE_OPTIONS,
        );
      } catch {
        return unavailable(
          'adapter_unavailable',
          'Claude Code version probe failed',
          { binary },
        );
      }

      const combined = `${String(output.stdout ?? '')}\n${String(output.stderr ?? '')}`;
      if (Buffer.byteLength(combined, 'utf8') > PROBE_OUTPUT_LIMIT_BYTES) {
        return unavailable(
          'version_unparseable',
          'Claude Code version output exceeded the safe limit',
          { binary },
        );
      }

      if (
        !await identityMatches(dependencies, candidate.sourcePath, candidate.realPath)
        || !await identityMatches(dependencies, binary.command, binary.realPath)
      ) {
        return unavailable('binary_changed', 'Claude Code executable identity changed during detection');
      }

      const version = extractAdapterVersion(combined);
      if (!version) {
        return unavailable(
          'version_unparseable',
          'Claude Code version could not be verified',
          { binary },
        );
      }
      const compatibility = classifyAdapterCompatibility(CLAUDE_CODE_ADAPTER_ID, version);
      if (compatibility.status === 'unsupported') {
        return unavailable(
          'version_unsupported',
          'Claude Code version is outside the verified compatibility range',
          { binary, version },
        );
      }

      return Object.freeze({
        installed: true,
        version,
        authState: 'unknown',
        binary,
        profileVersion: CLAUDE_COMPATIBILITY.profileVersion,
      });
    },
  });
}
