import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  OPENCODE_ADAPTER_ID,
  OPENCODE_SERVER_PASSWORD_ENV_KEY,
  OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
  freezeSpawnSpec,
  type AgentTask,
  type AttestationDescriptor,
  type PolicyAttestationAssertion,
  type ProcessArgument,
  type ProcessRole,
  type ProcessSpec,
  type SpawnPrivateRuntime,
  type SpawnContext,
  type SpawnRuntimeScope,
  type SpawnSecretEnvBinding,
  type SpawnSpec,
} from './adapter.js';
import {
  OPENCODE_PROFILE_VERSION,
} from './opencode-detect.js';
import type { RuntimePrivateArtifact } from './runtime-files.js';

export { OPENCODE_PROFILE_VERSION } from './opencode-detect.js';

export const OPENCODE_TASK_LIMIT_BYTES = 64 * 1024;

const MAX_PATH_BYTES = 4_096;
const MAX_ENDPOINT_BYTES = 2_048;
const SERVER_READINESS_LIMIT_BYTES = 4 * 1024;
const SERVER_READINESS_TIMEOUT_MS = 5_000;
const SERVER_IDLE_TIMEOUT_MS = 5 * 60 * 1_000;

const DENIED_CLAUDE_TOOLS = Object.freeze([
  'Bash',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
] as const);

const SHIPPED_POLICY_KEYS = Object.freeze([
  'description',
  'disallowedTools',
  'maxTurns',
  'name',
  'permissionMode',
  'prompt',
  'tools',
]);

export const OPENCODE_FIXED_ISOLATION_ENV_KEYS = Object.freeze([
  'OPENCODE_DISABLE_AUTOUPDATE',
  'OPENCODE_DISABLE_CLAUDE_CODE_PROMPT',
  'OPENCODE_DISABLE_EXTERNAL_SKILLS',
  'OPENCODE_DISABLE_LSP_DOWNLOAD',
  'OPENCODE_DISABLE_PROJECT_CONFIG',
  'OPENCODE_TEST_HOME',
  'OPENCODE_TEST_MANAGED_CONFIG_DIR',
  'XDG_CONFIG_HOME',
] as const);

export const OPENCODE_AGENT_FALLBACK_WARNING_SENTINELS = Object.freeze([
  'agent "fsb" not found. Falling back to default agent',
  'agent "fsb" is a subagent, not a primary agent. Falling back to default agent',
] as const);

const RUNTIME_CONTEXT_KEYS = Object.freeze([
  'fsbMcpEndpoint',
  'opencodeConfigRoot',
  'opencodeConfigPath',
  'opencodeTestHomePath',
  'opencodeManagedConfigPath',
  'opencodeDataRoot',
]);

const CONTEXT_KEYS = Object.freeze([
  'adapterId',
  'detection',
  'delegationId',
  'runtimeFingerprint',
  'cwd',
  'privateMcpConfigPath',
  'runtimeFiles',
]);
const CONTEXT_KEYS_WITH_SCOPES = Object.freeze([...CONTEXT_KEYS, 'runtimeScopes']);
const RUNTIME_SCOPE_KEYS = Object.freeze([
  'role',
  'runtimeId',
  'privateMcpConfigPath',
  'runtimeFiles',
]);
const RUNTIME_SCOPE_ORDER = Object.freeze([
  'delegation',
  'provider_server',
  'policy_preflight',
] as const);

const DETECTION_KEYS = Object.freeze([
  'installed',
  'version',
  'authState',
  'binary',
  'profileVersion',
]);

const BINARY_KEYS = Object.freeze(['command', 'realPath', 'argvPrefix']);

interface ShippedFsbPolicy {
  readonly description: string;
  readonly prompt: string;
}

export interface OpenCodeProfileRuntime {
  readonly fsbMcpEndpoint: string;
  readonly opencodeConfigRoot: string;
  readonly opencodeConfigPath: string;
  readonly opencodeTestHomePath: string;
  readonly opencodeManagedConfigPath: string;
  readonly opencodeDataRoot: string;
}

