import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage, targetTabIdFromParams } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';
import { screenshotStore, type ManagedScreenshotAttestor } from '../screenshot-store.js';
import {
  TOOL_REGISTRY,
  jsonSchemaToZod,
  PARAM_TRANSFORMS,
  type ToolDefinition,
} from './schema-bridge.js';
import { isAllowedMcpVisualClientLabel, getAllowedMcpVisualClientLabels, normalizeMcpVisualClientLabel } from './visual-session.js';
import { MCP_CHANGE_REPORT_SENTENCE, MCP_EXPECT_DESCRIPTION, mcpToolDescription, mcpParamDescriptions } from './descriptions.js';

type ToolCallResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

// Phase 245 D-04 / D-05: tools with _emitChangeReport return a `change_report` diff.
// Phase 69 D-09: the MCP suffix is one sentence from ./descriptions.ts.
const CHANGE_REPORT_DESCRIPTION_SUFFIX = ` ${MCP_CHANGE_REPORT_SENTENCE}`;

const TRIGGER_MANUAL_EXCLUSIONS = new Set(['trigger']); function isManualTool(t: ToolDefinition): boolean { return !t._readOnly && !TRIGGER_MANUAL_EXCLUSIONS.has(t.name); }

// ---------------------------------------------------------------------------
// Phase 69 D-11..D-16: the optional same-call `expect` check.
//
// MCP-only: added as an extra zod key at registration for the 29 D-12 tools
// (28 registry action tools here, plus `back` in ./agents.ts), never in the
// registry inputSchema. Values mirror extension/utils/action-verification.js
// (plan 69-03); plan 69-07's parity test compares the two sides.
// ---------------------------------------------------------------------------

// D-12: the fixed set of tools that accept `expect`, in this exact order.
export const EXPECT_TOOL_NAMES: readonly string[] = Object.freeze([
  'execute_js', 'click', 'right_click', 'double_click', 'click_at', 'double_click_at', 'click_and_hold',
  'type_text', 'insert_text', 'press_enter', 'press_key', 'clear_input',
  'select_option', 'check_box', 'set_attribute',
  'drag_drop', 'drag', 'drag_variable_speed', 'drop_file', 'upload_file',
  'select_text_range', 'scroll_to_top', 'scroll_to_bottom', 'scroll_to_element',
  'navigate', 'go_back', 'go_forward', 'refresh', 'back',
]);
export const EXPECT_TOOL_SET: ReadonlySet<string> = new Set(EXPECT_TOOL_NAMES);

// D-20 bounds, uncalibrated pending V4.
export const EXPECT_DEFAULT_TIMEOUT_MS = 2_000;
export const EXPECT_MAX_TIMEOUT_MS = 5_000;
export const EXPECT_STRING_MAX = 2_000;
// Bridge headroom added to `back`'s timeout when expect is sent. Uncalibrated
// (V4); it must exceed the extension's 750 ms probe race.
export const EXPECT_BRIDGE_HEADROOM_MS = 1_500;

// D-19 result vocabulary used by the version-skew fill.
const EXPECT_OBSERVED_MAX = 120;
const EXPECT_REDACTED = '[redacted]';
const EXPECT_STRING_KEYS = ['url_includes', 'title_includes', 'text_visible', 'text_gone', 'selector', 'value'] as const;
const EXPECT_PREDICATE_KEYS = ['url_includes', 'title_includes', 'text_visible', 'text_gone', 'selector', 'dialog_open'] as const;

/**
 * D-20: clamp a caller timeout to [0, EXPECT_MAX_TIMEOUT_MS]. Absent or
 * non-finite values give the default; numeric strings are accepted; values
 * are truncated toward zero. Same table as the extension.
 */
export function clampExpectTimeoutMs(raw: unknown): number {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    n = Number(raw);
  } else {
    return EXPECT_DEFAULT_TIMEOUT_MS;
  }
  if (!Number.isFinite(n)) return EXPECT_DEFAULT_TIMEOUT_MS;
  n = Math.trunc(n) || 0;
  if (n < 0) return 0;
  if (n > EXPECT_MAX_TIMEOUT_MS) return EXPECT_MAX_TIMEOUT_MS;
  return n;
}

/**
 * D-14 / RESEARCH Finding 11: `null` means omitted; a string whose trimmed
 * text starts with `{` is parsed (hosts stringify object arguments). An
 * unparseable string is returned unchanged so validation rejects it.
 */
