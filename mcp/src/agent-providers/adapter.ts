import {
  validateEffectiveAuthorityAttestation,
  validatePreSpawnIdentityProbe,
} from './effective-authority.js';

export const CLAUDE_CODE_ADAPTER_ID = 'claude-code' as const;
export const OPENCODE_ADAPTER_ID = 'opencode' as const;
export const CODEX_ADAPTER_ID = 'codex' as const;

export type AgentProviderId =
  | typeof CLAUDE_CODE_ADAPTER_ID
  | typeof OPENCODE_ADAPTER_ID
  | typeof CODEX_ADAPTER_ID;

export type AdapterAuthState = 'chatgpt' | 'api_key' | 'unauthenticated' | 'unknown';

export type AdapterDiagnosticCode =
  | 'adapter_unavailable'
  | 'binary_missing'
  | 'binary_changed'
  | 'binary_unsafe'
  | 'version_unparseable'
  | 'version_unsupported'
  | 'agent_protocol_drift'
  | 'tree_unsettled';

export interface AdapterDiagnostic {
  readonly code: AdapterDiagnosticCode;
  readonly message: string;
}

/**
 * One executable identity retained from detection through process creation.
 * `argvPrefix` supports a verified native interpreter/entry-point pair without
 * permitting a shell or a second PATH lookup.
 */
export interface RetainedBinary {
  readonly command: string;
  readonly realPath: string;
  readonly argvPrefix: readonly string[];
}

export interface AdapterDetection {
  readonly installed: boolean;
  readonly version: string | null;
  readonly authState: AdapterAuthState;
  readonly binary: RetainedBinary | null;
  readonly profileVersion: string | null;
  readonly diagnostic?: AdapterDiagnostic;
}

export interface AgentTask {
  readonly text: string;
}

/** Values here are minted or selected by the daemon, never by a wire caller. */
export interface SpawnContext {
  readonly adapterId: AgentProviderId;
  readonly detection: AdapterDetection;
  readonly delegationId: string;
  readonly runtimeFingerprint: string;
  readonly cwd: string;
  readonly privateMcpConfigPath: string;
  readonly runtimeFiles: readonly string[];
  /** Optional role-scoped runtime graphs minted by the supervisor. */
  readonly runtimeScopes?: readonly SpawnRuntimeScope[];
  /** Serve-owned endpoint/generation capability; never accepted from the wire. */
  readonly directRuntimeReference?: DirectRuntimeReference;
}

export interface DirectRuntimeReference {
  readonly endpoint: string;
  readonly generation: string;
}

export type ProbeByteMatcher =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'exact'; bytes: readonly number[] }>
  | Readonly<{
      kind: 'prefix_suffix';
      prefix: readonly number[];
      suffix: readonly number[];
      minBytes: number;
      maxBytes: number;
    }>
  | Readonly<{
      kind: 'masked_token';
      prefix: readonly number[];
      separator: readonly number[];
      suffix: readonly number[];
      leadingBytes: number;
      trailingBytes: number;
    }>;

export interface IdentityProbeOutcome {
  readonly authState: AdapterAuthState;
  readonly exitCode: number;
  readonly stdout: ProbeByteMatcher;
  readonly stderr: ProbeByteMatcher;
}

/** Declarative classifier over a retained-binary byte probe. */
export interface PreSpawnIdentityProbe {
  readonly source: 'retained_binary';
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly stdoutLimitBytes: number;
  readonly stderrLimitBytes: number;
  readonly expectedAuthState: AdapterAuthState;
  readonly outcomes: readonly IdentityProbeOutcome[];
}

/** Declarative exact effective-authority proof over a retained-binary JSON probe. */
export interface EffectiveAuthorityAttestation {
  readonly source: 'retained_binary';
  readonly argv: readonly string[];
  /** Optional fixed protocol request written to the retained binary's stdin. */
  readonly stdinBytes?: readonly number[];
  readonly timeoutMs: number;
  readonly stdoutLimitBytes: number;
  readonly stderrLimitBytes: number;
  readonly classifier: 'effective_authority_json' | 'codex_effective_authority_json';
  readonly expectedServerName: 'fsb';
  readonly endpointRef: 'direct_runtime_endpoint';
  readonly required: true;
  readonly enabled: true;
  readonly enabledTools: readonly string[];
  readonly defaultToolsApprovalMode: 'approve';
  readonly headers: 'absent';
  readonly env: 'absent';
  readonly bearerToken: 'absent';
}

