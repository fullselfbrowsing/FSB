import { isAbsolute, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import type {
  AdapterAuthState,
  DirectRuntimeReference,
  EffectiveAuthorityAttestation,
  IdentityProbeOutcome,
  PreSpawnIdentityProbe,
  ProbeByteMatcher,
} from './adapter.js';

const GENERATION_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_CLASSIFICATION_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_TOOL_PATTERN = /^(?:fsb_[A-Za-z0-9_~-]{1,127}|search_capabilities|invoke_capability)$/;
const MAX_ARGUMENTS = 256;
const MAX_ARGUMENT_BYTES = 64 * 1024;
const MAX_CHANNEL_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 60_000;
const MAX_OUTCOMES = 16;
const MAX_MATCHER_BYTES = 64 * 1024;
const MAX_ENABLED_TOOLS = 256;
const MAX_CODEX_APP_SERVER_MESSAGES = 8;
const CODEX_AUTHORITY_CLIENT_NAME = 'fsb_codex_authority';
const CODEX_AUTHORITY_CLIENT_TITLE = 'Full Self-Browsing Codex Authority';
const CODEX_AUTHORITY_PROTOCOL_VERSION = '0.142.5';
const CODEX_REMOTE_CONTROL_NOTIFICATION = 'remoteControl/status/changed';
const SAFE_AUTH_STATES = Object.freeze([
  'chatgpt',
  'api_key',
  'unauthenticated',
  'unknown',
]);

const directRuntimeReferences = new WeakSet<object>();

export type EffectiveAuthorityFailureCode =
  | 'invalid_direct_runtime'
  | 'invalid_identity_probe'
  | 'invalid_authority_attestation';

export class EffectiveAuthorityContractError extends Error {
  readonly code: EffectiveAuthorityFailureCode;

  constructor(code: EffectiveAuthorityFailureCode) {
    super(code);
    this.name = 'EffectiveAuthorityContractError';
    this.code = code;
  }
}

export type IdentityProbeReasonCode =
  | 'match'
  | 'exit_mismatch'
  | 'byte_mismatch'
  | 'ambiguous'
  | 'malformed';

export interface IdentityProbeClassification {
  readonly matched: boolean;
  readonly authState: AdapterAuthState | null;
  readonly reason: IdentityProbeReasonCode;
}

export type EffectiveAuthorityReasonCode =
  | 'match'
  | 'malformed'
  | 'server_count'
  | 'server_name'
  | 'endpoint'
  | 'required'
  | 'enabled'
  | 'enabled_tools'
  | 'approval_policy'
  | 'headers_present'
  | 'env_present'
  | 'bearer_present';

export interface EffectiveAuthorityClassification {
  readonly pass: boolean;
  readonly reason: EffectiveAuthorityReasonCode;
  readonly serverCountMatches: boolean;
  readonly serverNameMatches: boolean;
  readonly endpointMatches: boolean;
  readonly requiredMatches: boolean;
  readonly enabledMatches: boolean;
  readonly enabledToolsMatch: boolean;
  readonly approvalPolicyMatches: boolean;
  readonly headersAbsent: boolean;
  readonly envAbsent: boolean;
  readonly bearerTokenAbsent: boolean;
}

type OwnDataRecord = Readonly<Record<string, unknown>>;

function contractFailure(code: EffectiveAuthorityFailureCode): never {
  throw new EffectiveAuthorityContractError(code);
}

function ownDataRecord(value: unknown, code: EffectiveAuthorityFailureCode): OwnDataRecord {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) contractFailure(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) contractFailure(code);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      contractFailure(code);
    }
  }
  return value as OwnDataRecord;
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  code: EffectiveAuthorityFailureCode,
): OwnDataRecord {
  const record = ownDataRecord(value, code);
  const keys = Reflect.ownKeys(record) as string[];
  if (
    keys.length !== expectedKeys.length
    || keys.some((key) => !expectedKeys.includes(key))
  ) contractFailure(code);
  return record;
}

function ownValue(
  record: OwnDataRecord,
  key: string,
  code: EffectiveAuthorityFailureCode,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) contractFailure(code);
  return descriptor.value;
}

function boundedString(
  value: unknown,
  code: EffectiveAuthorityFailureCode,
  allowEmpty = false,
): string {
  if (
    typeof value !== 'string'
    || (!allowEmpty && value.length === 0)
    || value.includes('\0')
    || Buffer.byteLength(value, 'utf8') > MAX_ARGUMENT_BYTES
  ) contractFailure(code);
  return value;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  code: EffectiveAuthorityFailureCode,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    contractFailure(code);
  }
  return value as number;
}

function denseArray(
  value: unknown,
  maximum: number,
  code: EffectiveAuthorityFailureCode,
): readonly unknown[] {
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1
  ) contractFailure(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      contractFailure(code);
    }
  }
  return value;
}

function arrayValue(
  values: readonly unknown[],
  index: number,
  code: EffectiveAuthorityFailureCode,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) contractFailure(code);
  return descriptor.value;
}