export function parseExpectArg(v: unknown): unknown {
  if (v === null) return undefined;
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try {
      return JSON.parse(v.trim());
    } catch {
      return v;
    }
  }
  return v;
}

// D-13: one flat, closed object. No .min()/.max() and no sub-property
// descriptions (they would publish bytes, RESEARCH Finding 12); the length,
// non-empty, non-blank, at-least-one-predicate and selector rules live in one
// superRefine, which the SDK does not publish. `value` may be '' (the natural
// check after clear_input), mirroring the extension's normalizeExpectSpec.
//
// timeout_ms: null means omitted (as D-14 treats a null expect), so the
// default applies. Only numbers and non-blank strings reach Number(); any
// other type (boolean, array, object, a blank string) becomes NaN and is
// rejected instead of being coerced to 0 or 1. Same rule as the extension.
function preprocessExpectTimeout(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return v;
  return NaN;
}

const expectObject = z.object({
  url_includes: z.string().optional(),
  title_includes: z.string().optional(),
  text_visible: z.string().optional(),
  text_gone: z.string().optional(),
  selector: z.string().optional(),
  state: z.enum(['visible', 'gone', 'checked', 'unchecked']).optional(),
  value: z.string().optional(),
  dialog_open: z.boolean().optional(),
  timeout_ms: z.preprocess(
    preprocessExpectTimeout,
    z.coerce.number().int().finite().optional(),
  ).optional(),
}).strict().superRefine((spec, ctx) => {
  const record = spec as Record<string, unknown>;
  for (const key of EXPECT_STRING_KEYS) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    if (value.length === 0 && key !== 'value') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} must not be empty` });
    } else if (key !== 'value' && value.trim().length === 0) {
      // Text matching collapses whitespace, so a blank predicate would match
      // every page (or none): reject it like ''. value keeps '' and blanks.
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} must not be blank` });
    }
    if (value.length > EXPECT_STRING_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} must be at most ${EXPECT_STRING_MAX} characters` });
    }
  }
  if (!EXPECT_PREDICATE_KEYS.some((key) => record[key] !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'expect needs at least one check besides timeout_ms' });
  }
  if ((record.state !== undefined || record.value !== undefined) && record.selector === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'state and value require selector' });
  }
});

export type ExpectSpec = z.infer<typeof expectObject>;

export const EXPECT_SHAPE = {
  expect: z.preprocess(parseExpectArg, expectObject.optional()).optional().describe(MCP_EXPECT_DESCRIPTION),
};

function capExpected(value: unknown): unknown {
  if (typeof value !== 'string' || value.length <= EXPECT_OBSERVED_MAX) return value;
  return `${value.slice(0, EXPECT_OBSERVED_MAX - 3)}...`;
}

/**
 * RESEARCH Finding 10 / Open Question 1: the expect_result an older extension
 * could not produce. Every check is uncertain with observed null, in the
 * extension's fixed order (url_includes, title_includes, text_visible,
 * text_gone, state, value, dialog_open); a value check's expected is always
 * the redaction marker, since nothing observed the field.
 */
export function buildUnsupportedExpectResult(expect: unknown): Record<string, unknown> {
  const spec = (expect && typeof expect === 'object' ? expect : {}) as Record<string, unknown>;
  const has = (key: string): boolean => spec[key] !== undefined;
  const checks: Array<{ kind: string; expected: unknown }> = [];
  if (has('url_includes')) checks.push({ kind: 'url_includes', expected: spec.url_includes });
  if (has('title_includes')) checks.push({ kind: 'title_includes', expected: spec.title_includes });
  if (has('text_visible')) checks.push({ kind: 'text_visible', expected: spec.text_visible });
  if (has('text_gone')) checks.push({ kind: 'text_gone', expected: spec.text_gone });
  if (has('selector')) {
    if (has('state') || !has('value')) checks.push({ kind: 'state', expected: has('state') ? spec.state : 'visible' });
    if (has('value')) checks.push({ kind: 'value', expected: EXPECT_REDACTED });
  }
  if (has('dialog_open')) checks.push({ kind: 'dialog_open', expected: spec.dialog_open });
  return {
    status: 'uncertain',
    checks: checks.map((check) => ({
      kind: check.kind,
      expected: capExpected(check.expected),
      observed: null,
      status: 'uncertain',
    })),
    waited_ms: 0,
    timeout_ms: clampExpectTimeoutMs(spec.timeout_ms),
    reason: 'extension_unsupported',
  };
}

/**
 * Version-skew fill: when expect was sent and the extension returned a
 * success or unknown-outcome result without expect_result, add an uncertain /
 * extension_unsupported expect_result (last key, on a shallow copy) so a
 * caller never mistakes "not checked" for "not requested". Otherwise the same
 * result reference is returned, so every no-expect response is unchanged.
 */
export function withUnsupportedExpectFill<T>(result: T, expect: unknown): T {
  if (expect === undefined || expect === null) return result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const record = result as unknown as Record<string, unknown>;
  if (record.success !== true && record.mayHaveExecuted !== true) return result;
  if (record.expect_result !== undefined && record.expect_result !== null) return result;
  const { expect_result: _missing, ...rest } = record;
  return { ...rest, expect_result: buildUnsupportedExpectResult(expect) } as unknown as T;
}

/**
 * Phase 255 Plan 03: visual-session field-bundle validator.
 *
 * Runs at the dispatch chokepoint for every action tool (registered by
 * registerManualTools below). Read-only tools bypass this validator
 * entirely because they are registered through registerReadOnlyTools
 * (mcp/src/tools/read-only.ts), which does not import this function.
 *
 * Validation steps (matches .planning/phases/255-schema-enforcement-on-
 * action-tools/255-CONTEXT.md Validator location section, steps 3-4):
 *   1. visual_reason MUST be a non-empty string. Empty / missing -> reject
 *      with VISUAL_FIELDS_REQUIRED.
 *   2. client MUST be a non-empty string. Empty / missing -> reject with
 *      VISUAL_FIELDS_REQUIRED.
 *   3. client MUST pass isAllowedMcpVisualClientLabel(). Failed -> reject
 *      with BADGE_NOT_ALLOWED.
 *
 * On success returns null (caller proceeds to execAction). On rejection
 * returns the ToolCallResult the MCP SDK should serialize back to the
 * caller; the underlying FSB action does NOT run.
 *
 * Source-of-truth for field names and error codes: .planning/v0.9.62-
 * CONTRACT.md (Field Bundle + Typed Errors sections).
 */
function validateVisualSessionFields(
  toolName: string,
  params: Record<string, unknown>,
): ToolCallResult | null {
  const visualReason = params.visual_reason;
  const client = params.client;

  const visualReasonOk = typeof visualReason === 'string' && visualReason.trim().length > 0;
  const clientOk = typeof client === 'string' && client.trim().length > 0;

  if (!visualReasonOk || !clientOk) {
    return mapFSBError({
      success: false,
      errorCode: 'VISUAL_FIELDS_REQUIRED',
      tool: toolName,
    });
  }

  if (!isAllowedMcpVisualClientLabel(client)) {
    return mapFSBError({
      success: false,
      errorCode: 'BADGE_NOT_ALLOWED',
      tool: toolName,
      clientLabel: client,
      allowedClients: getAllowedMcpVisualClientLabels(),
    });
  }

  return null;
}

/**
 * Phase 255 Plan 03: strip the visual-session field bundle from caller
 * params before forwarding to the FSB extension. The extension protocol
 * does not yet consume these fields (lifecycle code lands in Phase 256);
 * leaving them in the payload would noise up the bridge wire.
 */
function stripVisualSessionFields(params: Record<string, unknown>): Record<string, unknown> {
  const {
    visual_reason: _vr,
    client: _cl,
    is_final: _if,
    managedScreenshotAttested: _managedScreenshotAttested,
    ...rest
  } = params;
  return rest;
}

/**
 * Phase 256 Plan 02: visual-session SIDECAR builder.
 *
 * After validateVisualSessionFields passes, this helper extracts the
 * validated field bundle from the ORIGINAL caller params (before the
 * Phase 255 strip helper runs) and returns it as a sibling sidecar
 * object that the bridge payload carries alongside the agentId /
 * ownershipToken / connectionId top-level fields (see
 * mcp/src/agent-bridge.ts buildAgentPayload).
 *
 * Source-of-truth for the field names is .planning/v0.9.62-CONTRACT.md
 * lines 70-86 (Field Bundle section): the schema-side keys remain
 * snake_case (visual_reason / client / is_final), and this helper
 * converts them to the wire-side camelCase (visualReason / client /
 * isFinal) so the sidecar matches the existing agent-bridge.ts wire
 * conventions (agentId, ownershipToken, connectionId).
 *
 * Preconditions (enforced by validateVisualSessionFields, which MUST
 * have returned null before this helper runs):
 *   - params.visual_reason is a non-empty trimmed string.
 *   - params.client normalises to an allowlisted label.
 *
 * The client value is RE-NORMALISED here via
 * normalizeMcpVisualClientLabel so the sidecar carries the CANONICAL
 * casing (not whatever casing the caller sent); this is a tampering
 * mitigation per the Phase 256 Plan 02 threat register (T-256-02-01)
 * and protects the extension-side lifecycle code (Phase 256 Plan 03)
 * from caller-supplied label drift.
 */
type VisualSessionSidecar = {
  visualReason: string;
  client: string;
  isFinal: boolean;
};

type ManualToolOptions = {
  screenshotAttestor?: ManagedScreenshotAttestor;
};

function buildVisualSessionSidecar(params: Record<string, unknown>): VisualSessionSidecar {
  const reasonRaw = params.visual_reason;
  const clientRaw = params.client;
  const isFinalRaw = params.is_final;
  const visualReason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
  const clientNormalised = normalizeMcpVisualClientLabel(clientRaw);
  // After the validator passes, clientNormalised MUST be a non-null
  // string. The `?? ''` is belt-and-suspenders against a future
  // refactor that drops the validator gate by accident.
  const client = clientNormalised ?? '';
  const isFinal = isFinalRaw === true;
  return { visualReason, client, isFinal };
}

/**
 * Execute a single browser action through the FSB extension.
 * All manual tools funnel through this helper which checks connectivity,
 * enqueues via TaskQueue (mutation serialization), and maps the result.
 */
async function execAction(
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
  toolName: string,
  fsbVerb: string,
  params: Record<string, unknown>,
  visualSession: VisualSessionSidecar | null,
  screenshotAttestor: ManagedScreenshotAttestor,
  expect?: unknown,
): Promise<ToolCallResult> {
  if (!bridge.isConnected) {
    console.error(`[FSB Manual] ${toolName}: bridge not connected`);
    return mapFSBError({ success: false, error: 'extension_not_connected' });
  }
  console.error(`[FSB Manual] ${toolName}: sending verb=${fsbVerb} params=${JSON.stringify(params).slice(0, 150)}`);
  // fill_sheet types cell-by-cell into Google Sheets and can take minutes for large datasets.
  // Leave room for delivery, the content script's 120s execution budget, and the reply.
  const LONG_TIMEOUT_TOOLS = new Set(['fill_sheet', 'read_sheet']);
  const timeout = LONG_TIMEOUT_TOOLS.has(toolName) ? 150_000 : 30_000;

  return queue.enqueue(toolName, async () => {
    try {
      let outboundParams = params;
      let managedScreenshotAttested = false;
      if (toolName === 'upload_file' && typeof params.file_path === 'string') {
        let canonicalPath: string | null = null;
        try {
          canonicalPath = await screenshotAttestor.attestManagedPath(params.file_path);
        } catch (_error) {
          // The extension's default /.fsb/ deny rule remains authoritative.
        }
        if (canonicalPath) {
          outboundParams = { ...params, file_path: canonicalPath };
          managedScreenshotAttested = true;
        }
      }

      // Phase 256 Plan 02: when the visual-session sidecar is present, attach
      // it as a TOP-LEVEL field on the bridge payload base object (not inside
      // `params`). sendAgentScopedBridgeMessage merges agentId, ownershipToken,
      // and connectionId at the same top level; `visualSession` becomes a
      // sibling of those existing fields and is what the extension-side
      // lifecycle code (Phase 256 Plan 03) reads after the v0.9.60 ownership
      // gate fires. The action params shipped under `params` stay scrubbed
      // (Phase 255 strip preserved verbatim).
      const basePayload: Record<string, unknown> = { tool: fsbVerb, params: outboundParams };
      if (visualSession) {
        basePayload.visualSession = visualSession;
      }
      if (managedScreenshotAttested) {
        basePayload.managedScreenshotAttested = true;
      }
      // Phase 69 D-15: `expect` is a top-level sidecar like visualSession,
      // set only when the caller sent it, so the no-expect payload is
      // byte-identical to the pre-69 wire. It never enters `params`.
      if (expect !== undefined) basePayload.expect = expect;
      const result = await sendAgentScopedBridgeMessage(
        bridge,
        agentScope,
        'mcp:execute-action',
        basePayload,
        { timeout, targetTabId: targetTabIdFromParams(params) },
      );
      if (!result?.success) {
        console.error(`[FSB Manual] ${toolName}: FAILED - ${result?.error || 'unknown error'}`);
      }
      return mapFSBError(withUnsupportedExpectFill(result, expect));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[FSB Manual] ${toolName}: EXCEPTION - ${errMsg}`);
      return mapFSBError({ success: false, error: errMsg });
    }
  });
}

