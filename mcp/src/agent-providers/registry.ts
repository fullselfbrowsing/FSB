import {
  CLAUDE_CODE_ADAPTER_ID,
  OPENCODE_ADAPTER_ID,
  type AdapterDetection,
  type AgentEvent,
  type AgentProviderAdapter,
  type AgentProviderId,
  type SupervisedChild,
} from './adapter.js';
import { createClaudeCodeAdapter } from './claude-code.js';
import {
  createOpenCodeAdapter,
  type OpenCodeDetectionDependency,
  type OpenCodeParserDependency,
  type OpenCodeProfileRuntimeDependency,
} from './opencode.js';

export type AdapterRegistryErrorCode =
  | 'invalid_adapter_id'
  | 'unknown_adapter_id'
  | 'duplicate_adapter'
  | 'missing_adapter';

export class AdapterRegistryError extends Error {
  readonly code: AdapterRegistryErrorCode;

  constructor(code: AdapterRegistryErrorCode, message: string) {
    super(message);
    this.name = 'AdapterRegistryError';
    this.code = code;
  }
}

export interface AdapterRegistration {
  readonly id: string;
  readonly adapter: AgentProviderAdapter;
}

export interface AgentProviderRegistry {
  require(id: string): AgentProviderAdapter;
  ids(): readonly AgentProviderId[];
}

export interface ProductionAdapterRegistryDependencies {
  readonly detect?: () => Promise<AdapterDetection>;
  readonly parseEvents?: (stream: NodeJS.ReadableStream) => AsyncIterable<AgentEvent>;
  readonly openCodeDetect?: OpenCodeDetectionDependency;
  readonly openCodeParseEvents?: OpenCodeParserDependency;
  readonly resolveOpenCodeProfileRuntime?: OpenCodeProfileRuntimeDependency;
  readonly kill: (
    child: SupervisedChild,
    options: { grace: number },
  ) => Promise<void>;
}

const CANONICAL_IDS = Object.freeze([
  CLAUDE_CODE_ADAPTER_ID,
  OPENCODE_ADAPTER_ID,
] as const);
const ADAPTER_METHODS = Object.freeze([
  'detect',
  'buildSpawn',
  'parseEvents',
  'kill',
  'caps',
]);

function parseRegistrationId(id: string): AgentProviderId {
  if (typeof id !== 'string' || id.length === 0 || id !== id.toLowerCase()) {
    throw new AdapterRegistryError('invalid_adapter_id', 'Adapter id must be canonical');
  }
  if (id !== CLAUDE_CODE_ADAPTER_ID && id !== OPENCODE_ADAPTER_ID) {
    throw new AdapterRegistryError('unknown_adapter_id', 'Unknown adapter id');
  }
  return id;
}

function parseLookupId(id: string): AgentProviderId {
  return parseRegistrationId(id);
}

function denseRegistrationValues(
  registrations: readonly AdapterRegistration[],
): readonly unknown[] {
  if (!Array.isArray(registrations) || Object.getPrototypeOf(registrations) !== Array.prototype) {
    throw new TypeError('Adapter registrations must be a dense data array');
  }
  const ownKeys = Reflect.ownKeys(registrations);
  const expectedKeys = Array.from({ length: registrations.length }, (_, index) => String(index));
  expectedKeys.push('length');
  if (
    ownKeys.some((key) => typeof key !== 'string')
    || ownKeys.length !== expectedKeys.length
    || JSON.stringify([...ownKeys].sort()) !== JSON.stringify(expectedKeys.sort())
  ) {
    throw new TypeError('Adapter registrations must be a dense data array');
  }
  return Object.freeze(Array.from({ length: registrations.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(registrations, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('Adapter registrations must be a dense data array');
    }
    return descriptor.value;
  }));
}