function cloneArguments(
  value: unknown,
  code: EffectiveAuthorityFailureCode,
): readonly string[] {
  const values = denseArray(value, MAX_ARGUMENTS, code);
  if (values.length === 0) contractFailure(code);
  return Object.freeze(values.map((_value, index) => boundedString(
    arrayValue(values, index, code),
    code,
    true,
  )));
}

function cloneBytes(
  value: unknown,
  code: EffectiveAuthorityFailureCode,
): readonly number[] {
  const values = denseArray(value, MAX_MATCHER_BYTES, code);
  return Object.freeze(values.map((_value, index) => boundedInteger(
    arrayValue(values, index, code),
    0,
    255,
    code,
  )));
}

function cloneMatcher(value: unknown): ProbeByteMatcher {
  const code = 'invalid_identity_probe' as const;
  const base = ownDataRecord(value, code);
  const kind = ownValue(base, 'kind', code);
  if (kind === 'empty') {
    exactRecord(value, ['kind'], code);
    return Object.freeze({ kind });
  }
  if (kind === 'exact') {
    const record = exactRecord(value, ['kind', 'bytes'], code);
    return Object.freeze({ kind, bytes: cloneBytes(ownValue(record, 'bytes', code), code) });
  }
  if (kind === 'prefix_suffix') {
    const record = exactRecord(
      value,
      ['kind', 'prefix', 'suffix', 'minBytes', 'maxBytes'],
      code,
    );
    const prefix = cloneBytes(ownValue(record, 'prefix', code), code);
    const suffix = cloneBytes(ownValue(record, 'suffix', code), code);
    const minBytes = boundedInteger(ownValue(record, 'minBytes', code), 0, MAX_CHANNEL_BYTES, code);
    const maxBytes = boundedInteger(ownValue(record, 'maxBytes', code), 1, MAX_CHANNEL_BYTES, code);
    if (
      prefix.length === 0
      || suffix.length === 0
      || minBytes > maxBytes
      || minBytes < prefix.length + suffix.length
    ) contractFailure(code);
    return Object.freeze({ kind, prefix, suffix, minBytes, maxBytes });
  }
  if (kind === 'masked_token') {
    const record = exactRecord(
      value,
      ['kind', 'prefix', 'separator', 'suffix', 'leadingBytes', 'trailingBytes'],
      code,
    );
    const prefix = cloneBytes(ownValue(record, 'prefix', code), code);
    const separator = cloneBytes(ownValue(record, 'separator', code), code);
    const suffix = cloneBytes(ownValue(record, 'suffix', code), code);
    const leadingBytes = boundedInteger(
      ownValue(record, 'leadingBytes', code),
      1,
      MAX_CHANNEL_BYTES,
      code,
    );
    const trailingBytes = boundedInteger(
      ownValue(record, 'trailingBytes', code),
      1,
      MAX_CHANNEL_BYTES,
      code,
    );
    if (
      prefix.length === 0
      || separator.length === 0
      || suffix.length === 0
      || prefix.length + separator.length + suffix.length + leadingBytes + trailingBytes
        > MAX_CHANNEL_BYTES
    ) contractFailure(code);
    return Object.freeze({
      kind,
      prefix,
      separator,
      suffix,
      leadingBytes,
      trailingBytes,
    });
  }
  contractFailure(code);
}

function matcherMaximum(matcher: ProbeByteMatcher): number {
  if (matcher.kind === 'empty') return 0;
  if (matcher.kind === 'exact') return matcher.bytes.length;
  if (matcher.kind === 'masked_token') {
    return matcher.prefix.length
      + matcher.leadingBytes
      + matcher.separator.length
      + matcher.trailingBytes
      + matcher.suffix.length;
  }
  return matcher.maxBytes;
}

function matcherEquals(left: ProbeByteMatcher, right: ProbeByteMatcher): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'empty' && right.kind === 'empty') return true;
  if (left.kind === 'exact' && right.kind === 'exact') {
    return left.bytes.length === right.bytes.length
      && left.bytes.every((byte, index) => byte === right.bytes[index]);
  }
  if (left.kind === 'prefix_suffix' && right.kind === 'prefix_suffix') {
    return left.minBytes === right.minBytes
      && left.maxBytes === right.maxBytes
      && left.prefix.length === right.prefix.length
      && left.suffix.length === right.suffix.length
      && left.prefix.every((byte, index) => byte === right.prefix[index])
      && left.suffix.every((byte, index) => byte === right.suffix[index]);
  }
  if (left.kind === 'masked_token' && right.kind === 'masked_token') {
    return left.leadingBytes === right.leadingBytes
      && left.trailingBytes === right.trailingBytes
      && left.prefix.length === right.prefix.length
      && left.separator.length === right.separator.length
      && left.suffix.length === right.suffix.length
      && left.prefix.every((byte, index) => byte === right.prefix[index])
      && left.separator.every((byte, index) => byte === right.separator[index])
      && left.suffix.every((byte, index) => byte === right.suffix[index]);
  }
  return false;
}

