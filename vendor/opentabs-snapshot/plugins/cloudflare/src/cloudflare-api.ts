import {
  ToolError,
  clearAuthCache,
  getAuthCache,
  getPageGlobal,
  parseRetryAfterMs,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface CloudflareAuth {
  /** ATOK token from window.bootstrap.atok — required for API calls */
  atok: string;
  /** Account ID extracted from the current URL path */
  accountId: string | null;
}

/**
 * Cloudflare dashboard authentication:
 *
 * - The API proxy is at `/api/v4/` (same-origin on dash.cloudflare.com).
 *   Cross-origin requests to api.cloudflare.com are blocked by CORS.
 * - HttpOnly session cookies handle the actual authentication (sent
 *   automatically with `credentials: 'same-origin'`).
 * - An `x-atok` header is required on most endpoints. The ATOK value
 *   is a timestamp-prefixed anti-forgery token set on `window.bootstrap.atok`
 *   by the dashboard's server-rendered bootstrap script. The token refreshes
 *   on each page load, so it must always be read live from window.bootstrap.
 * - Auth detection uses `window.bootstrap.atok` presence as the primary
 *   signal, with `__cf_logged_in` cookie as a secondary indicator.
 */
const getAuth = (): CloudflareAuth | null => {
  // Always read atok live — it refreshes on each page load (timestamp-prefixed)
  const atok = getAtok();
  if (!atok) return null;

  const accountId = getPersistedAccountId() ?? extractAccountId();
  const auth: CloudflareAuth = { atok, accountId };
  setPersistedAccountId(accountId);
  return auth;
};

/** Read ATOK from the bootstrap global — for direct use by tools that bypass cloudflareApi() */
export const getAtokHeader = (): string | null => getAtok();

/** Read ATOK from the bootstrap global set by the dashboard's server-rendered script */
const getAtok = (): string | null => {
  const atok = getPageGlobal('bootstrap.atok');
  return typeof atok === 'string' && atok.length > 0 ? atok : null;
};

/**
 * Extract account ID from the URL path.
 * URL pattern: /[accountId]/...
 * Account IDs are 32-char hex strings.
 */
const extractAccountId = (): string | null => {
  const match = window.location.pathname.match(/^\/([a-f0-9]{32})\b/);
  return match?.[1] ?? null;
};

// --- Account ID persistence ---

interface PersistedCloudflare {
  accountId: string | null;
}

const getPersistedAccountId = (): string | null => getAuthCache<PersistedCloudflare>('cloudflare')?.accountId ?? null;

const setPersistedAccountId = (accountId: string | null): void => {
  setAuthCache('cloudflare', { accountId });
};

const clearPersistedAuth = (): void => {
  clearAuthCache('cloudflare');
};

// --- Public auth helpers ---

export const isCloudflareAuthenticated = (): boolean => getAuth() !== null;

export const waitForCloudflareAuth = (): Promise<boolean> =>
  waitUntil(() => isCloudflareAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

/** Get the account ID from the current URL, if present */
export const getAccountId = (): string | null => {
  const auth = getAuth();
  return auth?.accountId ?? extractAccountId();
};

// --- API caller ---

type QueryValue = string | number | boolean | undefined;

/**
 * Cloudflare API v4 response envelope.
 * All responses wrap data in: { success, errors, messages, result, result_info }
 */
interface CloudflareApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
  result: T;
  result_info?: {
    page: number;
    per_page: number;
    count: number;
    total_count: number;
    total_pages: number;
  };
}

export const cloudflareApi = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    query?: Record<string, QueryValue | QueryValue[]>;
  } = {},
): Promise<CloudflareApiResponse<T>> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Cloudflare.');

  // Same-origin proxy — the dashboard proxies API calls through dash.cloudflare.com/api/v4/
  let url = `/api/v4${endpoint}`;

  const params = new URLSearchParams();
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          if (v !== undefined) params.append(key, String(v));
        }
      } else if (value !== undefined) {
        params.append(key, String(value));
      }
    }
  }
  const qs = params.toString();
  if (qs) url += `?${qs}`;

  const headers: Record<string, string> = {
    'x-atok': auth.atok,
  };
  let fetchBody: string | undefined;

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(options.body);
  }

  const method = options.method ?? 'GET';
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw ToolError.timeout(`API request timed out: ${endpoint}`);
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ToolError('Request was aborted', 'aborted');
    }
    throw new ToolError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'network_error', {
      category: 'internal',
      retryable: true,
    });
  }

  if (!response.ok) {
    const errorBody = (await response.text().catch(() => '')).substring(0, 512);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryMs = retryAfter !== null ? parseRetryAfterMs(retryAfter) : undefined;
      throw ToolError.rateLimited(`Rate limited: ${endpoint} — ${errorBody}`, retryMs);
    }
    if (response.status === 401 || response.status === 403) {
      clearPersistedAuth();
      throw ToolError.auth(`Auth error (${response.status}): ${errorBody}`);
    }
    if (response.status === 404) {
      throw ToolError.notFound(`Not found: ${endpoint} — ${errorBody}`);
    }
    throw ToolError.internal(`API error (${response.status}): ${endpoint} — ${errorBody}`);
  }

  const data = (await response.json()) as CloudflareApiResponse<T>;

  if (!data.success && data.errors.length > 0) {
    const msg = data.errors.map(e => `[${e.code}] ${e.message}`).join('; ');
    throw ToolError.internal(`Cloudflare API error: ${msg}`);
  }

  return data;
};
