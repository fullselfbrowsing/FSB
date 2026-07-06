import { ToolError, getCookie, getLocalStorage, parseRetryAfterMs, waitUntil } from '@opentabs-dev/plugin-sdk';

const GRAPHQL_BASE = '/graphql';

// --- Auth detection ---
// DoorDash uses HttpOnly session cookies (dd_session_id) sent automatically
// via credentials: 'include'. Auth is detected via the dd_cx_logged_in cookie
// and consumerId in localStorage.

const getAuth = (): { consumerId: string } | null => {
  const loggedIn = getCookie('dd_cx_logged_in') !== null;
  if (!loggedIn) return null;

  const consumerId = getLocalStorage('consumerId');
  if (!consumerId) return null;

  return { consumerId };
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

const getCsrfToken = (): string | null => getCookie('csrf_token');

// --- GraphQL caller ---

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export const gql = async <T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> => {
  if (!getAuth()) throw ToolError.auth('Not authenticated — please log in to DoorDash.');

  const csrf = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-channel-id': 'marketplace',
    'x-experience-id': 'doordash',
  };
  if (csrf) headers['x-csrftoken'] = csrf;

  let response: Response;
  try {
    response = await fetch(`${GRAPHQL_BASE}/${operationName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ operationName, variables, query }),
      credentials: 'include',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`API request timed out: ${operationName}`);
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
      throw ToolError.rateLimited(`Rate limited: ${operationName} — ${errorBody}`, retryMs);
    }
    if (response.status === 401 || response.status === 403)
      throw ToolError.auth(`Auth error (${response.status}): ${errorBody}`);
    if (response.status === 404) throw ToolError.notFound(`Not found: ${operationName} — ${errorBody}`);
    // 400 from GraphQL usually means query validation error
    if (response.status === 400) throw ToolError.validation(`GraphQL validation error: ${errorBody}`);
    throw ToolError.internal(`API error (${response.status}): ${operationName} — ${errorBody}`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    const msg = json.errors.map(e => e.message).join('; ');
    throw ToolError.internal(`GraphQL error: ${msg}`);
  }
  if (!json.data) throw ToolError.internal(`Empty response from ${operationName}`);
  return json.data;
};
