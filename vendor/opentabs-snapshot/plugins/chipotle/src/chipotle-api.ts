import {
  type FetchFromPageOptions,
  ToolError,
  buildQueryString,
  fetchJSON,
  getAuthCache,
  getLocalStorage,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

const GATEWAY_URL = 'https://services.chipotle.com';
const SUBSCRIPTION_KEY = 'b4d9f36380184a3788857063bce25d6a';

interface ChipotleAuth {
  jwt: string;
}

const getAuth = (): ChipotleAuth | null => {
  const cached = getAuthCache<ChipotleAuth>('chipotle');
  if (cached?.jwt) return cached;

  const vuex = getLocalStorage('cmg-vuex');
  if (!vuex) return null;

  try {
    const state = JSON.parse(vuex);
    const jwt = state?.customer?.jwt;
    if (!jwt) return null;

    const auth: ChipotleAuth = { jwt };
    setAuthCache('chipotle', auth);
    return auth;
  } catch {
    return null;
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

/**
 * Makes an authenticated GET request to the Chipotle API.
 * KPSDK (Kasada bot protection) automatically injects x-kpsdk-ct/h/v headers
 * via its fetch/XHR interceptor — no manual header injection needed.
 */
export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to chipotle.com.');

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${GATEWAY_URL}${endpoint}?${qs}` : `${GATEWAY_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    'Content-Type': 'application/json',
    'Chipotle-CorrelationId': crypto.randomUUID(),
    Authorization: `Bearer ${auth.jwt}`,
  };

  const init: FetchFromPageOptions = {
    method: options.method ?? 'GET',
    headers,
  };

  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  const data = await fetchJSON<T>(url, init);
  return data as T;
};

/**
 * Makes a POST request. Shorthand for api() with method: 'POST'.
 */
export const apiPost = async <T>(
  endpoint: string,
  body: unknown,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> => {
  return api<T>(endpoint, { method: 'POST', body, query });
};

/**
 * Reads a slice of the Vuex store from localStorage.
 * Useful for accessing cached menu data and order state.
 */
export const getVuexSlice = <T>(path: string): T | null => {
  const vuex = getLocalStorage('cmg-vuex');
  if (!vuex) return null;

  try {
    const state = JSON.parse(vuex);
    const parts = path.split('.');
    let current: unknown = state;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[part];
    }
    return current as T;
  } catch {
    return null;
  }
};
