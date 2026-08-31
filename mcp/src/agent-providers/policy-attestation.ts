import { createHash } from 'node:crypto';
import {
  freezePolicyAttestationAssertions,
  type PolicyAttestationAssertion,
} from './adapter.js';

const MAX_DOCUMENT_BYTES = 1024 * 1024;
const MAX_DOCUMENT_DEPTH = 32;
const MAX_DOCUMENT_NODES = 16_384;
const CLOSED_PRODUCTS = Object.freeze({
  fsb_mcp_tool_prefix: 'fsb_',
} as const);

export type PolicyAttestationReason =
  | 'passed'
  | 'invalid_document'
  | 'invalid_descriptor'
  | 'assertion_failed';

export type PolicyAttestationVerdict =
  | Readonly<{ pass: true; reason: 'passed' }>
  | Readonly<{
      pass: false;
      reason: Exclude<PolicyAttestationReason, 'passed' | 'assertion_failed'>;
    }>
  | Readonly<{
      pass: false;
      reason: 'assertion_failed';
      assertionIndex: number;
    }>;

type JsonScalar = string | number | boolean | null;
interface JsonObject {
  readonly [key: string]: JsonValue;
}
interface JsonArray extends ReadonlyArray<JsonValue> {}
type JsonValue = JsonScalar | JsonArray | JsonObject;

interface CopyBudget {
  nodes: number;
  bytes: number;
  readonly ancestors: WeakSet<object>;
}

interface CopyResult {
  readonly valid: boolean;
  readonly value?: JsonValue;
}

interface PathResult {
  readonly found: boolean;
  readonly value?: JsonValue;
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

function addBudget(budget: CopyBudget, bytes: number): boolean {
  budget.nodes += 1;
  budget.bytes += bytes;
  return budget.nodes <= MAX_DOCUMENT_NODES && budget.bytes <= MAX_DOCUMENT_BYTES;
}

function ownDataDescriptor(value: object, key: PropertyKey): PropertyDescriptor | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (
    !descriptor
    || descriptor.enumerable !== true
    || !Object.hasOwn(descriptor, 'value')
  ) return null;
  return descriptor;
}

