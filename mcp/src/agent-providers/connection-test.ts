import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import {
  freezeSpawnSpec,
  type AgentEvent,
  type AgentProviderId,
  type ProcessSpec,
  type SpawnContext,
} from './adapter.js';
import { classifyAdapterCompatibility } from './compatibility.js';
import type { AgentProviderRegistry } from './registry.js';
import {
  ProcessProbeError,
  runBoundedProcessProbe,
  type BoundedProcessProbeDescriptor,
  type BoundedProcessProbeResult,
} from './process-probe.js';
import {
  buildSanitizedAgentEnvironment,
  CONNECTION_TEST_AGENT_ENVIRONMENT_POLICY,
  DELEGATION_AGENT_ENVIRONMENT_POLICY,
} from './spawn-environment.js';

const CONNECTION_TEST_TIMEOUT_MS = 60_000;
const CONNECTION_TEST_CHANNEL_LIMIT_BYTES = 1024 * 1024;
const CONNECTION_TEST_PROMPT =
  'This is a connection validation. Do not use tools. Reply with a short acknowledgement.';
const EMPTY_MCP_CONFIG = '{"mcpServers":{}}\n';
const TEMP_PREFIX = 'fsb-agent-connection-';

export type AgentConnectionTestFailureCode =
  | 'binary_not_found'
  | 'unsupported_version'
  | 'auth_unauthenticated'
  | 'connection_test_timeout'
  | 'connection_test_cancelled'
  | 'connection_test_malformed'
  | 'connection_test_tools_used'
  | 'connection_test_failed'
  | 'connection_test_cleanup_failed';

export type AgentConnectionTestResult =
  | Readonly<{ ok: true; providerId: AgentProviderId }>
  | Readonly<{
    ok: false;
    providerId: AgentProviderId;
    code: AgentConnectionTestFailureCode;
  }>;

export interface AgentConnectionTestDependencies {
  readonly environment?: NodeJS.ProcessEnv;
  readonly runProbe?: (
    descriptor: BoundedProcessProbeDescriptor,
  ) => Promise<BoundedProcessProbeResult>;
  readonly createTempDirectory?: () => Promise<string>;
  readonly writePrivateFile?: (pathname: string, contents: string) => Promise<void>;
  readonly removeTempDirectory?: (pathname: string) => Promise<void>;
}

function failure(
  providerId: AgentProviderId,
  code: AgentConnectionTestFailureCode,
): AgentConnectionTestResult {
  return Object.freeze({ ok: false, providerId, code });
}

function directProcess(value: unknown): ProcessSpec | null {
  try {
    const spec = freezeSpawnSpec(value as never);
    if (
      spec.topology.kind !== 'direct'
      || spec.attestations.length !== 0
      || spec.privateRuntimes !== undefined
      || spec.preSpawnIdentityProbe !== undefined
      || spec.effectiveAuthorityAttestation !== undefined
    ) {
      return null;
    }
    const process = spec.topology.task;
    if (
      process.role !== 'direct_task'
      || process.stdin !== 'task'
      || process.stdout !== 'agent_jsonl'
      || process.spawnSecretEnvBindings.length !== 0
      || process.argv.some((value) => typeof value !== 'string')
    ) {
      return null;
    }
    return process;
  } catch (_error) {
    return null;
  }
}

function assistantHasText(event: AgentEvent): boolean {
  if (event.type !== 'assistant') return false;
  const direct = event.payload.text;
  if (typeof direct === 'string' && direct.trim().length > 0) return true;
  const message = event.payload.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return false;
    const text = (block as Record<string, unknown>).text;
    return typeof text === 'string' && text.trim().length > 0;
  });
}

function probeFailureCode(error: unknown): AgentConnectionTestFailureCode {
  if (error instanceof ProcessProbeError) {
    if (error.code === 'timeout') return 'connection_test_timeout';
    if (error.code === 'aborted') return 'connection_test_cancelled';
    if (error.code === 'tree_unsettled') return 'connection_test_cleanup_failed';
  }
  return 'connection_test_failed';
}

function isOwnedTempDirectory(pathname: string): boolean {
  return dirname(pathname) === tmpdir()
    && pathname.startsWith(join(tmpdir(), TEMP_PREFIX))
    && pathname.length > join(tmpdir(), TEMP_PREFIX).length;
}

