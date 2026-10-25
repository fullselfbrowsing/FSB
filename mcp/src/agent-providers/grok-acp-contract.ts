import type { AdapterAuthState } from './adapter.js';

export const GROK_BUILD_JSON_RPC_VERSION = '2.0' as const;
export const GROK_BUILD_CACHED_AUTH_METHOD_ID = 'cached_token' as const;
export const GROK_BUILD_BROWSER_AUTH_METHOD_ID = 'grok.com' as const;

export type GrokBuildJsonRecord = Record<string, unknown>;

export interface GrokBuildAcpNegotiation {
  readonly authState: Extract<AdapterAuthState, 'oauth' | 'unauthenticated'>;
  readonly authenticationMethodId: typeof GROK_BUILD_CACHED_AUTH_METHOD_ID | null;
}

export type GrokBuildExtensionNotificationKind =
  | 'settings'
  | 'announcements'
  | 'models'
  | 'sessions'
  | 'queue'
  | 'lifecycle'
  | 'mcp_progress'
  | 'mcp_servers'
  | 'mcp_server_status'
  | 'informational';

export interface GrokBuildExtensionNotification {
  readonly kind: GrokBuildExtensionNotificationKind;
  readonly params: GrokBuildJsonRecord;
}

export const GROK_BUILD_INITIALIZE_REQUEST = Object.freeze({
  jsonrpc: GROK_BUILD_JSON_RPC_VERSION,
  id: 1,
  method: 'initialize',
  params: Object.freeze({
    protocolVersion: 1,
    clientCapabilities: Object.freeze({
      fs: Object.freeze({ readTextFile: false, writeTextFile: false }),
      terminal: false,
    }),
  }),
});

export function buildGrokBuildAuthenticateRequest(): Readonly<{
  jsonrpc: typeof GROK_BUILD_JSON_RPC_VERSION;
  id: 2;
  method: 'authenticate';
  params: Readonly<{ methodId: typeof GROK_BUILD_CACHED_AUTH_METHOD_ID }>;
}> {
  return Object.freeze({
    jsonrpc: GROK_BUILD_JSON_RPC_VERSION,
    id: 2,
    method: 'authenticate',
    params: Object.freeze({ methodId: GROK_BUILD_CACHED_AUTH_METHOD_ID }),
  });
}

export function isGrokBuildRecord(value: unknown): value is GrokBuildJsonRecord {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function hasOnlyGrokBuildKeys(
  value: GrokBuildJsonRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => allowed.has(key));
}

export function isEmptyGrokBuildRecord(value: unknown): value is GrokBuildJsonRecord {
  return isGrokBuildRecord(value) && Object.keys(value).length === 0;
}

function isEmptyArray(value: unknown): value is readonly never[] {
  return Array.isArray(value) && value.length === 0;
}

function boundedDescription(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(value);
}

const CLI_VERSION_PATTERN = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;
const MAX_METADATA_NODES = 16_384;

/** ACP metadata is extensible, but every accepted addition remains bounded JSON. */
function boundedJson(value: unknown, depth = 0, budget = { nodes: 0 }): boolean {
  budget.nodes += 1;
  if (depth > 32 || budget.nodes > MAX_METADATA_NODES) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 256 * 1024;
  if (Array.isArray(value)) {
    return value.length <= MAX_METADATA_NODES
      && value.every((entry) => boundedJson(entry, depth + 1, budget));
  }
  return isGrokBuildRecord(value)
    && Object.keys(value).length <= MAX_METADATA_NODES
    && Object.values(value).every((entry) => boundedJson(entry, depth + 1, budget));
}

export function isBoundedGrokBuildRecord(value: unknown): value is GrokBuildJsonRecord {
  return isGrokBuildRecord(value) && boundedJson(value);
}

function authMethodId(value: unknown): string | null {
  return isGrokBuildRecord(value)
    && boundedDescription(value.id)
    && boundedJson(value)
    ? value.id
    : null;
}

