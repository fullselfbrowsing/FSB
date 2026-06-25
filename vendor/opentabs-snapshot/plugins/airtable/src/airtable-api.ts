import { ToolError, getPageGlobal, parseRetryAfterMs, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Types ---

interface AirtableAuth {
  userId: string;
  csrfToken: string;
}

// --- Auth detection ---
// Airtable uses HttpOnly session cookies. Auth is detected via window.initData
// which contains sessionUserId and csrfToken for authenticated users.

const getAuth = (): AirtableAuth | null => {
  const sessionUserId = getPageGlobal('initData.sessionUserId');
  const csrfToken = getPageGlobal('initData.csrfToken');
  if (typeof sessionUserId !== 'string' || typeof csrfToken !== 'string') return null;
  // Public share context users start with usrPAGESHARE — these are not real users
  if (sessionUserId.startsWith('usrPAGESHARE')) return null;
  return { userId: sessionUserId, csrfToken };
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

export const getUserId = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Airtable.');
  return auth.userId;
};

const getCsrf = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Airtable.');
  return auth.csrfToken;
};

// --- Request helpers ---

const COMMON_HEADERS: Record<string, string> = {
  'x-airtable-inter-service-client': 'webClient',
  'x-requested-with': 'XMLHttpRequest',
};

const getTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

// --- API callers ---

/** GET request to Airtable internal API with stringifiedObjectParams query */
export const apiGet = async <T>(
  endpoint: string,
  params: Record<string, unknown> = {},
  options: { appId?: string } = {},
): Promise<T> => {
  if (!getAuth()) throw ToolError.auth('Not authenticated — please log in to Airtable.');

  const qs = new URLSearchParams({
    stringifiedObjectParams: JSON.stringify(params),
    requestId: `req${Math.random().toString(36).slice(2, 10)}`,
  });

  const headers: Record<string, string> = {
    ...COMMON_HEADERS,
    'x-time-zone': getTimezone(),
  };
  if (options.appId) headers['x-airtable-application-id'] = options.appId;

  let response: Response;
  try {
    response = await fetch(`/v0.3/${endpoint}?${qs}`, {
      credentials: 'include',
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`API request timed out: ${endpoint}`);
    throw new ToolError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'network_error', {
      category: 'internal',
      retryable: true,
    });
  }

  return handleResponse<T>(response, endpoint);
};

/** POST request to Airtable internal API with stringifiedObjectParams body + CSRF */
export const apiPost = async <T>(
  endpoint: string,
  params: Record<string, unknown> = {},
  options: { appId?: string } = {},
): Promise<T> => {
  if (!getAuth()) throw ToolError.auth('Not authenticated — please log in to Airtable.');

  const headers: Record<string, string> = {
    ...COMMON_HEADERS,
    'Content-Type': 'application/json',
    'x-time-zone': getTimezone(),
  };
  if (options.appId) headers['x-airtable-application-id'] = options.appId;

  let response: Response;
  try {
    response = await fetch(`/v0.3/${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        stringifiedObjectParams: JSON.stringify(params),
        requestId: `req${Math.random().toString(36).slice(2, 10)}`,
        _csrf: getCsrf(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`API request timed out: ${endpoint}`);
    throw new ToolError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'network_error', {
      category: 'internal',
      retryable: true,
    });
  }

  return handleResponse<T>(response, endpoint);
};

// --- Response handler ---

const handleResponse = async <T>(response: Response, endpoint: string): Promise<T> => {
  if (!response.ok) {
    const errorBody = (await response.text().catch(() => '')).substring(0, 512);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryMs = retryAfter !== null ? parseRetryAfterMs(retryAfter) : undefined;
      throw ToolError.rateLimited(`Rate limited: ${endpoint} — ${errorBody}`, retryMs);
    }
    if (response.status === 401) throw ToolError.auth(`Auth error (${response.status}): ${errorBody}`);
    if (response.status === 403) {
      // Airtable uses 403 for both auth and permission errors — distinguish by error body
      if (errorBody.includes('INVALID_PERMISSIONS'))
        throw ToolError.validation(`Permission denied: ${endpoint} — ${errorBody}`);
      throw ToolError.auth(`Auth error (${response.status}): ${errorBody}`);
    }
    if (response.status === 404) throw ToolError.notFound(`Not found: ${endpoint} — ${errorBody}`);
    if (response.status === 422) throw ToolError.validation(`Invalid request: ${endpoint} — ${errorBody}`);
    throw ToolError.internal(`API error (${response.status}): ${endpoint} — ${errorBody}`);
  }

  if (response.status === 204) return {} as T;

  const json = (await response.json()) as { msg?: string; data?: T; error?: { type?: string; message?: string } };

  if (json.error) {
    const errMsg = json.error.message ?? json.error.type ?? 'Unknown error';
    if (json.error.type === 'NOT_FOUND' || json.error.type === 'MODEL_ID_NOT_FOUND')
      throw ToolError.notFound(`Not found: ${endpoint} — ${errMsg}`);
    if (json.error.type === 'INVALID_REQUEST' || json.error.type === 'INVALID_MODEL_ID')
      throw ToolError.validation(`Invalid request: ${endpoint} — ${errMsg}`);
    throw ToolError.internal(`API error: ${endpoint} — ${errMsg}`);
  }

  return (json.data ?? json) as T;
};