export type SpawnRuntimeRole = 'delegation' | 'provider_server' | 'policy_preflight';

export interface SpawnRuntimeScope {
  readonly role: SpawnRuntimeRole;
  readonly runtimeId: string;
  readonly privateMcpConfigPath: string;
  readonly runtimeFiles: readonly string[];
}

export type SpawnPrivateArtifact =
  | Readonly<{ kind: 'mcp_config'; endpoint: string }>
  | Readonly<{ kind: 'opencode_config'; contents: string }>
  | Readonly<{ kind: 'opencode_test_home' }>
  | Readonly<{ kind: 'opencode_managed_config' }>;

export interface SpawnPrivateRuntime {
  readonly role: SpawnRuntimeRole;
  readonly runtimeId: string;
  readonly privateFiles: readonly string[];
  readonly privateArtifacts: readonly SpawnPrivateArtifact[];
}

export const OPENCODE_SERVER_PASSWORD_ENV_KEY = 'OPENCODE_SERVER_PASSWORD' as const;
export const OWNED_SERVER_BASIC_PASSWORD_SECRET_REF = 'owned_server_basic_password' as const;

export type ProcessRole =
  | 'direct_task'
  | 'owned_server'
  | 'cold_task'
  | 'attach_task'
  | 'policy_preflight';

export type ProcessStdin = 'none' | 'task';
export type ProcessStdout = 'agent_jsonl' | 'bounded_readiness' | 'bounded_json';

/** A value supplied by the supervisor after it has verified an owned lease. */
export interface SupervisorRuntimeArgument {
  readonly runtimeRef: 'owned_server_endpoint';
}

export type ProcessArgument = string | SupervisorRuntimeArgument;

/**
 * This is metadata only. The referenced value is neither accepted nor exposed
 * by the adapter contract; only the serve-owned supervisor may materialize it.
 */
export interface SpawnSecretEnvBinding {
  readonly envKey: typeof OPENCODE_SERVER_PASSWORD_ENV_KEY;
  readonly secretRef: typeof OWNED_SERVER_BASIC_PASSWORD_SECRET_REF;
}

/** Declarative process data. User task text and resolved secrets are absent. */
export interface ProcessSpec {
  readonly role: ProcessRole;
  readonly command: string;
  readonly argv: readonly ProcessArgument[];
  readonly cwd: string;
  readonly privateFiles: readonly string[];
  readonly fixedEnv: Readonly<Record<string, string>>;
  readonly spawnSecretEnvBindings: readonly SpawnSecretEnvBinding[];
  readonly stdin: ProcessStdin;
  readonly stdout: ProcessStdout;
}

export interface OwnedServerReadinessPolicy {
  readonly linePrefix: string;
  readonly maxBytes: number;
  readonly timeoutMs: number;
}

export interface OwnedServerIdlePolicy {
  readonly timeoutMs: number;
}

export interface OwnedServerRuntimeRefs {
  readonly endpoint: 'owned_server_endpoint';
  readonly generation: 'daemon_generation';
}

export type SpawnTopology =
  | Readonly<{
      kind: 'direct';
      task: ProcessSpec;
    }>
  | Readonly<{
      kind: 'owned_server';
      server: ProcessSpec;
      coldTask: ProcessSpec;
      attachTask: ProcessSpec;
      readiness: OwnedServerReadinessPolicy;
      idle: OwnedServerIdlePolicy;
      runtimeRefs: OwnedServerRuntimeRefs;
    }>;

export type AttestationProductRef = 'fsb_mcp_tool_prefix';

export type PolicyAttestationAssertion =
  | Readonly<{
      kind: 'exact_keys';
      path: readonly string[];
      keys: readonly string[];
    }>
  | Readonly<{
      kind: 'exact_scalar';
      path: readonly string[];
      value: number | boolean | null;
    }>
  | Readonly<{
      kind: 'absent';
      path: readonly string[];
    }>
  | Readonly<{
      kind: 'string_sha256';
      path: readonly string[];
      sha256: string;
    }>
  | Readonly<{
      kind: 'document_sha256';
      path: readonly string[];
      sha256: string;
    }>
  | Readonly<{
      kind: 'nonempty_string';
      path: readonly string[];
    }>
  | Readonly<{
      kind: 'all_strings_prefix';
      path: readonly string[];
      prefixRef: AttestationProductRef;
    }>;