function copyOwnJson(value: unknown, budget: CopyBudget, depth: number): CopyResult {
  if (depth > MAX_DOCUMENT_DEPTH) return { valid: false };
  if (value === null || typeof value === 'boolean') {
    return addBudget(budget, 4) ? { valid: true, value } : { valid: false };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { valid: false };
    return addBudget(budget, 16) ? { valid: true, value } : { valid: false };
  }
  if (typeof value === 'string') {
    if (!isWellFormedText(value)) return { valid: false };
    return addBudget(budget, Buffer.byteLength(value, 'utf8'))
      ? { valid: true, value }
      : { valid: false };
  }
  if (!value || typeof value !== 'object' || budget.ancestors.has(value)) {
    return { valid: false };
  }
  budget.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return { valid: false };
      const keys = Reflect.ownKeys(value);
      if (
        keys.length !== value.length + 1
        || keys.some((key) => (
          typeof key !== 'string'
          || (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key))
        ))
        || !addBudget(budget, 2)
      ) return { valid: false };
      const copy: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = ownDataDescriptor(value, String(index));
        if (!descriptor) return { valid: false };
        const item = copyOwnJson(descriptor.value, budget, depth + 1);
        if (!item.valid || item.value === undefined) return { valid: false };
        copy.push(item.value);
      }
      return { valid: true, value: Object.freeze(copy) };
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return { valid: false };
    const keys = Reflect.ownKeys(value);
    if (
      keys.length > MAX_DOCUMENT_NODES
      || keys.some((key) => typeof key !== 'string')
      || !addBudget(budget, 2)
    ) return { valid: false };
    const copy: Record<string, JsonValue> = {};
    for (const key of keys as string[]) {
      if (!isWellFormedText(key) || !addBudget(budget, Buffer.byteLength(key, 'utf8'))) {
        return { valid: false };
      }
      const descriptor = ownDataDescriptor(value, key);
      if (!descriptor) return { valid: false };
      const item = copyOwnJson(descriptor.value, budget, depth + 1);
      if (!item.valid || item.value === undefined) return { valid: false };
      Object.defineProperty(copy, key, {
        value: item.value,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return { valid: true, value: Object.freeze(copy) };
  } finally {
    budget.ancestors.delete(value);
  }
}

function copyDocument(value: unknown): CopyResult {
  const result = copyOwnJson(value, { nodes: 0, bytes: 0, ancestors: new WeakSet() }, 0);
  if (!result.valid || result.value === undefined) return { valid: false };
  const serialized = JSON.stringify(result.value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES) return { valid: false };
  return result;
}

function resolvePath(document: JsonValue, path: readonly string[]): PathResult {
  let current = document;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return { found: false };
    if (Array.isArray(current) && !/^(?:0|[1-9][0-9]*)$/.test(segment)) {
      return { found: false };
    }
    const descriptor = Object.getOwnPropertyDescriptor(current, segment);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return { found: false };
    current = descriptor.value as JsonValue;
  }
  return { found: true, value: current };
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertionPasses(document: JsonValue, assertion: PolicyAttestationAssertion): boolean {
  const selected = resolvePath(document, assertion.path);
  if (assertion.kind === 'absent') return !selected.found;
  if (!selected.found) return false;
  const value = selected.value;
  if (assertion.kind === 'exact_keys') {
    return !!value
      && typeof value === 'object'
      && !Array.isArray(value)
      && JSON.stringify(Object.keys(value)) === JSON.stringify(assertion.keys);
  }
  if (assertion.kind === 'exact_scalar') return Object.is(value, assertion.value);
  if (assertion.kind === 'string_sha256') {
    return typeof value === 'string' && digest(value) === assertion.sha256;
  }
  if (assertion.kind === 'document_sha256') {
    return digest(JSON.stringify(value)) === assertion.sha256;
  }
  if (assertion.kind === 'nonempty_string') {
    return typeof value === 'string' && value.trim().length > 0;
  }
  if (assertion.kind === 'all_strings_prefix') {
    const prefix = CLOSED_PRODUCTS[assertion.prefixRef];
    return Array.isArray(value)
      && value.length > 0
      && value.every((item) => typeof item === 'string' && item.startsWith(prefix));
  }
  return false;
}

function verdict(reason: 'invalid_document' | 'invalid_descriptor'): PolicyAttestationVerdict;
function verdict(reason: 'assertion_failed', assertionIndex: number): PolicyAttestationVerdict;
function verdict(
  reason: 'invalid_document' | 'invalid_descriptor' | 'assertion_failed',
  assertionIndex?: number,
): PolicyAttestationVerdict {
  if (reason === 'assertion_failed') {
    return Object.freeze({ pass: false, reason, assertionIndex: assertionIndex ?? 0 });
  }
  return Object.freeze({ pass: false, reason });
}

/** Interpret only the closed assertion grammar over an exact own-data JSON value. */
export function verifyPolicyAttestation(
  document: unknown,
  assertions: readonly PolicyAttestationAssertion[],
): PolicyAttestationVerdict {
  const copied = copyDocument(document);
  if (!copied.valid || copied.value === undefined) return verdict('invalid_document');
  const safeDocument = copied.value;
  let safeAssertions: readonly PolicyAttestationAssertion[];
  try {
    safeAssertions = freezePolicyAttestationAssertions(assertions);
  } catch {
    return verdict('invalid_descriptor');
  }
  for (let index = 0; index < safeAssertions.length; index += 1) {
    if (!assertionPasses(safeDocument, safeAssertions[index]!)) {
      return verdict('assertion_failed', index);
    }
  }
  return Object.freeze({ pass: true, reason: 'passed' });
}