export interface OpenCodeProfile {
  readonly privateArtifacts: readonly RuntimePrivateArtifact[];
  readonly spawnSpec: SpawnSpec;
}

export interface OpenCodeRoleRuntimes {
  readonly delegation: OpenCodeProfileRuntime;
  readonly provider_server: OpenCodeProfileRuntime;
  readonly policy_preflight: OpenCodeProfileRuntime;
}

type OwnDataRecord = Readonly<Record<string, unknown>>;

function ownDataRecord(value: unknown, label: string): OwnDataRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`OpenCode ${label} is invalid`);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`OpenCode ${label} is invalid`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new Error(`OpenCode ${label} is invalid`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      throw new Error(`OpenCode ${label} is invalid`);
    }
  }
  return value as OwnDataRecord;
}

function exactRecord(value: unknown, keys: readonly string[], label: string): OwnDataRecord {
  const record = ownDataRecord(value, label);
  const actual = Reflect.ownKeys(record) as string[];
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`OpenCode ${label} is invalid`);
  }
  return record;
}

function ownValue(record: OwnDataRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw new Error('OpenCode data property is invalid');
  }
  return descriptor.value;
}

function ownDenseArray(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`OpenCode ${label} is invalid`);
  }
  if (value.length > maximum) throw new Error(`OpenCode ${label} is invalid`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1
    || keys.some((key) => (
      typeof key !== 'string'
      || (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key))
    ))
  ) throw new Error(`OpenCode ${label} is invalid`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      throw new Error(`OpenCode ${label} is invalid`);
    }
  }
  return value;
}

function arrayValue(values: readonly unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw new Error('OpenCode array value is invalid');
  }
  return descriptor.value;
}

function boundedString(value: unknown, label: string, maximum = MAX_PATH_BYTES): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || Buffer.byteLength(value, 'utf8') > maximum
  ) throw new Error(`OpenCode ${label} is invalid`);
  return value;
}

function absolutePath(value: unknown, label: string): string {
  const path = boundedString(value, label);
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error(`OpenCode ${label} must be an absolute normalized path`);
  }
  return path;
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function loadShippedFsbPolicy(): ShippedFsbPolicy {
  const assetUrl = new URL('../../ai/agents/fsb.json', import.meta.url);
  const parsed = JSON.parse(readFileSync(assetUrl, 'utf8')) as unknown;
  const policy = exactRecord(parsed, SHIPPED_POLICY_KEYS, 'shipped FSB policy');
  const tools = ownDenseArray(ownValue(policy, 'tools'), 'shipped FSB tools', 1);
  const denied = ownDenseArray(
    ownValue(policy, 'disallowedTools'),
    'shipped FSB denied tools',
    DENIED_CLAUDE_TOOLS.length,
  );
  if (
    ownValue(policy, 'name') !== 'fsb'
    || typeof ownValue(policy, 'description') !== 'string'
    || (ownValue(policy, 'description') as string).length < 24
    || typeof ownValue(policy, 'prompt') !== 'string'
    || (ownValue(policy, 'prompt') as string).length < 200
    || tools.length !== 1
    || arrayValue(tools, 0) !== 'mcp__fsb'
    || denied.length !== DENIED_CLAUDE_TOOLS.length
    || denied.some((_entry, index) => arrayValue(denied, index) !== DENIED_CLAUDE_TOOLS[index])
    || ownValue(policy, 'permissionMode') !== 'dontAsk'
    || ownValue(policy, 'maxTurns') !== 40
  ) throw new Error('OpenCode shipped FSB policy is invalid');
  return Object.freeze({
    description: ownValue(policy, 'description') as string,
    prompt: ownValue(policy, 'prompt') as string,
  });
}

const SHIPPED_FSB_POLICY = loadShippedFsbPolicy();

export const SHIPPED_FSB_DESCRIPTION_SHA256 = digest(SHIPPED_FSB_POLICY.description);
export const SHIPPED_FSB_PROMPT_SHA256 = digest(SHIPPED_FSB_POLICY.prompt);

function wellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function validateTask(task: AgentTask): string {
  const record = exactRecord(task, ['text'], 'task');
  const text = ownValue(record, 'text');
  if (
    typeof text !== 'string'
    || text.length === 0
    || !wellFormedUtf16(text)
  ) throw new Error('Agent task must be non-empty UTF-8 text');
  if (Buffer.byteLength(text, 'utf8') > OPENCODE_TASK_LIMIT_BYTES) {
    throw new Error('Agent task exceeds the safe byte limit');
  }
  return text;
}

interface ValidatedContext {
  readonly command: string;
  readonly argvPrefix: readonly string[];
  readonly cwd: string;
  readonly runtimeScopes: readonly SpawnRuntimeScope[] | null;
}

function validateContext(ctx: SpawnContext): ValidatedContext {
  const hasRuntimeScopes = Object.hasOwn(ctx, 'runtimeScopes');
  const context = exactRecord(
    ctx,
    hasRuntimeScopes ? CONTEXT_KEYS_WITH_SCOPES : CONTEXT_KEYS,
    'spawn context',
  );
  if (ownValue(context, 'adapterId') !== OPENCODE_ADAPTER_ID) {
    throw new Error('OpenCode profile requires the canonical adapter id');
  }
  const detection = exactRecord(ownValue(context, 'detection'), DETECTION_KEYS, 'detection');
  if (
    ownValue(detection, 'installed') !== true
    || ownValue(detection, 'version') !== OPENCODE_PROFILE_VERSION
    || ownValue(detection, 'authState') !== 'unknown'
    || ownValue(detection, 'profileVersion') !== OPENCODE_PROFILE_VERSION
  ) throw new Error('OpenCode profile requires an exact retained detection');
  const binary = exactRecord(ownValue(detection, 'binary'), BINARY_KEYS, 'retained binary');
  const command = absolutePath(ownValue(binary, 'command'), 'retained command');
  if (absolutePath(ownValue(binary, 'realPath'), 'retained real path') !== command) {
    throw new Error('OpenCode retained binary identity is invalid');
  }
  const prefixInput = ownDenseArray(ownValue(binary, 'argvPrefix'), 'retained argv prefix', 8);
  const argvPrefix = prefixInput.map((_entry, index) => (
    boundedString(arrayValue(prefixInput, index), 'retained argument', 4_096)
  ));
  const delegationId = boundedString(ownValue(context, 'delegationId'), 'delegation id');
  const runtimeFingerprint = boundedString(
    ownValue(context, 'runtimeFingerprint'),
    'runtime fingerprint',
  );
  if (
    !/^[A-Za-z0-9_-]{8,128}$/.test(delegationId)
    || !/^[A-Za-z0-9_-]{16,256}$/.test(runtimeFingerprint)
  ) throw new Error('OpenCode profile requires daemon-minted runtime identity');
  absolutePath(ownValue(context, 'privateMcpConfigPath'), 'private MCP config path');
  ownDenseArray(ownValue(context, 'runtimeFiles'), 'runtime files', 8);
  let runtimeScopes: readonly SpawnRuntimeScope[] | null = null;
  if (hasRuntimeScopes) {
    const input = ownDenseArray(ownValue(context, 'runtimeScopes'), 'runtime scopes', 3);
    if (input.length !== RUNTIME_SCOPE_ORDER.length) {
      throw new Error('OpenCode runtime scopes are invalid');
    }
    const runtimeIds = new Set<string>();
    runtimeScopes = Object.freeze(input.map((_entry, index) => {
      const scope = exactRecord(
        arrayValue(input, index),
        RUNTIME_SCOPE_KEYS,
        'runtime scope',
      );
      const role = ownValue(scope, 'role');
      if (role !== RUNTIME_SCOPE_ORDER[index]) {
        throw new Error('OpenCode runtime scopes are invalid');
      }
      const runtimeId = boundedString(ownValue(scope, 'runtimeId'), 'runtime id');
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(runtimeId) || runtimeIds.has(runtimeId)) {
        throw new Error('OpenCode runtime scopes are invalid');
      }
      runtimeIds.add(runtimeId);
      const runtimeFiles = ownDenseArray(
        ownValue(scope, 'runtimeFiles'),
        'runtime scope files',
        8,
      ).map((_path, pathIndex) => absolutePath(
        arrayValue(
          ownValue(scope, 'runtimeFiles') as readonly unknown[],
          pathIndex,
        ),
        'runtime scope file',
      ));
      return Object.freeze({
        role,
        runtimeId,
        privateMcpConfigPath: absolutePath(
          ownValue(scope, 'privateMcpConfigPath'),
          'runtime scope MCP config path',
        ),
        runtimeFiles: Object.freeze(runtimeFiles),
      }) as SpawnRuntimeScope;
    }));
  }
  return Object.freeze({
    command,
    argvPrefix: Object.freeze(argvPrefix),
    cwd: absolutePath(ownValue(context, 'cwd'), 'working directory'),
    runtimeScopes,
  });
}

