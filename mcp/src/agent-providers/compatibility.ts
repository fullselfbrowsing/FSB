import {
  CLAUDE_CODE_ADAPTER_ID,
  CODEX_ADAPTER_ID,
  OPENCODE_ADAPTER_ID,
  type AdapterCapabilities,
  type AdapterAuthState,
} from './adapter.js';

export type CompatibilityStatus = 'supported' | 'degraded' | 'unsupported';

export type CompatibilityReason =
  | 'within_tested_range'
  | 'newer_than_tested_range'
  | 'evidence_stale'
  | 'binary_not_found'
  | 'version_missing'
  | 'version_malformed'
  | 'below_minimum'
  | 'wrong_major'
  | 'adapter_unshipped'
  | 'matrix_invalid';

export interface AdapterCompatibilityContract {
  readonly adapterId: string;
  readonly capabilities: AdapterCapabilities;
  readonly displayLabel: string;
  readonly profileVersion: string;
  readonly minimumVersion: string;
  readonly testedThroughVersion: string;
  readonly supportedMajor: number;
  readonly fixtureManifest: string;
  readonly requiredInitFields: readonly string[];
  readonly requiredResultFields: readonly string[];
  readonly expectedNormalizedSequence: readonly string[];
}

export interface AdapterCompatibilityMatrix {
  readonly schemaVersion: 1;
  readonly adapters: readonly AdapterCompatibilityContract[];
}

export interface AdapterCompatibilityClassification {
  readonly adapterId: string;
  readonly displayLabel: string;
  readonly status: CompatibilityStatus;
  readonly reason: CompatibilityReason;
}

export interface AdapterCompatibilityEvidence {
  readonly binaryFound: boolean;
  readonly version: string | null;
}

export interface SafeAdapterCompatibilityRow extends AdapterCompatibilityClassification {
  readonly authState: AdapterAuthState;
}

export interface SafeCompatibilitySnapshot {
  readonly schemaVersion: 2;
  readonly checkedAt: number;
  readonly adapters: readonly SafeAdapterCompatibilityRow[];
}

export const COMPATIBILITY_STATUSES = Object.freeze([
  'supported',
  'degraded',
  'unsupported',
] as const);

export const COMPATIBILITY_REASONS = Object.freeze([
  'within_tested_range',
  'newer_than_tested_range',
  'evidence_stale',
  'binary_not_found',
  'version_missing',
  'version_malformed',
  'below_minimum',
  'wrong_major',
  'adapter_unshipped',
  'matrix_invalid',
] as const);

const MATRIX_KEYS = Object.freeze(['adapters', 'schemaVersion']);
const CONTRACT_KEYS = Object.freeze([
  'adapterId',
  'capabilities',
  'displayLabel',
  'expectedNormalizedSequence',
  'fixtureManifest',
  'minimumVersion',
  'profileVersion',
  'requiredInitFields',
  'requiredResultFields',
  'supportedMajor',
  'testedThroughVersion',
]);
const CAPABILITY_KEYS = Object.freeze([
  'chatMode',
  'resume',
  'serverMode',
  'taskMode',
] as const);
const EVIDENCE_KEYS = Object.freeze(['binaryFound', 'version']);
const SAFE_ROW_KEYS = Object.freeze([
  'adapterId',
  'authState',
  'displayLabel',
  'reason',
  'status',
]);
const SAFE_AUTH_STATES = Object.freeze([
  'chatgpt',
  'api_key',
  'unauthenticated',
  'unknown',
] as const);

const MAX_ADAPTERS = 16;
const MAX_FIELD_NAMES = 32;
const MAX_EVENT_NAMES = 64;
const MAX_ID_OR_LABEL_LENGTH = 64;
const MAX_VERSION_LENGTH = 32;
const MAX_FIXTURE_REFERENCE_LENGTH = 256;
const MAX_VERSION_OUTPUT_BYTES = 64 * 1024;

