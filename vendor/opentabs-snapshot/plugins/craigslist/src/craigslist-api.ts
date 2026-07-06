import { ToolError, buildQueryString, getCookie, fetchFromPage, fetchJSON, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// Craigslist uses HttpOnly session cookies (`cl_session`) for API auth.
// The non-HttpOnly `cl_login` cookie indicates the user is logged in and
// contains the user ID and email in the format "userId:email".

export const isAuthenticated = (): boolean => getCookie('cl_login') !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

/** Parse the cl_login cookie into userId and email. */
const parseLoginCookie = (): { userId: string; email: string } | null => {
  const raw = getCookie('cl_login');
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  const colonIdx = decoded.indexOf(':');
  if (colonIdx === -1) return null;
  return {
    userId: decoded.substring(0, colonIdx),
    email: decoded.substring(colonIdx + 1),
  };
};

export const getUserEmail = (): string => {
  const parsed = parseLoginCookie();
  if (!parsed) throw ToolError.auth('Not authenticated — please log in to Craigslist.');
  return parsed.email;
};

export const getUserId = (): string => {
  const parsed = parseLoginCookie();
  if (!parsed) throw ToolError.auth('Not authenticated — please log in to Craigslist.');
  return parsed.userId;
};

// --- Craigslist API response envelope ---

interface CraigslistResponse<T> {
  apiVersion: number;
  data: T;
  errors: Array<{ code?: number; message: string }>;
}

// --- API callers ---
// Craigslist has two API subdomains:
//   wapi.craigslist.org — write/account APIs (user info, payment cards, posting actions)
//   capi.craigslist.org — chat APIs

const WAPI_BASE = 'https://wapi.craigslist.org/web/v8';
const CAPI_BASE = 'https://capi.craigslist.org/web/v8';

const callApi = async <T>(
  base: string,
  endpoint: string,
  options: {
    method?: string;
    body?: FormData | string;
    contentType?: string;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  if (!isAuthenticated()) throw ToolError.auth('Not authenticated — please log in to Craigslist.');

  const query = { lang: 'en', ...options.query };
  const qs = buildQueryString(query);
  const url = `${base}${endpoint}?${qs}`;

  const headers: Record<string, string> = {};
  const method = options.method ?? 'GET';

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = options.contentType ?? 'application/json';
  }

  const response = await fetchFromPage(url, { method, headers, body: options.body });
  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
};

/** Call the write/account API (wapi.craigslist.org). */
export const wapi = async <T>(
  endpoint: string,
  options?: {
    method?: string;
    body?: FormData | string;
    contentType?: string;
    query?: Record<string, string | number | boolean | undefined>;
  },
): Promise<CraigslistResponse<T>> => callApi<CraigslistResponse<T>>(WAPI_BASE, endpoint, options);

/** Call the chat API (capi.craigslist.org). */
export const capi = async <T>(
  endpoint: string,
  options?: {
    method?: string;
    body?: FormData | string;
    contentType?: string;
    query?: Record<string, string | number | boolean | undefined>;
  },
): Promise<CraigslistResponse<T>> => callApi<CraigslistResponse<T>>(CAPI_BASE, endpoint, options);

/** Call the accounts.craigslist.org JSON endpoint (saved searches). */
export const accountsApi = async <T>(endpoint: string): Promise<T> => {
  if (!isAuthenticated()) throw ToolError.auth('Not authenticated — please log in to Craigslist.');

  const data = await fetchJSON<T>(`https://accounts.craigslist.org${endpoint}`);
  return data as T;
};
