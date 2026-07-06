import {
  type FetchFromPageOptions,
  ToolError,
  fetchFromPage,
  getPageGlobal,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

/**
 * Uber uses HttpOnly session cookies (`sid`) for authentication.
 * All API calls go to same-origin `/api/*` endpoints with `credentials: 'include'`.
 * A `x-csrf-token` header is required on all requests — Uber validates its presence,
 * not its value, so any non-empty string works.
 *
 * Auth detection reads the `__preload_cache__` global, which contains the bootstrapped
 * getCurrentUser response for logged-in users.
 */

export const isAuthenticated = (): boolean => {
  const cache = getPageGlobal('__preload_cache__') as
    | Record<string, { data?: { status?: string; data?: { user?: unknown } } }>
    | undefined;
  if (!cache) return false;

  for (const key of Object.keys(cache)) {
    if (key.includes('getCurrentUser')) {
      const entry = cache[key];
      if (entry?.data?.status === 'success' && entry?.data?.data?.user) {
        return true;
      }
    }
  }
  return false;
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

const CSRF_TOKEN = 'x';

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<T> => {
  if (!isAuthenticated()) {
    throw ToolError.auth('Not authenticated — please log in to Uber.');
  }

  const url = `/api${endpoint}`;
  const method = options.method ?? 'POST';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-csrf-token': CSRF_TOKEN,
  };

  const init: FetchFromPageOptions = { method, headers };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  } else {
    init.body = '{}';
  }

  const response = await fetchFromPage(url, init);

  if (response.status === 204) return {} as T;

  const json = (await response.json()) as { status?: string; data?: T };

  if (json.status === 'success' && json.data !== undefined) {
    return json.data;
  }

  return json as T;
};