const ADAPTER_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const FIELD_NAME_PATTERN = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;
const STRICT_VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const KNOWN_NORMALIZED_EVENTS = new Set([
  'init',
  'assistant',
  'assistant_delta',
  'user',
  'tool_use',
  'tool_result',
  'retry',
  'result',
  'diagnostic',
]);
const CANONICAL_ADAPTER_IDS = Object.freeze([
  CLAUDE_CODE_ADAPTER_ID,
  OPENCODE_ADAPTER_ID,
  CODEX_ADAPTER_ID,
] as const);
const EXPECTED_CAPABILITIES = Object.freeze({
  [CLAUDE_CODE_ADAPTER_ID]: Object.freeze({
    taskMode: true,
    chatMode: false,
    resume: false,
    serverMode: false,
  }),
  [OPENCODE_ADAPTER_ID]: Object.freeze({
    taskMode: true,
    chatMode: false,
    resume: false,
    serverMode: true,
  }),
  [CODEX_ADAPTER_ID]: Object.freeze({
    taskMode: true,
    chatMode: false,
    resume: false,
    serverMode: false,
  }),
});

interface ParsedVersion {
  readonly raw: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

function ownDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return null;
  const stringKeys = ownKeys as string[];
  if (
    stringKeys.length !== expectedKeys.length
    || JSON.stringify([...stringKeys].sort()) !== JSON.stringify([...expectedKeys].sort())
  ) {
    return null;
  }

  const record: Record<string, unknown> = {};
  for (const key of stringKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    record[key] = descriptor.value;
  }
  return record;
}

function denseDataArray(value: unknown, maximumLength: number): readonly unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  if (!Number.isSafeInteger(value.length) || value.length > maximumLength) return null;

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return null;
  const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
  expectedKeys.push('length');
  if (
    ownKeys.length !== expectedKeys.length
    || JSON.stringify([...ownKeys].sort()) !== JSON.stringify(expectedKeys.sort())
  ) {
    return null;
  }

  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    items.push(descriptor.value);
  }
  return items;
}

function boundedString(
  value: unknown,
  maximumLength: number,
  pattern?: RegExp,
): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && !/[\u0000-\u001f\u007f]/.test(value)
    && (!pattern || pattern.test(value));
}

function parseVersion(value: unknown): ParsedVersion | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_VERSION_LENGTH) {
    return null;
  }
  const match = STRICT_VERSION_PATTERN.exec(value);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return Object.freeze({ raw: value, major, minor, patch });
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return 0;
}

function parseStringArray(
  value: unknown,
  maximumLength: number,
  itemValidator: (item: unknown) => item is string,
  requireUnique: boolean,
): readonly string[] | null {
  const values = denseDataArray(value, maximumLength);
  if (!values || values.length === 0 || !values.every(itemValidator)) return null;
  const strings = values as string[];
  if (requireUnique && new Set(strings).size !== strings.length) return null;
  return Object.freeze([...strings]);
}

function parseFixtureReference(value: unknown, adapterId: string, profileVersion: string): string | null {
  if (!boundedString(value, MAX_FIXTURE_REFERENCE_LENGTH)) return null;
  if (value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) return null;
  const expected = `tests/fixtures/agent-streams/${adapterId}-${profileVersion}/manifest.json`;
  return value === expected ? value : null;
}

function parseCapabilities(
  value: unknown,
  adapterId:
    | typeof CLAUDE_CODE_ADAPTER_ID
    | typeof OPENCODE_ADAPTER_ID
    | typeof CODEX_ADAPTER_ID,
): AdapterCapabilities | null {
  const record = ownDataRecord(value, CAPABILITY_KEYS);
  if (!record || CAPABILITY_KEYS.some((key) => typeof record[key] !== 'boolean')) return null;
  const expected = EXPECTED_CAPABILITIES[adapterId];
  if (CAPABILITY_KEYS.some((key) => record[key] !== expected[key])) return null;
  return Object.freeze({
    taskMode: record.taskMode as boolean,
    chatMode: record.chatMode as boolean,
    resume: record.resume as boolean,
    serverMode: record.serverMode as boolean,
  });
}

