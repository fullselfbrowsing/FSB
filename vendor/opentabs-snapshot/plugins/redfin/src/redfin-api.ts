import {
  type FetchFromPageOptions,
  ToolError,
  fetchFromPage,
  getCookie,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  buildQueryString,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Redfin Stingray API response envelope ---

interface StingrayResponse<T> {
  version: number;
  errorMessage: string;
  resultCode: number;
  payload: T;
}

// --- Auth ---

interface RedfinAuth {
  rfAuth: string;
}

const AUTH_NAMESPACE = 'redfin';

const getAuth = (): RedfinAuth | null => {
  const cached = getAuthCache<RedfinAuth>(AUTH_NAMESPACE);
  if (cached) return cached;

  const rfAuth = getCookie('RF_AUTH');
  if (!rfAuth) return null;

  const auth: RedfinAuth = { rfAuth };
  setAuthCache(AUTH_NAMESPACE, auth);
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

// --- Stingray API caller ---
// Redfin's Stingray APIs return `{}&&{json}` (JSONP security prefix).
// Auth is via HttpOnly session cookie (JSESSIONID) + x-rf-secure header.

const stripJsonpPrefix = (text: string): string => {
  if (text.startsWith('{}&&')) return text.slice(4);
  return text;
};

export const api = async <T>(
  endpoint: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Redfin.');

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${endpoint}?${qs}` : endpoint;

  const headers: Record<string, string> = {
    'x-rf-secure': auth.rfAuth,
  };

  const init: FetchFromPageOptions = {
    method: 'GET',
    headers,
  };

  let response: Response;
  try {
    response = await fetchFromPage(url, init);
  } catch (error) {
    if (error instanceof ToolError) {
      if (error.category === 'auth') clearAuthCache(AUTH_NAMESPACE);
      throw error;
    }
    throw error;
  }

  const text = await response.text();
  const jsonStr = stripJsonpPrefix(text);

  let data: StingrayResponse<T>;
  try {
    data = JSON.parse(jsonStr) as StingrayResponse<T>;
  } catch {
    throw ToolError.internal(`Failed to parse Redfin API response from ${endpoint}`);
  }

  if (data.resultCode !== 0) {
    const msg = data.errorMessage || `API error (code ${data.resultCode})`;
    if (data.resultCode === 4) throw ToolError.auth(msg);
    if (data.resultCode === 100) throw ToolError.validation(`Missing required parameter: ${msg}`);
    throw ToolError.internal(msg);
  }

  return data.payload;
};