function cloneIdentityOutcome(value: unknown): IdentityProbeOutcome {
  const code = 'invalid_identity_probe' as const;
  const record = exactRecord(value, ['authState', 'exitCode', 'stdout', 'stderr'], code);
  const authState = ownValue(record, 'authState', code);
  if (
    typeof authState !== 'string'
    || !SAFE_CLASSIFICATION_PATTERN.test(authState)
    || !SAFE_AUTH_STATES.includes(authState)
  ) contractFailure(code);
  return Object.freeze({
    authState: authState as AdapterAuthState,
    exitCode: boundedInteger(ownValue(record, 'exitCode', code), 0, 255, code),
    stdout: cloneMatcher(ownValue(record, 'stdout', code)),
    stderr: cloneMatcher(ownValue(record, 'stderr', code)),
  });
}

/** Validate and recursively freeze one generic retained-binary identity probe. */
export function validatePreSpawnIdentityProbe(value: unknown): PreSpawnIdentityProbe {
  const code = 'invalid_identity_probe' as const;
  try {
    const record = exactRecord(value, [
      'source',
      'argv',
      'timeoutMs',
      'stdoutLimitBytes',
      'stderrLimitBytes',
      'expectedAuthState',
      'outcomes',
    ], code);
    if (ownValue(record, 'source', code) !== 'retained_binary') contractFailure(code);
    const stdoutLimitBytes = boundedInteger(
      ownValue(record, 'stdoutLimitBytes', code),
      1,
      MAX_CHANNEL_BYTES,
      code,
    );
    const stderrLimitBytes = boundedInteger(
      ownValue(record, 'stderrLimitBytes', code),
      1,
      MAX_CHANNEL_BYTES,
      code,
    );
    const rawOutcomes = denseArray(ownValue(record, 'outcomes', code), MAX_OUTCOMES, code);
    if (rawOutcomes.length === 0) contractFailure(code);
    const outcomes = Object.freeze(rawOutcomes.map((_outcome, index) => (
      cloneIdentityOutcome(arrayValue(rawOutcomes, index, code))
    )));
    if (
      new Set(outcomes.map((outcome) => outcome.authState)).size !== outcomes.length
      || outcomes.some((outcome) => (
        matcherMaximum(outcome.stdout) > stdoutLimitBytes
        || matcherMaximum(outcome.stderr) > stderrLimitBytes
      ))
    ) contractFailure(code);
    for (let left = 0; left < outcomes.length; left += 1) {
      for (let right = left + 1; right < outcomes.length; right += 1) {
        if (
          outcomes[left]?.exitCode === outcomes[right]?.exitCode
          && matcherEquals(outcomes[left]!.stdout, outcomes[right]!.stdout)
          && matcherEquals(outcomes[left]!.stderr, outcomes[right]!.stderr)
        ) contractFailure(code);
      }
    }
    const expectedAuthState = ownValue(record, 'expectedAuthState', code);
    if (
      typeof expectedAuthState !== 'string'
      || outcomes.filter((outcome) => outcome.authState === expectedAuthState).length !== 1
    ) contractFailure(code);
    return Object.freeze({
      source: 'retained_binary',
      argv: cloneArguments(ownValue(record, 'argv', code), code),
      timeoutMs: boundedInteger(ownValue(record, 'timeoutMs', code), 1, MAX_TIMEOUT_MS, code),
      stdoutLimitBytes,
      stderrLimitBytes,
      expectedAuthState: expectedAuthState as AdapterAuthState,
      outcomes,
    });
  } catch (error) {
    if (error instanceof EffectiveAuthorityContractError) throw error;
    contractFailure(code);
  }
}

function matchBytes(bytes: Buffer, matcher: ProbeByteMatcher): boolean {
  if (matcher.kind === 'empty') return bytes.length === 0;
  if (matcher.kind === 'exact') {
    return bytes.length === matcher.bytes.length
      && matcher.bytes.every((byte, index) => bytes[index] === byte);
  }
  if (matcher.kind === 'masked_token') {
    const expectedLength = matcher.prefix.length
      + matcher.leadingBytes
      + matcher.separator.length
      + matcher.trailingBytes
      + matcher.suffix.length;
    if (bytes.length !== expectedLength) return false;
    let offset = 0;
    if (matcher.prefix.some((byte, index) => bytes[index] !== byte)) return false;
    offset += matcher.prefix.length;
    const isTokenByte = (byte: number): boolean => (
      (byte >= 0x30 && byte <= 0x39)
      || (byte >= 0x41 && byte <= 0x5a)
      || (byte >= 0x61 && byte <= 0x7a)
      || byte === 0x2d
      || byte === 0x5f
    );
    for (let index = 0; index < matcher.leadingBytes; index += 1) {
      if (!isTokenByte(bytes[offset + index]!)) return false;
    }
    offset += matcher.leadingBytes;
    if (matcher.separator.some((byte, index) => bytes[offset + index] !== byte)) return false;
    offset += matcher.separator.length;
    for (let index = 0; index < matcher.trailingBytes; index += 1) {
      if (!isTokenByte(bytes[offset + index]!)) return false;
    }
    offset += matcher.trailingBytes;
    return matcher.suffix.every((byte, index) => bytes[offset + index] === byte);
  }
  if (bytes.length < matcher.minBytes || bytes.length > matcher.maxBytes) return false;
  if (matcher.prefix.some((byte, index) => bytes[index] !== byte)) return false;
  const suffixOffset = bytes.length - matcher.suffix.length;
  return matcher.suffix.every((byte, index) => bytes[suffixOffset + index] === byte);
}

