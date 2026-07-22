import { dirname, isAbsolute, resolve } from 'node:path';
import {
  CODEX_ADAPTER_ID,
  freezeSpawnSpec,
  type AdapterAuthState,
  type AgentTask,
  type DirectRuntimeReference,
  type EffectiveAuthorityAttestation,
  type PreSpawnIdentityProbe,
  type SpawnContext,
  type SpawnSpec,
} from './adapter.js';
import { classifyAdapterCompatibility } from './compatibility.js';
import { CODEX_PROFILE_VERSION } from './codex-detect.js';
import {
  validateDirectRuntimeReference,
} from './effective-authority.js';

const MAX_PATH_BYTES = 4_096;
const MAX_TASK_BYTES = 256 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;
const AUTH_PROBE_TIMEOUT_MS = 3_000;
const AUTH_PROBE_LIMIT_BYTES = 128;
const AUTH_CHATGPT = Buffer.from('Logged in using ChatGPT\n', 'utf8');
const AUTH_UNAUTHENTICATED = Buffer.from('Not logged in\n', 'utf8');
const AUTH_API_PREFIX = Buffer.from('Logged in using an API key - ', 'utf8');
const AUTH_API_SEPARATOR = Buffer.from('***', 'ascii');
const AUTHORITY_CLIENT_NAME = 'fsb_codex_authority';
const AUTHORITY_CLIENT_TITLE = 'Full Self-Browsing Codex Authority';
const REMOTE_CONTROL_NOTIFICATION = 'remoteControl/status/changed';

export const CODEX_ALLOWED_MCP_TOOLS = Object.freeze([
  'search_capabilities',
  'invoke_capability',
] as const);

export const CODEX_DISABLED_TOOL_FEATURES = Object.freeze([
  'undo',
  'shell_tool',
  'unified_exec',
  'shell_zsh_fork',
  'unified_exec_zsh_fork',
  'shell_snapshot',
  'deferred_executor',
  'js_repl',
  'code_mode',
  'code_mode_only',
  'js_repl_tools_only',
  'web_search_request',
  'web_search_cached',
  'standalone_web_search',
  'search_tool',
  'codex_git_commit',
  'memories',
  'chronicle',
  'apply_patch_freeform',
  'apply_patch_streaming_events',
  'exec_permission_approvals',
  'hooks',
  'request_permissions_tool',
  'request_rule',
  'remote_models',
  'multi_agent',
  'multi_agent_v2',
  'multi_agent_mode',
  'enable_fanout',
  'apps',
  'enable_mcp_apps',
  'apps_mcp_path_override',
  'tool_search',
  'tool_search_always_defer_mcp_tools',
  'non_prefixed_mcp_tool_names',
  'unavailable_dummy_tools',
  'tool_suggest',
  'plugins',
  'plugin_hooks',
  'in_app_browser',
  'browser_use',
  'browser_use_full_cdp_access',
  'browser_use_external',
  'computer_use',
  'remote_plugin',
  'plugin_sharing',
  'external_migration',
  'image_generation',
  'imagegenext',
  'resize_all_images',
  'skill_mcp_dependency_install',
  'skill_env_var_dependency_prompt',
  'default_mode_request_user_input',
  'guardian_approval',
  'goals',
  'sleep_tool',
  'collaboration_modes',
  'tool_call_mcp_elicitation',
  'auth_elicitation',
  'artifact',
  'fast_mode',
  'realtime_conversation',
  'remote_control',
  'image_detail_original',
  'workspace_dependencies',
] as const);

export const CODEX_BASE_ARGV = Object.freeze([
  'exec',
  '-',
  '--json',
  '--ephemeral',
  '--ignore-user-config',
  '--ignore-rules',
  '--strict-config',
  '--color',
  'never',
  '--sandbox',
  'read-only',
  '--skip-git-repo-check',
] as const);

export const CODEX_FSB_DEVELOPER_INSTRUCTIONS = [
  'Act only through the configured fsb MCP server.',
  'Use only search_capabilities and invoke_capability.',
  'Do not use shell, files, web search, collaboration, plugins, apps, images, or another server.',
].join(' ');

type OwnDataRecord = Readonly<Record<string, unknown>>;

interface ValidatedCodexContext {
  readonly command: string;
  readonly argvPrefix: readonly string[];
  readonly scratchDirectory: string;
  readonly directRuntime: DirectRuntimeReference;
  readonly authState: 'chatgpt' | 'api_key';
}

function invalid(label: string): never {
  throw new TypeError(`Codex ${label} is invalid`);
}

function ownRecord(value: unknown, keys: readonly string[], label: string): OwnDataRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(label);
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid(label);
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length
    || actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) invalid(label);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid(label);
  }
  return value as OwnDataRecord;
}

function ownValue(record: OwnDataRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid('data property');
  return descriptor.value;
}

function denseArray(value: unknown, maximum: number, label: string): readonly unknown[] {
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1
  ) invalid(label);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid(label);
  }
  return value;
}

