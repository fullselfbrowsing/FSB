import { ToolError, getCookie, parseRetryAfterMs, waitUntil } from '@opentabs-dev/plugin-sdk';

const API_BASE = 'https://www.airbnb.com';
const API_KEY = 'd306zoyjsyarp7ifhu67rjxn52tv0t20';

/** Persisted query hashes discovered from the Airbnb web client */
export const QUERY_HASHES = {
  Header: 'bb590cf8c21b62e4b5122e1cd19969f1f1df72832040a335fd45af52597440e4',
  GetThumbnailPicQuery: 'c580fd640ccff52e5410e321af202495da29d3438f16fb78ca4ca129119563e7',
  IsHostQuery: '9c7b90a451bf2e27619bd48bdc0ef878f34121a07358db917978368dd4e162a7',
  WishlistIndexPageQuery: 'b8b421d802c399b55fb6ac1111014807a454184ad38f198365beb7836c018c18',
  WishlistItemsAsyncQuery: 'c0f9d9474bb20eb7af2f94f8e022750a5ed9b7437613e1d9aa91aadea87e4467',
  AutoSuggestionsQuery: '840ae28ff24af2a4729bd74fb5b98eadcd3412e3a28fea5c9ae18e5a216e6aca',
  ViaductInboxData: 'c7df4bccc0bbd009ed779a8567f1fddbd30491e3927edcc64331fe9b855dfa57',
  ViaductGetThreadAndDataQuery: 'dcb6744db9acb399e8da07cc518b8004d618a5bd96371e40820b034a40dae35f',
  FetchInboxFiltersConfig: '5c1689bbbba34a5d01635a50d4a57827d840985612adcd7be7a3dbb6e7ede536',
  MapViewportInfoQuery: 'aae2b4447f90adfd800a006f1afc80e2df9f98ddc8cd932628da179ebae10c79',
  AddWishlistItemMutation: '3f124e56e14e759117c7320c93d217f2836ea865215d675bd2c6274cce237b86',
  BatchDeleteWishlistItemsByWishlistItemIdMutation: '702b75cc68c3cf609a148a7a005d983e803701b43cd56c7fc274d07d0e3bbd90',
} as const;

interface UserAttributes {
  id: number;
  id_str: string;
  curr: string;
  is_admin: boolean;
}

/** Parse the _user_attributes cookie to get basic user info */
const getUserAttributes = (): UserAttributes | null => {
  const raw = getCookie('_user_attributes');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserAttributes;
  } catch {
    return null;
  }
};

/** Check if the user is authenticated via the _user_attributes cookie */
export const isAuthenticated = (): boolean => getUserAttributes() !== null;

/** Poll for authentication state with a timeout */
export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

/** Get the current user ID from cookies */
export const getCurrentUserId = (): string | null => {
  const attrs = getUserAttributes();
  return attrs?.id_str ?? null;
};

/** Get the current user's currency preference */
export const getCurrentCurrency = (): string => {
  const attrs = getUserAttributes();
  return attrs?.curr ?? 'USD';
};

/** Standard headers for all Airbnb API requests */
const getHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  'X-Airbnb-API-Key': API_KEY,
  'X-Airbnb-GraphQL-Platform': 'web',
  'X-Airbnb-GraphQL-Platform-Client': 'minimalist-niobe',
  'X-Airbnb-Supports-Airlock-V2': 'true',
  'X-CSRF-Without-Token': '1',
});

/** Execute a persisted GraphQL query against the Airbnb v3 API */
export const graphql = async <T>(
  operationName: string,
  hash: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  if (!isAuthenticated()) throw ToolError.auth('Not authenticated — please log in to Airbnb.');

  const currency = getCurrentCurrency();
  const params = new URLSearchParams({
    operationName,
    locale: 'en',
    currency,
  });
  if (variables) params.set('variables', JSON.stringify(variables));
  params.set('extensions', JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }));

  const url = `${API_BASE}/api/v3/${operationName}/${hash}?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
      credentials: 'include',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`Timed out: ${operationName}`);
    throw new ToolError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'network_error', {
      category: 'internal',
      retryable: true,
    });
  }

  if (!response.ok) {
    const body = (await response.text().catch(() => '')).substring(0, 512);
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw ToolError.rateLimited(
        `Rate limited: ${operationName}`,
        retryAfter ? parseRetryAfterMs(retryAfter) : undefined,
      );
    }
    if (response.status === 401 || response.status === 403)
      throw ToolError.auth(`Auth error (${response.status}): ${body}`);
    if (response.status === 404) throw ToolError.notFound(`Not found: ${operationName}`);
    if (response.status === 400) {
      if (body.includes('persisted_query_not_found'))
        throw ToolError.internal(
          `Persisted query hash expired for ${operationName}. Airbnb may have deployed a new client version.`,
        );
      throw ToolError.validation(`Bad request: ${body}`);
    }
    throw ToolError.internal(`API error (${response.status}): ${operationName} — ${body}`);
  }

  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors?.length) {
    const errorMsg = json.errors.map(e => e.message).join('; ');
    throw ToolError.internal(`GraphQL error in ${operationName}: ${errorMsg}`);
  }

  if (!json.data) throw ToolError.internal(`No data returned from ${operationName}`);

  return json.data;
};

/** Execute a persisted GraphQL mutation (POST) against the Airbnb v3 API */
export const graphqlMutation = async <T>(
  operationName: string,
  hash: string,
  variables: Record<string, unknown>,
): Promise<T> => {
  if (!isAuthenticated()) throw ToolError.auth('Not authenticated — please log in to Airbnb.');

  const currency = getCurrentCurrency();
  const params = new URLSearchParams({
    operationName,
    locale: 'en',
    currency,
  });

  const url = `${API_BASE}/api/v3/${operationName}/${hash}?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        operationName,
        variables,
        extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
      }),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`Timed out: ${operationName}`);
    throw new ToolError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'network_error', {
      category: 'internal',
      retryable: true,
    });
  }

  if (!response.ok) {
    const body = (await response.text().catch(() => '')).substring(0, 512);
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw ToolError.rateLimited(
        `Rate limited: ${operationName}`,
        retryAfter ? parseRetryAfterMs(retryAfter) : undefined,
      );
    }
    if (response.status === 401 || response.status === 403)
      throw ToolError.auth(`Auth error (${response.status}): ${body}`);
    if (response.status === 400) {
      if (body.includes('persisted_query_not_found'))
        throw ToolError.internal(
          `Persisted query hash expired for ${operationName}. Airbnb may have deployed a new client version.`,
        );
      throw ToolError.validation(`Bad request: ${body}`);
    }
    throw ToolError.internal(`API error (${response.status}): ${operationName} — ${body}`);
  }

  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors?.length) {
    const errorMsg = json.errors.map(e => e.message).join('; ');
    throw ToolError.internal(`GraphQL error in ${operationName}: ${errorMsg}`);
  }

  if (!json.data) throw ToolError.internal(`No data returned from ${operationName}`);

  return json.data;
};

/** Parse SSR-injected data from the page's deferred state or injector instances */
export const getPageData = (): Record<string, unknown> | null => {
  const deferredEl = document.getElementById('data-deferred-state-0');
  if (deferredEl?.textContent) {
    try {
      return JSON.parse(deferredEl.textContent) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const injectorEl = document.getElementById('data-injector-instances');
  if (injectorEl?.textContent) {
    try {
      return JSON.parse(injectorEl.textContent) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
};
