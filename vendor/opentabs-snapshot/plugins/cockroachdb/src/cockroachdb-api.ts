import { ToolError, getPageGlobal, waitUntil } from '@opentabs-dev/plugin-sdk';

// CockroachDB Cloud uses gRPC-Web over HTTP/1.1 with protobuf encoding.
// The page exposes a `window.proto` global containing compiled protobuf
// message classes with serializeBinary() / deserializeBinary() methods.
// Auth uses HttpOnly session cookies sent via credentials: 'include'.

const SERVICE = 'console.ManagementConsole';

// --- Proto type access ---
// The proto library is loaded by the CockroachDB Cloud SPA at page init.
// Message classes are on window.proto.console.* and window.proto.common.*.

interface ProtoMessage {
  serializeBinary(): Uint8Array;
  toObject(): Record<string, unknown>;
}

interface ProtoMessageClass<T extends ProtoMessage = ProtoMessage> {
  new (): T;
  deserializeBinary(bytes: Uint8Array): T;
}

// Proto namespaces expose message classes by name. The Record type is intentionally
// broad — runtime presence is guaranteed by the SPA's protobuf bundle.
type ProtoClassMap = Record<string, (ProtoMessageClass & Record<string, unknown>) | undefined>;

interface ProtoNamespace {
  console: ProtoClassMap;
  common: ProtoClassMap;
}

const getProto = (): ProtoNamespace => {
  const proto = getPageGlobal('proto') as ProtoNamespace | undefined;
  if (proto) return proto;
  throw ToolError.internal('Protobuf library not available — page may not be fully loaded.');
};

// --- Auth detection ---
// Auth state is inferred from the presence of initData (a base64-encoded protobuf
// containing feature flags and session info injected by the server into the HTML).
// The actual authentication uses HttpOnly session cookies.

export const isAuthenticated = (): boolean => {
  const initData = getPageGlobal('initData');
  return typeof initData === 'string' && initData.length > 0;
};

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

// --- gRPC-Web transport ---
// gRPC-Web frames: [flag:1byte, length:4bytes big-endian, payload:N bytes]
// flag=0 → data frame, flag=128 → trailer frame (contains grpc-status)

const encodeGrpcFrame = (payload: Uint8Array): ArrayBuffer => {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = 0;
  const view = new DataView(frame.buffer);
  view.setUint32(1, payload.length);
  frame.set(payload, 5);
  return frame.buffer;
};

interface GrpcFrame {
  flag: number;
  data: Uint8Array;
}

const decodeGrpcFrames = (buffer: ArrayBuffer): GrpcFrame[] => {
  const bytes = new Uint8Array(buffer);
  const frames: GrpcFrame[] = [];
  let offset = 0;
  while (offset + 5 <= bytes.length) {
    const flag = bytes[offset] as number;
    const view = new DataView(buffer, offset + 1, 4);
    const len = view.getUint32(0);
    const data = bytes.slice(offset + 5, offset + 5 + len);
    frames.push({ flag, data });
    offset += 5 + len;
  }
  return frames;
};

const parseGrpcTrailer = (data: Uint8Array): { status: number; message: string } => {
  const text = new TextDecoder().decode(data);
  let status = 0;
  let message = '';
  for (const line of text.split('\r\n')) {
    const statusMatch = line.match(/^grpc-status:\s*(\d+)/);
    if (statusMatch?.[1]) status = Number.parseInt(statusMatch[1], 10);
    const messageMatch = line.match(/^grpc-message:\s*(.*)/);
    if (messageMatch?.[1]) message = decodeURIComponent(messageMatch[1]);
  }
  return { status, message };
};