function validateEndpoint(value: unknown): string {
  const raw = boundedString(value, 'FSB MCP endpoint', MAX_ENDPOINT_BYTES);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('OpenCode FSB MCP endpoint is invalid');
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
  ) throw new Error('OpenCode FSB MCP endpoint is invalid');
  return parsed.toString();
}

function validateRuntime(
  value: OpenCodeProfileRuntime,
  expectedRuntimeFiles: readonly string[],
): OpenCodeProfileRuntime {
  const runtime = exactRecord(value, RUNTIME_CONTEXT_KEYS, 'profile runtime');
  const opencodeConfigRoot = absolutePath(
    ownValue(runtime, 'opencodeConfigRoot'),
    'config root',
  );
  const opencodeConfigPath = absolutePath(
    ownValue(runtime, 'opencodeConfigPath'),
    'config path',
  );
  const opencodeTestHomePath = absolutePath(
    ownValue(runtime, 'opencodeTestHomePath'),
    'test home path',
  );
  const opencodeManagedConfigPath = absolutePath(
    ownValue(runtime, 'opencodeManagedConfigPath'),
    'managed config path',
  );
  const opencodeDataRoot = absolutePath(
    ownValue(runtime, 'opencodeDataRoot'),
    'data root',
  );
  const runDirectory = dirname(opencodeConfigRoot);
  if (
    opencodeConfigPath !== join(opencodeConfigRoot, 'opencode', 'opencode.json')
    || opencodeTestHomePath !== join(runDirectory, 'test-home')
    || opencodeManagedConfigPath !== join(runDirectory, 'managed-config')
  ) throw new Error('OpenCode private runtime graph is invalid');

  const runtimeFiles = ownDenseArray(expectedRuntimeFiles, 'runtime files', 8);
  const expectedFiles = [opencodeConfigPath, opencodeTestHomePath, opencodeManagedConfigPath];
  if (
    runtimeFiles.length !== expectedFiles.length
    || expectedFiles.some((path, index) => arrayValue(runtimeFiles, index) !== path)
  ) throw new Error('OpenCode private runtime files are invalid');

  return Object.freeze({
    fsbMcpEndpoint: validateEndpoint(ownValue(runtime, 'fsbMcpEndpoint')),
    opencodeConfigRoot,
    opencodeConfigPath,
    opencodeTestHomePath,
    opencodeManagedConfigPath,
    opencodeDataRoot,
  });
}

function fixedEnvironment(runtime: OpenCodeProfileRuntime): Readonly<Record<string, string>> {
  return Object.freeze({
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: '1',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_TEST_HOME: runtime.opencodeTestHomePath,
    OPENCODE_TEST_MANAGED_CONFIG_DIR: runtime.opencodeManagedConfigPath,
    XDG_CONFIG_HOME: runtime.opencodeConfigRoot,
  });
}