function parseRegistration(value: unknown): AdapterRegistration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Adapter registration must be an exact data record');
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Adapter registration must be an exact data record');
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== 2
    || ownKeys.some((key) => typeof key !== 'string')
    || !ownKeys.includes('id')
    || !ownKeys.includes('adapter')
  ) {
    throw new TypeError('Adapter registration must be an exact data record');
  }
  const idDescriptor = Object.getOwnPropertyDescriptor(value, 'id');
  const adapterDescriptor = Object.getOwnPropertyDescriptor(value, 'adapter');
  if (
    !idDescriptor
    || !adapterDescriptor
    || !idDescriptor.enumerable
    || !adapterDescriptor.enumerable
    || !Object.hasOwn(idDescriptor, 'value')
    || !Object.hasOwn(adapterDescriptor, 'value')
  ) {
    throw new TypeError('Adapter registration must be an exact data record');
  }
  return {
    id: idDescriptor.value as string,
    adapter: adapterDescriptor.value as AgentProviderAdapter,
  };
}

function validateAdapter(adapter: AgentProviderAdapter): void {
  if (!adapter || typeof adapter !== 'object' || !Object.isFrozen(adapter)) {
    throw new TypeError('Adapter registration must reference an immutable adapter');
  }
  if (Object.getPrototypeOf(adapter) !== Object.prototype) {
    throw new TypeError('Adapter registration must reference an immutable adapter');
  }
  const ownKeys = Reflect.ownKeys(adapter);
  if (
    ownKeys.length !== ADAPTER_METHODS.length
    || ownKeys.some((key) => typeof key !== 'string' || !ADAPTER_METHODS.includes(key))
  ) {
    throw new TypeError('Adapter registration must expose exactly five methods');
  }
  for (const method of ADAPTER_METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(adapter, method);
    if (
      !descriptor
      || !descriptor.enumerable
      || !Object.hasOwn(descriptor, 'value')
      || typeof descriptor.value !== 'function'
    ) {
      throw new TypeError('Adapter registration must expose exactly five methods');
    }
  }
}

/**
 * Construct the complete immutable production roster. Registration is closed
 * to the two shipped canonical ids and their reviewed order.
 */
export function createAdapterRegistry(
  registrations: readonly AdapterRegistration[],
): AgentProviderRegistry {
  const adapters = new Map<AgentProviderId, AgentProviderAdapter>();
  const observedIds: AgentProviderId[] = [];

  for (const value of denseRegistrationValues(registrations)) {
    const registration = parseRegistration(value);
    const id = parseRegistrationId(registration.id);
    if (adapters.has(id)) {
      throw new AdapterRegistryError('duplicate_adapter', 'Duplicate adapter registration');
    }
    validateAdapter(registration.adapter);
    adapters.set(id, registration.adapter);
    observedIds.push(id);
  }

  for (const id of CANONICAL_IDS) {
    if (!adapters.has(id)) {
      throw new AdapterRegistryError('missing_adapter', 'Required adapter is missing');
    }
  }
  if (observedIds.some((id, index) => id !== CANONICAL_IDS[index])) {
    throw new AdapterRegistryError('invalid_adapter_id', 'Adapter registrations are out of order');
  }
  if (observedIds.length !== CANONICAL_IDS.length) {
    throw new AdapterRegistryError('missing_adapter', 'Required adapter is missing');
  }

  return Object.freeze({
    require(id: string): AgentProviderAdapter {
      const canonicalId = parseLookupId(id);
      const adapter = adapters.get(canonicalId);
      if (!adapter) {
        throw new AdapterRegistryError('missing_adapter', 'Required adapter is missing');
      }
      return adapter;
    },
    ids(): readonly AgentProviderId[] {
      return CANONICAL_IDS;
    },
  });
}

export function createProductionAdapterRegistry(
  dependencies: ProductionAdapterRegistryDependencies,
): AgentProviderRegistry {
  return createAdapterRegistry([
    {
      id: CLAUDE_CODE_ADAPTER_ID,
      adapter: createClaudeCodeAdapter(dependencies),
    },
    {
      id: OPENCODE_ADAPTER_ID,
      adapter: createOpenCodeAdapter({
        detect: dependencies.openCodeDetect,
        resolveProfileRuntime: dependencies.resolveOpenCodeProfileRuntime,
        parseEvents: dependencies.openCodeParseEvents,
        kill: dependencies.kill,
      }),
    },
  ]);
}
