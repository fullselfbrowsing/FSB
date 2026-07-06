import {
  ToolError,
  fetchFromPage,
  getPageGlobal,
  waitUntil,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---
// Medium uses HttpOnly session cookies for API auth and an XSRF token
// from __PRELOADED_STATE__.session.xsrf for mutations. The viewer query
// returning a non-null id confirms the user is logged in.

interface MediumAuth {
  viewerId: string;
  xsrf: string;
}

const getAuth = (): MediumAuth | null => {
  const cached = getAuthCache<MediumAuth>('medium');
  if (cached) return cached;

  const xsrf = getPageGlobal('__PRELOADED_STATE__.session.xsrf') as string | undefined;
  if (!xsrf) return null;

  // Extract viewer ID from Apollo state. The ROOT_QUERY.viewer is an Apollo
  // cache reference like { __ref: "User:c278fc735f33" } — extract the ID from it.
  const apolloState = getPageGlobal('__APOLLO_STATE__') as Record<string, unknown> | undefined;
  if (!apolloState) return null;

  const rootQuery = apolloState.ROOT_QUERY as Record<string, unknown> | undefined;
  const viewer = rootQuery?.viewer as { __ref?: string; id?: string } | undefined;
  if (!viewer) return null;

  let viewerId: string | undefined;
  if (viewer.__ref) {
    // Apollo cache reference: "User:c278fc735f33" → extract "c278fc735f33"
    const match = viewer.__ref.match(/^User:(.+)$/);
    viewerId = match?.[1];
  } else {
    viewerId = viewer.id;
  }
  if (!viewerId) return null;

  const auth: MediumAuth = { viewerId, xsrf };
  setAuthCache('medium', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

export const getViewerId = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Medium.');
  return auth.viewerId;
};

// --- GraphQL API ---

const GRAPHQL_URL = '/_/graphql';

export const gql = async <T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
  isMutation = false,
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Medium.');

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'graphql-operation': operationName,
  };

  // XSRF token is required for mutations
  if (isMutation) {
    headers['x-xsrf-token'] = auth.xsrf;
  }

  let response: Response;
  try {
    response = await fetchFromPage(GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ operationName, variables, query }]),
    });
  } catch (err: unknown) {
    // fetchFromPage already maps HTTP errors to ToolError — re-throw
    if (err instanceof ToolError) {
      // On 401/403 clear auth cache so it re-reads fresh on next call
      if (err.category === 'auth') clearAuthCache('medium');
      throw err;
    }
    throw ToolError.internal(`GraphQL request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const body = (await response.json()) as Array<{ data?: T; errors?: Array<{ message: string }> }>;
  const result = body[0];

  if (result?.errors?.length) {
    const msg = result.errors.map(e => e.message).join('; ');
    throw ToolError.internal(`GraphQL error (${operationName}): ${msg}`);
  }

  if (!result?.data) {
    throw ToolError.internal(`GraphQL returned no data for ${operationName}`);
  }

  return result.data;
};