function privateConfigDocument(runtime: OpenCodeProfileRuntime) {
  const truncationGlob = join(runtime.opencodeDataRoot, 'tool-output', '*');
  return {
    share: 'disabled',
    autoupdate: false,
    default_agent: 'fsb',
    plugin: [],
    command: {},
    instructions: [],
    agent: {
      fsb: {
        mode: 'primary',
        description: SHIPPED_FSB_POLICY.description,
        prompt: SHIPPED_FSB_POLICY.prompt,
        steps: 40,
        permission: {
          '*': 'deny',
          external_directory: {
            '*': 'deny',
            [truncationGlob]: 'deny',
          },
          'fsb_*': 'allow',
        },
      },
    },
    mcp: {
      fsb: {
        type: 'remote',
        url: runtime.fsbMcpEndpoint,
        enabled: true,
        oauth: false,
      },
    },
  };
}

function privateArtifacts(runtime: OpenCodeProfileRuntime): readonly RuntimePrivateArtifact[] {
  const document = privateConfigDocument(runtime);
  return Object.freeze([
    Object.freeze({ kind: 'opencode_config' as const, contents: `${JSON.stringify(document)}\n` }),
    Object.freeze({ kind: 'opencode_test_home' as const }),
    Object.freeze({ kind: 'opencode_managed_config' as const }),
  ]);
}

function simpleRule(
  permission: string,
  action: 'allow' | 'deny' | 'ask',
) {
  return Object.freeze({ permission, action, pattern: '*' });
}

function patternedRule(
  permission: string,
  pattern: string,
  action: 'allow' | 'deny' | 'ask',
) {
  return Object.freeze({ permission, pattern, action });
}

function resolvedFsbPermissionRules(runtime: OpenCodeProfileRuntime) {
  const truncationGlob = join(runtime.opencodeDataRoot, 'tool-output', '*');
  return Object.freeze([
    simpleRule('*', 'allow'),
    simpleRule('doom_loop', 'ask'),
    patternedRule('external_directory', '*', 'ask'),
    patternedRule('external_directory', truncationGlob, 'allow'),
    simpleRule('question', 'deny'),
    simpleRule('plan_enter', 'deny'),
    simpleRule('plan_exit', 'deny'),
    patternedRule('read', '*', 'allow'),
    patternedRule('read', '*.env', 'ask'),
    patternedRule('read', '*.env.*', 'ask'),
    patternedRule('read', '*.env.example', 'allow'),
    simpleRule('*', 'deny'),
    patternedRule('external_directory', '*', 'deny'),
    patternedRule('external_directory', truncationGlob, 'deny'),
    simpleRule('fsb_*', 'allow'),
  ]);
}

function configAssertions(runtime: OpenCodeProfileRuntime): readonly PolicyAttestationAssertion[] {
  const config = privateConfigDocument(runtime);
  return Object.freeze([
    Object.freeze({
      kind: 'exact_keys' as const,
      path: Object.freeze([]),
      keys: Object.freeze([
        'share',
        'autoupdate',
        'default_agent',
        'plugin',
        'command',
        'instructions',
        'agent',
        'mcp',
      ]),
    }),
    Object.freeze({
      kind: 'document_sha256' as const,
      path: Object.freeze([]),
      sha256: digest(JSON.stringify(config)),
    }),
    Object.freeze({
      kind: 'string_sha256' as const,
      path: Object.freeze(['share']),
      sha256: digest('disabled'),
    }),
    Object.freeze({
      kind: 'exact_scalar' as const,
      path: Object.freeze(['autoupdate']),
      value: false,
    }),
    Object.freeze({
      kind: 'string_sha256' as const,
      path: Object.freeze(['default_agent']),
      sha256: digest('fsb'),
    }),
    Object.freeze({
      kind: 'exact_keys' as const,
      path: Object.freeze(['mcp']),
      keys: Object.freeze(['fsb']),
    }),
    Object.freeze({
      kind: 'document_sha256' as const,
      path: Object.freeze(['mcp', 'fsb']),
      sha256: digest(JSON.stringify(config.mcp.fsb)),
    }),
    Object.freeze({
      kind: 'exact_keys' as const,
      path: Object.freeze(['agent']),
      keys: Object.freeze(['fsb']),
    }),
    Object.freeze({
      kind: 'document_sha256' as const,
      path: Object.freeze(['agent', 'fsb']),
      sha256: digest(JSON.stringify(config.agent.fsb)),
    }),
    Object.freeze({ kind: 'absent' as const, path: Object.freeze(['model']) }),
    Object.freeze({ kind: 'absent' as const, path: Object.freeze(['provider']) }),
    Object.freeze({ kind: 'absent' as const, path: Object.freeze(['skills']) }),
    Object.freeze({ kind: 'absent' as const, path: Object.freeze(['permission']) }),
    Object.freeze({ kind: 'absent' as const, path: Object.freeze(['tools']) }),
  ]);
}