function parseContract(value: unknown): AdapterCompatibilityContract | null {
  const record = ownDataRecord(value, CONTRACT_KEYS);
  if (!record) return null;
  if (!boundedString(record.adapterId, MAX_ID_OR_LABEL_LENGTH, ADAPTER_ID_PATTERN)) return null;
  if (
    record.adapterId !== CLAUDE_CODE_ADAPTER_ID
    && record.adapterId !== OPENCODE_ADAPTER_ID
    && record.adapterId !== CODEX_ADAPTER_ID
  ) return null;
  if (!boundedString(record.displayLabel, MAX_ID_OR_LABEL_LENGTH)) return null;
  const capabilities = parseCapabilities(record.capabilities, record.adapterId);
  if (!capabilities) return null;

  const profileVersion = parseVersion(record.profileVersion);
  const minimumVersion = parseVersion(record.minimumVersion);
  const testedThroughVersion = parseVersion(record.testedThroughVersion);
  if (!profileVersion || !minimumVersion || !testedThroughVersion) return null;
  if (
    !Number.isSafeInteger(record.supportedMajor)
    || typeof record.supportedMajor !== 'number'
    || record.supportedMajor < 0
    || record.supportedMajor > 999_999_999
    || profileVersion.major !== record.supportedMajor
    || minimumVersion.major !== record.supportedMajor
    || testedThroughVersion.major !== record.supportedMajor
    || compareVersions(minimumVersion, testedThroughVersion) > 0
    || compareVersions(profileVersion, minimumVersion) < 0
    || compareVersions(profileVersion, testedThroughVersion) > 0
  ) {
    return null;
  }

  const fixtureManifest = parseFixtureReference(
    record.fixtureManifest,
    record.adapterId,
    profileVersion.raw,
  );
  if (!fixtureManifest) return null;

  const requiredInitFields = parseStringArray(
    record.requiredInitFields,
    MAX_FIELD_NAMES,
    (item): item is string => boundedString(item, MAX_ID_OR_LABEL_LENGTH, FIELD_NAME_PATTERN),
    true,
  );
  const requiredResultFields = parseStringArray(
    record.requiredResultFields,
    MAX_FIELD_NAMES,
    (item): item is string => boundedString(item, MAX_ID_OR_LABEL_LENGTH, FIELD_NAME_PATTERN),
    true,
  );
  const expectedNormalizedSequence = parseStringArray(
    record.expectedNormalizedSequence,
    MAX_EVENT_NAMES,
    (item): item is string => typeof item === 'string' && KNOWN_NORMALIZED_EVENTS.has(item),
    false,
  );
  if (!requiredInitFields || !requiredResultFields || !expectedNormalizedSequence) return null;

  return Object.freeze({
    adapterId: record.adapterId,
    capabilities,
    displayLabel: record.displayLabel,
    profileVersion: profileVersion.raw,
    minimumVersion: minimumVersion.raw,
    testedThroughVersion: testedThroughVersion.raw,
    supportedMajor: record.supportedMajor,
    fixtureManifest,
    requiredInitFields,
    requiredResultFields,
    expectedNormalizedSequence,
  });
}

export function parseAdapterCompatibilityMatrix(
  value: unknown,
): AdapterCompatibilityMatrix | null {
  const record = ownDataRecord(value, MATRIX_KEYS);
  if (!record || record.schemaVersion !== 1) return null;
  const values = denseDataArray(record.adapters, MAX_ADAPTERS);
  if (!values || values.length !== CANONICAL_ADAPTER_IDS.length) return null;

  const adapters: AdapterCompatibilityContract[] = [];
  const ids = new Set<string>();
  for (const [index, valueItem] of values.entries()) {
    const adapter = parseContract(valueItem);
    if (
      !adapter
      || ids.has(adapter.adapterId)
      || adapter.adapterId !== CANONICAL_ADAPTER_IDS[index]
    ) return null;
    ids.add(adapter.adapterId);
    adapters.push(adapter);
  }
  return Object.freeze({
    schemaVersion: 1,
    adapters: Object.freeze(adapters),
  });
}

