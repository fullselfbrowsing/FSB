import {
  ToolError,
  buildQueryString,
  fetchJSON,
  getCookie,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';
import type { FetchFromPageOptions } from '@opentabs-dev/plugin-sdk';

// --- Auth ---
// Carta uses Django session cookies with a CSRF token.
// Authentication is detected by the presence of the `is_logged_in` cookie.
// The CSRF token is stored in the `eshares-csrftoken-2` cookie.

interface CartaAuth {
  csrfToken: string;
}

const getAuth = (): CartaAuth | null => {
  const cached = getAuthCache<CartaAuth>('carta');
  if (cached) return cached;

  // The CSRF cookie (`eshares-csrftoken-2`) is only set for authenticated users.
  // The `is_logged_in` cookie exists but is HttpOnly and inaccessible via document.cookie.
  const csrfToken = getCookie('eshares-csrftoken-2');
  if (!csrfToken) return null;

  const auth: CartaAuth = { csrfToken };
  setAuthCache('carta', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

const requireAuth = (): CartaAuth => {
  const auth = getAuth();
  if (!auth) {
    clearAuthCache('carta');
    throw ToolError.auth('Not authenticated — please log in to Carta.');
  }
  return auth;
};

// --- API caller ---

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const auth = requireAuth();
  const method = options.method ?? 'GET';

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${endpoint}?${qs}` : endpoint;

  const headers: Record<string, string> = {};

  if (method !== 'GET') {
    headers['X-CSRFToken'] = auth.csrfToken;
  }

  const init: FetchFromPageOptions = { method, headers };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  try {
    const result = await fetchJSON<T>(url, init);
    return result as T;
  } catch (err: unknown) {
    if (err instanceof ToolError && err.category === 'auth') {
      clearAuthCache('carta');
    }
    throw err;
  }
};

// --- Context extraction ---
// Carta URLs embed portfolio and corporation IDs that many endpoints require.
// Extract them from the current page URL.

interface CartaContext {
  portfolioId: number;
  corporationId?: number;
}

export const getContext = (): CartaContext | null => {
  const url = window.location.pathname;

  // Pattern: /investors/individual/{portfolioId}/portfolio/{corpId?}/...
  const match = url.match(/\/investors\/individual\/(\d+)\/portfolio\/(?:(\d+)\/)?/);
  if (match) {
    return {
      portfolioId: Number(match[1]),
      corporationId: match[2] ? Number(match[2]) : undefined,
    };
  }

  return null;
};

export const requireContext = (): CartaContext => {
  const ctx = getContext();
  if (!ctx) throw ToolError.validation('Navigate to a Carta portfolio page first.');
  return ctx;
};