function agentAssertions(runtime: OpenCodeProfileRuntime): readonly PolicyAttestationAssertion[] {
  const permission = resolvedFsbPermissionRules(runtime);
  return Object.freeze([
    Object.freeze({
      kind: 'exact_keys' as const,
      path: Object.freeze([]),
      keys: Object.freeze([
        'name',
        'mode',
        'description',
        'prompt',
        'steps',
        'permission',
        'tools',
        'resolvedModel',
      ]),
    }),
    Object.freeze({
      kind: 'string_sha256' as const,
      path: Object.freeze(['name']),
      sha256: digest('fsb'),
    }),
    Object.freeze({
      kind: 'string_sha256' as const,
      path: Object.freeze(['mode']),
      sha256: digest('primary'),
    }),
    Object.freeze({
      kind: 'string_sha256' as const,
      path: Object.freeze(['description']),
      sha256: SHIPPED_FSB_DESCRIPTION_SHA256,
    }),
    Object.freeze({
      kind: 'string_sha256' as const,
      path: Object.freeze(['prompt']),
      sha256: SHIPPED_FSB_PROMPT_SHA256,
    }),
    Object.freeze({
      kind: 'exact_scalar' as const,
      path: Object.freeze(['steps']),
      value: 40,
    }),
    Object.freeze({
      kind: 'document_sha256' as const,
      path: Object.freeze(['permission']),
      sha256: digest(JSON.stringify(permission)),
    }),
    Object.freeze({
      kind: 'all_strings_prefix' as const,
      path: Object.freeze(['tools']),
      prefixRef: 'fsb_mcp_tool_prefix' as const,
    }),
    Object.freeze({
      kind: 'nonempty_string' as const,
      path: Object.freeze(['resolvedModel']),
    }),
    Object.freeze({ kind: 'absent' as const, path: Object.freeze(['model']) }),
  ]);
}

function policyProcess(
  command: string,
  argv: readonly ProcessArgument[],
  cwd: string,
  privateFiles: readonly string[],
  fixedEnv: Readonly<Record<string, string>>,
): ProcessSpec {
  return processSpec({
    role: 'policy_preflight',
    command,
    argv,
    cwd,
    privateFiles,
    fixedEnv,
  });
}

function policyAttestations(
  context: ValidatedContext,
  processRuntime: OpenCodeProfileRuntime,
  serverRuntime: OpenCodeProfileRuntime,
  prefix: readonly string[],
  privateFiles: readonly string[],
  fixedEnv: Readonly<Record<string, string>>,
): readonly AttestationDescriptor[] {
  const processConfig = configAssertions(processRuntime);
  const processAgent = agentAssertions(processRuntime);
  const serverConfig = configAssertions(serverRuntime);
  const serverAgent = agentAssertions(serverRuntime);
  const maxBytes = 128 * 1024;
  const timeoutMs = 5_000;
  return Object.freeze([
    Object.freeze({
      source: 'process_json' as const,
      process: policyProcess(
        context.command,
        Object.freeze([...prefix, 'debug', 'config']),
        context.cwd,
        privateFiles,
        fixedEnv,
      ),
      maxBytes,
      timeoutMs,
      assertions: processConfig,
    }),
    Object.freeze({
      source: 'process_json' as const,
      process: policyProcess(
        context.command,
        Object.freeze([...prefix, 'debug', 'agent', 'fsb']),
        context.cwd,
        privateFiles,
        fixedEnv,
      ),
      maxBytes,
      timeoutMs,
      assertions: processAgent,
    }),
    Object.freeze({
      source: 'owned_server_json' as const,
      method: 'GET' as const,
      path: '/config',
      secretRef: OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
      maxBytes,
      timeoutMs,
      assertions: serverConfig,
    }),
    Object.freeze({
      source: 'owned_server_json' as const,
      method: 'GET' as const,
      path: '/agent',
      secretRef: OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
      maxBytes,
      timeoutMs,
      assertions: serverAgent,
    }),
  ]);
}

