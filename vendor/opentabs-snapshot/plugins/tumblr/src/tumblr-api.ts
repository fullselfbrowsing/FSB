import {
  type FetchFromPageOptions,
  ToolError,
  buildQueryString,
  clearAuthCache,
  fetchFromPage,
  getAuthCache,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface TumblrAuth {
  apiToken: string;
  csrfToken: string;
}

const parseInitialState = (): TumblrAuth | null => {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('___INITIAL_STATE___');
  if (!el?.textContent) return null;
  try {
    const state = JSON.parse(el.textContent);
    const apiToken = state.apiFetchStore?.API_TOKEN;
    const csrfToken = state.csrfToken;
    if (typeof apiToken === 'string' && apiToken.length > 0) {
      return { apiToken, csrfToken: csrfToken ?? '' };
    }
  } catch {
    // Ignore parse errors
  }
  return null;
};

const getAuth = (): TumblrAuth | null => {
  const cached = getAuthCache<TumblrAuth>('tumblr');
  if (cached?.apiToken) return cached;

  const parsed = parseInitialState();
  if (!parsed) return null;

  setAuthCache('tumblr', parsed);
  return parsed;
};

const updateCsrf = (newCsrf: string): void => {
  const auth = getAuthCache<TumblrAuth>('tumblr');
  if (auth) {
    setAuthCache('tumblr', { ...auth, csrfToken: newCsrf });
  }
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = async (): Promise<boolean> => {
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

// --- API helpers ---

interface TumblrResponse<T> {
  meta: { status: number; msg: string };
  response: T;
}

const API_BASE = '/api/v2';

/**
 * Fetches a fresh CSRF token by making a lightweight GET request.
 * Tumblr's CSRF tokens expire after the initial page load, so
 * write operations need a fresh token from the x-csrf response header.
 */
const refreshCsrf = async (apiToken: string): Promise<string> => {
  const response = await fetchFromPage(`${API_BASE}/user/info`, {
    method: 'GET',
    headers: {
      Accept: 'application/json;format=camelcase',
      Authorization: `Bearer ${apiToken}`,
      'X-Version': 'redpop/3/0//redpop/',
    },
  });
  const csrf = response.headers.get('x-csrf');
  if (csrf) {
    updateCsrf(csrf);
    return csrf;
  }
  return '';
};

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Tumblr.');

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json;format=camelcase',
    Authorization: `Bearer ${auth.apiToken}`,
    'X-Version': 'redpop/3/0//redpop/',
  };

  if (method !== 'GET') {
    const csrf = auth.csrfToken || (await refreshCsrf(auth.apiToken));
    headers['X-Csrf'] = csrf;
  }

  const init: FetchFromPageOptions = { method, headers };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetchFromPage(url, init);
  } catch (error) {
    if (error instanceof ToolError) {
      if (error.category === 'auth') {
        clearAuthCache('tumblr');
      }
      throw error;
    }
    throw ToolError.internal(`Tumblr API error: ${String(error)}`);
  }

  // Update CSRF from response headers for future use
  const responseCsrf = response.headers.get('x-csrf');
  if (responseCsrf) {
    updateCsrf(responseCsrf);
  }

  if (response.status === 204) return {} as T;

  const data = (await response.json()) as TumblrResponse<T>;
  return data.response;
};
