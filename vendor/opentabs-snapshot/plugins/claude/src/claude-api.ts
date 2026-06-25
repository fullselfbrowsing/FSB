import {
  type FetchFromPageOptions,
  ToolError,
  buildQueryString,
  fetchFromPage,
  fetchJSON,
  getAuthCache,
  getCookie,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---
// Claude.ai uses HttpOnly session cookies — requests with credentials: 'include'
// are automatically authenticated. We detect auth via the intercomSettings global
// or the lastActiveOrg cookie.

interface ClaudeAuth {
  orgId: string;
}

const getAuth = (): ClaudeAuth | null => {
  const cached = getAuthCache<ClaudeAuth>('claude');
  if (cached) return cached;

  const orgId = getCookie('lastActiveOrg');
  if (!orgId) return null;

  const auth: ClaudeAuth = { orgId };
  setAuthCache('claude', auth);
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

export const getOrgId = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Claude.');
  return auth.orgId;
};

// --- API caller ---

const API_BASE = '/api';

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Claude.');

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  const init: FetchFromPageOptions = { method, headers };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const data = await fetchJSON<T>(url, init);
  return data as T;
};

// For the streaming completion endpoint — collects SSE chunks into a full response
export const apiStream = async (endpoint: string, body: unknown): Promise<string> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Claude.');

  const url = `${API_BASE}${endpoint}`;
  const response = await fetchFromPage(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  // Parse SSE events and concatenate completion text
  let fullText = '';
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const data = JSON.parse(line.slice(6)) as {
        type?: string;
        completion?: string;
      };
      if (data.type === 'completion' && data.completion) {
        fullText += data.completion;
      }
    } catch {
      // Skip malformed SSE lines
    }
  }

  return fullText;
};

// Org-scoped API shorthand
export const orgApi = async <T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const orgId = getOrgId();
  return api<T>(`/organizations/${orgId}${path}`, options);
};