/**
 * Register all manual (non-read-only) browser action tools from the shared
 * TOOL_REGISTRY. Each tool's JSON Schema inputSchema is converted to Zod
 * on the fly via jsonSchemaToZod(), and parameter transforms are applied
 * for tools where MCP param names differ from FSB internal names.
 */
export function registerManualTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
  options?: ManualToolOptions,
): void {
  const screenshotAttestor = options?.screenshotAttestor ?? screenshotStore;
  // Filter to non-read-only tools from canonical registry
  const manualTools = TOOL_REGISTRY.filter(isManualTool);

  for (const tool of manualTools) {
    // Phase 69 D-07: MCP-only short text from ./descriptions.ts; the registry
    // text stays the autopilot source and is only the fallback here.
    // Phase 69 D-11/D-12: the optional `expect` key joins the shape only for
    // the D-12 tools; it never enters the registry inputSchema.
    const zodShape = {
      ...jsonSchemaToZod(tool.inputSchema, mcpParamDescriptions(tool.name)),
      ...(EXPECT_TOOL_SET.has(tool.name) ? EXPECT_SHAPE : {}),
    };
    const fsbVerb = tool._contentVerb || tool._cdpVerb || tool.name;
    const transform = PARAM_TRANSFORMS[tool.name];

    // Phase 245 D-04 / D-05: append change_report contract to descriptions of
    // action tools whose _emitChangeReport flag is true (per D-05 INCLUDE list,
    // minus D-06 opt-outs scroll/scroll_at/hover/focus).
    const baseDescription = mcpToolDescription(tool.name, tool.description);
    const description = (tool._emitChangeReport === true)
      ? `${baseDescription}${CHANGE_REPORT_DESCRIPTION_SUFFIX}`
      : baseDescription;

    server.tool(
      tool.name,
      description,
      zodShape,
      async (params: Record<string, unknown>) => {
        // Phase 69 D-15: lift `expect` out first, so the validator, the
        // strip and PARAM_TRANSFORMS (which rebuild params from scratch)
        // run on exactly the params they saw before Phase 69. zod already
        // rejected a malformed expect (D-16); null arrives as undefined.
        const { expect, ...callerParams } = params;

        // Phase 255 Plan 03: visual-session field-bundle gate runs
        // BEFORE the param transform + execAction. Rejections do not
        // proceed to queue.enqueue or sendAgentScopedBridgeMessage, so
        // no DOM mutation, no change_report, no overlay change.
        const rejection = validateVisualSessionFields(tool.name, callerParams);
        if (rejection) return rejection;

        // Phase 256 Plan 02: capture the validated field bundle as a
        // SIDECAR from the ORIGINAL caller params, BEFORE the Phase 255
        // strip helper runs. The sidecar travels as a top-level field
        // on the bridge payload (sibling of agentId / ownershipToken /
        // connectionId in agent-bridge.ts buildAgentPayload), so the
        // extension-side lifecycle code (Phase 256 Plan 03) can record
        // a tick after the v0.9.60 ownership gate fires.
        const visualSession = buildVisualSessionSidecar(callerParams);

        const cleanedParams = stripVisualSessionFields(callerParams);
        const finalParams = transform ? transform(cleanedParams) : cleanedParams;
        return execAction(
          bridge,
          queue,
          agentScope,
          tool.name,
          fsbVerb,
          finalParams,
          visualSession,
          screenshotAttestor,
          expect,
        );
      },
    );
  }
}
