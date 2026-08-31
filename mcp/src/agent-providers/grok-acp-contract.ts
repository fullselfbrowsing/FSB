import type { AdapterAuthState } from './adapter.js';
import { GROK_BUILD_PROFILE_VERSION } from './grok-runtime.js';

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
  | 'mcp_server_status';

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

function validAuthMethod(
  value: unknown,
  id: typeof GROK_BUILD_CACHED_AUTH_METHOD_ID | typeof GROK_BUILD_BROWSER_AUTH_METHOD_ID,
  name: string,
): boolean {
  return isGrokBuildRecord(value)
    && hasOnlyGrokBuildKeys(value, ['id', 'name', 'description'])
    && value.id === id
    && value.name === name
    && boundedDescription(value.description);
}

export function parseGrokBuildInitializeResult(
  value: unknown,
): GrokBuildAcpNegotiation | null {
  if (!isGrokBuildRecord(value) || value.protocolVersion !== 1) return null;
  const capabilities = value.agentCapabilities;
  if (
    !isGrokBuildRecord(capabilities)
    || !isGrokBuildRecord(capabilities.mcpCapabilities)
    || capabilities.mcpCapabilities.http !== true
    || !isGrokBuildRecord(capabilities.sessionCapabilities)
    || !isEmptyGrokBuildRecord(capabilities.sessionCapabilities.close)
  ) return null;

  const meta = value._meta;
  if (
    !isGrokBuildRecord(meta)
    || meta.agentVersion !== GROK_BUILD_PROFILE_VERSION
    || !isEmptyArray(meta.mcpServers)
    || !Array.isArray(value.authMethods)
  ) return null;

  const methods = value.authMethods;
  const browserMethodValid = validAuthMethod(
    methods.at(-1),
    GROK_BUILD_BROWSER_AUTH_METHOD_ID,
    'Grok',
  );
  if (!browserMethodValid) return null;

  if (methods.length === 1 && meta.defaultAuthMethodId === null) {
    return Object.freeze({
      authState: 'unauthenticated',
      authenticationMethodId: null,
    });
  }
  if (
    methods.length === 2
    && validAuthMethod(
      methods[0],
      GROK_BUILD_CACHED_AUTH_METHOD_ID,
      GROK_BUILD_CACHED_AUTH_METHOD_ID,
    )
    && meta.defaultAuthMethodId === GROK_BUILD_CACHED_AUTH_METHOD_ID
  ) {
    return Object.freeze({
      authState: 'oauth',
      authenticationMethodId: GROK_BUILD_CACHED_AUTH_METHOD_ID,
    });
  }
  return null;
}

export function parseGrokBuildInitializeResponse(
  value: unknown,
): GrokBuildAcpNegotiation | null {
  if (
    !isGrokBuildRecord(value)
    || !hasOnlyGrokBuildKeys(value, ['jsonrpc', 'id', 'result'])
    || value.jsonrpc !== GROK_BUILD_JSON_RPC_VERSION
    || value.id !== 1
  ) return null;
  return parseGrokBuildInitializeResult(value.result);
}

export function validateGrokBuildAuthenticationResult(value: unknown): boolean {
  if (
    !isGrokBuildRecord(value)
    || !hasOnlyGrokBuildKeys(value, ['_meta'])
    || !isGrokBuildRecord(value._meta)
  ) return false;
  const meta = value._meta;
  if (!hasOnlyGrokBuildKeys(meta, [
    'email',
    'auth_mode',
    'team_id',
    'team_name',
    'is_zdr',
    'team_role',
    'coding_data_retention_opt_out',
    'show_resolved_model',
    'gate',
    'subscription_tier',
  ])) return false;
  const nullableText = (item: unknown): boolean => (
    item === null || (typeof item === 'string' && item.length <= 512)
  );
  return nullableText(meta.email)
    && meta.auth_mode === 'Oidc'
    && nullableText(meta.team_id)
    && nullableText(meta.team_name)
    && typeof meta.is_zdr === 'boolean'
    && nullableText(meta.team_role)
    && typeof meta.coding_data_retention_opt_out === 'boolean'
    && (meta.show_resolved_model === null || typeof meta.show_resolved_model === 'boolean')
    && (meta.gate === null || isGrokBuildRecord(meta.gate))
    && nullableText(meta.subscription_tier);
}

export function validateGrokBuildAuthenticationResponse(value: unknown): boolean {
  return isGrokBuildRecord(value)
    && hasOnlyGrokBuildKeys(value, ['jsonrpc', 'id', 'result'])
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
    || !hasOnlyGrokBuildKeys(value, ['jsonrpc', 'method', 'params'])
    || value.jsonrpc !== GROK_BUILD_JSON_RPC_VERSION
    || typeof value.method !== 'string'
    || !isGrokBuildRecord(value.params)
  ) return null;
  if (value.method === '_x.ai/mcp/servers_updated') {
    return Object.freeze({ kind: 'mcp_servers', params: value.params });
  }
  if (value.method === '_x.ai/mcp/server_status') {
    return Object.freeze({ kind: 'mcp_server_status', params: value.params });
  }
  if (!Object.hasOwn(NON_AUTHORITY_NOTIFICATION_KINDS, value.method)) return null;
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
    || !hasOnlyGrokBuildKeys(notification.params, ['mcpServers'])
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
  if (
    !hasOnlyGrokBuildKeys(params, ['sessionId', 'name', 'source', 'status', 'reason', 'tools'])
    && !hasOnlyGrokBuildKeys(
      params,
      ['sessionId', 'name', 'source', 'status', 'reason', 'detail', 'tools'],
    )
  ) return null;
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
): GrokBuildAcpNegotiation | null {
  const expectedResponseIds = requireAuthentication ? [1, 2] : [1];
  let responseIndex = 0;
  let negotiation: GrokBuildAcpNegotiation | null = null;
  for (const message of messages) {
    if (isGrokBuildRecord(message) && Object.hasOwn(message, 'id')) {
      const expectedId = expectedResponseIds[responseIndex];
      if (expectedId === undefined || message.id !== expectedId) return null;
      if (expectedId === 1) {
        negotiation = parseGrokBuildInitializeResponse(message);
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
