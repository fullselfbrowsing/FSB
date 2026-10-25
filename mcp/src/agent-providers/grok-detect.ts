import { constants as fsConstants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { access, realpath, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join, win32 } from 'node:path';
import {
  GROK_BUILD_ADAPTER_ID,
  type AdapterAuthState,
  type AdapterDetection,
  type AdapterDiagnosticCode,
  type RetainedBinary,
} from './adapter.js';
import { validateGrokBuildIsolation } from './grok-isolation.js';
import {
  GROK_BUILD_PROFILE_VERSION,
  createGrokBuildPrivateRuntime,
  type GrokBuildPrivateRuntime,
  type GrokBuildRunPaths,
} from './grok-runtime.js';
import {
  GROK_BUILD_INITIALIZE_REQUEST,
  buildGrokBuildAuthenticateRequest,
  parseGrokBuildProbeTranscript,
} from './grok-acp-contract.js';
import {
  runBoundedProcessProbe,
  type BoundedProcessProbeDescriptor,
  type BoundedProcessProbeResult,
} from './process-probe.js';
import { buildSanitizedGrokEnvironment } from './spawn-environment.js';

export const GROK_BUILD_NATIVE_EXECUTABLE_NAMES = Object.freeze({
  posix: Object.freeze(['grok'] as const),
  win32: Object.freeze(['grok.exe'] as const),
});

export const GROK_BUILD_TASK_ARGV = Object.freeze([
  '--tools',
  'mcp',
  '--permission-mode',
  'dontAsk',
  '--disable-web-search',
  '--no-memory',
  '--no-subagents',
  '--no-plan',
  '--sandbox',
  'strict',
  'agent',
  '--no-leader',
] as const);

const PROBE_TIMEOUT_MS = 5_000;
const VERSION_OUTPUT_LIMIT_BYTES = 64 * 1024;
const JSON_OUTPUT_LIMIT_BYTES = 1024 * 1024;
const MAX_PATH_BYTES = 4_096;
// Grok 1.0.4 mints UUIDv7 session ids; the roster covers v1 through v8.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_PATTERN = /(?:^|[^0-9A-Za-z.-])((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?=$|[^0-9A-Za-z.-])/g;
const EMPTY_ARRAY_JSON = '[]';

export interface GrokBuildBinaryCandidate {
  readonly sourcePath: string;
  readonly realPath: string;
}

export type GrokBuildProbeDependency = (
  descriptor: BoundedProcessProbeDescriptor,
) => Promise<BoundedProcessProbeResult>;

export interface GrokBuildDetectDependencies {
  readonly platform: NodeJS.Platform;
  readonly pathValue: string;
  readonly sourceEnv: NodeJS.ProcessEnv;
  readonly resolveBinary: () => Promise<GrokBuildBinaryCandidate | null>;
  readonly resolveRealPath: (path: string) => Promise<string>;
  readonly probe: GrokBuildProbeDependency;
  readonly runtime: GrokBuildPrivateRuntime;
  readonly mintProbeId: () => string;
  readonly inspectBinaryIdentity: (path: string) => Promise<string>;
}

interface RetainedGrokIdentity {
  readonly sourcePath: string;
  readonly fingerprint: string;
  readonly resolve: GrokBuildDetectDependencies['resolveRealPath'];
  readonly inspect: GrokBuildDetectDependencies['inspectBinaryIdentity'];
}

const retainedIdentities = new WeakMap<RetainedBinary, RetainedGrokIdentity>();

async function inspectBinaryIdentity(pathname: string): Promise<string> {
  const metadata = await stat(pathname, { bigint: true });
  if (!metadata.isFile()) throw new Error('binary_changed');
  return [metadata.dev, metadata.ino, metadata.size, metadata.mtimeNs, metadata.ctimeNs].join(':');
}

/** Recheck the retained path and file identity immediately before process creation. */
export async function verifyGrokBuildExecutableIdentity(binary: RetainedBinary): Promise<boolean> {
  const retained = retainedIdentities.get(binary);
  // Injected adapters can supply their own retained-binary verification.
  if (!retained) return true;
  try {
    return await retained.resolve(retained.sourcePath) === binary.realPath
      && await retained.resolve(binary.command) === binary.realPath
      && await retained.inspect(binary.command) === retained.fingerprint;
  } catch {
    return false;
  }
}

function pathApi(platform: NodeJS.Platform): typeof win32 {
  return platform === 'win32' ? win32 : { delimiter, isAbsolute, join } as typeof win32;
}

async function resolveFromPath(
  platform: NodeJS.Platform,
  pathValue: string,
): Promise<GrokBuildBinaryCandidate | null> {
  const paths = pathApi(platform);
  const names = platform === 'win32'
    ? GROK_BUILD_NATIVE_EXECUTABLE_NAMES.win32
    : GROK_BUILD_NATIVE_EXECUTABLE_NAMES.posix;
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
        // Continue through the fixed executable roster only.
      }
    }
  }
  return null;
}