export async function testAgentProviderConnection(input: Readonly<{
  providerId: AgentProviderId;
  registry: AgentProviderRegistry;
  signal?: AbortSignal;
  dependencies?: AgentConnectionTestDependencies;
}>): Promise<AgentConnectionTestResult> {
  const { providerId, registry, signal } = input;
  const dependencies = input.dependencies ?? {};
  let directory = '';
  let cleanupFailed = false;
  let probe: BoundedProcessProbeResult | null = null;
  try {
    const adapter = registry.require(providerId);
    const detection = await adapter.detect();
    const compatibility = classifyAdapterCompatibility(providerId, {
      binaryFound: detection.installed === true && detection.binary !== null,
      version: detection.version,
    });
    if (!detection.binary) {
      return failure(providerId, 'binary_not_found');
    }
    if (compatibility.status === 'unsupported') {
      return failure(providerId, 'unsupported_version');
    }
    if (!detection.installed) {
      return failure(providerId, 'binary_not_found');
    }
    if (detection.authState === 'unauthenticated') {
      return failure(providerId, 'auth_unauthenticated');
    }
    if (signal?.aborted) return failure(providerId, 'connection_test_cancelled');

    directory = dependencies.createTempDirectory
      ? await dependencies.createTempDirectory()
      : await mkdtemp(join(tmpdir(), TEMP_PREFIX));
    if (!isOwnedTempDirectory(directory)) {
      return failure(providerId, 'connection_test_cleanup_failed');
    }
    const emptyMcpConfigPath = join(directory, 'empty-mcp.json');
    if (dependencies.writePrivateFile) {
      await dependencies.writePrivateFile(emptyMcpConfigPath, EMPTY_MCP_CONFIG);
    } else {
      await writeFile(emptyMcpConfigPath, EMPTY_MCP_CONFIG, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
    }

    const context: SpawnContext = Object.freeze({
      purpose: 'connection_test',
      adapterId: providerId,
      detection,
      delegationId: randomBytes(16).toString('base64url'),
      runtimeFingerprint: randomBytes(24).toString('base64url'),
      cwd: directory,
      privateMcpConfigPath: emptyMcpConfigPath,
      runtimeFiles: Object.freeze([emptyMcpConfigPath]),
    });
    const declared = await adapter.buildSpawn(
      Object.freeze({ text: CONNECTION_TEST_PROMPT }),
      context,
    );
    const processSpec = directProcess(declared);
    if (!processSpec) return failure(providerId, 'connection_test_malformed');
    if (
      processSpec.command !== detection.binary.command
      || processSpec.cwd !== directory
      || processSpec.privateFiles.some((pathname) => pathname !== emptyMcpConfigPath)
    ) {
      return failure(providerId, 'connection_test_malformed');
    }
    const argv = processSpec.argv as readonly string[];
    const serializedSurface = JSON.stringify({
      argv,
      fixedEnv: processSpec.fixedEnv,
    });
    if (
      /mcp__fsb|mcp_servers\.fsb|agent["']?\s*[:,=]\s*["']?fsb/iu.test(serializedSurface)
      || argv.includes('--chrome')
    ) {
      return failure(providerId, 'connection_test_malformed');
    }

    const environment = buildSanitizedAgentEnvironment(
      dependencies.environment ?? process.env,
      processSpec.fixedEnv,
      Object.hasOwn(processSpec.fixedEnv, 'OPENCODE_CONFIG_CONTENT')
        ? CONNECTION_TEST_AGENT_ENVIRONMENT_POLICY
        : DELEGATION_AGENT_ENVIRONMENT_POLICY,
    );
    const prompt = Buffer.from(`${CONNECTION_TEST_PROMPT}\n`, 'utf8');
    try {
      probe = await (dependencies.runProbe ?? runBoundedProcessProbe)({
        command: processSpec.command,
        argv,
        cwd: processSpec.cwd,
        environment,
        timeoutMs: CONNECTION_TEST_TIMEOUT_MS,
        stdoutLimitBytes: CONNECTION_TEST_CHANNEL_LIMIT_BYTES,
        stderrLimitBytes: CONNECTION_TEST_CHANNEL_LIMIT_BYTES,
        stdinBytes: Object.freeze(Array.from(prompt)),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      return failure(providerId, probeFailureCode(error));
    } finally {
      prompt.fill(0);
    }
    if (probe.exit.code !== 0 || probe.exit.signal !== null) {
      return failure(providerId, 'connection_test_failed');
    }

    let sawAssistant = false;
    let sawResult = false;
    try {
      for await (const event of adapter.parseEvents(
        Readable.from([probe.stdout]),
        { purpose: 'connection_test' },
      )) {
        if (event.type === 'tool_use' || event.type === 'tool_result') {
          return failure(providerId, 'connection_test_tools_used');
        }
        if (assistantHasText(event)) sawAssistant = true;
        if (event.type === 'result') {
          if (event.payload.is_error === true) {
            return failure(providerId, 'connection_test_failed');
          }
          sawResult = true;
        }
      }
    } catch (_error) {
      return failure(providerId, 'connection_test_malformed');
    }
    if (!sawAssistant || !sawResult) {
      return failure(providerId, 'connection_test_malformed');
    }
    return Object.freeze({ ok: true, providerId });
  } catch (_error) {
    return failure(providerId, 'connection_test_failed');
  } finally {
    probe?.zeroize();
    if (directory && isOwnedTempDirectory(directory)) {
      try {
        if (dependencies.removeTempDirectory) {
          await dependencies.removeTempDirectory(directory);
        } else {
          await rm(directory, { recursive: true, force: true, maxRetries: 2 });
        }
      } catch (_error) {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) {
      return failure(providerId, 'connection_test_cleanup_failed');
    }
  }
}

export const AGENT_CONNECTION_TEST_TIMEOUT_MS = CONNECTION_TEST_TIMEOUT_MS;