/** Classify only to a safe enum/reason; raw buffers are neither copied nor retained. */
export function classifyPreSpawnIdentityProbe(
  result: Readonly<{
    stdout: Buffer;
    stderr: Buffer;
    exit: Readonly<{ code: number | null; signal: NodeJS.Signals | null }>;
  }>,
  descriptorValue: unknown,
): IdentityProbeClassification {
  try {
    const descriptor = validatePreSpawnIdentityProbe(descriptorValue);
    if (
      !result
      || typeof result !== 'object'
      || !Buffer.isBuffer(result.stdout)
      || !Buffer.isBuffer(result.stderr)
      || !result.exit
      || typeof result.exit !== 'object'
      || result.exit.signal !== null
      || (result.exit.code !== null && !Number.isSafeInteger(result.exit.code))
    ) return Object.freeze({ matched: false, authState: null, reason: 'malformed' });
    const sameExit = descriptor.outcomes.filter((outcome) => outcome.exitCode === result.exit.code);
    if (sameExit.length === 0) {
      return Object.freeze({ matched: false, authState: null, reason: 'exit_mismatch' });
    }
    const matches = sameExit.filter((outcome) => (
      matchBytes(result.stdout, outcome.stdout) && matchBytes(result.stderr, outcome.stderr)
    ));
    if (matches.length === 0) {
      return Object.freeze({ matched: false, authState: null, reason: 'byte_mismatch' });
    }
    if (matches.length !== 1) {
      return Object.freeze({ matched: false, authState: null, reason: 'ambiguous' });
    }
    return Object.freeze({ matched: true, authState: matches[0]!.authState, reason: 'match' });
  } catch {
    return Object.freeze({ matched: false, authState: null, reason: 'malformed' });
  }
}

function parseOwnedLoopbackEndpoint(endpoint: unknown): string {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 4_096) {
    contractFailure('invalid_direct_runtime');
  }
  try {
    const parsed = new URL(endpoint);
    const port = Number(parsed.port);
    if (
      parsed.protocol !== 'http:'
      || parsed.hostname !== '127.0.0.1'
      || parsed.port.length === 0
      || !Number.isSafeInteger(port)
      || port < 1
      || port > 65_535
      || parsed.pathname !== '/mcp'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.search !== ''
      || parsed.hash !== ''
      || endpoint !== `${parsed.origin}/mcp`
    ) contractFailure('invalid_direct_runtime');
    return endpoint;
  } catch (error) {
    if (error instanceof EffectiveAuthorityContractError) throw error;
    contractFailure('invalid_direct_runtime');
  }
}

/** Mint only from serve-delegation after the listener owns its loopback endpoint. */
export function createDirectRuntimeReference(
  endpoint: string,
  generation: string,
): DirectRuntimeReference {
  const validatedEndpoint = parseOwnedLoopbackEndpoint(endpoint);
  if (typeof generation !== 'string' || !GENERATION_PATTERN.test(generation)) {
    contractFailure('invalid_direct_runtime');
  }
  const reference = Object.freeze({ endpoint: validatedEndpoint, generation });
  directRuntimeReferences.add(reference);
  return reference;
}

/** Reject structurally forged or cross-generation endpoint capabilities. */
export function validateDirectRuntimeReference(
  value: unknown,
  expectedGeneration?: string,
): DirectRuntimeReference {
  const code = 'invalid_direct_runtime' as const;
  try {
    if (!value || typeof value !== 'object' || !directRuntimeReferences.has(value)) {
      contractFailure(code);
    }
    const record = exactRecord(value, ['endpoint', 'generation'], code);
    const endpoint = parseOwnedLoopbackEndpoint(ownValue(record, 'endpoint', code));
    const generation = ownValue(record, 'generation', code);
    if (
      typeof generation !== 'string'
      || !GENERATION_PATTERN.test(generation)
      || (expectedGeneration !== undefined && generation !== expectedGeneration)
      || !Object.isFrozen(value)
    ) contractFailure(code);
    return value as DirectRuntimeReference;
  } catch (error) {
    if (error instanceof EffectiveAuthorityContractError) throw error;
    contractFailure(code);
  }
}

function cloneEnabledTools(value: unknown): readonly string[] {
  const code = 'invalid_authority_attestation' as const;
  const values = denseArray(value, MAX_ENABLED_TOOLS, code);
  if (values.length === 0) contractFailure(code);
  const tools = Object.freeze(values.map((_value, index) => {
    const tool = boundedString(arrayValue(values, index, code), code);
    if (!SAFE_TOOL_PATTERN.test(tool)) contractFailure(code);
    return tool;
  }));
  if (new Set(tools).size !== tools.length) contractFailure(code);
  return tools;
}

