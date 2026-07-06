import {
  ToolError,
  fetchFromPage,
  getCookie,
  getPageGlobal,
  waitUntil,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
} from '@opentabs-dev/plugin-sdk';
import type { FetchFromPageOptions } from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface AmplitudeAuth {
  orgId: string;
  orgSlug: string;
}

const extractOrgFromUrl = (): { orgId: string; orgSlug: string } | null => {
  // URL pattern: /analytics/{orgSlug}/...
  const match = window.location.pathname.match(/\/(analytics|experiment|data)\/([^/]+)/);
  const orgSlug = match?.[2] ?? '';
  if (!orgSlug) return null;

  // Org ID comes from the JWT payload or intercomSettings
  const intercom = getPageGlobal('intercomSettings') as { org_id?: string } | undefined;
  const orgId = intercom?.org_id ?? '';
  if (!orgId) return null;

  return { orgId, orgSlug };
};

const getAuth = (): AmplitudeAuth | null => {
  const cached = getAuthCache<AmplitudeAuth>('amplitude');
  if (cached?.orgId && cached?.orgSlug) return cached;

  const jwt = getCookie('onenav_jwt_prod');
  if (!jwt) return null;

  const org = extractOrgFromUrl();
  if (!org) return null;

  const auth: AmplitudeAuth = { orgId: org.orgId, orgSlug: org.orgSlug };
  setAuthCache('amplitude', auth);
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

const requireAuth = (): AmplitudeAuth => {
  const auth = getAuth();
  if (!auth) {
    clearAuthCache('amplitude');
    throw ToolError.auth('Not authenticated — please log in to Amplitude.');
  }
  return auth;
};

// --- GraphQL API ---

export const gql = async <T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> => {
  const auth = requireAuth();
  const url = `/t/graphql/org/${auth.orgId}?q=${operationName}`;

  const init: FetchFromPageOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Org': auth.orgId,
    },
    body: JSON.stringify({ query, variables, operationName }),
  };

  const response = await fetchFromPage(url, init);
  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length && !json.data) {
    const msg = json.errors.map(e => e.message).join('; ');
    if (msg.includes('Unauthorized') || msg.includes('not authenticated') || msg.includes('401')) {
      clearAuthCache('amplitude');
      throw ToolError.auth(msg);
    }
    throw ToolError.internal(`GraphQL error: ${msg}`);
  }

  return json.data as T;
};
