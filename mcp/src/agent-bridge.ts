import type { WebSocketBridge } from './bridge.js';
import type { AgentScope } from './agent-scope.js';
import type { MCPMessageType, MCPResponse } from './types.js';
import { randomUUID } from 'node:crypto';

type AgentScopedSendOptions = {
  timeout?: number;
  onProgress?: (p: MCPResponse) => void;
  targetTabId?: number | null;
  includeOwnershipToken?: boolean;
  retryOnAgentNotRegistered?: boolean;
  onAgentId?: (agentId: string) => void;
};

function isAgentNotRegistered(result: Record<string, unknown> | null | undefined): boolean {
  return result?.code === 'AGENT_NOT_REGISTERED'
    || result?.errorCode === 'AGENT_NOT_REGISTERED';
}

export function targetTabIdFromParams(params: Record<string, unknown>): number | null {
  if (typeof params.tab_id === 'number' && Number.isFinite(params.tab_id)) return params.tab_id;
  if (typeof params.tabId === 'number' && Number.isFinite(params.tabId)) return params.tabId;
  return null;
}

function currentOwnershipToken(agentScope: AgentScope, targetTabId: number | null): string | null {
  const specific = (typeof agentScope.ownershipTokenFor === 'function')
    ? agentScope.ownershipTokenFor(targetTabId)
    : null;
  if (specific) return specific;
  return (typeof agentScope.currentOwnershipToken === 'function')
    ? agentScope.currentOwnershipToken()
    : null;
}

function currentConnectionId(agentScope: AgentScope): string | null {
  return (typeof agentScope.currentConnectionId === 'function')
    ? agentScope.currentConnectionId()
    : null;
}

function captureOwnershipToken(agentScope: AgentScope, result: Record<string, unknown> | null | undefined): void {
  if (!result || typeof result.ownershipToken !== 'string') return;
  if (typeof agentScope.captureOwnershipToken !== 'function') return;
  agentScope.captureOwnershipToken(
    typeof result.tabId === 'number' ? result.tabId : null,
    result.ownershipToken,
  );
}

function supportsRecordingCallLifecycle(agentScope: AgentScope): boolean {
  return typeof agentScope.beginRecordingCall === 'function'
    && typeof agentScope.completeRecordingCall === 'function';
}

const RECORDING_LEASE_DEFAULT_MS = 30_000;
const RECORDING_LEASE_MIN_MS = 1_000;
const RECORDING_LEASE_MAX_MS = 15 * 60_000;
const RECORDING_LEASE_SETTLE_GRACE_MS = 5_000;

function recordingLeaseMs(timeout: number | undefined): number {
  const requested = typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0
    ? timeout
    : RECORDING_LEASE_DEFAULT_MS;
  return Math.max(
    RECORDING_LEASE_MIN_MS,
    Math.min(RECORDING_LEASE_MAX_MS, Math.ceil(requested) + RECORDING_LEASE_SETTLE_GRACE_MS),
  );
}

async function buildAgentPayload(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  basePayload: Record<string, unknown>,
  options: AgentScopedSendOptions,
  recordingCallId: string,
): Promise<Record<string, unknown>> {
  const agentId = await agentScope.ensure(bridge);
  options.onAgentId?.(agentId);

  const payload: Record<string, unknown> = {
    ...basePayload,
    agentId,
    recordingCallId,
    recordingLeaseMs: recordingLeaseMs(options.timeout),
  };
  if (options.includeOwnershipToken !== false) {
    const ownershipToken = currentOwnershipToken(agentScope, options.targetTabId ?? null);
    if (ownershipToken) payload.ownershipToken = ownershipToken;
  }

  const connectionId = currentConnectionId(agentScope);
  if (connectionId) payload.connectionId = connectionId;

  // Compatibility: pre-journal embedders omit correlation, while the first
  // journal implementation exposes only ensureRecordingRun(). Newer scopes
  // track physical attempts so long-running calls do not look idle.
  if (supportsRecordingCallLifecycle(agentScope)) {
    payload.recordingRunId = agentScope.beginRecordingCall();
  } else if (typeof agentScope.ensureRecordingRun === 'function') {
    payload.recordingRunId = agentScope.ensureRecordingRun();
  }
  return payload;
}

async function sendBridgeAttempt(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  type: MCPMessageType,
  payload: Record<string, unknown>,
  sendOptions: Pick<AgentScopedSendOptions, 'timeout' | 'onProgress'>,
): Promise<Record<string, unknown>> {
  try {
    return await bridge.sendAndWait({ type, payload }, sendOptions);
  } finally {
    const runId = payload.recordingRunId;
    if (typeof runId === 'string' && supportsRecordingCallLifecycle(agentScope)) {
      agentScope.completeRecordingCall(runId);
    }
  }
}

function isConfirmedTerminalLifecycle(
  type: MCPMessageType,
  basePayload: Record<string, unknown>,
  result: Record<string, unknown> | null | undefined,
): boolean {
  if (type !== 'mcp:task-status' || !result) return false;
  const tool = basePayload.tool;
  if (tool === 'complete_task') return result.status === 'completed';
  if (tool === 'partial_task') return result.status === 'partial';
  if (tool === 'fail_task') return result.status === 'failed';
  return false;
}

export async function sendAgentScopedBridgeMessage(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  type: MCPMessageType,
  basePayload: Record<string, unknown>,
  options: AgentScopedSendOptions = {},
): Promise<Record<string, unknown>> {
  const sendOptions = {
    timeout: options.timeout,
    onProgress: options.onProgress,
  };
  let recordingCallId = randomUUID();

  let payload = await buildAgentPayload(bridge, agentScope, basePayload, options, recordingCallId);
  let result = await sendBridgeAttempt(bridge, agentScope, type, payload, sendOptions);

  if (options.retryOnAgentNotRegistered !== false && isAgentNotRegistered(result)) {
    agentScope.reset();
    recordingCallId = randomUUID();
    payload = await buildAgentPayload(bridge, agentScope, basePayload, options, recordingCallId);
    result = await sendBridgeAttempt(bridge, agentScope, type, payload, sendOptions);
  }

  captureOwnershipToken(agentScope, result);
  if (isConfirmedTerminalLifecycle(type, basePayload, result)) {
    if (typeof agentScope.rotateRecordingRun === 'function') agentScope.rotateRecordingRun();
  }
  return result;
}
