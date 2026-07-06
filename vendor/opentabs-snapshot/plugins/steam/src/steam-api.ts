import {
  ToolError,
  buildQueryString,
  fetchJSON,
  getAuthCache,
  getCookie,
  getPageGlobal,
  postForm,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface SteamAuth {
  sessionId: string;
  accountId: number;
  steamId64: string;
}

const getAuth = (): SteamAuth | null => {
  const cached = getAuthCache<SteamAuth>('steam');
  if (cached) return cached;

  const sessionId = (getPageGlobal('g_sessionID') as string | undefined) ?? getCookie('sessionid');
  const accountId = getPageGlobal('g_AccountID') as number | undefined;

  if (!sessionId || !accountId || accountId === 0) return null;

  const steamId64 = (BigInt(accountId) + BigInt('76561197960265728')).toString();
  const auth: SteamAuth = { sessionId, accountId, steamId64 };
  setAuthCache('steam', auth);
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

export const getSessionId = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Steam.');
  return auth.sessionId;
};

export const getSteamId64 = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Steam.');
  return auth.steamId64;
};

export const getAccountId = (): number => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Steam.');
  return auth.accountId;
};

// --- API helpers ---

const STORE_BASE = 'https://store.steampowered.com';

/**
 * GET a JSON endpoint on the Steam store. Includes session cookies automatically.
 */
export const storeGet = async <T>(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> => {
  const qs = query ? buildQueryString(query) : '';
  const url = qs ? `${STORE_BASE}${path}?${qs}` : `${STORE_BASE}${path}`;
  const data = await fetchJSON<T>(url);
  return data as T;
};

/**
 * POST to a Steam store endpoint with form-encoded body.
 * Automatically includes the session ID for CSRF protection.
 */
export const storePost = async <T>(path: string, body: Record<string, string | number | boolean>): Promise<T> => {
  const sessionId = getSessionId();
  const url = `${STORE_BASE}${path}`;
  const data = await postForm<T>(url, { sessionid: sessionId, ...body });
  return data as T;
};
