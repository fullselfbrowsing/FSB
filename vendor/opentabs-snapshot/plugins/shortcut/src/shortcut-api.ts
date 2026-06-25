import {
  type FetchFromPageOptions,
  ToolError,
  buildQueryString,
  clearAuthCache,
  fetchFromPage,
  fetchJSON,
  getAuthCache,
  getCurrentUrl,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth: session cookies + tenant headers ---

interface ShortcutAuth {
  workspaceId: string;
  organizationId: string;
  slug: string;
}

const getAuth = (): ShortcutAuth | null => {
  const cached = getAuthCache<ShortcutAuth>('shortcut');
  if (cached) return cached;

  const url = getCurrentUrl();
  const slug = url.match(/app\.shortcut\.com\/([^/]+)/)?.[1];
  if (!slug || slug === 'signup' || slug === 'login') return null;

  return null;
};

/**
 * Bootstrap auth by resolving the workspace slug to IDs via the slug-info endpoint.
 * Called from isReady() and cached for subsequent API calls.
 */
const bootstrapAuth = async (): Promise<boolean> => {
  const cached = getAuthCache<ShortcutAuth>('shortcut');
  if (cached) return true;

  const url = getCurrentUrl();
  const slug = url.match(/app\.shortcut\.com\/([^/]+)/)?.[1];
  if (!slug || slug === 'signup' || slug === 'login') return false;

  try {
    const data = await fetchJSON<{ id?: string; organization2?: { id?: string } }>(
      `/backend/api/private/user/slug-info/${slug}`,
    );
    const workspaceId = data?.id;
    const organizationId = data?.organization2?.id;
    if (!workspaceId || !organizationId) return false;

    setAuthCache('shortcut', { workspaceId, organizationId, slug });
    return true;
  } catch {
    return false;
  }
};

export const isShortcutAuthenticated = (): boolean => getAuth() !== null;

export const waitForShortcutAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => bootstrapAuth(), { interval: 500, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

// --- API caller ---

const tenantHeaders = (): Record<string, string> => {
  const auth = getAuthCache<ShortcutAuth>('shortcut');
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Shortcut.');
  return {
    'Content-Type': 'application/json',
    'Tenant-Organization2': auth.organizationId,
    'Tenant-Workspace2': auth.workspaceId,
  };
};

/**
 * Call a Shortcut v3 API endpoint (documented public API, same-origin with session cookies).
 * Base path: /backend/api/v3
 */
export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const headers = tenantHeaders();
  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `/backend/api/v3${endpoint}?${qs}` : `/backend/api/v3${endpoint}`;
  const method = options.method ?? 'GET';

  const init: FetchFromPageOptions = { method, headers };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  try {
    if (method === 'DELETE') {
      const response = await fetchFromPage(url, init);
      if (response.status === 204) return {} as T;
      return (await response.json()) as T;
    }
    return (await fetchJSON<T>(url, init)) as T;
  } catch (e) {
    if (e instanceof ToolError && (e.code === 'AUTH_ERROR' || e.code === 'FORBIDDEN')) {
      clearAuthCache('shortcut');
    }
    throw e;
  }
};