interface AttestationLimits {
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly assertions: readonly PolicyAttestationAssertion[];
}

export type AttestationDescriptor =
  | (AttestationLimits & Readonly<{
      source: 'process_json';
      process: ProcessSpec;
    }>)
  | (AttestationLimits & Readonly<{
      source: 'owned_server_json';
      method: 'GET';
      path: string;
      secretRef: typeof OWNED_SERVER_BASIC_PASSWORD_SECRET_REF;
    }>);

export interface SpawnSpec {
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly topology: SpawnTopology;
  readonly attestations: readonly AttestationDescriptor[];
  readonly privateRuntimes?: readonly SpawnPrivateRuntime[];
  readonly preSpawnIdentityProbe?: PreSpawnIdentityProbe;
  readonly effectiveAuthorityAttestation?: EffectiveAuthorityAttestation;
}

export type AgentEventType =
  | 'init'
  | 'assistant'
  | 'assistant_delta'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'retry'
  | 'result'
  | 'diagnostic';

export interface AgentEvent {
  readonly type: AgentEventType;
  readonly sessionId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ChildExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface SupervisedChild {
  readonly pid: number;
  readonly processGroupId: number;
  readonly platform: NodeJS.Platform;
  readonly closed: Promise<ChildExit>;
}

export interface AdapterCapabilities {
  readonly taskMode: boolean;
  readonly chatMode: boolean;
  readonly resume: boolean;
  readonly serverMode: boolean;
}

export const TASK_ONLY_CAPABILITIES: AdapterCapabilities = Object.freeze({
  taskMode: true,
  chatMode: false,
  resume: false,
  serverMode: false,
});

const MAX_CONTRACT_STRING_BYTES = 64 * 1024;
const MAX_PROCESS_ARGUMENTS = 256;
const MAX_PRIVATE_FILES = 128;
const MAX_FIXED_ENV_ENTRIES = 128;
const MAX_ATTESTATIONS = 32;
const MAX_PRIVATE_RUNTIMES = 3;
const MAX_PRIVATE_ARTIFACTS = 4;
const MAX_ASSERTIONS = 128;
const MAX_PATH_SEGMENTS = 32;
const MAX_ATTESTATION_BYTES = 1024 * 1024;
const MAX_ATTESTATION_TIMEOUT_MS = 60_000;
const MAX_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_ENV_KEY_PATTERN = /(?:^|_)(?:API_?KEY|AUTHORIZATION|CREDENTIALS?|PASSWORD|PRIVATE_?KEY|SECRETS?|TOKENS?)(?:_|$)/i;
const SECRET_VALUE_PATTERNS = Object.freeze([
  /^(?:Basic|Bearer)\s+\S+/i,
  /^sk-[A-Za-z0-9_-]{8,}$/,
  /^AKIA[A-Z0-9]{12,}$/,
  /^(?:password|secret|token|credential|authorization)[_:=-]\S+/i,
]);
const SAFE_SERVER_PATH_PATTERN = /^\/(?:[A-Za-z0-9_~-]+(?:\/[A-Za-z0-9_~-]+)*)?$/;

type OwnDataRecord = Readonly<Record<string, unknown>>;

function invalidContract(label: string): never {
  throw new TypeError(`Invalid ${label}`);
}

function isWellFormedText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function boundedString(value: unknown, label: string, allowEmpty = false): string {
  if (
    typeof value !== 'string'
    || (!allowEmpty && value.length === 0)
    || !isWellFormedText(value)
    || value.includes('\0')
    || Buffer.byteLength(value, 'utf8') > MAX_CONTRACT_STRING_BYTES
  ) invalidContract(label);
  return value;
}

function ownDataRecord(value: unknown, label: string): OwnDataRecord {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) invalidContract(label);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) invalidContract(label);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      invalidContract(label);
    }
  }
  return value as OwnDataRecord;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): OwnDataRecord {
  const record = ownDataRecord(value, label);
  const actual = Reflect.ownKeys(record) as string[];
  if (
    actual.length !== keys.length
    || actual.some((key) => !keys.includes(key))
  ) invalidContract(label);
  return record;
}

function ownValue(record: OwnDataRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalidContract('data property');
  return descriptor.value;
}