function boundedString(value: unknown, maximum: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || Buffer.byteLength(value, 'utf8') > maximum
  ) invalid(label);
  return value;
}

function absolutePath(value: unknown, label: string): string {
  const path = boundedString(value, MAX_PATH_BYTES, label);
  if (!isAbsolute(path) || resolve(path) !== path) invalid(label);
  return path;
}

function validateContext(contextValue: SpawnContext): ValidatedCodexContext {
  const context = ownRecord(contextValue, [
    'adapterId',
    'detection',
    'delegationId',
    'runtimeFingerprint',
    'cwd',
    'privateMcpConfigPath',
    'runtimeFiles',
    'runtimeScopes',
    'directRuntimeReference',
  ], 'spawn context');
  if (ownValue(context, 'adapterId') !== CODEX_ADAPTER_ID) invalid('adapter identity');
  const detection = ownRecord(ownValue(context, 'detection'), [
    'installed',
    'version',
    'authState',
    'binary',
    'profileVersion',
  ], 'detection');
  const version = ownValue(detection, 'version');
  const authState = ownValue(detection, 'authState');
  if (
    ownValue(detection, 'installed') !== true
    || typeof version !== 'string'
    || classifyAdapterCompatibility(CODEX_ADAPTER_ID, version).status === 'unsupported'
    || ownValue(detection, 'profileVersion') !== CODEX_PROFILE_VERSION
    || (authState !== 'chatgpt' && authState !== 'api_key')
  ) invalid('retained detection');
  const binary = ownRecord(ownValue(detection, 'binary'), [
    'command',
    'realPath',
    'argvPrefix',
  ], 'retained binary');
  const command = absolutePath(ownValue(binary, 'command'), 'retained command');
  if (absolutePath(ownValue(binary, 'realPath'), 'retained real path') !== command) {
    invalid('retained binary identity');
  }
  const prefix = denseArray(ownValue(binary, 'argvPrefix'), 8, 'retained argv prefix');
  const argvPrefix = prefix.map((entry) => boundedString(entry, 4_096, 'retained argument'));
  if (
    !ID_PATTERN.test(boundedString(ownValue(context, 'delegationId'), 128, 'delegation id'))
    || !ID_PATTERN.test(boundedString(
      ownValue(context, 'runtimeFingerprint'),
      256,
      'runtime fingerprint',
    ))
  ) invalid('daemon runtime identity');
  absolutePath(ownValue(context, 'cwd'), 'daemon working directory');
  const privateMcpConfigPath = absolutePath(
    ownValue(context, 'privateMcpConfigPath'),
    'private MCP path',
  );
  const runtimeFiles = denseArray(ownValue(context, 'runtimeFiles'), 8, 'runtime files');
  if (runtimeFiles.length !== 1 || runtimeFiles[0] !== privateMcpConfigPath) {
    invalid('runtime files');
  }
  const runtimeScopes = denseArray(ownValue(context, 'runtimeScopes'), 3, 'runtime scopes');
  if (runtimeScopes.length !== 3) invalid('runtime scopes');
  const directRuntime = validateDirectRuntimeReference(ownValue(context, 'directRuntimeReference'));
  return Object.freeze({
    command,
    argvPrefix: Object.freeze(argvPrefix),
    scratchDirectory: dirname(privateMcpConfigPath),
    directRuntime,
    authState,
  });
}

function validateTask(taskValue: AgentTask): void {
  const task = ownRecord(taskValue, ['text'], 'task');
  const text = ownValue(task, 'text');
  if (
    typeof text !== 'string'
    || text.length === 0
    || Buffer.byteLength(text, 'utf8') > MAX_TASK_BYTES
  ) invalid('task');
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid('task');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) invalid('task');
  }
}

function tomlString(value: string): string {
  const encoded = JSON.stringify(value);
  if (typeof encoded !== 'string') invalid('configuration value');
  return encoded;
}

export function buildCodexConfigOverrides(endpoint: string): readonly string[] {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    invalid('FSB MCP endpoint');
  }
  const port = Number(parsed.port);
  if (
    parsed.protocol !== 'http:'
    || (parsed.hostname !== '127.0.0.1' && parsed.hostname !== '[::1]' && parsed.hostname !== '::1')
    || !parsed.port
    || !Number.isInteger(port)
    || port < 1
    || port > 65_535
    || parsed.pathname !== '/mcp'
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.username !== ''
    || parsed.password !== ''
  ) invalid('FSB MCP endpoint');
  const normalizedEndpoint = parsed.toString();
  const overrides = [
    'project_doc_max_bytes=0',
    'web_search="disabled"',
    `developer_instructions=${tomlString(CODEX_FSB_DEVELOPER_INSTRUCTIONS)}`,
    'shell_environment_policy.inherit="none"',
    ...CODEX_DISABLED_TOOL_FEATURES.map((feature) => `features.${feature}=false`),
    'mcp_servers={}',
    `mcp_servers.fsb.url=${tomlString(normalizedEndpoint)}`,
    'mcp_servers.fsb.required=true',
    'mcp_servers.fsb.enabled=true',
    `mcp_servers.fsb.enabled_tools=${JSON.stringify(CODEX_ALLOWED_MCP_TOOLS)}`,
    'mcp_servers.fsb.default_tools_approval_mode="approve"',
  ];
  return Object.freeze(overrides.flatMap((value) => ['-c', value]));
}