function codexAuthorityConfigArguments(argv: readonly string[]): readonly string[] {
  const code = 'invalid_authority_attestation' as const;
  if (
    argv.length < 12
    || argv[argv.length - 3] !== 'app-server'
    || argv[argv.length - 2] !== '--stdio'
    || argv[argv.length - 1] !== '--strict-config'
  ) contractFailure(code);
  const appServerIndex = argv.length - 3;
  let configIndex = -1;
  for (let index = 0; index < appServerIndex; index += 1) {
    if (argv[index] === '-c') {
      configIndex = index;
      break;
    }
  }
  if (configIndex < 0 || (appServerIndex - configIndex) % 2 !== 0) contractFailure(code);
  const configArguments = argv.slice(configIndex, appServerIndex);
  const values: string[] = [];
  for (let index = 0; index < configArguments.length; index += 2) {
    if (configArguments[index] !== '-c') contractFailure(code);
    values.push(configArguments[index + 1]!);
  }
  const exactCritical = [
    'mcp_servers={}',
    'mcp_servers.fsb.required=true',
    'mcp_servers.fsb.enabled=true',
    'mcp_servers.fsb.enabled_tools=["search_capabilities","invoke_capability"]',
    'mcp_servers.fsb.default_tools_approval_mode="approve"',
  ];
  if (exactCritical.some((value) => values.filter((item) => item === value).length !== 1)) {
    contractFailure(code);
  }
  const urlValues = values.filter((value) => value.startsWith('mcp_servers.fsb.url='));
  if (urlValues.length !== 1) contractFailure(code);
  const allowedMcpValues = new Set([...exactCritical, urlValues[0]!]);
  if (values.some((value) => value.startsWith('mcp_servers') && !allowedMcpValues.has(value))) {
    contractFailure(code);
  }
  return Object.freeze(configArguments);
}

function validateCodexAuthorityRequest(bytes: readonly number[]): void {
  const code = 'invalid_authority_attestation' as const;
  const owned = Buffer.from(bytes);
  let text: string | null = null;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(owned);
    if (!text.endsWith('\n')) contractFailure(code);
    const lines = text.split('\n');
    if (lines.length !== 4 || lines[3] !== '' || lines.slice(0, 3).some((line) => !line)) {
      contractFailure(code);
    }
    const documents = lines.slice(0, 3).map((line) => JSON.parse(line) as unknown);
    const initialize = exactRecord(documents[0], ['method', 'id', 'params'], code);
    if (
      ownValue(initialize, 'method', code) !== 'initialize'
      || ownValue(initialize, 'id', code) !== 1
    ) contractFailure(code);
    const initializeParams = exactRecord(
      ownValue(initialize, 'params', code),
      ['clientInfo', 'capabilities'],
      code,
    );
    const clientInfo = exactRecord(
      ownValue(initializeParams, 'clientInfo', code),
      ['name', 'title', 'version'],
      code,
    );
    if (
      ownValue(clientInfo, 'name', code) !== CODEX_AUTHORITY_CLIENT_NAME
      || ownValue(clientInfo, 'title', code) !== CODEX_AUTHORITY_CLIENT_TITLE
      || ownValue(clientInfo, 'version', code) !== CODEX_AUTHORITY_PROTOCOL_VERSION
    ) contractFailure(code);
    const capabilities = exactRecord(
      ownValue(initializeParams, 'capabilities', code),
      ['optOutNotificationMethods'],
      code,
    );
    const optedOut = denseArray(
      ownValue(capabilities, 'optOutNotificationMethods', code),
      1,
      code,
    );
    if (
      optedOut.length !== 1
      || arrayValue(optedOut, 0, code) !== CODEX_REMOTE_CONTROL_NOTIFICATION
    ) contractFailure(code);

    const initialized = exactRecord(documents[1], ['method', 'params'], code);
    if (
      ownValue(initialized, 'method', code) !== 'initialized'
      || Reflect.ownKeys(ownDataRecord(ownValue(initialized, 'params', code), code)).length !== 0
    ) contractFailure(code);

    const configRead = exactRecord(documents[2], ['method', 'id', 'params'], code);
    if (
      ownValue(configRead, 'method', code) !== 'config/read'
      || ownValue(configRead, 'id', code) !== 2
    ) contractFailure(code);
    const configParams = exactRecord(
      ownValue(configRead, 'params', code),
      ['includeLayers', 'cwd'],
      code,
    );
    const cwd = ownValue(configParams, 'cwd', code);
    if (
      ownValue(configParams, 'includeLayers', code) !== false
      || typeof cwd !== 'string'
      || !isAbsolute(cwd)
      || resolve(cwd) !== cwd
    ) contractFailure(code);
  } catch (error) {
    if (error instanceof EffectiveAuthorityContractError) throw error;
    contractFailure(code);
  } finally {
    owned.fill(0);
    text = null;
  }
}

