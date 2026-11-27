import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { FSB_ERROR_MESSAGES, mapFSBError } from '../errors.js';

const SETTINGS_TIMEOUT_MS = 10_000;
const SETTINGS_KEY_MAX = 64;
const SETTINGS_VALUE_MAX = 2048;
// The default arm of an extension that predates the settings routes answers
// with exactly this sentence (mcp-bridge-client.js), resolved as success:false.
const UNSUPPORTED_SETTINGS_ERROR = /^Unknown MCP message type: mcp:(get-settings|set-setting)$/;

const SETTINGS_DESCRIPTION =
  'Read or change FSB settings. No args returns all; key returns one with its allowed values; key and value sets it. API keys and endpoints are read-only.';

const REQUEST_INVALID_HINT =
  'Call settings with only a key to see its type and allowed values, or with no arguments to list every setting.';
const UNSUPPORTED_HINT = 'Update the FSB extension, or change the setting in the FSB Control Panel.';
const UNAVAILABLE_HINT = 'Check that the FSB extension is connected, then call settings again.';
const UNCONFIRMED_WRITE_HINT =
  'The change may have been applied. Call settings with only this key to check its current value before retrying.';
// A bridge or extension reason shown in an unavailable error only when it is
// a bare token such as mcp_authority_not_ready; free text never is.
const REASON_TOKEN = /^[a-z][a-z0-9_]{0,63}$/;

// Success bodies are built from these fields only (D-07), so nothing else the
// extension adds to its answer reaches the client.
const READ_ALL_FIELDS = ['settings', 'readOnly'] as const;
const READ_ONE_FIELDS = ['key', 'value', 'type', 'writable', 'range', 'values'] as const;
// `coupled` appears only when a write also set another key (a modelProvider
// change sets modelName): { modelName: { value, previous } }.
const WRITE_FIELDS = ['key', 'value', 'previous', 'changed', 'coupled'] as const;

type BridgeResult = Record<string, unknown> | null | undefined;
type SettingsToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
type LocalSettingCode = 'SETTING_REQUEST_INVALID' | 'SETTING_UNSUPPORTED' | 'SETTING_UNAVAILABLE';
// How a settings call failed outside the extension's settings routes:
// no_answer       the bridge threw before a write was sent (timeout, lost link)
// unconfirmed     the bridge threw after the write was sent: outcome unknown
// not_run         the extension answered without running the route
//                 (mcp_authority_not_ready, ...), so nothing was changed
type UnavailableKind = 'no_answer' | 'unconfirmed' | 'not_run';

// Hosts may send JSON booleans or numbers for `value`; they become strings
// before validation, so the wire schema stays a plain {type: string}. null,
// objects and arrays pass through unchanged and fail the string check.
function toWireString(v: unknown): unknown {
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return v;
}

function localFailure(code: LocalSettingCode, error: string, recoveryHint?: string): SettingsToolResult {
  return mapFSBError({
    success: false,
    code,
    errorCode: code,
    error,
    recoveryHint: recoveryHint ?? (code === 'SETTING_UNSUPPORTED' ? UNSUPPORTED_HINT : REQUEST_INVALID_HINT),
  });
}

// Rendered under Settings rather than the page-navigation fallback, which
// would tell the client to re-read the page. A timeout after the write was
// sent does not mean it failed: the extension may still finish the storage
// write, so the client is told to check before retrying.
function unavailable(kind: UnavailableKind, reason?: unknown): SettingsToolResult {
  const token = typeof reason === 'string' && REASON_TOKEN.test(reason) ? ` (${reason})` : '';
  if (kind === 'unconfirmed') {
    return localFailure('SETTING_UNAVAILABLE',
      `The FSB extension did not confirm the settings change${token}.`, UNCONFIRMED_WRITE_HINT);
  }
  if (kind === 'not_run') {
    return localFailure('SETTING_UNAVAILABLE',
      `The FSB extension could not run the settings request${token}. Nothing was changed.`, UNAVAILABLE_HINT);
  }
  return localFailure('SETTING_UNAVAILABLE',
    `The FSB extension did not answer the settings request${token}.`, UNAVAILABLE_HINT);
}

// A bridge error reduced to a token: the timeout and disconnect messages name
// only the message type and id, and the reason never carries the payload.
function bridgeFailureReason(message: string): string {
  if (/timed out/i.test(message)) return 'timeout';
  if (/disconnected|lost connection/i.test(message)) return 'disconnected';
  return '';
}

function unsupported(): SettingsToolResult {
  return localFailure(
    'SETTING_UNSUPPORTED',
    'This FSB extension does not support settings yet. Update the FSB extension.',
  );
}

function isUnsupported(result: BridgeResult): boolean {
  return !!result
    && result.success === false
    && typeof result.error === 'string'
    && UNSUPPORTED_SETTINGS_ERROR.test(result.error);
}

function isSuccess(result: BridgeResult): result is Record<string, unknown> {
  return !!result && result.success === true;
}

