import { ToolError, fetchFromPage, getCookie, waitUntil } from '@opentabs-dev/plugin-sdk';

/**
 * Coinbase uses HttpOnly session cookies for authentication and a same-origin
 * GraphQL endpoint at `/graphql/query`. Introspection is disabled but inline
 * queries are accepted via POST. Auth detection relies on the `logged_in`
 * non-HttpOnly cookie that Coinbase sets alongside the session.
 */

// ---------------------------------------------------------------------------
// Auth detection
// ---------------------------------------------------------------------------

export const isAuthenticated = (): boolean => getCookie('logged_in') === 'true';

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// GraphQL caller
// ---------------------------------------------------------------------------

const GQL_ENDPOINT = '/graphql/query';

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'CB-CLIENT': 'CoinbaseWeb',
  'cb-version': '2021-01-11',
  'X-CB-Platform': 'web',
  'X-CB-Project-Name': 'consumer',
};

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/**
 * Execute a GraphQL query or mutation against the Coinbase same-origin endpoint.
 * Uses HttpOnly session cookies automatically via `credentials: 'include'`.
 */
export const gql = async <T>(
  query: string,
  variables: Record<string, unknown> = {},
  operationName?: string,
): Promise<T> => {
  if (!isAuthenticated()) {
    throw ToolError.auth('Not authenticated — please log in to Coinbase.');
  }

  const response = await fetchFromPage(GQL_ENDPOINT, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query, variables, operationName }),
  });

  const json = (await response.json()) as GraphQLResponse<T>;

  const firstError = json.errors?.[0];
  if (firstError) {
    const first = firstError;
    const code = first.extensions?.code ?? '';
    const msg = first.message;

    if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') {
      throw ToolError.auth(msg);
    }
    if (code === 'NOT_FOUND') {
      throw ToolError.notFound(msg);
    }
    if (code === 'RATE_LIMITED') {
      throw ToolError.rateLimited(msg);
    }
    if (code === 'VALIDATION_FAILED' || code === 'BAD_USER_INPUT') {
      throw ToolError.validation(msg);
    }
    // If we got partial data alongside errors, return the data
    if (json.data) {
      return json.data;
    }
    throw ToolError.internal(`GraphQL error: ${msg}`);
  }

  if (!json.data) {
    throw ToolError.internal('GraphQL response contained no data.');
  }

  return json.data;
};
