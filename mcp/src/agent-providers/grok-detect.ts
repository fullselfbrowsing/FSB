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
import { classifyAdapterCompatibility } from './compatibility.js';
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
const EXPECTED_COMPATIBILITY_CELLS = Object.freeze([
  'cursor:skills',
  'cursor:rules',
  'cursor:agents',
  'cursor:mcps',
  'cursor:hooks',
  'cursor:sessions',
  'claude:skills',
  'claude:rules',
  'claude:agents',
  'claude:mcps',
  'claude:hooks',
  'claude:sessions',
  'codex:sessions',
] as const);

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
  return Object.freeze({
    command: candidate.realPath,
    realPath: candidate.realPath,
    argvPrefix: Object.freeze([]),
  });
}

function decodeVersion(result: BoundedProcessProbeResult): string | null {
  try {
    if (result.exit.code !== 0 || result.exit.signal !== null) return null;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const combined = `${decoder.decode(result.stdout)}\n${decoder.decode(result.stderr)}`;
    const matches = [...combined.matchAll(VERSION_PATTERN)];
    return matches.length === 1 ? matches[0]?.[1] ?? null : null;
  } catch {
    return null;
  } finally {
    result.zeroize();
  }
}

function parseJsonLines(result: BoundedProcessProbeResult): readonly unknown[] | null {
  try {
    if (result.exit.code !== 0 || result.exit.signal !== null || result.stderr.length !== 0) {
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
    if (result.exit.code !== 0 || result.exit.signal !== null || result.stderr.length !== 0) {
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

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function emptyArray(value: unknown): boolean {
  return Array.isArray(value) && JSON.stringify(value) === EMPTY_ARRAY_JSON;
}

async function validateInspectDocument(
  value: unknown,
  dependencies: GrokBuildDetectDependencies,
  runtime: GrokBuildPrivateRuntime,
  run: GrokBuildRunPaths,
): Promise<boolean> {
  if (!isRecord(value) || value.grokVersion !== GROK_BUILD_PROFILE_VERSION) return false;
  if (
    typeof value.cwd !== 'string'
    || value.projectRoot !== null
    || value.projectTrusted !== true
  ) {
    return false;
  }
  try {
    if (
      await dependencies.resolveRealPath(value.cwd)
      !== await dependencies.resolveRealPath(run.cwd)
    ) return false;
  } catch {
    return false;
  }
  for (const key of [
    'projectInstructions',
    'hooks',
    'skills',
    'plugins',
    'marketplaces',
    'mcpServers',
    'lspServers',
  ]) {
    if (!emptyArray(value[key])) return false;
  }
  if (!isRecord(value.permissions)) return false;
  const permissionSources = value.permissions.sources;
  if (
    !Array.isArray(permissionSources)
    || permissionSources.length !== 1
    || typeof permissionSources[0] !== 'string'
    || !permissionSources[0].endsWith(' (config)')
  ) return false;
  const permissionPath = permissionSources[0].slice(0, -' (config)'.length);
  try {
    if (
      await dependencies.resolveRealPath(permissionPath)
      !== await dependencies.resolveRealPath(runtime.paths.configPath)
    ) return false;
  } catch {
    return false;
  }
  if (
    value.permissions.loaded !== 1
    || value.permissions.managedSettingsExists !== false
    || value.permissions.managedSettingsActive !== false
  ) return false;
  if (!emptyArray(value.permissions.skipped)) return false;
  if (!emptyArray(value.permissions.mcpServerAllowlist)) return false;
  if (!emptyArray(value.permissions.marketplaceAllowlist)) return false;
  if (!Array.isArray(value.agents) || value.agents.length !== 3) return false;
  const agentNames = value.agents.map((agent) => isRecord(agent) ? agent.name : null);
  if (JSON.stringify(agentNames) !== JSON.stringify(['general-purpose', 'explore', 'plan'])) {
    return false;
  }
  if (!value.agents.every((agent) => (
    isRecord(agent)
    && isRecord(agent.source)
    && agent.source.type === 'builtin'
  ))) return false;
  if (
    !isRecord(value.configSources)
    || !Array.isArray(value.configSources.layers)
    || value.configSources.layers.length !== 1
    || !isRecord(value.configSources.layers[0])
    || value.configSources.layers[0].role !== 'user'
    || typeof value.configSources.layers[0].path !== 'string'
  ) return false;
  try {
    if (
      await dependencies.resolveRealPath(value.configSources.layers[0].path)
      !== await dependencies.resolveRealPath(runtime.paths.configPath)
    ) return false;
  } catch {
    return false;
  }
  if (!isRecord(value.externalCompat) || value.externalCompat.remoteSettingsLoaded !== false) {
    return false;
  }
  const cells = value.externalCompat.cells;
  if (!Array.isArray(cells) || cells.length !== 13) return false;
  const actualCells: string[] = [];
  for (const cell of cells) {
    if (
      !isRecord(cell)
      || !exactKeys(cell, ['vendor', 'surface', 'enabled', 'source'])
      || typeof cell.vendor !== 'string'
      || typeof cell.surface !== 'string'
      || cell.enabled !== false
      || cell.source !== 'env'
    ) return false;
    actualCells.push(`${cell.vendor}:${cell.surface}`);
  }
  return JSON.stringify(actualCells) === JSON.stringify(EXPECTED_COMPATIBILITY_CELLS);
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
  };
}

async function verifyIsolation(
  dependencies: GrokBuildDetectDependencies,
  binary: RetainedBinary,
  run: GrokBuildRunPaths,
): Promise<boolean> {
  const inspect = parseJsonDocument(await dependencies.probe(descriptor(
    dependencies,
    binary,
    run,
    ['inspect', '--json'],
    JSON_OUTPUT_LIMIT_BYTES,
  )));
  if (!await validateInspectDocument(inspect, dependencies, dependencies.runtime, run)) {
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

async function probeAcpAuthState(
  dependencies: GrokBuildDetectDependencies,
  binary: RetainedBinary,
  run: GrokBuildRunPaths,
): Promise<Readonly<{ initialized: boolean; authState: AdapterAuthState }>> {
  const argv = [
    ...GROK_BUILD_TASK_ARGV,
    '--agent-profile',
    dependencies.runtime.paths.agentProfilePath,
    'stdio',
  ];
  const initialized = parseJsonLines(await dependencies.probe(descriptor(
    dependencies,
    binary,
    run,
    argv,
    JSON_OUTPUT_LIMIT_BYTES,
    jsonLine(GROK_BUILD_INITIALIZE_REQUEST),
  )));
  if (!initialized) {
    return Object.freeze({ initialized: false, authState: 'unknown' });
  }
  const negotiation = parseGrokBuildProbeTranscript(initialized, false);
  if (!negotiation) {
    // Grok Build 1.0.4 exits cleanly without an ACP initialize response when
    // its private OIDC cache is present but can no longer be refreshed. Treat
    // only that exact, credential-backed empty transcript as logged out so the
    // browser OAuth recovery path remains available. Any malformed or partial
    // ACP transcript still fails closed as protocol drift.
    if (initialized.length === 0 && await dependencies.runtime.secureAuthFile()) {
      return Object.freeze({ initialized: true, authState: 'unauthenticated' });
    }
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
    `${jsonLine(GROK_BUILD_INITIALIZE_REQUEST)}${jsonLine(
      buildGrokBuildAuthenticateRequest(),
    )}`,
  )));
  return Object.freeze({
    initialized: true,
    authState: authenticated && parseGrokBuildProbeTranscript(authenticated, true)
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
      try {
        await dependencies.runtime.ensureBase();
        probeId = dependencies.mintProbeId();
        if (!/^probe_[A-Za-z0-9_-]{16,121}$/.test(probeId)) {
          return unavailable('adapter_unavailable', 'Grok Build isolation profile is unavailable', {
            binary,
          });
        }
        run = await dependencies.runtime.prepareRun(probeId);
        const version = decodeVersion(await dependencies.probe(descriptor(
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
        ) return unavailable('binary_changed', 'Grok Build executable identity changed during detection');
        const compatibility = classifyAdapterCompatibility(GROK_BUILD_ADAPTER_ID, version);
        if (compatibility.status !== 'supported' || version !== GROK_BUILD_PROFILE_VERSION) {
          return unavailable(
            'version_unsupported',
            'Grok Build version is outside the verified compatibility profile',
            { binary, version },
          );
        }
        if (!await verifyIsolation(dependencies, binary, run)) {
          return unavailable('adapter_unavailable', 'Grok Build isolation could not be attested', {
            binary,
            version,
          });
        }
        const acp = await probeAcpAuthState(dependencies, binary, run);
        if (!acp.initialized) {
          return unavailable('adapter_unavailable', 'Grok Build ACP could not be verified', {
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
        ) return unavailable('binary_changed', 'Grok Build executable identity changed during detection');
        return Object.freeze({
          installed: true,
          version,
          authState,
          binary,
          profileVersion: GROK_BUILD_PROFILE_VERSION,
        });
      } catch {
        return unavailable('adapter_unavailable', 'Grok Build compatibility probe failed', { binary });
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
