import { ToolError, getPageGlobal, parseRetryAfterMs, waitUntil } from '@opentabs-dev/plugin-sdk';

const API_BASE = 'https://app.asana.com/api/1.0';

// --- Auth detection ---
// Asana uses HttpOnly cookies (auth_token) that aren't accessible via JS.
// Auth is detected via window.env._user_id, a numeric global that Asana
// injects on every page for logged-in users. The actual API auth uses
// session cookies sent automatically via credentials: 'include'.

const getUserId = (): number | null => {
  const envUserId = getPageGlobal('env._user_id');
  if (typeof envUserId === 'number') return envUserId;
  const globalUserId = getPageGlobal('page_load_globals.user_id');
  if (typeof globalUserId === 'number') return globalUserId;
  return null;
};

export const isAuthenticated = (): boolean => getUserId() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

// --- API caller ---

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  if (!isAuthenticated()) throw ToolError.auth('Not authenticated — please log in to Asana.');

  const method = options.method ?? 'GET';

  let url = `${API_BASE}${endpoint}`;
  if (options.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) params.append(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  // POST/PUT/DELETE requests require this header for write auth
  if (method !== 'GET') {
    headers['X-Allow-Asana-Client'] = '1';
  }

  let fetchBody: string | undefined;
  if (options.body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      credentials: 'include',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`API request timed out: ${endpoint}`);
    if (err instanceof DOMException && err.name === 'AbortError') throw new ToolError('Request was aborted', 'aborted');
    throw new ToolError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'network_error', {
      category: 'internal',
      retryable: true,
    });
  }

  if (!response.ok) {
    const errorBody = (await response.text().catch(() => '')).substring(0, 512);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryMs = retryAfter !== null ? parseRetryAfterMs(retryAfter) : undefined;
      throw ToolError.rateLimited(`Rate limited: ${endpoint} — ${errorBody}`, retryMs);
    }
    if (response.status === 401 || response.status === 403)
      throw ToolError.auth(`Auth error (${response.status}): ${errorBody}`);
    if (response.status === 404) throw ToolError.notFound(`Not found: ${endpoint} — ${errorBody}`);
    if (response.status === 400 || response.status === 422)
      throw ToolError.validation(`Validation error: ${endpoint} — ${errorBody}`);
    throw ToolError.internal(`API error (${response.status}): ${endpoint} — ${errorBody}`);
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
};