const SERVER_SECRET_BINDING: readonly SpawnSecretEnvBinding[] = Object.freeze([
  Object.freeze({
    envKey: OPENCODE_SERVER_PASSWORD_ENV_KEY,
    secretRef: OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
  }),
]);

function processSpec(input: Readonly<{
  role: ProcessRole;
  command: string;
  argv: readonly ProcessArgument[];
  cwd: string;
  privateFiles: readonly string[];
  fixedEnv: Readonly<Record<string, string>>;
}>): ProcessSpec {
  const isTask = input.role === 'cold_task' || input.role === 'attach_task';
  return {
    role: input.role,
    command: input.command,
    argv: input.argv,
    cwd: input.cwd,
    privateFiles: input.privateFiles,
    fixedEnv: input.fixedEnv,
    spawnSecretEnvBindings: input.role === 'owned_server' || input.role === 'attach_task'
      ? SERVER_SECRET_BINDING
      : Object.freeze([]),
    stdin: isTask ? 'task' : 'none',
    stdout: isTask
      ? 'agent_jsonl'
      : input.role === 'owned_server'
        ? 'bounded_readiness'
        : 'bounded_json',
  };
}

function taskAbsent(task: string, value: unknown): boolean {
  const serialized = JSON.stringify(value);
  return serialized !== task
    && !serialized.includes(JSON.stringify(task))
    && (Buffer.byteLength(task, 'utf8') < 16 || !serialized.includes(task));
}

