import {
  type FetchFromPageOptions,
  buildQueryString,
  fetchFromPage,
  fetchJSON,
  getPageGlobal,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// Starbucks uses HttpOnly session cookies. Auth state is readable from the Redux store.
// The sessionExpired flag is a client-side SPA flag that gets set during navigation and
// session refresh — it does not mean the HTTP session is invalid. The reliable indicators
// are sessionMeta.value (user logged in) and accountProfile.data (profile was loaded).

interface ReduxUserState {
  sessionMeta?: { value?: string };
  accountProfile?: { data?: unknown };
}

interface ReduxStore {
  getState?: () => { user?: ReduxUserState };
}

export const isAuthenticated = (): boolean => {
  const store = getPageGlobal('store') as ReduxStore | undefined;
  const state = store?.getState?.();
  return !!state?.user?.sessionMeta?.value && !!state?.user?.accountProfile?.data;
};

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

// --- Redux store access ---
// The Redux store at window.store.getState() provides rich client-side data.

export const getReduxSlice = <T>(path: string): T | null => {
  const store = getPageGlobal('store') as ReduxStore | undefined;
  const state = store?.getState?.() as Record<string, unknown> | undefined;
  if (!state) return null;
  const parts = path.split('.');
  let current: unknown = state;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return (current ?? null) as T | null;
};

// --- API wrapper ---
// Starbucks uses /apiproxy/v1/ endpoints with cookie-based auth (credentials: 'include').

const API_BASE = '/apiproxy/v1';

const COMMON_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'x-requested-with': 'XMLHttpRequest',
};

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { ...COMMON_HEADERS };

  const init: FetchFromPageOptions = { method, headers };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const data = await fetchJSON<T>(url, init);
  return data as T;
};

// For Orchestra GraphQL-style operations via /apiproxy/v1/orchestra/<operationId>
export const orchestraApi = async <T>(operationId: string, variables: Record<string, unknown> = {}): Promise<T> => {
  const url = `${API_BASE}/orchestra/${operationId}`;
  const data = await fetchJSON<T>(url, {
    method: 'POST',
    headers: { ...COMMON_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId, variables }),
  });
  return data as T;
};

// For endpoints that return arrays directly (not wrapped in { data: ... })
export const apiArray = async <T>(
  endpoint: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T[]> => {
  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  const response = await fetchFromPage(url, {
    method: 'GET',
    headers: COMMON_HEADERS,
  });

  if (response.status === 204) return [];
  return (await response.json()) as T[];
};
