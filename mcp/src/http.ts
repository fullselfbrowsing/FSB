import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRuntime } from './runtime.js';
import { AgentScope } from './agent-scope.js';
import { DELEGATION_ID_HEADER } from './agent-providers/runtime-files.js';
import type { WebSocketBridge } from './bridge.js';
import type { TaskQueue } from './queue.js';
import {
  NATIVE_HOST_HEALTH_PRODUCT,
  NATIVE_HOST_PROTOCOL_VERSION,
} from './native-host/constants.js';
import { FSB_MCP_VERSION } from './version.js';

const DELEGATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

type SessionContext = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

type HttpServerOptions = {
  host: string;
  port: number;
  bridge: WebSocketBridge;
  queue: TaskQueue;
};

type RunningHttpServer = {
  endpoint: string;
  healthEndpoint: string;
  markServeReady: () => void;
  close: () => Promise<void>;
};

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  if (!res.headersSent) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload, null, 2));
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) return undefined;

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  return JSON.parse(raw);
}

export async function startHttpServer(options: HttpServerOptions): Promise<RunningHttpServer> {
  if (!LOOPBACK_HOSTS.has(options.host)) {
    throw new Error('The FSB HTTP server only accepts a loopback --host (127.0.0.1, localhost, or ::1).');
  }
  const sessions = new Map<string, SessionContext>();
  let closed = false;
  let serveReady = false;

  const server = createHttpServer((req, res) => {
    void handleRequest(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, {
        jsonrpc: '2.0',
        error: { code: -32603, message: `Internal server error: ${message}` },
        id: null,
      });
    });
  });

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const address = server.address() as AddressInfo | null;
    const port = address?.port;
    const allowedHosts = new Set([
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      `[::1]:${port}`,
    ]);
    const rawHosts: string[] = [];
    let hasOrigin = false;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i]?.toLowerCase();
      if (name === 'host') rawHosts.push(req.rawHeaders[i + 1] ?? '');
      if (name === 'origin') hasOrigin = true;
    }
    if (rawHosts.length !== 1 || !allowedHosts.has(rawHosts[0].toLowerCase())
      || req.headers.host?.toLowerCase() !== rawHosts[0].toLowerCase() || hasOrigin) {
      sendJson(res, 403, { error: 'Forbidden Host or Origin' });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // Only the path is read; a fixed base keeps an IPv6 bind host from breaking URL parsing.
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: NATIVE_HOST_HEALTH_PRODUCT,
        version: FSB_MCP_VERSION,
        nativeHostProtocol: NATIVE_HOST_PROTOCOL_VERSION,
        serveReady,
        transport: 'streamable-http',
        bridgeMode: options.bridge.topology.mode,
        extensionConnected: options.bridge.topology.extensionConnected,
        extensionAttachment: options.bridge.topology.extensionAttachment,
        bridgeTopology: options.bridge.topology,
        hubConnected: options.bridge.topology.hubConnected,
        relayCount: options.bridge.topology.relayCount,
        activeHubInstanceId: options.bridge.topology.activeHubInstanceId,
        queuedMutationTools: options.queue.isRunning,
        sessions: sessions.size,
      });
      return;
    }

    if (url.pathname !== '/mcp') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    if (!req.method || !['GET', 'POST', 'DELETE'].includes(req.method)) {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
      res.end('Method Not Allowed');
      return;
    }

    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    const parsedBody = req.method === 'POST' ? await readJsonBody(req) : undefined;

    let context = sessionId ? sessions.get(sessionId) : undefined;

    if (!context) {
      if (req.method === 'POST' && !sessionId && isInitializeRequest(parsedBody)) {
        let transport!: StreamableHTTPServerTransport;
        const delegationIdHeader = req.headers[DELEGATION_ID_HEADER];
        const rawDelegationId = Array.isArray(delegationIdHeader)
          ? delegationIdHeader[0]
          : delegationIdHeader;
        const sessionAgentScope = typeof rawDelegationId === 'string'
          && DELEGATION_ID_PATTERN.test(rawDelegationId)
          ? new AgentScope({ environment: { FSB_DELEGATION_ID: rawDelegationId } })
          : undefined;
        const runtime = createRuntime({
          bridge: options.bridge,
          queue: options.queue,
          agentScope: sessionAgentScope,
        });

        transport = new StreamableHTTPServerTransport({
          enableJsonResponse: true,
          enableDnsRebindingProtection: true,
          allowedHosts: [...allowedHosts],
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            sessions.set(newSessionId, { server: runtime.server, transport });
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        await runtime.server.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
        return;
      }

      const statusCode = sessionId ? 404 : 400;
      sendJson(res, statusCode, {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: sessionId
            ? `Unknown MCP session: ${sessionId}`
            : 'Missing session. Send an initialize request first.',
        },
        id: null,
      });
      return;
    }

    await context.transport.handleRequest(req, res, parsedBody);
  };

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const endpointHost = options.host === '::1' ? '[::1]' : options.host;
  const endpoint = `http://${endpointHost}:${address.port}/mcp`;
  const healthEndpoint = `http://${endpointHost}:${address.port}/health`;

  return {
    endpoint,
    healthEndpoint,
    markServeReady: () => {
      if (!closed) serveReady = true;
    },
    close: async () => {
      closed = true;
      serveReady = false;
      for (const [, context] of sessions) {
        await context.transport.close().catch(() => {});
      }
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
