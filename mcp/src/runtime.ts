import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from './server.js';
import { WebSocketBridge } from './bridge.js';
import { TaskQueue } from './queue.js';
import { AgentScope } from './agent-scope.js';
import { detectMcpClientInventory } from './client-inventory.js';
import { registerAutopilotTools } from './tools/autopilot.js';
import { registerVisualSessionTools } from './tools/visual-session.js';
import { registerTriggerTools } from './tools/triggers.js';
import { registerManualTools } from './tools/manual.js';
import { registerReadOnlyTools } from './tools/read-only.js';
import { registerObservabilityTools } from './tools/observability.js';
import { registerAgentTools } from './tools/agents.js';
import { registerVaultTools } from './tools/vault.js';
import { registerCapabilityTools } from './tools/capabilities.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';

export type FSBRuntime = {
  server: McpServer;
  bridge: WebSocketBridge;
  queue: TaskQueue;
  agentScope: AgentScope;
};

type RuntimeOptions = {
  bridge?: WebSocketBridge;
  queue?: TaskQueue;
  agentScope?: AgentScope;
};

export function createRuntime(options: RuntimeOptions = {}): FSBRuntime {
  const bridge = options.bridge ?? new WebSocketBridge();
  const queue = options.queue ?? new TaskQueue();
  const agentScope = options.agentScope ?? new AgentScope();
  const server = createServer();

  if (typeof agentScope.setClientInfoSupplier === 'function') {
    agentScope.setClientInfoSupplier(() => server.server.getClientVersion?.() ?? null);
  }
  if (typeof agentScope.setClientInventorySupplier === 'function') {
    agentScope.setClientInventorySupplier(() => detectMcpClientInventory());
  }

  registerVisualSessionTools(server, bridge, queue, agentScope);
  registerTriggerTools(server, bridge, queue, agentScope);
  registerManualTools(server, bridge, queue, agentScope);
  registerReadOnlyTools(server, bridge, queue, agentScope);
  registerObservabilityTools(server, bridge, queue, agentScope);
  registerAgentTools(server, bridge, queue, agentScope);
  registerVaultTools(server, bridge, queue, agentScope);
  registerCapabilityTools(server, bridge, queue, agentScope);
  registerAutopilotTools(server, bridge, queue, agentScope);
  registerResources(server, bridge);
  registerPrompts(server);

  return { server, bridge, queue, agentScope };
}