// gRPC status codes to ToolError mapping
const grpcStatusToError = (status: number, message: string, method: string): ToolError => {
  switch (status) {
    case 3:
      return ToolError.validation(`Invalid argument: ${method} — ${message}`);
    case 5:
      return ToolError.notFound(`Not found: ${method} — ${message}`);
    case 7:
      return ToolError.auth(`Permission denied: ${method} — ${message}`);
    case 8:
      return ToolError.rateLimited(`Resource exhausted: ${method} — ${message}`);
    case 16:
      return ToolError.auth(`Unauthenticated: ${method} — ${message}`);
    default:
      return ToolError.internal(`gRPC error (${status}): ${method} — ${message}`);
  }
};

// --- Public API ---

// Call a gRPC-Web method with a protobuf request, returning the decoded response object.
// For methods that take no parameters, omit the setup callback.
// The responseClass parameter accepts undefined to match Record indexing — throws if missing.
export const grpc = async <T extends Record<string, unknown>>(
  method: string,
  responseClass: ProtoMessageClass | undefined,
  setup?: (proto: ProtoNamespace) => ProtoMessage,
): Promise<T> => {
  if (!responseClass) throw ToolError.internal(`Missing proto class for ${method} — page may not be fully loaded.`);
  if (!isAuthenticated()) throw ToolError.auth('Not authenticated — please log in to CockroachDB Cloud.');

  const proto = getProto();
  let body: ArrayBuffer;

  if (setup) {
    const req = setup(proto);
    body = encodeGrpcFrame(req.serializeBinary());
  } else {
    body = encodeGrpcFrame(new Uint8Array(0));
  }

  let response: Response;
  try {
    response = await fetch(`https://cockroachlabs.cloud/${SERVICE}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/grpc-web+proto',
        Accept: 'application/grpc-web+proto',
        'X-Grpc-Web': '1',
      },
      body,
      credentials: 'include',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') throw ToolError.timeout(`Timed out: ${method}`);
    throw new ToolError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'network_error', {
      category: 'internal',
      retryable: true,
    });
  }

  const buffer = await response.arrayBuffer();
  const frames = decodeGrpcFrames(buffer);

  // Check trailer for errors
  const trailerFrame = frames.find(f => f.flag === 128);
  if (trailerFrame) {
    const trailer = parseGrpcTrailer(trailerFrame.data);
    if (trailer.status !== 0) throw grpcStatusToError(trailer.status, trailer.message, method);
  }

  // Decode data frame
  const dataFrame = frames.find(f => f.flag === 0);
  if (!dataFrame || dataFrame.data.length === 0) return {} as T;

  return responseClass.deserializeBinary(dataFrame.data).toObject() as T;
};

// Convenience: get the proto.console namespace for building requests
export const getConsoleProto = (): ProtoNamespace['console'] => getProto().console;
export const getCommonProto = (): ProtoNamespace['common'] => getProto().common;

// Create a new protobuf request message by class name.
// Searches console namespace first, then common namespace.
// Throws if the class is not found (page not fully loaded or wrong class name).
export const newRequest = (className: string): ProtoMessage => {
  const proto = getProto();
  const cls = proto.console[className] ?? proto.common[className];
  if (!cls) throw ToolError.internal(`Proto class ${className} not found — page may not be fully loaded.`);
  return new cls();
};

// Get a response class by name, searching console then common then top-level proto.
export const getResponseClass = (className: string): ProtoMessageClass => {
  const proto = getProto();
  const cls = proto.console[className] ?? proto.common[className];
  if (cls) return cls;
  // Some classes like Empty are on the top-level proto namespace
  const topLevel = getPageGlobal(`proto.${className}`) as ProtoMessageClass | undefined;
  if (topLevel) return topLevel;
  throw ToolError.internal(`Proto response class ${className} not found — page may not be fully loaded.`);
};

// Call a setter on a protobuf message. Protobuf messages have dynamically-generated
// setter methods (setClusterId, setName, etc.) that cannot be typed statically.
export const setField = (msg: ProtoMessage, setter: string, value: unknown): void => {
  const fn = (msg as unknown as Record<string, unknown>)[setter];
  if (typeof fn === 'function') fn.call(msg, value);
};
