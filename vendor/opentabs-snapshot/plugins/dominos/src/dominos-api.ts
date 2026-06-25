import { ToolError, getCookie, parseRetryAfterMs, waitUntil } from '@opentabs-dev/plugin-sdk';

const GQL_ENDPOINT = '/api/web-bff/graphql';

/**
 * Decode the base64-encoded `userProfile` cookie to check login state.
 * Returns null when not logged in.
 */
const getUserProfile = (): { firstName: string; email: string } | null => {
  try {
    const encoded = getCookie('userProfile');
    if (!encoded) return null;
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
};

export const isAuthenticated = (): boolean => getUserProfile() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

// ---------------------------------------------------------------------------
// Frontend cart state — read from the site's own cookies
// ---------------------------------------------------------------------------

/**
 * Read the active cart and store IDs from the Domino's frontend cookies.
 * The site's XState cart machine writes `cartId` and `storeId` cookies
 * when the user selects a store through the UI. Tools that modify the cart
 * should use these IDs to operate on the same cart the browser is displaying.
 *
 * Returns null if no store has been selected yet.
 */
const getActiveCart = (): {
  cartId: string;
  storeId: string;
} | null => {
  const cartId = getCookie('cartId');
  const storeId = getCookie('storeId');
  if (!cartId || !storeId) return null;
  return { cartId, storeId };
};

/**
 * Resolve the active cart and store IDs, or throw a clear error telling
 * the user to create a cart first. Reads from the frontend's own cookies
 * so that API mutations operate on the same cart the browser is displaying.
 */
export const requireActiveCart = (): { cartId: string; storeId: string } => {
  const cart = getActiveCart();
  if (!cart) {
    throw ToolError.validation(
      "No active cart — call create_cart with a store ID first, or select a store on the Domino's website.",
    );
  }
  return cart;
};

/**
 * Set the cookies that the Domino's frontend reads to recognize an active cart.
 * This allows carts created via the API to be fully visible in the browser UI
 * without the user going through the store selection flow manually.
 */
export const setFrontendCartCookies = (
  cartId: string,
  storeId: string,
  serviceMethod: string,
  cartInput: Record<string, unknown>,
): void => {
  const set = (name: string, value: string) => {
    // biome-ignore lint/suspicious/noDocumentCookie: required to sync adapter-created carts with the Domino's frontend
    document.cookie = `${name}=${value}; path=/; domain=.dominos.com`;
  };
  set('cartId', cartId);
  set('storeId', storeId);
  set('serviceMethod', serviceMethod);
  set('dispatchType', serviceMethod);
  set('has_new_order', 'true');
  set('cartVariables', encodeURIComponent(JSON.stringify({ cart: cartInput })));
};

// ---------------------------------------------------------------------------
// GraphQL client
// ---------------------------------------------------------------------------

/**
 * Execute a GraphQL operation against the Domino's BFF endpoint.
 * Auth is cookie-based — `credentials: 'include'` sends session cookies automatically.
 * The `x-dpz-api` header is required and must match the GraphQL operation name.
 */
export const gql = async <T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> => {
  if (!isAuthenticated()) {
    throw ToolError.auth("Not authenticated — please log in to Domino's.");
  }

  let response: Response;
  try {
    response = await fetch(GQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dpz-api': operationName,
      },
      credentials: 'include',
      body: JSON.stringify({ operationName, variables, query }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw ToolError.timeout(`Timed out: ${operationName}`);
    }
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
    if (response.status === 401 || response.status === 403) {
      throw ToolError.auth(`Auth error (${response.status}): ${body}`);
    }
    if (response.status === 404) {
      throw ToolError.notFound(`Not found: ${operationName}`);
    }
    throw ToolError.internal(`API error (${response.status}): ${operationName} — ${body}`);
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };

  if (json.errors?.length && !json.data) {
    const msg = json.errors[0]?.message ?? 'Unknown error';
    const code = json.errors[0]?.extensions?.code ?? '';
    if (code === 'unauthorized' || code === 'forbidden') {
      throw ToolError.auth(`Auth error: ${msg}`);
    }
    if (code === 'not.found') {
      throw ToolError.notFound(msg);
    }
    if (code === 'bad.request') {
      throw ToolError.validation(`Validation error: ${msg}`);
    }
    throw ToolError.internal(`GraphQL error (${operationName}): ${msg}`);
  }

  return json.data as T;
};

// ---------------------------------------------------------------------------
// Frontend cart sync — broadcast via BroadcastChannel
// ---------------------------------------------------------------------------

/**
 * Broadcast a SYNC_CART event on the cart_channel BroadcastChannel.
 * The Domino's frontend uses XState state machines communicating via BroadcastChannel.
 * After cart-modifying API calls, broadcasting SYNC_CART tells the cart MFE to re-read
 * the cart from the backend, keeping the browser UI in sync with API changes.
 */
export const syncCartUI = (): void => {
  try {
    const cartChannel = new BroadcastChannel('cart_channel');
    cartChannel.postMessage({ type: 'SYNC_CART' });
    cartChannel.postMessage({
      type: 'UPDATE_CART_SUCCESS',
      data: { inMyDealsAndRewards: false, inCartUpdate: false },
    });
    cartChannel.close();
  } catch {
    // BroadcastChannel may not be available in all contexts
  }
};
