import {
  ToolError,
  buildQueryString,
  fetchJSON,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  waitUntil,
  parseRateLimitHeader,
} from '@opentabs-dev/plugin-sdk';

const API_BASE = 'https://hub.docker.com';

interface DockerHubAuth {
  token: string;
  username: string;
}

// --- Auth detection ---
// Docker Hub uses cookie-based session auth via Auth0.
// The /auth/profile endpoint returns the JWT bearer token and username
// for the current session. Token is cached to avoid repeated profile fetches.

const fetchProfile = async (): Promise<DockerHubAuth | null> => {
  try {
    const resp = await fetch(`${API_BASE}/auth/profile`, {
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      token?: string;
      profile?: { username?: string };
    };
    if (!data.token || !data.profile?.username) return null;
    return { token: data.token, username: data.profile.username };
  } catch {
    return null;
  }
};

const getAuth = (): DockerHubAuth | null => {
  const cached = getAuthCache<DockerHubAuth>('docker-hub');
  if (cached?.token && cached?.username) return cached;
  return null;
};

const refreshAuth = async (): Promise<DockerHubAuth | null> => {
  const auth = await fetchProfile();
  if (auth) {
    setAuthCache('docker-hub', auth);
  }
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = async (): Promise<boolean> => {
  // First try a direct profile fetch to populate the cache
  const auth = await refreshAuth();
  if (auth) return true;

  try {
    await waitUntil(() => isAuthenticated(), {
      interval: 500,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
};

export const getUsername = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Docker Hub.');
  return auth.username;
};

// --- API caller ---

const ensureAuth = async (): Promise<DockerHubAuth> => {
  let auth = getAuth();
  if (auth) return auth;

  // Token may have expired; attempt a refresh
  auth = await refreshAuth();
  if (auth) return auth;

  throw ToolError.auth('Not authenticated — please log in to Docker Hub.');
};

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const auth = await ensureAuth();

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
  };

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`API request timed out: ${endpoint}`);
    throw new ToolError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'network_error', {
      category: 'internal',
      retryable: true,
    });
  }

  if (!response.ok) {
    const errorBody = (await response.text().catch(() => '')).substring(0, 512);

    if (response.status === 429) {
      const retryMs = parseRateLimitHeader(response.headers);
      throw ToolError.rateLimited(`Rate limited: ${endpoint} — ${errorBody}`, retryMs);
    }
    if (response.status === 401 || response.status === 403) {
      clearAuthCache('docker-hub');
      throw ToolError.auth(`Auth error (${response.status}): ${errorBody}`);
    }
    if (response.status === 404) throw ToolError.notFound(`Not found: ${endpoint} — ${errorBody}`);
    if (response.status === 400 || response.status === 422)
      throw ToolError.validation(`Validation error: ${endpoint} — ${errorBody}`);
    throw ToolError.internal(`API error (${response.status}): ${endpoint} — ${errorBody}`);
  }

  if (response.status === 202 || response.status === 204) return {} as T;
  return (await response.json()) as T;
};

// Variant for the v3 catalog search API which has a different base path
export const searchApi = async <T>(query: Record<string, string | number | boolean | undefined>): Promise<T> => {
  const auth = await ensureAuth();

  const qs = buildQueryString(query);
  const url = `${API_BASE}/api/search/v3/catalog/search?${qs}`;

  const data = await fetchJSON<T>(url, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  return data as T;
};
