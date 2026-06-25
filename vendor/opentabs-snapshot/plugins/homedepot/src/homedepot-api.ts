import {
  type FetchFromPageOptions,
  ToolError,
  buildQueryString,
  fetchJSON,
  getCookie,
  getAuthCache,
  getPageGlobal,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface HdAuth {
  /** Raw value of the THD_CUSTOMER cookie — used as x-thd-customer-token header */
  customerToken: string;
  /** Decoded user/session ID from the token payload */
  userId: string;
  /** Store ID for the user's local store */
  storeId: string;
}

/** Decode the THD_CUSTOMER cookie payload to extract userId */
const decodeCustomerToken = (raw: string): { userId?: string } => {
  try {
    const parts = raw.split('.');
    const payload = parts[0];
    if (!payload) return {};
    const decoded = atob(payload);
    const json = JSON.parse(decoded) as { u?: string };
    return { userId: json.u };
  } catch {
    return {};
  }
};

/** Read store and delivery info from the experience context page global */
const getContext = () => {
  const ctx = getPageGlobal('__EXPERIENCE_CONTEXT__') as
    | { store?: { storeId?: string }; deliveryZip?: string }
    | undefined;
  return {
    storeId: ctx?.store?.storeId ?? '6672',
  };
};

const getAuth = (): HdAuth | null => {
  const cached = getAuthCache<HdAuth>('homedepot');
  if (cached) return cached;

  const customerToken = getCookie('THD_CUSTOMER');
  if (!customerToken) return null;

  const { userId } = decodeCustomerToken(customerToken);
  if (!userId) return null;

  const auth: HdAuth = {
    customerToken,
    userId,
    storeId: getContext().storeId,
  };

  setAuthCache('homedepot', auth);
  return auth;
};

export const isAuthenticated = (): boolean => {
  const customerToken = getCookie('THD_CUSTOMER');
  if (!customerToken) return false;
  const { userId } = decodeCustomerToken(customerToken);
  return Boolean(userId);
};

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

// ---------------------------------------------------------------------------
// GraphQL API
// ---------------------------------------------------------------------------

const GRAPHQL_URL = 'https://apionline.homedepot.com/federation-gateway/graphql';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: { classification?: string; id?: number };
  }>;
}

/** Call the Home Depot federation GraphQL endpoint */
export const gql = async <T>(
  opname: string,
  query: string,
  variables: Record<string, unknown> = {},
  experienceName = 'general-merchandise',
): Promise<T> => {
  const auth = getAuth();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: '*/*',
    'x-experience-name': experienceName,
    'x-hd-dc': 'origin',
    'x-debug': 'false',
    'x-current-url': window.location.pathname,
    'X-Api-Cookies': JSON.stringify({
      'x-user-id': auth?.userId ?? '',
    }),
  };

  if (auth) {
    headers['x-thd-customer-token'] = auth.customerToken;
  }

  const fullUrl = `${GRAPHQL_URL}?${buildQueryString({ opname })}`;

  const init: FetchFromPageOptions = {
    method: 'POST',
    headers,
    body: JSON.stringify({ operationName: opname, variables, query }),
  };

  const result = (await fetchJSON<GraphQLResponse<T>>(fullUrl, init)) ?? ({} as GraphQLResponse<T>);

  if (result.errors && result.errors.length > 0 && !result.data) {
    const firstError = result.errors[0];
    const msg = firstError?.message ?? 'GraphQL error';
    const classification = firstError?.extensions?.classification;
    const statusCode = firstError?.extensions?.id;

    if (statusCode === 401 || classification === 'UnauthorizedException') {
      throw ToolError.auth(`Not authenticated — please sign in to homedepot.com. (${msg})`);
    }
    if (statusCode === 404) throw ToolError.notFound(msg);
    if (statusCode === 429) throw ToolError.rateLimited(msg);
    throw ToolError.internal(msg);
  }

  if (!result.data) throw ToolError.internal('Empty response from Home Depot API');
  return result.data;
};

// ---------------------------------------------------------------------------
// Cart REST API
// ---------------------------------------------------------------------------

/** Add items to cart via the REST API at /mcc-cart/v2/Cart/ */
export const addToCartRest = async (body: unknown): Promise<unknown> => {
  return fetchJSON('/mcc-cart/v2/Cart/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

// ---------------------------------------------------------------------------
// Store context helpers
// ---------------------------------------------------------------------------

/** Get the user's currently selected store ID (from auth cache or page context) */
export const getStoreId = (): string => {
  const auth = getAuth();
  if (auth) return auth.storeId;
  return getContext().storeId;
};