export function parseGrokBuildInitializeResult(
  value: unknown,
  expectedVersion?: string,
): GrokBuildAcpNegotiation | null {
  if (!isGrokBuildRecord(value) || !boundedJson(value) || value.protocolVersion !== 1) return null;
  const capabilities = value.agentCapabilities;
  if (
    !isGrokBuildRecord(capabilities)
    || !isGrokBuildRecord(capabilities.mcpCapabilities)
    || capabilities.mcpCapabilities.http !== true
    || !isGrokBuildRecord(capabilities.sessionCapabilities)
    || !isGrokBuildRecord(capabilities.sessionCapabilities.close)
  ) return null;

  const meta = value._meta;
  if (
    !isGrokBuildRecord(meta)
    || typeof meta.agentVersion !== 'string'
    || !CLI_VERSION_PATTERN.test(meta.agentVersion)
    || (expectedVersion !== undefined && meta.agentVersion !== expectedVersion)
    || !isEmptyArray(meta.mcpServers)
    || !Array.isArray(value.authMethods)
    || value.authMethods.length === 0
    || value.authMethods.length > 32
  ) return null;

  const methodIds = value.authMethods.map(authMethodId);
  if (methodIds.some((id) => id === null) || new Set(methodIds).size !== methodIds.length) return null;
  // Other advertised methods carry no authority: FSB only selects cached OAuth.
  if (
    meta.defaultAuthMethodId === GROK_BUILD_CACHED_AUTH_METHOD_ID
    && methodIds.includes(GROK_BUILD_CACHED_AUTH_METHOD_ID)
  ) {
    return Object.freeze({
      authState: 'oauth',
      authenticationMethodId: GROK_BUILD_CACHED_AUTH_METHOD_ID,
    });
  }
  if (
    meta.defaultAuthMethodId === null
    && (methodIds.includes(GROK_BUILD_BROWSER_AUTH_METHOD_ID) || methodIds.includes('oidc'))
  ) {
    return Object.freeze({
      authState: 'unauthenticated',
      authenticationMethodId: null,
    });
  }
  return null;
}

export function parseGrokBuildInitializeResponse(
  value: unknown,
  expectedVersion?: string,
): GrokBuildAcpNegotiation | null {
  if (
    !isGrokBuildRecord(value)
    || !['jsonrpc', 'id', 'result'].every((key) => Object.hasOwn(value, key))
    || Object.hasOwn(value, 'method')
    || Object.hasOwn(value, 'error')
    || !boundedJson(value)
    || value.jsonrpc !== GROK_BUILD_JSON_RPC_VERSION
    || value.id !== 1
  ) return null;
  return parseGrokBuildInitializeResult(value.result, expectedVersion);
}

export function validateGrokBuildAuthenticationResult(value: unknown): boolean {
  if (
    !isGrokBuildRecord(value)
    || !boundedJson(value)
    || !isGrokBuildRecord(value._meta)
  ) return false;
  // Account and subscription display metadata does not grant authority. Only
  // the explicit OAuth mode establishes the credential kind FSB may accept.
  return value._meta.auth_mode === 'Oidc';
}

export function validateGrokBuildAuthenticationResponse(value: unknown): boolean {
  return isGrokBuildRecord(value)
    && ['jsonrpc', 'id', 'result'].every((key) => Object.hasOwn(value, key))
    && !Object.hasOwn(value, 'method')
    && !Object.hasOwn(value, 'error')
    && boundedJson(value)
    && value.jsonrpc === GROK_BUILD_JSON_RPC_VERSION
    && value.id === 2
    && validateGrokBuildAuthenticationResult(value.result);
}

const NON_AUTHORITY_NOTIFICATION_KINDS = Object.freeze({
  '_x.ai/settings/update': 'settings',
  '_x.ai/announcements/update': 'announcements',
  '_x.ai/models/update': 'models',
  '_x.ai/sessions/changed': 'sessions',
  '_x.ai/queue/changed': 'queue',
  '_x.ai/session_notification': 'lifecycle',
  '_x.ai/session/prompt_complete': 'lifecycle',
  '_x.ai/mcp/init_progress': 'mcp_progress',
  '_x.ai/mcp_initialized': 'mcp_progress',
} as const);

