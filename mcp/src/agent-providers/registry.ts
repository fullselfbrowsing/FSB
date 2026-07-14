import {
  CLAUDE_CODE_ADAPTER_ID,
  type AgentProviderAdapter,
  type AgentProviderId,
} from './adapter.js';

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

const CANONICAL_IDS = Object.freeze([CLAUDE_CODE_ADAPTER_ID] as const);

function parseRegistrationId(id: string): AgentProviderId {
  if (id.length === 0 || id !== id.toLowerCase()) {
    throw new AdapterRegistryError('invalid_adapter_id', 'Adapter id must be canonical');
  }
  if (id !== CLAUDE_CODE_ADAPTER_ID) {
    throw new AdapterRegistryError('unknown_adapter_id', 'Unknown adapter id');
  }
  return id;
}

function parseLookupId(id: string): AgentProviderId {
  return parseRegistrationId(id);
}

/**
 * Construct a complete, immutable registry. Phase 60 deliberately has one
 * canonical slot; callers inject its concrete implementation at composition.
 */
export function createAdapterRegistry(
  registrations: readonly AdapterRegistration[],
): AgentProviderRegistry {
  const adapters = new Map<AgentProviderId, AgentProviderAdapter>();

  for (const registration of registrations) {
    const id = parseRegistrationId(registration.id);
    if (adapters.has(id)) {
      throw new AdapterRegistryError('duplicate_adapter', 'Duplicate adapter registration');
    }
    adapters.set(id, registration.adapter);
  }

  if (!adapters.has(CLAUDE_CODE_ADAPTER_ID)) {
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
