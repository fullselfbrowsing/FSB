import {
  ToolError,
  clearAuthCache,
  getAuthCache,
  getLocalStorage,
  parseRetryAfterMs,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Types ---

interface BlueskySession {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
  pdsUrl: string;
  active: boolean;
}

interface BlueskyStorageData {
  session?: {
    currentAccount?: BlueskySession;
  };
}

type QueryValue = string | number | boolean | undefined | string[];

interface XrpcOptions {
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, QueryValue>;
  extraHeaders?: Record<string, string>;
}

const AUTH_CACHE_KEY = 'bluesky';

// --- Auth detection ---
// Bluesky stores session data in localStorage under `BSKY_STORAGE`.
// The session contains a JWT access token and the user's PDS URL, which
// is the base for all XRPC API calls. The PDS URL is cross-origin from
// bsky.app, so we use raw fetch with the Authorization header instead
// of credentials: 'include'.

const getSession = (): BlueskySession | null => {
  const cached = getAuthCache<BlueskySession>(AUTH_CACHE_KEY);
  if (cached?.accessJwt && cached.pdsUrl && cached.did) return cached;

  const raw = getLocalStorage('BSKY_STORAGE');
  if (!raw) return null;

  let data: BlueskyStorageData;
  try {
    data = JSON.parse(raw) as BlueskyStorageData;
  } catch {
    return null;
  }

  const account = data.session?.currentAccount;
  if (!account?.accessJwt || !account.pdsUrl || !account.did || !account.active) return null;

  setAuthCache(AUTH_CACHE_KEY, account);
  return account;
};

export const isAuthenticated = (): boolean => getSession() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

/** Returns the user's DID or throws an auth error. */
export const getDid = (): string => {
  const session = getSession();
  if (!session) throw ToolError.auth('Not authenticated — please log in to Bluesky.');
  return session.did;
};

// --- Error handling ---
// Uses raw fetch (not fetchFromPage) because the PDS is cross-origin from
// bsky.app and we need custom error classification — the AT Protocol returns
// auth errors as 400 with {"error":"ExpiredToken"}, which httpStatusToToolError
// would misclassify as a validation error.

const AUTH_ERRORS = new Set(['ExpiredToken', 'InvalidToken', 'AuthMissing']);

const handleFetchError = (err: unknown, nsid: string): never => {
  if (err instanceof ToolError) throw err;
  if (err instanceof DOMException && err.name === 'TimeoutError')
    throw ToolError.timeout(`API request timed out: ${nsid}`);
  if (err instanceof DOMException && err.name === 'AbortError') throw new ToolError('Request was aborted', 'aborted');
  throw new ToolError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'network_error', {
    category: 'internal',
    retryable: true,
  });
};

const handleResponseError = async (response: Response, nsid: string): Promise<never> => {
  const errorBody = (await response.text().catch(() => '')).substring(0, 512);

  // AT Protocol returns auth errors (expired/invalid tokens) as 400
  // with {"error":"ExpiredToken"} — detect these before generic status handling
  if (response.status === 400) {
    try {
      const parsed = JSON.parse(errorBody) as { error?: string };
      if (parsed.error && AUTH_ERRORS.has(parsed.error)) {
        clearAuthCache(AUTH_CACHE_KEY);
        throw ToolError.auth(`Token expired — please refresh the Bluesky page: ${errorBody}`);
      }
    } catch (e) {
      if (e instanceof ToolError) throw e;
    }
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const retryMs = retryAfter !== null ? parseRetryAfterMs(retryAfter) : undefined;
    throw ToolError.rateLimited(`Rate limited: ${nsid} — ${errorBody}`, retryMs);
  }
  if (response.status === 401 || response.status === 403) {
    clearAuthCache(AUTH_CACHE_KEY);
    throw ToolError.auth(`Auth error (${response.status}): ${errorBody}`);
  }
  if (response.status === 404) throw ToolError.notFound(`Not found: ${nsid} — ${errorBody}`);
  if (response.status === 400 || response.status === 422)
    throw ToolError.validation(`Validation error: ${nsid} — ${errorBody}`);
  throw ToolError.internal(`API error (${response.status}): ${nsid} — ${errorBody}`);
};

// --- Shared XRPC caller ---

const xrpc = async <T>(nsid: string, options: XrpcOptions = {}): Promise<T> => {
  const session = getSession();
  if (!session) throw ToolError.auth('Not authenticated — please log in to Bluesky.');

  const base = session.pdsUrl.endsWith('/') ? session.pdsUrl : `${session.pdsUrl}/`;
  let qs = '';
  if (options.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, item);
      } else {
        params.append(key, String(value));
      }
    }
    qs = params.toString();
  }
  const url = qs ? `${base}xrpc/${nsid}?${qs}` : `${base}xrpc/${nsid}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessJwt}`,
    Accept: 'application/json',
    ...options.extraHeaders,
  };

  let fetchBody: string | undefined;
  if (options.body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: fetchBody,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    return handleFetchError(err, nsid);
  }

  if (!response.ok) return handleResponseError(response, nsid);

  if (response.status === 204) return {} as T;
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
};

// --- Public API callers ---

interface ApiOptions {
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, QueryValue>;
}

/** Calls an AT Protocol XRPC endpoint on the user's PDS. */
export const api = <T>(nsid: string, options: ApiOptions = {}): Promise<T> => xrpc<T>(nsid, options);

/** Calls a chat XRPC endpoint with the `atproto-proxy` header for chat operations. */
export const chatApi = <T>(nsid: string, options: ApiOptions = {}): Promise<T> =>
  xrpc<T>(nsid, { ...options, extraHeaders: { 'atproto-proxy': 'did:web:api.bsky.chat#bsky_chat' } });
