import {
  ToolError,
  fetchJSON,
  fetchFromPage,
  buildQueryString,
  getPageGlobal,
  getMetaContent,
  getCookie,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';
import type { FetchFromPageOptions } from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface ZendeskAuth {
  userId: string;
}

const getAuth = (): ZendeskAuth | null => {
  const cached = getAuthCache<ZendeskAuth>('zendesk');
  if (cached) return cached;

  // Zendesk agent UI stores current user info in __app_config__
  const userId = getPageGlobal('__app_config__.currentUser.id') as string | undefined;
  if (!userId) return null;

  const auth: ZendeskAuth = { userId };
  setAuthCache('zendesk', auth);
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

// --- CSRF ---

const getCsrfToken = (): string | null => getMetaContent('csrf-token') ?? getCookie('_zendesk_csrf');

// --- API caller ---

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  if (!getAuth()) {
    clearAuthCache('zendesk');
    throw ToolError.auth('Not authenticated — please log in to Zendesk.');
  }

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `/api/v2${endpoint}?${qs}` : `/api/v2${endpoint}`;

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (method !== 'GET') {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const init: FetchFromPageOptions = {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  };

  try {
    const data = await fetchJSON<T>(url, init);
    return data as T;
  } catch (error) {
    if (error instanceof ToolError && error.category === 'auth') {
      clearAuthCache('zendesk');
    }
    throw error;
  }
};

// For endpoints that return non-JSON responses (e.g., exports)
export const apiRaw = async (
  endpoint: string,
  options: {
    method?: string;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<Response> => {
  if (!getAuth()) {
    clearAuthCache('zendesk');
    throw ToolError.auth('Not authenticated — please log in to Zendesk.');
  }

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `/api/v2${endpoint}?${qs}` : `/api/v2${endpoint}`;

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (method !== 'GET') {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  return fetchFromPage(url, { method, headers });
};
