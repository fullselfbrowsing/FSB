import { ToolError, getLocalStorage, getPageGlobal, parseRetryAfterMs, waitUntil } from '@opentabs-dev/plugin-sdk';

// Auth0 SPA SDK stores the token in localStorage under this key.
// The token object has { body: { access_token, ... }, expiresAt }.
const AUTH0_STORAGE_KEY = '@@auth0spajs@@::IPpH4RND0qNXHVayepffgsGpbXQmFikr::control-plane-web::openid profile email';

// ClickHouse Cloud stores organization/instance data in localStorage
// under keys prefixed with __uc_cache__:
const UC_CACHE_PREFIX = '__uc_cache__:';

interface Auth0TokenEntry {
  body?: {
    access_token?: string;
  };
  expiresAt?: number;
}

interface ClickHouseAuth {
  accessToken: string;
}

// --- Auth extraction ---

const getAuth = (): ClickHouseAuth | null => {
  try {
    const raw = getLocalStorage(AUTH0_STORAGE_KEY);
    if (!raw) return null;

    const entry = JSON.parse(raw) as Auth0TokenEntry;
    const accessToken = entry.body?.access_token;
    if (!accessToken) return null;

    // Check expiration — expiresAt is unix seconds
    const expiresAt = entry.expiresAt ?? 0;
    if (expiresAt > 0 && expiresAt < Date.now() / 1000) {
      // Token expired. Auth0 SPA SDK auto-refreshes in the background,
      // so a subsequent check may find a valid token.
      return null;
    }

    return { accessToken };
  } catch {
    return null;
  }
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

// --- Organization ID extraction ---

// The ClickHouse Cloud console caches organization and instance data in
// localStorage under __uc_cache__:organizations:<userId> etc. The org ID
// is also available in the URL path (/services/<orgId>/...).

export const getFromCache = <T>(cacheKey: string): T | null => {
  try {
    const prefix = `${UC_CACHE_PREFIX}${cacheKey}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const raw = getLocalStorage(key);
      if (!raw) continue;
      return JSON.parse(raw) as T;
    }
  } catch {
    /* ignore */
  }
  return null;
};

export const getOrgId = (): string | null => {
  // Strategy 1: Read from localStorage org ID preference
  try {
    const orgId = getLocalStorage('currentOrganizationId');
    if (orgId) return orgId;
  } catch {
    // Ignore
  }

  // Strategy 2: Read from __uc_cache__:organizations:<userId> — stored as a JSON array
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${UC_CACHE_PREFIX}organizations:`)) continue;
      const raw = getLocalStorage(key);
      if (!raw) continue;
      const orgs = JSON.parse(raw) as Array<{ id?: string }>;
      if (Array.isArray(orgs) && orgs[0]?.id) return orgs[0].id;
    }
  } catch {
    // Ignore
  }

  return null;
};

// --- API base URL ---

const getApiBase = (): string => {
  try {
    const apiHost = getPageGlobal('consoleConfig.controlPlane.apiHost');
    if (typeof apiHost === 'string') return apiHost;
  } catch {
    // Ignore
  }
  return 'https://control-plane-internal.clickhouse.cloud';
};

// --- API caller ---

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to ClickHouse Cloud.');

  const base = getApiBase();
  let url = `${base}${endpoint}`;

  if (options.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) params.append(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${auth.accessToken}`,
  };

  let fetchBody: string | undefined;
  if (options.body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers,
      body: fetchBody,
      credentials: 'include',
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
      throw ToolError.auth(`Auth error (${response.status}): ${errorBody}`);
    }
    if (response.status === 404) {
      throw ToolError.notFound(`Not found: ${endpoint} — ${errorBody}`);
    }
    if (response.status === 422) {
      throw ToolError.validation(`Validation error: ${endpoint} — ${errorBody}`);
    }
    throw ToolError.internal(`API error (${response.status}): ${endpoint} — ${errorBody}`);
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
};