function defaultDependencies(): GrokBuildDetectDependencies {
  const platform = process.platform;
  const pathValue = process.env.PATH ?? '';
  return {
    platform,
    pathValue,
    sourceEnv: process.env,
    inspectBinaryIdentity,
    resolveBinary: () => resolveFromPath(platform, pathValue),
    resolveRealPath: realpath,
    probe: runBoundedProcessProbe,
    runtime: createGrokBuildPrivateRuntime({ platform }),
    mintProbeId: () => `probe_${randomUUID().replaceAll('-', '')}`,
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

async function identityMatches(
  dependencies: GrokBuildDetectDependencies,
  pathname: string,
  expectedRealPath: string,
): Promise<boolean> {
  try {
    return await dependencies.resolveRealPath(pathname) === expectedRealPath;
  } catch {
    return false;
  }
}

async function retainExecutable(
  dependencies: GrokBuildDetectDependencies,
  candidate: GrokBuildBinaryCandidate,
): Promise<RetainedBinary | null> {
  if (
    !safeAbsolutePath(dependencies.platform, candidate.sourcePath)
    || !safeAbsolutePath(dependencies.platform, candidate.realPath)
    || !await identityMatches(dependencies, candidate.sourcePath, candidate.realPath)
  ) return null;
  if (dependencies.platform === 'win32' && !candidate.sourcePath.toLowerCase().endsWith('.exe')) {
    return null;
  }
  const binary = Object.freeze({
    command: candidate.realPath,
    realPath: candidate.realPath,
    argvPrefix: Object.freeze([]),
  });
  retainedIdentities.set(binary, {
    sourcePath: candidate.sourcePath,
    fingerprint: await dependencies.inspectBinaryIdentity(candidate.realPath),
    resolve: dependencies.resolveRealPath,
    inspect: dependencies.inspectBinaryIdentity,
  });
  return binary;
}

function decodeVersion(result: BoundedProcessProbeResult): string | null {
  try {
    if (result.exit.code !== 0 || result.exit.signal !== null) return null;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const stdout = decoder.decode(result.stdout).trim();
    const stderr = decoder.decode(result.stderr).trim();
    // Prefer the CLI's own version line; advisory text can mention other releases.
    const versionLine = stdout.split(/\r?\n/).find((line) => /^grok\s+\d+\.\d+\.\d+(?:\s|$)/i.test(line));
    const matches = [...(versionLine ?? (stdout || stderr)).matchAll(VERSION_PATTERN)];
    return matches.length === 1 ? matches[0]?.[1] ?? null : null;
  } catch {
    return null;
  } finally {
    result.zeroize();
  }
}

function parseJsonLines(result: BoundedProcessProbeResult): readonly unknown[] | null {
  try {
    if (result.exit.code !== 0 || result.exit.signal !== null) {
      return null;
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    const lines = decoded.split(/\r?\n/).filter((line) => line.length > 0);
    return Object.freeze(lines.map((line) => JSON.parse(line) as unknown));
  } catch {
    return null;
  } finally {
    result.zeroize();
  }
}

function parseJsonDocument(result: BoundedProcessProbeResult): unknown | null {
  try {
    if (result.exit.code !== 0 || result.exit.signal !== null) {
      return null;
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    return JSON.parse(decoded) as unknown;
  } catch {
    return null;
  } finally {
    result.zeroize();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function emptyArray(value: unknown): boolean {
  return Array.isArray(value) && JSON.stringify(value) === EMPTY_ARRAY_JSON;
}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function descriptor(
  dependencies: GrokBuildDetectDependencies,
  binary: RetainedBinary,
  run: GrokBuildRunPaths,
  argv: readonly string[],
  limit: number,
  stdin?: string,
  responseId?: number,
  followup?: Readonly<{ afterResponseId: number; text: string }>,
): BoundedProcessProbeDescriptor {
  const fixedEnv = dependencies.runtime.authEnvironment();
  return {
    command: binary.command,
    argv: Object.freeze([...binary.argvPrefix, ...argv]),
    cwd: run.cwd,
    environment: buildSanitizedGrokEnvironment(dependencies.sourceEnv, fixedEnv),
    timeoutMs: PROBE_TIMEOUT_MS,
    stdoutLimitBytes: limit,
    stderrLimitBytes: limit,
    ...(stdin ? { stdinBytes: Object.freeze(Array.from(Buffer.from(stdin, 'utf8'))) } : {}),
    ...(responseId === undefined ? {} : { stdinCloseAfterJsonRpcResponseId: responseId }),
    ...(followup ? {
      stdinJsonRpcFollowup: Object.freeze({
        afterResponseId: followup.afterResponseId,
        bytes: Object.freeze(Array.from(Buffer.from(followup.text, 'utf8'))),
      }),
    } : {}),
  };
}

async function verifyIsolation(
  dependencies: GrokBuildDetectDependencies,
  binary: RetainedBinary,
  run: GrokBuildRunPaths,
  version: string,
): Promise<boolean> {
  const inspect = parseJsonDocument(await dependencies.probe(descriptor(
    dependencies,
    binary,
    run,
    ['inspect', '--json'],
    JSON_OUTPUT_LIMIT_BYTES,
  )));
  if (!validateGrokBuildIsolation(inspect, {
    expectedCliVersion: version, cwd: run.cwd, configPath: dependencies.runtime.paths.configPath,
  })) {
    return false;
  }
  for (const argv of [['mcp', 'list', '--json'], ['plugin', 'list', '--json']] as const) {
    const document = parseJsonDocument(await dependencies.probe(descriptor(
      dependencies,
      binary,
      run,
      argv,
      JSON_OUTPUT_LIMIT_BYTES,
    )));
    if (!emptyArray(document)) return false;
  }
  return true;
}

// grok refuses to start under `--sandbox strict` when it cannot resolve one of
// the runtime-socket deny paths -- a symlinked /var/run/docker.sock is enough.
// It prints this on stderr and exits non-zero, which otherwise reads to us as an
// indistinguishable "ACP could not be verified".
const SANDBOX_REFUSAL_MARKER = "could not apply the 'strict' sandbox profile";

function refusedSandbox(result: BoundedProcessProbeResult): boolean {
  try {
    return result.exit.code !== 0
      && result.stderr.length > 0
      && new TextDecoder('utf-8', { fatal: false })
        .decode(result.stderr)
        .includes(SANDBOX_REFUSAL_MARKER);
  } catch {
    return false;
  }
}

async function probeAcpAuthState(
  dependencies: GrokBuildDetectDependencies,
  binary: RetainedBinary,
  run: GrokBuildRunPaths,
  version: string,
): Promise<Readonly<{
  initialized: boolean;
  authState: AdapterAuthState;
  sandboxRefused?: boolean;
  capabilityMissing?: boolean;
}>> {
  const argv = [
    ...GROK_BUILD_TASK_ARGV,
    '--agent-profile',
    dependencies.runtime.paths.agentProfilePath,
    'stdio',
  ];
  const initializeProbe = await dependencies.probe(descriptor(
    dependencies,
    binary,
    run,
    argv,
    JSON_OUTPUT_LIMIT_BYTES,
    jsonLine(GROK_BUILD_INITIALIZE_REQUEST),
    1,
  ));
  // Read stderr before parseJsonLines zeroizes both channels.
  const sandboxRefused = refusedSandbox(initializeProbe);
  const initialized = parseJsonLines(initializeProbe);
  if (!initialized) {
    return Object.freeze({ initialized: false, authState: 'unknown', sandboxRefused });
  }
  const init = initialized.find((message) => isRecord(message) && message.id === 1);
  const result = isRecord(init) && isRecord(init.result) ? init.result : null;
  if (result?.protocolVersion === 1) {
    const caps = result.agentCapabilities;
    if (!isRecord(caps) || !isRecord(caps.mcpCapabilities)
        || caps.mcpCapabilities.http !== true || !isRecord(caps.sessionCapabilities)
        || !isRecord(caps.sessionCapabilities.close)) {
      return Object.freeze({ initialized: false, authState: 'unknown', capabilityMissing: true });
    }
  }
  const negotiation = parseGrokBuildProbeTranscript(initialized, false, version);
  if (!negotiation) {
    return Object.freeze({ initialized: false, authState: 'unknown' });
  }
  if (negotiation.authState !== 'oauth') {
    return Object.freeze({ initialized: true, authState: negotiation.authState });
  }

  const authenticated = parseJsonLines(await dependencies.probe(descriptor(
    dependencies,
    binary,
    run,
    argv,
    JSON_OUTPUT_LIMIT_BYTES,
    jsonLine(GROK_BUILD_INITIALIZE_REQUEST),
    2,
    { afterResponseId: 1, text: jsonLine(buildGrokBuildAuthenticateRequest()) },
  )));
  return Object.freeze({
    initialized: true,
    authState: authenticated && parseGrokBuildProbeTranscript(authenticated, true, version)
      ? 'oauth'
      : 'unknown',
  });
}

export function createGrokBuildDetector(
  overrides: Partial<GrokBuildDetectDependencies> = {},
): Readonly<{ detect: () => Promise<AdapterDetection> }> {
  const dependencies = Object.freeze({ ...defaultDependencies(), ...overrides });
  return Object.freeze({
    async detect(): Promise<AdapterDetection> {
      let candidate: GrokBuildBinaryCandidate | null;
      try {
        candidate = await dependencies.resolveBinary();
      } catch {
        return unavailable('binary_missing', 'Grok Build executable was not found');
      }
      if (!candidate) return unavailable('binary_missing', 'Grok Build executable was not found');

      const binary = await retainExecutable(dependencies, candidate).catch(() => null);
      if (!binary) {
        return unavailable('binary_unsafe', 'Grok Build executable is not a supported native binary');
      }

      let run: GrokBuildRunPaths | null = null;
      let probeId: string | null = null;
      let version: string | null = null;
      try {
        await dependencies.runtime.ensureBase();
        probeId = dependencies.mintProbeId();
        if (!/^probe_[A-Za-z0-9_-]{16,121}$/.test(probeId)) {
          return unavailable('adapter_unavailable', 'Grok Build isolation profile is unavailable', {
            binary,
          });
        }
        run = await dependencies.runtime.prepareRun(probeId);
        version = decodeVersion(await dependencies.probe(descriptor(
          dependencies,
          binary,
          run,
          ['--version'],
          VERSION_OUTPUT_LIMIT_BYTES,
        )));
        if (!version) {
          return unavailable('version_unparseable', 'Grok Build version could not be verified', {
            binary,
          });
        }
        if (
          !await identityMatches(dependencies, candidate.sourcePath, candidate.realPath)
          || !await identityMatches(dependencies, binary.command, binary.realPath)
          || !await verifyGrokBuildExecutableIdentity(binary)
        ) return unavailable('binary_changed', 'Grok Build executable identity changed during detection');
        if (!await verifyIsolation(dependencies, binary, run, version)) {
          return unavailable('isolation_unavailable', 'Grok Build isolation could not be attested', {
            binary,
            version,
          });
        }
        const acp = await probeAcpAuthState(dependencies, binary, run, version);
        if (!acp.initialized) {
          return acp.sandboxRefused === true
            ? unavailable(
              'sandbox_unavailable',
              'Grok Build refused to start under the required strict sandbox',
              { binary, version },
            )
            : unavailable(acp.capabilityMissing ? 'capability_missing' : 'agent_protocol_drift', 'Grok Build ACP could not be verified', {
              binary,
              version,
            });
        }
        const authState = acp.authState;
        if (authState === 'oauth' && !await dependencies.runtime.secureAuthFile()) {
          return unavailable('adapter_unavailable', 'Grok Build OAuth profile is unavailable', {
            binary,
            version,
          });
        }
        if (
          !await identityMatches(dependencies, candidate.sourcePath, candidate.realPath)
          || !await identityMatches(dependencies, binary.command, binary.realPath)
          || !await verifyGrokBuildExecutableIdentity(binary)
        ) return unavailable('binary_changed', 'Grok Build executable identity changed during detection');
        return Object.freeze({
          installed: true,
          version,
          authState,
          binary,
          profileVersion: GROK_BUILD_PROFILE_VERSION,
        });
      } catch {
        return unavailable('adapter_unavailable', 'Grok Build compatibility probe failed', { binary, version });
      } finally {
        if (run && probeId) await dependencies.runtime.removeRun(probeId)
          .catch(() => undefined);
      }
    },
  });
}

export function isGrokBuildSessionId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export const GROK_BUILD_PROBE_TIMEOUT_MS = PROBE_TIMEOUT_MS;
