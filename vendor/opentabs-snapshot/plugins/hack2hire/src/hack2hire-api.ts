import {
  ToolError,
  buildQueryString,
  clearAuthCache,
  fetchFromPage,
  getAuthCache,
  getLocalStorage,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

const API_BASE = 'https://api.hack2hire.com/algro/v1';

interface Hack2HireAuth {
  /** Bearer token used in the Authorization header. */
  token: string;
  /** User ID sent in the x-user-id header alongside every request. */
  userId: string;
}

/**
 * Hack2Hire stores the bearer token in localStorage at `ALGRO_TOKEN` as a
 * JSON-encoded string (so it has surrounding quotes that must be parsed away).
 * The user ID is stored in `USER_ID` the same way.
 */
const readJsonString = (key: string): string | null => {
  const raw = getLocalStorage(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
};

const getAuth = (): Hack2HireAuth | null => {
  const cached = getAuthCache<Hack2HireAuth>('hack2hire');
  if (cached?.token && cached?.userId) return cached;

  const token = readJsonString('ALGRO_TOKEN');
  const userId = readJsonString('USER_ID');
  if (!token || !userId) return null;

  const auth: Hack2HireAuth = { token, userId };
  setAuthCache('hack2hire', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

/**
 * Standard envelope returned by every Hack2Hire endpoint.
 *
 * For paginated list endpoints, the inner `data` is itself an envelope with
 * `data` (the array), `total`, `page`, and `perPage` — see `Hack2HireList`.
 */
interface Hack2HireEnvelope<T> {
  data: T;
  status: { code: number; message: string };
}

export interface Hack2HireList<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * Calls a Hack2Hire endpoint and returns the unwrapped `data` payload.
 *
 * The API is cross-origin from `*.hack2hire.com` and uses bearer tokens, so
 * `credentials: 'omit'` is required — the response sets a specific
 * `access-control-allow-origin` value without `access-control-allow-credentials`,
 * which the browser would otherwise reject when sending cookies.
 */
export const api = async <T>(
  endpoint: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Hack2Hire.');

  const qs = query ? buildQueryString(query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  let response: Response;
  try {
    response = await fetchFromPage(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'x-user-id': auth.userId,
        Accept: 'application/json',
      },
      credentials: 'omit',
    });
  } catch (err: unknown) {
    if (err instanceof ToolError) {
      // 401/403 — drop the cached auth so the next call re-reads localStorage.
      if (err.category === 'auth') clearAuthCache('hack2hire');
      throw err;
    }
    throw ToolError.internal(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const envelope = (await response.json()) as Hack2HireEnvelope<T>;
  return envelope.data;
};