function authProbe(argvPrefix: readonly string[], authState: AdapterAuthState): PreSpawnIdentityProbe {
  if (authState !== 'chatgpt' && authState !== 'api_key') invalid('spawn auth state');
  return {
    source: 'retained_binary',
    argv: Object.freeze([...argvPrefix, 'login', 'status']),
    timeoutMs: AUTH_PROBE_TIMEOUT_MS,
    stdoutLimitBytes: AUTH_PROBE_LIMIT_BYTES,
    stderrLimitBytes: AUTH_PROBE_LIMIT_BYTES,
    expectedAuthState: authState,
    outcomes: Object.freeze([
      Object.freeze({
        authState: 'chatgpt' as const,
        exitCode: 0,
        stdout: Object.freeze({ kind: 'empty' as const }),
        stderr: Object.freeze({
          kind: 'exact' as const,
          bytes: Object.freeze(Array.from(AUTH_CHATGPT)),
        }),
      }),
      Object.freeze({
        authState: 'api_key' as const,
        exitCode: 0,
        stdout: Object.freeze({ kind: 'empty' as const }),
        stderr: Object.freeze({
          kind: 'masked_token' as const,
          prefix: Object.freeze(Array.from(AUTH_API_PREFIX)),
          separator: Object.freeze(Array.from(AUTH_API_SEPARATOR)),
          suffix: Object.freeze([0x0a]),
          leadingBytes: 8,
          trailingBytes: 5,
        }),
      }),
      Object.freeze({
        authState: 'unauthenticated' as const,
        exitCode: 1,
        stdout: Object.freeze({ kind: 'empty' as const }),
        stderr: Object.freeze({
          kind: 'exact' as const,
          bytes: Object.freeze(Array.from(AUTH_UNAUTHENTICATED)),
        }),
      }),
    ]),
  };
}

function authorityAttestation(
  argvPrefix: readonly string[],
  configArguments: readonly string[],
  scratchDirectory: string,
): EffectiveAuthorityAttestation {
  const request = Buffer.from(`${[
    {
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: {
          name: AUTHORITY_CLIENT_NAME,
          title: AUTHORITY_CLIENT_TITLE,
          version: CODEX_PROFILE_VERSION,
        },
        capabilities: {
          optOutNotificationMethods: [REMOTE_CONTROL_NOTIFICATION],
        },
      },
    },
    { method: 'initialized', params: {} },
    {
      method: 'config/read',
      id: 2,
      params: { includeLayers: false, cwd: scratchDirectory },
    },
  ].map((document) => JSON.stringify(document)).join('\n')}\n`, 'utf8');
  const stdinBytes = Object.freeze(Array.from(request));
  request.fill(0);
  return {
    source: 'retained_binary',
    argv: Object.freeze([
      ...argvPrefix,
      ...configArguments,
      'app-server',
      '--stdio',
      '--strict-config',
    ]),
    stdinBytes,
    timeoutMs: 5_000,
    stdoutLimitBytes: 64 * 1024,
    stderrLimitBytes: 8 * 1024,
    classifier: 'codex_effective_authority_json',
    expectedServerName: 'fsb',
    endpointRef: 'direct_runtime_endpoint',
    required: true,
    enabled: true,
    enabledTools: CODEX_ALLOWED_MCP_TOOLS,
    defaultToolsApprovalMode: 'approve',
    headers: 'absent',
    env: 'absent',
    bearerToken: 'absent',
  };
}

export function buildCodexSpawnSpec(task: AgentTask, context: SpawnContext): SpawnSpec {
  validateTask(task);
  const validated = validateContext(context);
  const configArguments = buildCodexConfigOverrides(validated.directRuntime.endpoint);
  return freezeSpawnSpec({
    adapterId: CODEX_ADAPTER_ID,
    profileVersion: CODEX_PROFILE_VERSION,
    topology: Object.freeze({
      kind: 'direct' as const,
      task: Object.freeze({
        role: 'direct_task' as const,
        command: validated.command,
        argv: Object.freeze([
          ...validated.argvPrefix,
          ...CODEX_BASE_ARGV,
          ...configArguments,
        ]),
        cwd: validated.scratchDirectory,
        privateFiles: Object.freeze([]),
        fixedEnv: Object.freeze({}),
        spawnSecretEnvBindings: Object.freeze([]),
        stdin: 'task' as const,
        stdout: 'agent_jsonl' as const,
      }),
    }),
    attestations: Object.freeze([]),
    preSpawnIdentityProbe: authProbe(validated.argvPrefix, validated.authState),
    effectiveAuthorityAttestation: authorityAttestation(
      validated.argvPrefix,
      configArguments,
      validated.scratchDirectory,
    ),
  });
}