/** Require the authority probe to reuse the task's complete ordered CLI overrides. */
export function codexAuthorityUsesTaskConfig(
  authorityArgv: readonly string[],
  taskArgv: readonly unknown[],
): boolean {
  try {
    const authorityConfig = codexAuthorityConfigArguments(authorityArgv);
    if (!Array.isArray(taskArgv) || Object.getPrototypeOf(taskArgv) !== Array.prototype) {
      return false;
    }
    const configIndex = taskArgv.findIndex((entry) => entry === '-c');
    if (configIndex < 0) return false;
    const taskConfig = taskArgv.slice(configIndex);
    if (
      taskConfig.length !== authorityConfig.length
      || taskConfig.some((entry, index) => (
        typeof entry !== 'string' || entry !== authorityConfig[index]
      ))
    ) return false;
    for (let index = 0; index < taskConfig.length; index += 2) {
      if (taskConfig[index] !== '-c' || typeof taskConfig[index + 1] !== 'string') return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Validate the exact provider-neutral effective-authority descriptor. */
export function validateEffectiveAuthorityAttestation(
  value: unknown,
): EffectiveAuthorityAttestation {
  const code = 'invalid_authority_attestation' as const;
  try {
    const base = ownDataRecord(value, code);
    const rawClassifier = ownValue(base, 'classifier', code);
    const expectsStdin = rawClassifier === 'codex_effective_authority_json';
    const record = exactRecord(value, [
      'source',
      'argv',
      ...(expectsStdin ? ['stdinBytes'] : []),
      'timeoutMs',
      'stdoutLimitBytes',
      'stderrLimitBytes',
      'classifier',
      'expectedServerName',
      'endpointRef',
      'required',
      'enabled',
      'enabledTools',
      'defaultToolsApprovalMode',
      'headers',
      'env',
      'bearerToken',
    ], code);
    if (
      ownValue(record, 'source', code) !== 'retained_binary'
      || (
        ownValue(record, 'classifier', code) !== 'effective_authority_json'
        && ownValue(record, 'classifier', code) !== 'codex_effective_authority_json'
      )
      || ownValue(record, 'expectedServerName', code) !== 'fsb'
      || ownValue(record, 'endpointRef', code) !== 'direct_runtime_endpoint'
      || ownValue(record, 'required', code) !== true
      || ownValue(record, 'enabled', code) !== true
      || ownValue(record, 'defaultToolsApprovalMode', code) !== 'approve'
      || ownValue(record, 'headers', code) !== 'absent'
      || ownValue(record, 'env', code) !== 'absent'
      || ownValue(record, 'bearerToken', code) !== 'absent'
    ) contractFailure(code);
    const classifier = ownValue(
      record,
      'classifier',
      code,
    ) as EffectiveAuthorityAttestation['classifier'];
    const argv = cloneArguments(ownValue(record, 'argv', code), code);
    let stdinBytes: readonly number[] | undefined;
    if (classifier === 'codex_effective_authority_json') {
      codexAuthorityConfigArguments(argv);
      stdinBytes = cloneBytes(ownValue(record, 'stdinBytes', code), code);
      if (stdinBytes.length === 0) contractFailure(code);
      validateCodexAuthorityRequest(stdinBytes);
    }
    return Object.freeze({
      source: 'retained_binary',
      argv,
      ...(stdinBytes ? { stdinBytes } : {}),
      timeoutMs: boundedInteger(ownValue(record, 'timeoutMs', code), 1, MAX_TIMEOUT_MS, code),
      stdoutLimitBytes: boundedInteger(
        ownValue(record, 'stdoutLimitBytes', code),
        1,
        MAX_CHANNEL_BYTES,
        code,
      ),
      stderrLimitBytes: boundedInteger(
        ownValue(record, 'stderrLimitBytes', code),
        1,
        MAX_CHANNEL_BYTES,
        code,
      ),
      classifier,
      expectedServerName: 'fsb',
      endpointRef: 'direct_runtime_endpoint',
      required: true,
      enabled: true,
      enabledTools: cloneEnabledTools(ownValue(record, 'enabledTools', code)),
      defaultToolsApprovalMode: 'approve',
      headers: 'absent',
      env: 'absent',
      bearerToken: 'absent',
    });
  } catch (error) {
    if (error instanceof EffectiveAuthorityContractError) throw error;
    contractFailure(code);
  }
}

function malformedAuthority(): EffectiveAuthorityClassification {
  return Object.freeze({
    pass: false,
    reason: 'malformed',
    serverCountMatches: false,
    serverNameMatches: false,
    endpointMatches: false,
    requiredMatches: false,
    enabledMatches: false,
    enabledToolsMatch: false,
    approvalPolicyMatches: false,
    headersAbsent: false,
    envAbsent: false,
    bearerTokenAbsent: false,
  });
}

function observedTools(value: unknown): readonly string[] | null {
  try {
    const values = denseArray(value, MAX_ENABLED_TOOLS, 'invalid_authority_attestation');
    const tools = values.map((_value, index) => arrayValue(
      values,
      index,
      'invalid_authority_attestation',
    ));
    return tools.every((tool) => typeof tool === 'string')
      ? tools as readonly string[]
      : null;
  } catch {
    return null;
  }
}

function classifyCodexNativeAuthority(
  value: unknown,
  descriptor: EffectiveAuthorityAttestation,
  directRuntime: DirectRuntimeReference,
): EffectiveAuthorityClassification {
  const code = 'invalid_authority_attestation' as const;
  const messages = denseArray(value, MAX_CODEX_APP_SERVER_MESSAGES, code);
  let initializeResult: OwnDataRecord | null = null;
  let configReadResult: OwnDataRecord | null = null;
  for (let index = 0; index < messages.length; index += 1) {
    const message = ownDataRecord(arrayValue(messages, index, code), code);
    if (Object.hasOwn(message, 'id')) {
      const response = exactRecord(message, ['id', 'result'], code);
      const id = ownValue(response, 'id', code);
      const result = ownDataRecord(ownValue(response, 'result', code), code);
      if (id === 1 && initializeResult === null) initializeResult = result;
      else if (id === 2 && configReadResult === null) configReadResult = result;
      else return malformedAuthority();
      continue;
    }
    const notification = exactRecord(message, ['method', 'params'], code);
    if (ownValue(notification, 'method', code) !== CODEX_REMOTE_CONTROL_NOTIFICATION) {
      return malformedAuthority();
    }
    ownDataRecord(ownValue(notification, 'params', code), code);
  }
  if (initializeResult === null || configReadResult === null) return malformedAuthority();
  const initialize = exactRecord(initializeResult, [
    'userAgent',
    'codexHome',
    'platformFamily',
    'platformOs',
  ], code);
  const codexHome = ownValue(initialize, 'codexHome', code);
  if (
    typeof ownValue(initialize, 'userAgent', code) !== 'string'
    || typeof codexHome !== 'string'
    || !isAbsolute(codexHome)
    || typeof ownValue(initialize, 'platformFamily', code) !== 'string'
    || typeof ownValue(initialize, 'platformOs', code) !== 'string'
  ) return malformedAuthority();

  const configResponse = exactRecord(configReadResult, ['config', 'origins'], code);
  const config = ownDataRecord(ownValue(configResponse, 'config', code), code);
  ownDataRecord(ownValue(configResponse, 'origins', code), code);
  const roster = ownDataRecord(ownValue(config, 'mcp_servers', code), code);
  const serverNames = Reflect.ownKeys(roster) as string[];
  if (serverNames.length > MAX_ENABLED_TOOLS) return malformedAuthority();
  const enabledServerNames: string[] = [];
  for (const serverName of serverNames) {
    const server = ownDataRecord(ownValue(roster, serverName, code), code);
    const enabled = ownValue(server, 'enabled', code);
    if (typeof enabled !== 'boolean') return malformedAuthority();
    if (enabled) enabledServerNames.push(serverName);
  }

  const serverCountMatches = enabledServerNames.length === 1;
  const serverNameMatches = enabledServerNames.length === 1
    && enabledServerNames[0] === descriptor.expectedServerName;
  if (!Object.hasOwn(roster, descriptor.expectedServerName)) {
    const checks = [
      ['server_count', serverCountMatches],
      ['server_name', serverNameMatches],
      ['endpoint', false],
      ['required', false],
      ['enabled', false],
      ['enabled_tools', false],
      ['approval_policy', false],
      ['headers_present', false],
      ['env_present', false],
      ['bearer_present', false],
    ] as const;
    const failed = checks.find(([, pass]) => !pass)!;
    return Object.freeze({
      pass: false,
      reason: failed[0],
      serverCountMatches,
      serverNameMatches,
      endpointMatches: false,
      requiredMatches: false,
      enabledMatches: false,
      enabledToolsMatch: false,
      approvalPolicyMatches: false,
      headersAbsent: false,
      envAbsent: false,
      bearerTokenAbsent: false,
    });
  }

  // Pinned to ConfigReadResponse + flattened McpServerConfig in Codex 0.142.5.
  const server = ownDataRecord(ownValue(roster, descriptor.expectedServerName, code), code);
  const requiredKeys = [
    'url',
    'environment_id',
    'enabled',
    'required',
    'tool_timeout_sec',
    'default_tools_approval_mode',
    'enabled_tools',
  ];
  const optionalSensitiveKeys = [
    'bearer_token',
    'bearer_token_env_var',
    'http_headers',
    'env_http_headers',
    'env',
    'env_vars',
  ];
  const serverKeys = Reflect.ownKeys(server) as string[];
  if (
    requiredKeys.some((key) => !serverKeys.includes(key))
    || serverKeys.some((key) => (
      !requiredKeys.includes(key) && !optionalSensitiveKeys.includes(key)
    ))
    || ownValue(server, 'environment_id', code) !== 'local'
    || ownValue(server, 'tool_timeout_sec', code) !== null
  ) return malformedAuthority();

  const tools = observedTools(ownValue(server, 'enabled_tools', code));
  const endpointMatches = ownValue(server, 'url', code) === directRuntime.endpoint;
  const requiredMatches = ownValue(server, 'required', code) === descriptor.required;
  const enabledMatches = ownValue(server, 'enabled', code) === descriptor.enabled;
  const enabledToolsMatch = tools !== null
    && tools.length === descriptor.enabledTools.length
    && new Set(tools).size === tools.length
    && tools.every((tool, index) => tool === descriptor.enabledTools[index]);
  const approvalPolicyMatches = ownValue(
    server,
    'default_tools_approval_mode',
    code,
  ) === descriptor.defaultToolsApprovalMode;
  const headersAbsent = !serverKeys.includes('http_headers');
  const envAbsent = !serverKeys.includes('env_http_headers')
    && !serverKeys.includes('env')
    && !serverKeys.includes('env_vars');
  const bearerTokenAbsent = !serverKeys.includes('bearer_token_env_var')
    && !serverKeys.includes('bearer_token');
  const checks = [
    ['server_count', serverCountMatches],
    ['server_name', serverNameMatches],
    ['endpoint', endpointMatches],
    ['required', requiredMatches],
    ['enabled', enabledMatches],
    ['enabled_tools', enabledToolsMatch],
    ['approval_policy', approvalPolicyMatches],
    ['headers_present', headersAbsent],
    ['env_present', envAbsent],
    ['bearer_present', bearerTokenAbsent],
  ] as const;
  const failed = checks.find(([, pass]) => !pass);
  const pass = failed === undefined;
  return Object.freeze({
    pass,
    reason: pass ? 'match' : failed[0],
    serverCountMatches,
    serverNameMatches,
    endpointMatches,
    requiredMatches,
    enabledMatches,
    enabledToolsMatch,
    approvalPolicyMatches,
    headersAbsent,
    envAbsent,
    bearerTokenAbsent,
  });
}

/** Reduce a parsed native roster to equality booleans and one closed reason. */
export function classifyEffectiveAuthority(
  value: unknown,
  descriptorValue: unknown,
  directRuntimeValue: unknown,
): EffectiveAuthorityClassification {
  try {
    const descriptor = validateEffectiveAuthorityAttestation(descriptorValue);
    const directRuntime = validateDirectRuntimeReference(directRuntimeValue);
    if (descriptor.classifier === 'codex_effective_authority_json') {
      return classifyCodexNativeAuthority(value, descriptor, directRuntime);
    }
    const root = exactRecord(value, ['servers'], 'invalid_authority_attestation');
    const servers = denseArray(
      ownValue(root, 'servers', 'invalid_authority_attestation'),
      MAX_ENABLED_TOOLS,
      'invalid_authority_attestation',
    );
    if (servers.length !== 1) {
      return Object.freeze({
        ...malformedAuthority(),
        reason: 'server_count' as const,
        serverCountMatches: false,
      });
    }
    const server = ownDataRecord(
      arrayValue(servers, 0, 'invalid_authority_attestation'),
      'invalid_authority_attestation',
    );
    const requiredKeys = [
      'serverName',
      'endpoint',
      'required',
      'enabled',
      'enabledTools',
      'defaultToolsApprovalMode',
    ];
    const optionalSensitiveKeys = ['headers', 'env', 'bearerToken'];
    const keys = Reflect.ownKeys(server) as string[];
    if (
      requiredKeys.some((key) => !keys.includes(key))
      || keys.some((key) => !requiredKeys.includes(key) && !optionalSensitiveKeys.includes(key))
    ) return malformedAuthority();

    const tools = observedTools(ownValue(server, 'enabledTools', 'invalid_authority_attestation'));
    const serverCountMatches = servers.length === 1;
    const serverNameMatches = ownValue(
      server,
      'serverName',
      'invalid_authority_attestation',
    ) === descriptor.expectedServerName;
    const endpointMatches = ownValue(
      server,
      'endpoint',
      'invalid_authority_attestation',
    ) === directRuntime.endpoint;
    const requiredMatches = ownValue(
      server,
      'required',
      'invalid_authority_attestation',
    ) === descriptor.required;
    const enabledMatches = ownValue(
      server,
      'enabled',
      'invalid_authority_attestation',
    ) === descriptor.enabled;
    const enabledToolsMatch = tools !== null
      && tools.length === descriptor.enabledTools.length
      && new Set(tools).size === tools.length
      && tools.every((tool, index) => tool === descriptor.enabledTools[index]);
    const approvalPolicyMatches = ownValue(
      server,
      'defaultToolsApprovalMode',
      'invalid_authority_attestation',
    ) === descriptor.defaultToolsApprovalMode;
    const headersAbsent = !keys.includes('headers');
    const envAbsent = !keys.includes('env');
    const bearerTokenAbsent = !keys.includes('bearerToken');
    const checks = [
      ['server_name', serverNameMatches],
      ['endpoint', endpointMatches],
      ['required', requiredMatches],
      ['enabled', enabledMatches],
      ['enabled_tools', enabledToolsMatch],
      ['approval_policy', approvalPolicyMatches],
      ['headers_present', headersAbsent],
      ['env_present', envAbsent],
      ['bearer_present', bearerTokenAbsent],
    ] as const;
    const failed = checks.find(([, pass]) => !pass);
    const pass = failed === undefined;
    return Object.freeze({
      pass,
      reason: pass ? 'match' : failed[0],
      serverCountMatches,
      serverNameMatches,
      endpointMatches,
      requiredMatches,
      enabledMatches,
      enabledToolsMatch,
      approvalPolicyMatches,
      headersAbsent,
      envAbsent,
      bearerTokenAbsent,
    });
  } catch {
    return malformedAuthority();
  }
}
