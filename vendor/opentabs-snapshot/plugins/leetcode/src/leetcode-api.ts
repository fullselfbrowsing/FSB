import { type FetchFromPageOptions, ToolError, fetchFromPage, getCookie, waitUntil } from '@opentabs-dev/plugin-sdk';

const GRAPHQL_URL = 'https://leetcode.com/graphql/';

const getCsrfToken = (): string | null => getCookie('csrftoken');

export const isAuthenticated = (): boolean => getCsrfToken() !== null;

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

/**
 * Execute a GraphQL query against the LeetCode API.
 * Auth is via HttpOnly LEETCODE_SESSION cookie (sent automatically with credentials: 'include').
 * Writes require the `x-csrftoken` header from the non-HttpOnly `csrftoken` cookie.
 */
export const graphql = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
  const csrf = getCsrfToken();
  if (!csrf) throw ToolError.auth('Not authenticated — please log in to LeetCode.');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-csrftoken': csrf,
  };

  const init: FetchFromPageOptions = {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  };

  const response = await fetchFromPage(GRAPHQL_URL, init);
  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors?.length && !json.data) {
    const msg = json.errors.map(e => e.message).join('; ');
    throw ToolError.internal(`GraphQL error: ${msg}`);
  }

  return json.data as T;
};

/**
 * Call a REST endpoint on LeetCode (e.g., interpret_solution, submit).
 * Uses the same cookie-based auth as GraphQL.
 */
export const rest = async <T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> => {
  const csrf = getCsrfToken();
  if (!csrf) throw ToolError.auth('Not authenticated — please log in to LeetCode.');

  const url = `https://leetcode.com${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-csrftoken': csrf,
    Referer: 'https://leetcode.com',
  };

  const init: FetchFromPageOptions = {
    method: options.method ?? 'POST',
    headers,
  };

  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetchFromPage(url, init);

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
};

/**
 * Poll a submission check endpoint until it reaches a terminal state.
 */
export const pollSubmissionResult = async <T>(submissionId: string): Promise<T> => {
  const csrf = getCsrfToken();
  if (!csrf) throw ToolError.auth('Not authenticated — please log in to LeetCode.');

  let result: Record<string, unknown> = {};

  await waitUntil(
    async () => {
      const response = await fetchFromPage(`https://leetcode.com/submissions/detail/${submissionId}/check/`, {
        method: 'GET',
        headers: { 'x-csrftoken': csrf },
      });
      result = (await response.json()) as Record<string, unknown>;
      return result.state === 'SUCCESS' || result.state === 'FAILURE';
    },
    { interval: 1000, timeout: 30000 },
  );

  return result as T;
};
