import {
  ToolError,
  fetchJSON,
  fetchFromPage,
  buildQueryString,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  getSessionStorage,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';
import type { FetchFromPageOptions } from '@opentabs-dev/plugin-sdk';

// Azure ARM API base URL
const ARM_BASE = 'https://management.azure.com';
// --- Auth token extraction ---

interface AzureAuth {
  armToken: string;
}

/**
 * Extract an access token from MSAL sessionStorage entries matching a scope fragment.
 * Azure Portal stores MSAL tokens as JSON objects in sessionStorage
 * with keys containing 'accesstoken' and the resource scope.
 */
const findMsalToken = (scopeFragment: string): string | null => {
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key || !key.includes('accesstoken') || !key.includes(scopeFragment)) {
      continue;
    }
    try {
      const raw = getSessionStorage(key);
      if (!raw) continue;
      const entry = JSON.parse(raw) as { secret?: string; expiresOn?: string };
      if (entry.secret && Number.parseInt(entry.expiresOn ?? '0', 10) > Date.now() / 1000) {
        return entry.secret;
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null;
};

const getAuth = (): AzureAuth | null => {
  // Check persisted cache first (survives adapter re-injection)
  const cached = getAuthCache<AzureAuth>('azure');
  if (cached?.armToken) {
    // Verify cached ARM token is not expired by checking MSAL source
    const freshArm = findMsalToken('management.core.windows.net');
    if (freshArm) {
      if (freshArm !== cached.armToken) {
        // Token was refreshed — update cache
        const auth: AzureAuth = { armToken: freshArm };
        setAuthCache('azure', auth);
        return auth;
      }
      return cached;
    }
    // Cached token may be stale, clear and re-extract
    clearAuthCache('azure');
  }

  // Extract ARM token from MSAL sessionStorage
  const armToken = findMsalToken('management.core.windows.net');
  if (!armToken) return null;

  const auth: AzureAuth = { armToken };
  setAuthCache('azure', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 8000 });
    return true;
  } catch {
    return false;
  }
};

// --- ARM API caller ---

export const armApi = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
    apiVersion?: string;
  } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Azure Portal.');

  const method = options.method ?? 'GET';
  const query = { ...options.query, 'api-version': options.apiVersion ?? '2022-12-01' };
  const qs = buildQueryString(query);
  const url = `${ARM_BASE}${endpoint}?${qs}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.armToken}`,
  };

  // ARM is cross-origin — use credentials:'omit' to avoid CORS preflight failures
  const init: FetchFromPageOptions = { method, headers, credentials: 'omit' };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const data = await fetchJSON<T>(url, init);
  return data as T;
};

// --- ARM DELETE helper (returns void for 200/202/204) ---

export const armDelete = async (
  endpoint: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    apiVersion?: string;
  } = {},
): Promise<void> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Azure Portal.');

  const query = { ...options.query, 'api-version': options.apiVersion ?? '2022-12-01' };
  const qs = buildQueryString(query);
  const url = `${ARM_BASE}${endpoint}?${qs}`;

  await fetchFromPage(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${auth.armToken}` },
    credentials: 'omit',
  });
};