export function parseGrokBuildExtensionNotification(
  value: unknown,
): GrokBuildExtensionNotification | null {
  if (
    !isGrokBuildRecord(value)
    || !['jsonrpc', 'method', 'params'].every((key) => Object.hasOwn(value, key))
    || Object.hasOwn(value, 'id')
    || value.jsonrpc !== GROK_BUILD_JSON_RPC_VERSION
    || typeof value.method !== 'string'
    || !isGrokBuildRecord(value.params)
    || !boundedJson(value.params)
  ) return null;
  if (value.method === '_x.ai/mcp/servers_updated') {
    return Object.freeze({ kind: 'mcp_servers', params: value.params });
  }
  if (value.method === '_x.ai/mcp/server_status') {
    return Object.freeze({ kind: 'mcp_server_status', params: value.params });
  }
  if (!Object.hasOwn(NON_AUTHORITY_NOTIFICATION_KINDS, value.method)) {
    // These namespaces only report UI/catalog state. Unknown MCP, hook,
    // permission and tool notifications remain incompatible rather than ignored.
    if (/^_x\.ai\/(?:settings|announcements|models|sessions|queue)\/[a-z_]+$/.test(value.method)) {
      return Object.freeze({ kind: 'informational', params: value.params });
    }
    return null;
  }
  return Object.freeze({
    kind: NON_AUTHORITY_NOTIFICATION_KINDS[
      value.method as keyof typeof NON_AUTHORITY_NOTIFICATION_KINDS
    ],
    params: value.params,
  });
}

export function grokBuildMcpServersFromNotification(
  notification: GrokBuildExtensionNotification,
): readonly unknown[] | null {
  if (
    notification.kind !== 'mcp_servers'
    || !Object.hasOwn(notification.params, 'mcpServers')
    || !Array.isArray(notification.params.mcpServers)
  ) return null;
  return notification.params.mcpServers;
}

/**
 * Grok reports MCP readiness per server through `_x.ai/mcp/server_status`, not
 * through a populated `servers_updated` list -- that one only ever arrives
 * empty, before `session/new`. The payload names the server and its outcome and
 * carries no transport or URL, so the endpoint is verified by the fact that
 * this is the server FSB asked for on the session it owns.
 */
export function grokBuildMcpServerStatusFromNotification(
  notification: GrokBuildExtensionNotification,
): Readonly<{ sessionId: unknown; name: unknown; source: unknown; status: unknown }> | null {
  if (notification.kind !== 'mcp_server_status') return null;
  const params = notification.params;
  if (!['sessionId', 'name', 'source', 'status'].every((key) => Object.hasOwn(params, key))) return null;
  return Object.freeze({
    sessionId: params.sessionId,
    name: params.name,
    source: params.source,
    status: params.status,
  });
}

export function parseGrokBuildProbeTranscript(
  messages: readonly unknown[],
  requireAuthentication: boolean,
  expectedVersion?: string,
): GrokBuildAcpNegotiation | null {
  const expectedResponseIds = requireAuthentication ? [1, 2] : [1];
  let responseIndex = 0;
  let negotiation: GrokBuildAcpNegotiation | null = null;
  for (const message of messages) {
    if (isGrokBuildRecord(message) && Object.hasOwn(message, 'id')) {
      const expectedId = expectedResponseIds[responseIndex];
      if (expectedId === undefined || message.id !== expectedId) return null;
      if (expectedId === 1) {
        negotiation = parseGrokBuildInitializeResponse(message, expectedVersion);
        if (!negotiation) return null;
      } else if (!validateGrokBuildAuthenticationResponse(message)) {
        return null;
      }
      responseIndex += 1;
      continue;
    }

    const notification = parseGrokBuildExtensionNotification(message);
    if (!notification) return null;
    if (notification.kind === 'mcp_servers') {
      const servers = grokBuildMcpServersFromNotification(notification);
      if (!servers || servers.length !== 0) return null;
    }
  }
  if (responseIndex !== expectedResponseIds.length || !negotiation) return null;
  if (requireAuthentication && negotiation.authState !== 'oauth') return null;
  return negotiation;
}
