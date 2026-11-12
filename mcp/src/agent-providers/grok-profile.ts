import { createHash } from 'node:crypto';
import {
  GROK_BUILD_ADAPTER_ID,
  freezeSpawnSpec,
  type AgentTask,
  type AttestationDescriptor,
  type ProcessSpec,
  type SpawnContext,
  type SpawnSpec,
} from './adapter.js';
import { GROK_BUILD_TASK_ARGV } from './grok-detect.js';
import {
  GROK_BUILD_PROFILE_VERSION,
  type GrokBuildPrivateRuntime,
} from './grok-runtime.js';

const MAX_TASK_BYTES = 64 * 1024;
const ATTESTATION_TIMEOUT_MS = 5_000;
const ATTESTATION_LIMIT_BYTES = 1024 * 1024;
const EMPTY_ARRAY_SHA256 = createHash('sha256').update('[]', 'utf8').digest('hex');

function processSpec(
  command: string,
  argv: readonly string[],
  cwd: string,
  privateFiles: readonly string[],
  fixedEnv: Readonly<Record<string, string>>,
  role: 'direct_task' | 'policy_preflight',
): ProcessSpec {
  return Object.freeze({
    role,
    command,
    argv: Object.freeze([...argv]),
    cwd,
    privateFiles: Object.freeze([...privateFiles]),
    fixedEnv,
    spawnSecretEnvBindings: Object.freeze([]),
    stdin: role === 'direct_task' ? 'acp_jsonrpc' as const : 'none' as const,
    stdout: role === 'direct_task' ? 'acp_jsonrpc' as const : 'bounded_json' as const,
  });
}

function emptyArrayAssertion(path: readonly string[]) {
  return Object.freeze({
    kind: 'document_sha256' as const,
    path: Object.freeze([...path]),
    sha256: EMPTY_ARRAY_SHA256,
  });
}

function processAttestation(
  process: ProcessSpec,
  assertions: AttestationDescriptor['assertions'],
): AttestationDescriptor {
  return Object.freeze({
    source: 'process_json' as const,
    process,
    maxBytes: ATTESTATION_LIMIT_BYTES,
    timeoutMs: ATTESTATION_TIMEOUT_MS,
    assertions,
  });
}

export function buildGrokBuildSpawnSpec(
  task: AgentTask,
  context: SpawnContext,
  runtime: GrokBuildPrivateRuntime,
): SpawnSpec {
  if (
    context.adapterId !== GROK_BUILD_ADAPTER_ID
    || context.detection.installed !== true
    || context.detection.binary === null
    || !context.detection.version
    || context.detection.profileVersion !== GROK_BUILD_PROFILE_VERSION
    || context.detection.authState !== 'oauth'
    || typeof task.text !== 'string'
    || task.text.length === 0
    || Buffer.byteLength(task.text, 'utf8') > MAX_TASK_BYTES
  ) throw new TypeError('Grok Build spawn context is invalid');

  const binary = context.detection.binary;
  const fixedEnv = runtime.taskEnvironment(Object.freeze({
    runDirectory: context.cwd,
    cwd: context.cwd,
  }));
  const privateFiles = Object.freeze([
    runtime.paths.configPath,
    runtime.paths.agentProfilePath,
  ]);
  const taskArgv = Object.freeze([
    ...binary.argvPrefix,
    ...GROK_BUILD_TASK_ARGV,
    '--agent-profile',
    runtime.paths.agentProfilePath,
    'stdio',
  ]);
  const taskProcess = processSpec(
    binary.command,
    taskArgv,
    context.cwd,
    privateFiles,
    fixedEnv,
    'direct_task',
  );
  const inspectProcess = processSpec(
    binary.command,
    [...binary.argvPrefix, 'inspect', '--json'],
    context.cwd,
    privateFiles,
    fixedEnv,
    'policy_preflight',
  );
  const mcpListProcess = processSpec(
    binary.command,
    [...binary.argvPrefix, 'mcp', 'list', '--json'],
    context.cwd,
    privateFiles,
    fixedEnv,
    'policy_preflight',
  );
  const pluginListProcess = processSpec(
    binary.command,
    [...binary.argvPrefix, 'plugin', 'list', '--json'],
    context.cwd,
    privateFiles,
    fixedEnv,
    'policy_preflight',
  );

  return freezeSpawnSpec({
    adapterId: GROK_BUILD_ADAPTER_ID,
    profileVersion: GROK_BUILD_PROFILE_VERSION,
    topology: Object.freeze({ kind: 'direct' as const, task: taskProcess }),
    attestations: Object.freeze([
      processAttestation(inspectProcess, Object.freeze([
        Object.freeze({
          kind: 'grok_isolation' as const,
          path: Object.freeze([]),
          expectedCliVersion: context.detection.version,
          cwd: context.cwd,
          configPath: runtime.paths.configPath,
        }),
      ])),
      processAttestation(mcpListProcess, Object.freeze([emptyArrayAssertion([])])),
      processAttestation(pluginListProcess, Object.freeze([emptyArrayAssertion([])])),
    ]),
  });
}