const RAW_ADAPTER_COMPATIBILITY_MATRIX = {
  schemaVersion: 1,
  adapters: [{
    adapterId: 'claude-code',
    capabilities: {
      taskMode: true,
      chatMode: false,
      resume: false,
      serverMode: false,
    },
    displayLabel: 'Claude Code',
    profileVersion: '2.1.177',
    minimumVersion: '2.1.177',
    testedThroughVersion: '2.1.177',
    supportedMajor: 2,
    fixtureManifest: 'tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json',
    requiredInitFields: ['type', 'subtype', 'session_id', 'tools', 'mcp_servers'],
    requiredResultFields: ['type', 'subtype', 'session_id', 'is_error'],
    expectedNormalizedSequence: [
      'init',
      'assistant',
      'tool_use',
      'assistant_delta',
      'user',
      'tool_result',
      'retry',
      'result',
    ],
  }, {
    adapterId: 'opencode',
    capabilities: {
      taskMode: true,
      chatMode: false,
      resume: false,
      serverMode: true,
    },
    displayLabel: 'OpenCode',
    profileVersion: '1.14.25',
    minimumVersion: '1.14.25',
    testedThroughVersion: '1.14.25',
    supportedMajor: 1,
    fixtureManifest: 'tests/fixtures/agent-streams/opencode-1.14.25/manifest.json',
    requiredInitFields: [
      'type',
      'timestamp',
      'sessionID',
      'part.id',
      'part.sessionID',
      'part.messageID',
      'part.type',
    ],
    requiredResultFields: [
      'type',
      'timestamp',
      'sessionID',
      'part.id',
      'part.sessionID',
      'part.messageID',
      'part.type',
      'part.reason',
      'part.cost',
      'part.tokens',
    ],
    expectedNormalizedSequence: [
      'init',
      'assistant_delta',
      'assistant',
      'tool_use',
      'tool_result',
      'tool_use',
      'tool_result',
      'assistant',
      'result',
    ],
  }, {
    adapterId: 'codex',
    capabilities: {
      taskMode: true,
      chatMode: false,
      resume: false,
      serverMode: false,
    },
    displayLabel: 'Codex',
    profileVersion: '0.142.5',
    minimumVersion: '0.142.5',
    testedThroughVersion: '0.142.5',
    supportedMajor: 0,
    fixtureManifest: 'tests/fixtures/agent-streams/codex-0.142.5/manifest.json',
    requiredInitFields: ['type', 'thread_id'],
    requiredResultFields: [
      'type',
      'usage.input_tokens',
      'usage.cached_input_tokens',
      'usage.output_tokens',
      'usage.reasoning_output_tokens',
    ],
    expectedNormalizedSequence: [
      'init',
      'assistant',
      'tool_use',
      'tool_result',
      'result',
    ],
  }],
};

const parsedMatrix = parseAdapterCompatibilityMatrix(RAW_ADAPTER_COMPATIBILITY_MATRIX);
if (!parsedMatrix) throw new Error('Invalid built-in adapter compatibility matrix');

export const ADAPTER_COMPATIBILITY_MATRIX = parsedMatrix;

export function getAdapterCompatibilityContract(
  adapterId: string,
  matrix: unknown = ADAPTER_COMPATIBILITY_MATRIX,
): AdapterCompatibilityContract | null {
  const parsed = matrix === ADAPTER_COMPATIBILITY_MATRIX
    ? ADAPTER_COMPATIBILITY_MATRIX
    : parseAdapterCompatibilityMatrix(matrix);
  if (!parsed || typeof adapterId !== 'string') return null;
  return parsed.adapters.find((adapter) => adapter.adapterId === adapterId) ?? null;
}