function ownDataArray(value: unknown, label: string, maxLength: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    invalidContract(label);
  }
  if (value.length > maxLength) invalidContract(label);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => (
    typeof key !== 'string'
    || (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key))
  ))) invalidContract(label);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      invalidContract(label);
    }
  }
  if (keys.length !== value.length + 1) invalidContract(label);
  return value;
}

function arrayValue(values: readonly unknown[], index: number, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalidContract(label);
  return descriptor.value;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalidContract(label);
  }
  return value as number;
}

function cloneStringArray(
  value: unknown,
  label: string,
  maxLength: number,
): readonly string[] {
  const input = ownDataArray(value, label, maxLength);
  const copy = input.map((_entry, index) => boundedString(arrayValue(input, index, label), label));
  return Object.freeze(copy);
}

function clonePath(value: unknown): readonly string[] {
  const input = ownDataArray(value, 'attestation path', MAX_PATH_SEGMENTS);
  const result = input.map((_entry, index) => {
    const segment = boundedString(arrayValue(input, index, 'attestation path'), 'attestation path');
    if (Buffer.byteLength(segment, 'utf8') > 256) invalidContract('attestation path');
    return segment;
  });
  return Object.freeze(result);
}

function cloneFixedEnv(value: unknown): Readonly<Record<string, string>> {
  const record = ownDataRecord(value, 'fixed environment');
  const keys = Reflect.ownKeys(record) as string[];
  if (keys.length > MAX_FIXED_ENV_ENTRIES) invalidContract('fixed environment');
  const copy: Record<string, string> = {};
  for (const key of keys) {
    if (
      !ENV_KEY_PATTERN.test(key)
      || key === OPENCODE_SERVER_PASSWORD_ENV_KEY
      || SECRET_ENV_KEY_PATTERN.test(key)
    ) invalidContract('fixed environment');
    const item = boundedString(ownValue(record, key), 'fixed environment value', true);
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(item))) {
      invalidContract('fixed environment value');
    }
    Object.defineProperty(copy, key, {
      value: item,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(copy);
}

function cloneSecretBindings(value: unknown): readonly SpawnSecretEnvBinding[] {
  const input = ownDataArray(value, 'spawn secret environment bindings', 1);
  const result = input.map((_entry, index) => {
    const binding = exactRecord(
      arrayValue(input, index, 'spawn secret environment bindings'),
      ['envKey', 'secretRef'],
      'spawn secret environment binding',
    );
    if (
      ownValue(binding, 'envKey') !== OPENCODE_SERVER_PASSWORD_ENV_KEY
      || ownValue(binding, 'secretRef') !== OWNED_SERVER_BASIC_PASSWORD_SECRET_REF
    ) invalidContract('spawn secret environment binding');
    return Object.freeze({
      envKey: OPENCODE_SERVER_PASSWORD_ENV_KEY,
      secretRef: OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
    });
  });
  return Object.freeze(result);
}

function cloneProcessArguments(value: unknown): readonly ProcessArgument[] {
  const input = ownDataArray(value, 'process arguments', MAX_PROCESS_ARGUMENTS);
  const result = input.map((_entry, index): ProcessArgument => {
    const item = arrayValue(input, index, 'process arguments');
    if (typeof item === 'string') return boundedString(item, 'process argument', true);
    const runtime = exactRecord(item, ['runtimeRef'], 'supervisor runtime argument');
    if (ownValue(runtime, 'runtimeRef') !== 'owned_server_endpoint') {
      invalidContract('supervisor runtime argument');
    }
    return Object.freeze({ runtimeRef: 'owned_server_endpoint' as const });
  });
  return Object.freeze(result);
}

function cloneProcessSpec(value: unknown): ProcessSpec {
  const record = exactRecord(value, [
    'role',
    'command',
    'argv',
    'cwd',
    'privateFiles',
    'fixedEnv',
    'spawnSecretEnvBindings',
    'stdin',
    'stdout',
  ], 'process spec');
  const role = ownValue(record, 'role');
  if (![
    'direct_task',
    'owned_server',
    'cold_task',
    'attach_task',
    'policy_preflight',
  ].includes(role as string)) invalidContract('process role');
  const typedRole = role as ProcessRole;
  const argv = cloneProcessArguments(ownValue(record, 'argv'));
  const runtimeArgumentCount = argv.filter((item) => typeof item !== 'string').length;
  if (
    (typedRole === 'attach_task' && runtimeArgumentCount !== 1)
    || (typedRole !== 'attach_task' && runtimeArgumentCount !== 0)
  ) invalidContract('supervisor runtime argument placement');
  const bindings = cloneSecretBindings(ownValue(record, 'spawnSecretEnvBindings'));
  if (
    ((typedRole === 'owned_server' || typedRole === 'attach_task') && bindings.length !== 1)
    || (typedRole !== 'owned_server' && typedRole !== 'attach_task' && bindings.length !== 0)
  ) invalidContract('spawn secret environment binding placement');
  const stdin = ownValue(record, 'stdin');
  const stdout = ownValue(record, 'stdout');
  const isTask = typedRole === 'direct_task' || typedRole === 'cold_task' || typedRole === 'attach_task';
  if (
    (isTask && (stdin !== 'task' || stdout !== 'agent_jsonl'))
    || (typedRole === 'owned_server' && (stdin !== 'none' || stdout !== 'bounded_readiness'))
    || (typedRole === 'policy_preflight' && (stdin !== 'none' || stdout !== 'bounded_json'))
  ) invalidContract('process stream contract');
  return Object.freeze({
    role: typedRole,
    command: boundedString(ownValue(record, 'command'), 'process command'),
    argv,
    cwd: boundedString(ownValue(record, 'cwd'), 'process cwd'),
    privateFiles: cloneStringArray(
      ownValue(record, 'privateFiles'),
      'private file references',
      MAX_PRIVATE_FILES,
    ),
    fixedEnv: cloneFixedEnv(ownValue(record, 'fixedEnv')),
    spawnSecretEnvBindings: bindings,
    stdin: stdin as ProcessStdin,
    stdout: stdout as ProcessStdout,
  });
}

function cloneReadinessPolicy(value: unknown): OwnedServerReadinessPolicy {
  const record = exactRecord(value, ['linePrefix', 'maxBytes', 'timeoutMs'], 'readiness policy');
  const linePrefix = boundedString(ownValue(record, 'linePrefix'), 'readiness prefix');
  if (
    Buffer.byteLength(linePrefix, 'utf8') > 512
    || linePrefix.includes('\n')
    || linePrefix.includes('\r')
  ) invalidContract('readiness prefix');
  return Object.freeze({
    linePrefix,
    maxBytes: boundedInteger(ownValue(record, 'maxBytes'), 1, 64 * 1024, 'readiness byte limit'),
    timeoutMs: boundedInteger(
      ownValue(record, 'timeoutMs'),
      1,
      MAX_ATTESTATION_TIMEOUT_MS,
      'readiness timeout',
    ),
  });
}

function cloneIdlePolicy(value: unknown): OwnedServerIdlePolicy {
  const record = exactRecord(value, ['timeoutMs'], 'idle policy');
  return Object.freeze({
    timeoutMs: boundedInteger(ownValue(record, 'timeoutMs'), 1, MAX_IDLE_TIMEOUT_MS, 'idle timeout'),
  });
}

function cloneRuntimeRefs(value: unknown): OwnedServerRuntimeRefs {
  const record = exactRecord(value, ['endpoint', 'generation'], 'owned server runtime references');
  if (
    ownValue(record, 'endpoint') !== 'owned_server_endpoint'
    || ownValue(record, 'generation') !== 'daemon_generation'
  ) invalidContract('owned server runtime references');
  return Object.freeze({
    endpoint: 'owned_server_endpoint',
    generation: 'daemon_generation',
  });
}

function cloneAssertion(value: unknown): PolicyAttestationAssertion {
  const base = ownDataRecord(value, 'policy attestation assertion');
  const kind = ownValue(base, 'kind');
  if (kind === 'exact_keys') {
    const record = exactRecord(value, ['kind', 'path', 'keys'], 'exact_keys assertion');
    const keys = cloneStringArray(ownValue(record, 'keys'), 'exact_keys values', 128);
    if (new Set(keys).size !== keys.length) invalidContract('exact_keys values');
    return Object.freeze({ kind, path: clonePath(ownValue(record, 'path')), keys });
  }
  if (kind === 'exact_scalar') {
    const record = exactRecord(value, ['kind', 'path', 'value'], 'exact_scalar assertion');
    const expected = ownValue(record, 'value');
    if (
      expected !== null
      && typeof expected !== 'boolean'
      && (typeof expected !== 'number' || !Number.isFinite(expected))
    ) invalidContract('exact_scalar value');
    return Object.freeze({
      kind,
      path: clonePath(ownValue(record, 'path')),
      value: expected as number | boolean | null,
    });
  }
  if (kind === 'absent' || kind === 'nonempty_string') {
    const record = exactRecord(value, ['kind', 'path'], `${kind} assertion`);
    return Object.freeze({ kind, path: clonePath(ownValue(record, 'path')) });
  }
  if (kind === 'string_sha256' || kind === 'document_sha256') {
    const record = exactRecord(value, ['kind', 'path', 'sha256'], `${kind} assertion`);
    const sha256 = boundedString(ownValue(record, 'sha256'), `${kind} digest`);
    if (!SHA256_PATTERN.test(sha256)) invalidContract(`${kind} digest`);
    return Object.freeze({ kind, path: clonePath(ownValue(record, 'path')), sha256 });
  }
  if (kind === 'all_strings_prefix') {
    const record = exactRecord(
      value,
      ['kind', 'path', 'prefixRef'],
      'all_strings_prefix assertion',
    );
    if (ownValue(record, 'prefixRef') !== 'fsb_mcp_tool_prefix') {
      invalidContract('attestation product reference');
    }
    return Object.freeze({
      kind,
      path: clonePath(ownValue(record, 'path')),
      prefixRef: 'fsb_mcp_tool_prefix',
    });
  }
  invalidContract('policy attestation assertion kind');
}

export function freezePolicyAttestationAssertions(
  value: unknown,
): readonly PolicyAttestationAssertion[] {
  const input = ownDataArray(value, 'policy attestation assertions', MAX_ASSERTIONS);
  return Object.freeze(input.map((_entry, index) => cloneAssertion(
    arrayValue(input, index, 'policy attestation assertions'),
  )));
}

function cloneAttestationLimits(record: OwnDataRecord): AttestationLimits {
  return {
    maxBytes: boundedInteger(
      ownValue(record, 'maxBytes'),
      1,
      MAX_ATTESTATION_BYTES,
      'attestation byte limit',
    ),
    timeoutMs: boundedInteger(
      ownValue(record, 'timeoutMs'),
      1,
      MAX_ATTESTATION_TIMEOUT_MS,
      'attestation timeout',
    ),
    assertions: freezePolicyAttestationAssertions(ownValue(record, 'assertions')),
  };
}

function cloneAttestation(value: unknown): AttestationDescriptor {
  const base = ownDataRecord(value, 'attestation descriptor');
  const source = ownValue(base, 'source');
  if (source === 'process_json') {
    const record = exactRecord(
      value,
      ['source', 'process', 'maxBytes', 'timeoutMs', 'assertions'],
      'process_json attestation',
    );
    const process = cloneProcessSpec(ownValue(record, 'process'));
    if (process.role !== 'policy_preflight') invalidContract('process_json process role');
    return Object.freeze({ source, process, ...cloneAttestationLimits(record) });
  }
  if (source === 'owned_server_json') {
    const record = exactRecord(value, [
      'source',
      'method',
      'path',
      'secretRef',
      'maxBytes',
      'timeoutMs',
      'assertions',
    ], 'owned_server_json attestation');
    const path = boundedString(ownValue(record, 'path'), 'owned server attestation path');
    const segments = path.split('/').slice(1);
    if (
      ownValue(record, 'method') !== 'GET'
      || ownValue(record, 'secretRef') !== OWNED_SERVER_BASIC_PASSWORD_SECRET_REF
      || !SAFE_SERVER_PATH_PATTERN.test(path)
      || segments.some((segment) => segment === '.' || segment === '..')
    ) invalidContract('owned_server_json attestation');
    return Object.freeze({
      source,
      method: 'GET',
      path,
      secretRef: OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
      ...cloneAttestationLimits(record),
    });
  }
  invalidContract('attestation source');
}

function cloneAttestations(value: unknown): readonly AttestationDescriptor[] {
  const input = ownDataArray(value, 'attestation descriptors', MAX_ATTESTATIONS);
  return Object.freeze(input.map((_entry, index) => cloneAttestation(
    arrayValue(input, index, 'attestation descriptors'),
  )));
}

function clonePrivateArtifact(value: unknown): SpawnPrivateArtifact {
  const base = ownDataRecord(value, 'private runtime artifact');
  const kind = ownValue(base, 'kind');
  if (kind === 'mcp_config') {
    const record = exactRecord(value, ['kind', 'endpoint'], 'MCP runtime artifact');
    return Object.freeze({
      kind,
      endpoint: boundedString(ownValue(record, 'endpoint'), 'MCP runtime endpoint'),
    });
  }
  if (kind === 'opencode_config') {
    const record = exactRecord(value, ['kind', 'contents'], 'OpenCode config artifact');
    const contents = boundedString(ownValue(record, 'contents'), 'OpenCode config artifact');
    if (Buffer.byteLength(contents, 'utf8') > 128 * 1024) {
      invalidContract('OpenCode config artifact');
    }
    return Object.freeze({ kind, contents });
  }
  if (kind === 'opencode_test_home' || kind === 'opencode_managed_config') {
    exactRecord(value, ['kind'], 'OpenCode directory artifact');
    return Object.freeze({ kind });
  }
  invalidContract('private runtime artifact kind');
}

function clonePrivateRuntimes(value: unknown): readonly SpawnPrivateRuntime[] {
  const input = ownDataArray(value, 'private runtimes', MAX_PRIVATE_RUNTIMES);
  const roles = new Set<SpawnRuntimeRole>();
  const runtimeIds = new Set<string>();
  const result = input.map((_entry, index): SpawnPrivateRuntime => {
    const record = exactRecord(
      arrayValue(input, index, 'private runtimes'),
      ['role', 'runtimeId', 'privateFiles', 'privateArtifacts'],
      'private runtime',
    );
    const role = ownValue(record, 'role');
    if (role !== 'delegation' && role !== 'provider_server' && role !== 'policy_preflight') {
      invalidContract('private runtime role');
    }
    const typedRole = role as SpawnRuntimeRole;
    const runtimeId = boundedString(ownValue(record, 'runtimeId'), 'private runtime id');
    if (
      !/^[A-Za-z0-9_-]{8,128}$/.test(runtimeId)
      || roles.has(typedRole)
      || runtimeIds.has(runtimeId)
    ) invalidContract('private runtime identity');
    roles.add(typedRole);
    runtimeIds.add(runtimeId);
    const artifacts = ownDataArray(
      ownValue(record, 'privateArtifacts'),
      'private runtime artifacts',
      MAX_PRIVATE_ARTIFACTS,
    );
    return Object.freeze({
      role: typedRole,
      runtimeId,
      privateFiles: cloneStringArray(
        ownValue(record, 'privateFiles'),
        'private runtime files',
        MAX_PRIVATE_FILES,
      ),
      privateArtifacts: Object.freeze(artifacts.map((_artifact, artifactIndex) => (
        clonePrivateArtifact(arrayValue(artifacts, artifactIndex, 'private runtime artifacts'))
      ))),
    });
  });
  return Object.freeze(result);
}

function cloneTopology(value: unknown): SpawnTopology {
  const base = ownDataRecord(value, 'spawn topology');
  const kind = ownValue(base, 'kind');
  if (kind === 'direct') {
    const record = exactRecord(value, ['kind', 'task'], 'direct topology');
    const task = cloneProcessSpec(ownValue(record, 'task'));
    if (task.role !== 'direct_task') invalidContract('direct topology task');
    return Object.freeze({ kind, task });
  }
  if (kind === 'owned_server') {
    const record = exactRecord(value, [
      'kind',
      'server',
      'coldTask',
      'attachTask',
      'readiness',
      'idle',
      'runtimeRefs',
    ], 'owned server topology');
    const server = cloneProcessSpec(ownValue(record, 'server'));
    const coldTask = cloneProcessSpec(ownValue(record, 'coldTask'));
    const attachTask = cloneProcessSpec(ownValue(record, 'attachTask'));
    if (
      server.role !== 'owned_server'
      || coldTask.role !== 'cold_task'
      || attachTask.role !== 'attach_task'
    ) invalidContract('owned server topology roles');
    return Object.freeze({
      kind,
      server,
      coldTask,
      attachTask,
      readiness: cloneReadinessPolicy(ownValue(record, 'readiness')),
      idle: cloneIdlePolicy(ownValue(record, 'idle')),
      runtimeRefs: cloneRuntimeRefs(ownValue(record, 'runtimeRefs')),
    });
  }
  invalidContract('spawn topology kind');
}

function cloneAdapterId(value: unknown): AgentProviderId {
  if (
    value !== CLAUDE_CODE_ADAPTER_ID
    && value !== OPENCODE_ADAPTER_ID
    && value !== CODEX_ADAPTER_ID
  ) {
    invalidContract('adapter id');
  }
  return value;
}

function legacyDirectSpawn(record: OwnDataRecord): SpawnSpec {
  const process = cloneProcessSpec({
    role: 'direct_task',
    command: ownValue(record, 'command'),
    argv: ownValue(record, 'argv'),
    cwd: ownValue(record, 'cwd'),
    privateFiles: ownValue(record, 'privateFiles'),
    fixedEnv: ownValue(record, 'fixedEnv'),
    spawnSecretEnvBindings: [],
    stdin: 'task',
    stdout: 'agent_jsonl',
  });
  return Object.freeze({
    adapterId: cloneAdapterId(ownValue(record, 'adapterId')),
    profileVersion: boundedString(ownValue(record, 'profileVersion'), 'profile version'),
    topology: Object.freeze({ kind: 'direct' as const, task: process }),
    attestations: Object.freeze([]),
  });
}

/**
 * Return a fresh recursively frozen contract. The flat overload is a narrow
 * compatibility projection for the existing Claude profile only.
 */
export function freezeSpawnSpec(spec: SpawnSpec): SpawnSpec;
export function freezeSpawnSpec(spec: Readonly<{
  adapterId: AgentProviderId;
  profileVersion: string;
  command: string;
  argv: readonly string[];
  cwd: string;
  privateFiles: readonly string[];
  fixedEnv: Readonly<Record<string, string>>;
}>): SpawnSpec;
export function freezeSpawnSpec(spec: unknown): SpawnSpec {
  const base = ownDataRecord(spec, 'spawn spec');
  if (Object.hasOwn(base, 'topology')) {
    const hasPrivateRuntimes = Object.hasOwn(base, 'privateRuntimes');
    const hasIdentityProbe = Object.hasOwn(base, 'preSpawnIdentityProbe');
    const hasAuthorityAttestation = Object.hasOwn(base, 'effectiveAuthorityAttestation');
    if (hasIdentityProbe !== hasAuthorityAttestation) {
      invalidContract('pre-spawn authority descriptors');
    }
    const keys = ['adapterId', 'profileVersion', 'topology', 'attestations'];
    if (hasPrivateRuntimes) keys.push('privateRuntimes');
    if (hasIdentityProbe) {
      keys.push('preSpawnIdentityProbe', 'effectiveAuthorityAttestation');
    }
    const record = exactRecord(
      spec,
      keys,
      'spawn spec',
    );
    const frozen = {
      adapterId: cloneAdapterId(ownValue(record, 'adapterId')),
      profileVersion: boundedString(ownValue(record, 'profileVersion'), 'profile version'),
      topology: cloneTopology(ownValue(record, 'topology')),
      attestations: cloneAttestations(ownValue(record, 'attestations')),
    };
    if (hasIdentityProbe && frozen.topology.kind !== 'direct') {
      invalidContract('pre-spawn authority topology');
    }
    return Object.freeze({
      ...frozen,
      ...(hasPrivateRuntimes
        ? { privateRuntimes: clonePrivateRuntimes(ownValue(record, 'privateRuntimes')) }
        : {}),
      ...(hasIdentityProbe
        ? {
            preSpawnIdentityProbe: validatePreSpawnIdentityProbe(
              ownValue(record, 'preSpawnIdentityProbe'),
            ),
            effectiveAuthorityAttestation: validateEffectiveAuthorityAttestation(
              ownValue(record, 'effectiveAuthorityAttestation'),
            ),
          }
        : {}),
    });
  }
  const legacy = exactRecord(spec, [
    'adapterId',
    'profileVersion',
    'command',
    'argv',
    'cwd',
    'privateFiles',
    'fixedEnv',
  ], 'legacy direct spawn spec');
  return legacyDirectSpawn(legacy);
}

export interface AgentProviderAdapter {
  detect(): Promise<AdapterDetection>;
  buildSpawn(task: AgentTask, ctx: SpawnContext): Promise<SpawnSpec>;
  parseEvents(stream: NodeJS.ReadableStream): AsyncIterable<AgentEvent>;
  kill(child: SupervisedChild, options: { grace: number }): Promise<void>;
  caps(): AdapterCapabilities;
}
