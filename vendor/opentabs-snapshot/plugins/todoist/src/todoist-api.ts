import {
  type FetchFromPageOptions,
  ToolError,
  buildQueryString,
  fetchFromPage,
  fetchJSON,
  getAuthCache,
  getLocalStorage,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface TodoistAuth {
  token: string;
}

const getAuth = (): TodoistAuth | null => {
  const cached = getAuthCache<TodoistAuth>('todoist');
  if (cached) return cached;

  const raw = getLocalStorage('User');
  if (!raw) return null;

  try {
    const user = JSON.parse(raw) as { token?: string };
    if (!user.token) return null;

    const auth: TodoistAuth = { token: user.token };
    setAuthCache('todoist', auth);
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

// --- API ---

const API_BASE = '/api/v1';

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export const api = async <T>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Todoist.');

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
  };

  const init: FetchFromPageOptions = { method, headers };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  return fetchJSON<T>(url, init) as Promise<T>;
};

// For endpoints that return 204 No Content (close, reopen, delete, archive)
export const apiVoid = async (endpoint: string, options: ApiOptions = {}): Promise<void> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Todoist.');

  const method = options.method ?? 'POST';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
  };

  const init: FetchFromPageOptions = { method, headers };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  await fetchFromPage(`${API_BASE}${endpoint}`, init);
};
