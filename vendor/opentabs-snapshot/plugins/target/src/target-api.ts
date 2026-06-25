import {
  ToolError,
  fetchJSON,
  fetchFromPage,
  buildQueryString,
  getCookie,
  getPageGlobal,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';
import type { FetchFromPageOptions } from '@opentabs-dev/plugin-sdk';

// --- Types ---

interface TargetAuth {
  apiKey: string;
  visitorId: string;
  storeId: string;
}

// --- Auth extraction ---

const getAuth = (): TargetAuth | null => {
  const cached = getAuthCache<TargetAuth>('target');
  if (cached) return cached;

  const apiKey =
    (getPageGlobal('__CONFIG__.defaultServicesApiKey') as string | undefined) ??
    '9f36aeafbe60771e321a7cc95a78140772ab3e96';

  const visitorId = getCookie('visitorId');
  if (!visitorId) return null;

  // Extract preferred store from cookies
  const sddStore = getCookie('sddStore');
  const preferredStoreId = sddStore ? (sddStore.split('|')[0]?.replace('DSI_', '') ?? '1426') : '1426';

  const auth: TargetAuth = {
    apiKey,
    visitorId,
    storeId: preferredStoreId,
  };
  setAuthCache('target', auth);
  return auth;
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

export const getStoreId = (): string => {
  const auth = getAuth();
  return auth?.storeId ?? '1426';
};

export const getVisitorId = (): string => {
  const auth = getAuth();
  return auth?.visitorId ?? '';
};

// --- API callers ---

const API_BASE = 'https://api.target.com';
const REDSKY_BASE = 'https://redsky.target.com';
const CARTS_BASE = 'https://carts.target.com';
const TYPEAHEAD_BASE = 'https://typeahead.target.com';

const getApiKey = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Target.');
  return auth.apiKey;
};

/** Generic fetch for api.target.com */
export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const apiKey = getApiKey();
  const baseQuery = { key: apiKey, ...options.query };
  const qs = buildQueryString(baseQuery);
  const url = `${API_BASE}/${endpoint}${qs ? `?${qs}` : ''}`;

  const init: FetchFromPageOptions = {
    method: options.method ?? 'GET',
    headers: { 'x-api-key': apiKey },
  };

  if (options.body) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  return (await fetchJSON<T>(url, init)) as T;
};

/** Fetch for redsky.target.com (product/store aggregation APIs) */
export const redskyApi = async <T>(
  endpoint: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Target.');

  const fullQuery = {
    key: auth.apiKey,
    visitor_id: auth.visitorId,
    channel: 'WEB',
    pricing_store_id: auth.storeId,
    store_ids: auth.storeId,
    ...query,
  };
  const qs = buildQueryString(fullQuery);
  const url = `${REDSKY_BASE}/${endpoint}${qs ? `?${qs}` : ''}`;
  return (await fetchJSON<T>(url)) as T;
};

/** Fetch for carts.target.com */
export const cartsApi = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const apiKey = getApiKey();
  const baseQuery = { key: apiKey, ...options.query };
  const qs = buildQueryString(baseQuery);
  const url = `${CARTS_BASE}/${endpoint}${qs ? `?${qs}` : ''}`;

  const init: FetchFromPageOptions = {
    method: options.method ?? 'GET',
  };

  if (options.body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  if (options.method === 'DELETE') {
    const response = await fetchFromPage(url, init);
    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  return (await fetchJSON<T>(url, init)) as T;
};

/** Fetch for typeahead.target.com */
export const typeaheadApi = async <T>(
  endpoint: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Target.');

  const fullQuery = {
    key: auth.apiKey,
    channel: 'WEB',
    visitor_id: auth.visitorId,
    ...query,
  };
  const qs = buildQueryString(fullQuery);
  const url = `${TYPEAHEAD_BASE}/${endpoint}${qs ? `?${qs}` : ''}`;
  return (await fetchJSON<T>(url)) as T;
};

/** Clear cached auth on error */
export const clearAuth = (): void => {
  clearAuthCache('target');
};