export function buildOpenCodeProfile(
  task: AgentTask,
  ctx: SpawnContext,
  runtimeInput: OpenCodeProfileRuntime,
  roleRuntimesInput?: OpenCodeRoleRuntimes,
): OpenCodeProfile {
  const taskText = validateTask(task);
  const context = validateContext(ctx);
  let delegationRuntime: OpenCodeProfileRuntime;
  let providerServerRuntime: OpenCodeProfileRuntime;
  let policyPreflightRuntime: OpenCodeProfileRuntime;
  let privateRuntimes: readonly SpawnPrivateRuntime[] | null = null;
  if (context.runtimeScopes) {
    const roleRuntimes = exactRecord(
      roleRuntimesInput,
      RUNTIME_SCOPE_ORDER,
      'role runtimes',
    );
    const validated = RUNTIME_SCOPE_ORDER.map((role, index) => validateRuntime(
      ownValue(roleRuntimes, role) as OpenCodeProfileRuntime,
      context.runtimeScopes![index].runtimeFiles,
    ));
    [delegationRuntime, providerServerRuntime, policyPreflightRuntime] = validated;
    privateRuntimes = Object.freeze(context.runtimeScopes.map((scope, index) => {
      const runtime = validated[index];
      return Object.freeze({
        role: scope.role,
        runtimeId: scope.runtimeId,
        privateFiles: Object.freeze([
          runtime.opencodeConfigPath,
          runtime.opencodeTestHomePath,
          runtime.opencodeManagedConfigPath,
        ]),
        privateArtifacts: privateArtifacts(runtime),
      });
    }));
  } else {
    delegationRuntime = validateRuntime(runtimeInput, ctx.runtimeFiles);
    providerServerRuntime = delegationRuntime;
    policyPreflightRuntime = delegationRuntime;
  }
  const delegationFixedEnv = fixedEnvironment(delegationRuntime);
  const providerServerFixedEnv = fixedEnvironment(providerServerRuntime);
  const policyPreflightFixedEnv = fixedEnvironment(policyPreflightRuntime);
  const delegationPrivateFiles = Object.freeze([
    delegationRuntime.opencodeConfigPath,
    delegationRuntime.opencodeTestHomePath,
    delegationRuntime.opencodeManagedConfigPath,
  ]);
  const providerServerPrivateFiles = Object.freeze([
    providerServerRuntime.opencodeConfigPath,
    providerServerRuntime.opencodeTestHomePath,
    providerServerRuntime.opencodeManagedConfigPath,
  ]);
  const policyPreflightPrivateFiles = Object.freeze([
    policyPreflightRuntime.opencodeConfigPath,
    policyPreflightRuntime.opencodeTestHomePath,
    policyPreflightRuntime.opencodeManagedConfigPath,
  ]);
  const prefix = Object.freeze([
    ...context.argvPrefix,
    '--pure',
    '--log-level',
    'ERROR',
  ]);
  const coldArgv: readonly ProcessArgument[] = Object.freeze([
    ...prefix,
    'run',
    '--format', 'json',
    '--agent', 'fsb',
  ]);
  const attachArgv: readonly ProcessArgument[] = Object.freeze([
    ...coldArgv,
    '--attach',
    Object.freeze({ runtimeRef: 'owned_server_endpoint' as const }),
  ]);
  const serverArgv: readonly ProcessArgument[] = Object.freeze([
    ...prefix,
    'serve',
    '--hostname', '127.0.0.1',
    '--port', '0',
    '--mdns', 'false',
  ]);

  const spawnSpec = freezeSpawnSpec({
    adapterId: OPENCODE_ADAPTER_ID,
    profileVersion: OPENCODE_PROFILE_VERSION,
    topology: {
      kind: 'owned_server',
      server: processSpec({
        role: 'owned_server',
        command: context.command,
        argv: serverArgv,
        cwd: context.cwd,
        privateFiles: providerServerPrivateFiles,
        fixedEnv: providerServerFixedEnv,
      }),
      coldTask: processSpec({
        role: 'cold_task',
        command: context.command,
        argv: coldArgv,
        cwd: context.cwd,
        privateFiles: delegationPrivateFiles,
        fixedEnv: delegationFixedEnv,
      }),
      attachTask: processSpec({
        role: 'attach_task',
        command: context.command,
        argv: attachArgv,
        cwd: context.cwd,
        privateFiles: delegationPrivateFiles,
        fixedEnv: delegationFixedEnv,
      }),
      readiness: {
        linePrefix: 'opencode server listening on http://127.0.0.1:',
        maxBytes: SERVER_READINESS_LIMIT_BYTES,
        timeoutMs: SERVER_READINESS_TIMEOUT_MS,
      },
      idle: { timeoutMs: SERVER_IDLE_TIMEOUT_MS },
      runtimeRefs: {
        endpoint: 'owned_server_endpoint',
        generation: 'daemon_generation',
      },
    },
    attestations: policyAttestations(
      context,
      policyPreflightRuntime,
      providerServerRuntime,
      prefix,
      policyPreflightPrivateFiles,
      policyPreflightFixedEnv,
    ),
    ...(privateRuntimes ? { privateRuntimes } : {}),
  });
  const artifacts = privateArtifacts(delegationRuntime);
  const profile = Object.freeze({ privateArtifacts: artifacts, spawnSpec });
  if (!taskAbsent(taskText, profile)) {
    throw new Error('Agent task crossed the OpenCode stdin-only boundary');
  }
  return profile;
}

export function buildOpenCodeSpawnSpec(
  task: AgentTask,
  ctx: SpawnContext,
  runtime: OpenCodeProfileRuntime,
): SpawnSpec {
  return buildOpenCodeProfile(task, ctx, runtime).spawnSpec;
}
