import {
  ToolError,
  fetchFromPage,
  getCookie,
  clearAuthCache,
  getAuthCache,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';
import type { FetchFromPageOptions } from '@opentabs-dev/plugin-sdk';

const PORTFOLIO_GRAPHQL_URL = '/ftgw/digital/portfolio/api/graphql?ref_at=portsum';

interface FidelityAuth {
  authenticated: boolean;
}

const getAuth = (): FidelityAuth | null => {
  const cached = getAuthCache<FidelityAuth>('fidelity');
  if (cached) return cached;

  const hasSession = !!getCookie('SC') || !!getCookie('MC') || !!getCookie('ATT');
  if (!hasSession) return null;

  const auth: FidelityAuth = { authenticated: true };
  setAuthCache('fidelity', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), {
      interval: 500,
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
};

const requireAuth = (): void => {
  if (!isAuthenticated()) {
    clearAuthCache('fidelity');
    throw ToolError.auth('Not authenticated — please log in to Fidelity.');
  }
};

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

const executeGraphql = async <T>(
  url: string,
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<T> => {
  requireAuth();

  const response = await fetchFromPage(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: '*/*',
      ...extraHeaders,
    },
    body: JSON.stringify({ operationName, query, variables }),
  });

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors?.length) {
    const msg = result.errors[0]?.message ?? 'Unknown GraphQL error';
    if (msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('unauthenticated')) {
      clearAuthCache('fidelity');
      throw ToolError.auth(msg);
    }
    throw ToolError.internal(msg);
  }

  if (!result.data) {
    throw ToolError.internal('No data in GraphQL response');
  }

  return result.data;
};

export const portfolioGraphql = async <T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> =>
  executeGraphql<T>(PORTFOLIO_GRAPHQL_URL, operationName, query, variables, {
    'apollographql-client-version': '0.0.0',
  });

export const fidelityRest = async <T>(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<T> => {
  requireAuth();

  const init: FetchFromPageOptions = {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  };

  if (options.body) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetchFromPage(url, init);
  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
};