export function extractAdapterVersion(output: unknown): string | null {
  if (typeof output !== 'string' || Buffer.byteLength(output, 'utf8') > MAX_VERSION_OUTPUT_BYTES) {
    return null;
  }
  const match = output.match(
    /(?:^|[^0-9A-Za-z.-])((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?=$|[^0-9A-Za-z.-])/,
  );
  if (!match || !parseVersion(match[1])) return null;
  return match[1];
}

function classification(
  adapterId: string,
  displayLabel: string,
  status: CompatibilityStatus,
  reason: CompatibilityReason,
): AdapterCompatibilityClassification {
  return Object.freeze({ adapterId, displayLabel, status, reason });
}

function fallbackAdapterId(value: unknown): string {
  return boundedString(value, MAX_ID_OR_LABEL_LENGTH, ADAPTER_ID_PATTERN)
    ? value
    : 'unknown-adapter';
}

function normalizeEvidence(
  evidence: unknown,
): AdapterCompatibilityEvidence | 'missing' | 'malformed' {
  if (evidence === null || evidence === undefined || evidence === '') return 'missing';
  if (typeof evidence === 'string') {
    return Object.freeze({ binaryFound: true, version: evidence });
  }
  const record = ownDataRecord(evidence, EVIDENCE_KEYS);
  if (
    !record
    || typeof record.binaryFound !== 'boolean'
    || !(record.version === null || typeof record.version === 'string')
  ) {
    return 'malformed';
  }
  return Object.freeze({
    binaryFound: record.binaryFound,
    version: record.version,
  });
}

export function classifyAdapterCompatibility(
  adapterId: string,
  evidence: unknown,
  matrix: unknown = ADAPTER_COMPATIBILITY_MATRIX,
): AdapterCompatibilityClassification {
  const parsed = matrix === ADAPTER_COMPATIBILITY_MATRIX
    ? ADAPTER_COMPATIBILITY_MATRIX
    : parseAdapterCompatibilityMatrix(matrix);
  const safeAdapterId = fallbackAdapterId(adapterId);
  if (!parsed) {
    return classification(safeAdapterId, safeAdapterId, 'unsupported', 'matrix_invalid');
  }

  const contract = parsed.adapters.find((adapter) => adapter.adapterId === adapterId);
  if (!contract) {
    return classification(safeAdapterId, safeAdapterId, 'unsupported', 'adapter_unshipped');
  }

  const normalized = normalizeEvidence(evidence);
  if (normalized === 'missing') {
    return classification(contract.adapterId, contract.displayLabel, 'unsupported', 'version_missing');
  }
  if (normalized === 'malformed') {
    return classification(contract.adapterId, contract.displayLabel, 'unsupported', 'version_malformed');
  }
  if (!normalized.binaryFound) {
    return classification(contract.adapterId, contract.displayLabel, 'unsupported', 'binary_not_found');
  }
  if (normalized.version === null || normalized.version === '') {
    return classification(contract.adapterId, contract.displayLabel, 'unsupported', 'version_missing');
  }

  const version = parseVersion(normalized.version);
  if (!version) {
    return classification(contract.adapterId, contract.displayLabel, 'unsupported', 'version_malformed');
  }
  if (version.major !== contract.supportedMajor) {
    return classification(contract.adapterId, contract.displayLabel, 'unsupported', 'wrong_major');
  }

  const minimum = parseVersion(contract.minimumVersion);
  const testedThrough = parseVersion(contract.testedThroughVersion);
  if (!minimum || !testedThrough) {
    return classification(contract.adapterId, contract.displayLabel, 'unsupported', 'matrix_invalid');
  }
  if (compareVersions(version, minimum) < 0) {
    return classification(contract.adapterId, contract.displayLabel, 'unsupported', 'below_minimum');
  }
  if (compareVersions(version, testedThrough) > 0) {
    return classification(
      contract.adapterId,
      contract.displayLabel,
      'degraded',
      'newer_than_tested_range',
    );
  }
  return classification(
    contract.adapterId,
    contract.displayLabel,
    'supported',
    'within_tested_range',
  );
}

function validStatusReason(status: unknown, reason: unknown): boolean {
  if (status === 'supported') return reason === 'within_tested_range';
  if (status === 'degraded') {
    return reason === 'newer_than_tested_range' || reason === 'evidence_stale';
  }
  if (status !== 'unsupported') return false;
  return reason === 'binary_not_found'
    || reason === 'version_missing'
    || reason === 'version_malformed'
    || reason === 'below_minimum'
    || reason === 'wrong_major'
    || reason === 'adapter_unshipped'
    || reason === 'matrix_invalid';
}

function parseSafeRow(value: unknown): SafeAdapterCompatibilityRow | null {
  const record = ownDataRecord(value, SAFE_ROW_KEYS);
  if (!record) return null;
  if (!boundedString(record.adapterId, MAX_ID_OR_LABEL_LENGTH, ADAPTER_ID_PATTERN)) return null;
  if (!boundedString(record.displayLabel, MAX_ID_OR_LABEL_LENGTH)) return null;
  if (!validStatusReason(record.status, record.reason)) return null;
  if (
    typeof record.authState !== 'string'
    || !(SAFE_AUTH_STATES as readonly string[]).includes(record.authState)
  ) return null;
  return Object.freeze({
    adapterId: record.adapterId,
    displayLabel: record.displayLabel,
    status: record.status as CompatibilityStatus,
    reason: record.reason as CompatibilityReason,
    authState: record.authState as AdapterAuthState,
  });
}

export function createSafeCompatibilitySnapshot(
  checkedAt: number,
  rows: unknown,
): SafeCompatibilitySnapshot {
  if (!Number.isSafeInteger(checkedAt) || checkedAt < 0) {
    throw new Error('Invalid safe compatibility snapshot');
  }
  const values = denseDataArray(rows, MAX_ADAPTERS);
  if (!values) throw new Error('Invalid safe compatibility snapshot');

  const adapters: SafeAdapterCompatibilityRow[] = [];
  const ids = new Set<string>();
  for (const value of values) {
    const row = parseSafeRow(value);
    if (!row || ids.has(row.adapterId)) {
      throw new Error('Invalid safe compatibility snapshot');
    }
    ids.add(row.adapterId);
    adapters.push(row);
  }
  return Object.freeze({
    schemaVersion: 2,
    checkedAt,
    adapters: Object.freeze(adapters),
  });
}
