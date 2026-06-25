import {
  type FetchFromPageOptions,
  ToolError,
  buildQueryString,
  fetchJSON,
  getCookie,
  getLocalStorage,
  getMetaContent,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// Calendly uses HttpOnly session cookies for auth. The CSRF token is in a <meta> tag.
// Auth presence is detected via the CALENDLY_AUTHENTICATED_USER_STATUS cookie/localStorage key
// and the existence of a CSRF token meta tag.

const getAuth = (): { csrfToken: string } | null => {
  const csrfToken = getMetaContent('csrf-token');
  if (!csrfToken) return null;

  const authStatus =
    getCookie('CALENDLY_AUTHENTICATED_USER_STATUS') ?? getLocalStorage('CALENDLY_AUTHENTICATED_USER_STATUS');
  if (!authStatus) return null;

  return { csrfToken };
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

// --- Internal API caller ---
// Calendly's internal web API uses session cookies + CSRF token for authentication.
// All endpoints are under /api/ on the same origin.

const getHeaders = (): Record<string, string> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Calendly.');
  return {
    Accept: 'application/json',
    'X-CSRF-Token': auth.csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
  };
};

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const headers = getHeaders();
  const method = options.method ?? 'GET';

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `/api${endpoint}?${qs}` : `/api${endpoint}`;

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const init: FetchFromPageOptions = {
    method,
    headers,
  };

  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  return fetchJSON<T>(url, init) as Promise<T>;
};
