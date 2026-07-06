import { type FetchFromPageOptions, buildQueryString, fetchJSON, getCookie, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// Netlify uses HttpOnly session cookies (`_nf-auth`, `connect.sid`) — no explicit
// token needed. Auth is detected via the non-HttpOnly `_nf-auth-hint` cookie set
// to "user-is-likely-authed" when logged in. The session cookies are sent
// automatically via credentials: 'include' (fetchJSON default).

export const isAuthenticated = (): boolean => getCookie('_nf-auth-hint') === 'user-is-likely-authed';

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

const API_BASE = '/access-control/bb-api/api/v1';

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export const api = async <T>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  const init: FetchFromPageOptions = {
    method: options.method ?? 'GET',
  };

  if (options.body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  return fetchJSON<T>(url, init) as Promise<T>;
};