function resultCode(result: BridgeResult): string {
  if (!result) return '';
  if (typeof result.code === 'string') return result.code;
  return typeof result.errorCode === 'string' ? result.errorCode : '';
}

function compact(result: Record<string, unknown>, fields: readonly string[]): SettingsToolResult {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(result, field) && result[field] !== undefined) {
      body[field] = result[field];
    }
  }
  return { content: [{ type: 'text', text: JSON.stringify(body) }] };
}

// A coded failure (the SETTING_ family, or an agent-scope code) keeps its own
// rendering. A failure with no code never reached the settings route, so it
// is reported as SETTING_UNAVAILABLE instead of the page-navigation fallback.
function failure(result: BridgeResult): SettingsToolResult {
  if (resultCode(result) === '') return unavailable('not_run', result ? result.error : undefined);
  return mapFSBError(result ?? { success: false });
}

/**
 * Register the settings tool: read every FSB setting, read one with its
 * constraints, or write one by key (Phase 66.1, SET-01/SET-02).
 *
 * SECURITY: registered directly with server.tool(), never through
 * TOOL_REGISTRY, so the frozen EXPECTED_NON_TRIGGER_REGISTRY_HASH and the
 * autopilot tool list stay unchanged and only MCP clients get the tool (D-02,
 * SC5). Reads and writes skip the TaskQueue and go straight to the bridge
 * through sendAgentScopedBridgeMessage, like stop_task, so the extension
 * receives agentId for its client label, journal correlation and the
 * delegated-run write refusal (D-05, D-20). `key` is free-form: the extension's
 * schema decides what exists, so a new schema key needs no edit here (SC4).
 * The handler never logs its arguments. A write reads the key first and sends
 * the value only for a key the extension reports as writable, so an extension
 * without settings support never receives (or journals) a value.
 */
export function registerSettingsTool(
  server: McpServer,
  bridge: WebSocketBridge,
  // Unused on purpose: reads and writes bypass the TaskQueue (D-05). The
  // parameter only keeps the shape of the other register* calls; do not route
  // settings writes through the queue.
  _queue: TaskQueue,
  agentScope: AgentScope,
): void {
  const send = (type: 'mcp:get-settings' | 'mcp:set-setting', payload: Record<string, unknown>) =>
    sendAgentScopedBridgeMessage(bridge, agentScope, type, payload, {
      timeout: SETTINGS_TIMEOUT_MS,
      includeOwnershipToken: false,
    });

  server.tool(
    'settings',
    SETTINGS_DESCRIPTION,
    {
      key: z.string().optional().describe('Setting name'),
      value: z.preprocess(toWireString, z.string()).optional()
        .describe('New value (string; true/false and numbers accepted)'),
    },
    async ({ key, value }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      if (value !== undefined && key === undefined) {
        return localFailure('SETTING_REQUEST_INVALID', 'value needs a key. Call settings with key and value.');
      }
      if (key !== undefined && key.length > SETTINGS_KEY_MAX) {
        return localFailure('SETTING_REQUEST_INVALID', `key must be at most ${SETTINGS_KEY_MAX} characters.`);
      }
      if (value !== undefined && value.length > SETTINGS_VALUE_MAX) {
        return localFailure('SETTING_REQUEST_INVALID', `value must be at most ${SETTINGS_VALUE_MAX} characters.`);
      }

      let writeSent = false;
      try {
        if (value === undefined) {
          const read = await send('mcp:get-settings', key === undefined ? {} : { key });
          if (isUnsupported(read)) return unsupported();
          if (!isSuccess(read)) return failure(read);
          return compact(read, key === undefined ? READ_ALL_FIELDS : READ_ONE_FIELDS);
        }

        // Write: the value-safe preflight. key is defined here.
        const preflight = await send('mcp:get-settings', { key });
        if (isUnsupported(preflight)) return unsupported();
        let writePayload: Record<string, unknown>;
        if (isSuccess(preflight) && preflight.writable === true) {
          writePayload = { key, value };
        } else if (isSuccess(preflight) || resultCode(preflight) === 'SETTING_UNKNOWN_KEY') {
          // Unknown or read-only key: the extension refuses (and logs the
          // refusal) on the key alone, so the value never leaves this process.
          writePayload = { key };
        } else {
          return failure(preflight);
        }

        writeSent = writePayload.value !== undefined;
        const written = await send('mcp:set-setting', writePayload);
        if (isUnsupported(written)) return unsupported();
        if (!isSuccess(written)) return failure(written);
        return compact(written, WRITE_FIELDS);
      } catch (err) {
        // Bridge errors (not connected, timeout, lost link) name only the
        // message type and id, never the payload. Not connected means nothing
        // was sent; anything else after the write went out leaves its outcome
        // unknown.
        const message = err instanceof Error ? err.message : String(err);
        if (message === FSB_ERROR_MESSAGES['extension_not_connected']) {
          return mapFSBError({ success: false, error: 'extension_not_connected' });
        }
        return unavailable(writeSent ? 'unconfirmed' : 'no_answer', bridgeFailureReason(message));
      }
    },
  );
}
