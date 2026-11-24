import { request as requestHttp } from 'node:http';
import {
  NATIVE_HOST_HEALTH_MAX_BYTES,
  NATIVE_HOST_HEALTH_PRODUCT,
  NATIVE_HOST_HEALTH_TIMEOUT_MS,
  NATIVE_HOST_PROTOCOL_VERSION,
} from './native-host/constants.js';

/**
 * What the long-lived local service (`fsb-mcp-server serve`, normally started
 * by the browser through the native host) says about itself on its loopback
 * /health endpoint. Only the fields the bridge acts on are kept.
 */
export interface DaemonHealth {
  /** True once the service has finished starting and accepts work. */
  readonly serveReady: boolean;
  /** Instance id of the service's own extension bridge, when it reports one. */
  readonly bridgeInstanceId: string | null;
  /** Whether the service's bridge is currently the hub or a relay. */
  readonly bridgeMode: string | null;
  /** The hub the service's bridge is attached to, when it is a relay. */
  readonly activeHubInstanceId: string | null;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype,
  );
}

function boundedString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
}

/**
 * Reads http://127.0.0.1:<port>/health and accepts it only when it is the FSB
 * service speaking the same health contract the native host wake checks: the
 * FSB product name, the native-host protocol version and a boolean serveReady.
 * Anything else -- nothing listening, a timeout, an oversized or malformed
 * body, some other program on the port -- resolves to null. Never throws.
 */
export function probeDaemonHealth(
  port: number,
  timeoutMs: number = NATIVE_HOST_HEALTH_TIMEOUT_MS,
): Promise<DaemonHealth | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: DaemonHealth | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      finish(null);
      return;
    }

    let outgoing;
    try {
      outgoing = requestHttp({
        host: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET',
        headers: { accept: 'application/json' },
      }, (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (chunk: Buffer) => {
          if (settled) return;
          total += chunk.length;
          if (total > NATIVE_HOST_HEALTH_MAX_BYTES) {
            finish(null);
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.once('end', () => {
          if (response.statusCode !== 200) {
            finish(null);
            return;
          }
          finish(parseDaemonHealth(Buffer.concat(chunks, total)));
        });
        response.once('error', () => finish(null));
        response.once('aborted', () => finish(null));
      });
    } catch {
      finish(null);
      return;
    }
    outgoing.setTimeout(timeoutMs, () => {
      outgoing.destroy(new Error('daemon_health_timeout'));
    });
    outgoing.once('error', () => finish(null));
    outgoing.end();
  });
}

function parseDaemonHealth(body: Buffer): DaemonHealth | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch {
    return null;
  }
  if (
    !plainObject(value)
    || value.ok !== true
    || value.service !== NATIVE_HOST_HEALTH_PRODUCT
    || value.nativeHostProtocol !== NATIVE_HOST_PROTOCOL_VERSION
    || typeof value.serveReady !== 'boolean'
  ) {
    return null;
  }
  const topology = plainObject(value.bridgeTopology) ? value.bridgeTopology : null;
  return Object.freeze({
    serveReady: value.serveReady,
    bridgeInstanceId: boundedString(topology?.instanceId),
    bridgeMode: boundedString(value.bridgeMode),
    activeHubInstanceId: boundedString(value.activeHubInstanceId),
  });
}
