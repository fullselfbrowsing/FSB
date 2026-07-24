import type { AdapterDetection, AgentProviderId } from './adapter.js';
import {
  CLAUDE_CODE_ADAPTER_ID,
  CODEX_ADAPTER_ID,
  OPENCODE_ADAPTER_ID,
} from './adapter.js';

export const ACCEPTED_AGENT_IDENTITY_KEYS = Object.freeze([
  'providerId',
  'label',
  'profileVersion',
  'authState',
  'billingKind',
] as const);

export const ACCEPTED_AGENT_AUTH_STATES = Object.freeze([
  'chatgpt',
  'api_key',
  'unauthenticated',
  'unknown',
] as const);

export const ACCEPTED_AGENT_BILLING_KINDS = Object.freeze([
  'subscription',
  'api',
  'unknown',
] as const);

export type AcceptedAgentAuthState = typeof ACCEPTED_AGENT_AUTH_STATES[number];
export type AcceptedAgentBillingKind = typeof ACCEPTED_AGENT_BILLING_KINDS[number];

export interface AcceptedAgentIdentity {
  readonly providerId: AgentProviderId;
  readonly label: string;
  readonly profileVersion: string;
  readonly authState: AcceptedAgentAuthState;
  readonly billingKind: AcceptedAgentBillingKind;
}

interface AcceptedIdentityProviderDefinition {
  readonly label: string;
  readonly authToBilling: Readonly<Partial<
    Record<AcceptedAgentAuthState, AcceptedAgentBillingKind>
  >>;
}

const MAX_PROFILE_VERSION_CHARS = 128;

const PROVIDER_DEFINITIONS: Readonly<
  Record<AgentProviderId, AcceptedIdentityProviderDefinition>
> = Object.freeze({
  [CLAUDE_CODE_ADAPTER_ID]: Object.freeze({
    label: 'Claude Code',
    authToBilling: Object.freeze({ unknown: 'subscription' }),
  }),
  [OPENCODE_ADAPTER_ID]: Object.freeze({
    label: 'OpenCode',
    authToBilling: Object.freeze({ unknown: 'unknown' }),
  }),
  [CODEX_ADAPTER_ID]: Object.freeze({
    label: 'Codex',
    authToBilling: Object.freeze({
      chatgpt: 'subscription',
      api_key: 'api',
      unauthenticated: 'unknown',
      unknown: 'unknown',
    }),
  }),
});

function exactOwnDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length
      || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) return null;
    const record: Record<string, unknown> = {};
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
      ) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function ownEnumerableDataValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor
      && descriptor.enumerable === true
      && Object.hasOwn(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function providerDefinition(value: unknown): Readonly<{
  providerId: AgentProviderId;
  definition: AcceptedIdentityProviderDefinition;
}> | null {
  if (
    typeof value !== 'string'
    || !Object.hasOwn(PROVIDER_DEFINITIONS, value)
  ) return null;
  const providerId = value as AgentProviderId;
  return Object.freeze({ providerId, definition: PROVIDER_DEFINITIONS[providerId] });
}

function billingFor(
  definition: AcceptedIdentityProviderDefinition,
  authState: unknown,
): AcceptedAgentBillingKind | null {
  if (
    typeof authState !== 'string'
    || !(ACCEPTED_AGENT_AUTH_STATES as readonly string[]).includes(authState)
    || !Object.hasOwn(definition.authToBilling, authState)
  ) return null;
  return definition.authToBilling[authState as AcceptedAgentAuthState] ?? null;
}

export function validateAcceptedAgentIdentity(value: unknown): AcceptedAgentIdentity | null {
  const record = exactOwnDataRecord(value, ACCEPTED_AGENT_IDENTITY_KEYS);
  if (
    !record
    || typeof record.profileVersion !== 'string'
    || record.profileVersion.length === 0
    || Array.from(record.profileVersion).length > MAX_PROFILE_VERSION_CHARS
    || typeof record.authState !== 'string'
    || !(ACCEPTED_AGENT_AUTH_STATES as readonly string[]).includes(record.authState)
    || typeof record.billingKind !== 'string'
    || !(ACCEPTED_AGENT_BILLING_KINDS as readonly string[]).includes(record.billingKind)
  ) return null;
  const provider = providerDefinition(record.providerId);
  if (!provider || record.label !== provider.definition.label) return null;
  const billingKind = billingFor(provider.definition, record.authState);
  if (!billingKind || record.billingKind !== billingKind) return null;
  return Object.freeze({
    providerId: provider.providerId,
    label: provider.definition.label,
    profileVersion: record.profileVersion,
    authState: record.authState as AcceptedAgentAuthState,
    billingKind,
  });
}

export function acceptedAgentIdentitiesEqual(left: unknown, right: unknown): boolean {
  const acceptedLeft = validateAcceptedAgentIdentity(left);
  const acceptedRight = validateAcceptedAgentIdentity(right);
  return acceptedLeft !== null
    && acceptedRight !== null
    && ACCEPTED_AGENT_IDENTITY_KEYS.every((key) => acceptedLeft[key] === acceptedRight[key]);
}

export function acceptedIdentityFromDetection(
  adapterId: AgentProviderId,
  detection: Pick<AdapterDetection, 'authState' | 'profileVersion'>,
): AcceptedAgentIdentity {
  const provider = providerDefinition(adapterId);
  const authState = ownEnumerableDataValue(detection, 'authState');
  const profileVersion = ownEnumerableDataValue(detection, 'profileVersion');
  const billingKind = provider ? billingFor(provider.definition, authState) : null;
  const accepted = provider && billingKind
    ? validateAcceptedAgentIdentity({
        providerId: provider.providerId,
        label: provider.definition.label,
        profileVersion,
        authState,
        billingKind,
      })
    : null;
  if (!accepted) throw new Error('adapter_unavailable');
  return accepted;
}
