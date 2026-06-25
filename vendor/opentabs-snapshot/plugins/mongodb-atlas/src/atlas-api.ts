import {
  type FetchFromPageOptions,
  ToolError,
  fetchFromPage,
  getAuthCache,
  getMetaContent,
  getPageGlobal,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface AtlasAuth {
  csrfToken: string;
  userId: string;
}

const getAuth = (): AtlasAuth | null => {
  const cached = getAuthCache<AtlasAuth>('mongodb-atlas');
  if (cached) return cached;

  const csrfToken = (getPageGlobal('PARAMS.csrfToken') as string | undefined) ?? getMetaContent('csrf-token');
  const userId = (getPageGlobal('PARAMS.appUser.id') as string | undefined) ?? '';
  if (!csrfToken) return null;

  const auth: AtlasAuth = { csrfToken, userId };
  setAuthCache('mongodb-atlas', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

// --- Context helpers ---

export const getGroupId = (): string => {
  const id = getPageGlobal('PARAMS.currentGroup.id') as string | undefined;
  if (!id) throw ToolError.validation('No project selected — navigate to a project first.');
  return id;
};

export const getOrgId = (): string => {
  const id = getPageGlobal('PARAMS.currentOrganization.id') as string | undefined;
  if (!id) throw ToolError.validation('No organization context — navigate to an organization first.');
  return id;
};

// --- API caller ---

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to MongoDB Atlas.');

  const method = options.method ?? 'GET';

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (method !== 'GET') {
    headers['X-CSRF-Token'] = auth.csrfToken;
  }

  const init: FetchFromPageOptions = { method, headers };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetchFromPage(endpoint, init);

  if (response.status === 204) return {} as T;

  const text = await response.text();
  if (!text || text.trim() === '') return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw ToolError.internal(`Unexpected response from Atlas API: ${text.substring(0, 200)}`);
  }
};
