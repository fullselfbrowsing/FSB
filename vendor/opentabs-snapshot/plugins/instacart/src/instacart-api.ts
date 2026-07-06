import {
  type FetchFromPageOptions,
  ToolError,
  fetchJSON,
  getPageGlobal,
  log,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Persisted Query Hash Resolution ---
// Instacart uses Apollo Client with server-side persisted queries. Each GraphQL operation
// is identified by a sha256 hash that changes on every app deployment. The hashes are
// loaded in webpack module 47096 as a JSON map of operationName → hash.
//
// We extract hashes at runtime from the webpack chunk to survive deployments. If the
// extraction fails (page structure changed), we fall back to a hardcoded snapshot.

interface WebpackChunkEntry {
  0: unknown;
  1: Record<string, (module: { exports: unknown }) => void>;
}

const HASH_MODULE_ID = '47096';

let cachedHashMap: Record<string, string> | null = null;

const extractHashMap = (): Record<string, string> | null => {
  if (cachedHashMap) return cachedHashMap;

  const chunks = getPageGlobal('webpackChunk') as WebpackChunkEntry[] | undefined;
  if (!chunks) return null;

  for (const chunk of chunks) {
    const modules = chunk[1];
    if (!modules?.[HASH_MODULE_ID]) continue;

    const fakeModule: { exports: unknown } = { exports: null };
    try {
      modules[HASH_MODULE_ID]?.(fakeModule);
      if (fakeModule.exports && typeof fakeModule.exports === 'object') {
        cachedHashMap = fakeModule.exports as Record<string, string>;
        return cachedHashMap;
      }
    } catch {
      log.warn('Failed to extract Instacart operation hash map from webpack module');
    }
  }

  return null;
};

// Fallback hashes captured from the live site. Used when webpack extraction fails.
// Only includes operations actively used by plugin tools.
const FALLBACK_HASHES: Record<string, string> = {
  CurrentUser: '4dadd77c2be35e01a3e199e04f3ece27c9beedadb6495b87c7c814c5c176e05c',
  PersonalActiveCarts: 'eac9d17bd45b099fbbdabca2e111acaf2a4fa486f2ce5bc4e8acbab2f31fd8c0',
  CartData: 'febb10bfcc2ba31eec79ad3f2bd7ef1e1a7d2d893b4f212ff438188bb5c1d359',
  UpdateCartItemsMutation: '7c2c63093a07a61b056c09be23eba6f5790059dca8179f7af7580c0456b1049f',
  DeleteCart: 'e1096ffd6928f46e0593cbfc664c18ffe72cec71da9baa158d51fb05136fe065',
  UserAddresses: '22e6dfa5cb0c9e731bfb696f34f573c1c2e31b8191e96c2b14329c33400a0ddc',
  CrossRetailerSearchAutosuggestions: '89ec32ea85c9b7ea89f7b4a071a5dd4ec1335831ff67035a0f92376725c306a3',
  Items: '5116339819ff07f207fd38f949a8a7f58e52cc62223b535405b087e3076ebf2f',
  OrderDeliveriesConnection: '3a607c6dd2f24ed259549a32fb83378178ad88625db1a25b8377e7ab14fdfcd1',
  OrderDelivery: '3ed4c3e0648822a69f64512ff389c068053f32310edb0f790479a83d6c00b663',
};

const getOperationHash = (operationName: string): string => {
  const hashMap = extractHashMap();
  const hash = hashMap?.[operationName] ?? FALLBACK_HASHES[operationName];
  if (!hash) {
    throw ToolError.internal(
      `Unknown GraphQL operation "${operationName}". Instacart may have deployed a new client version.`,
    );
  }
  return hash;
};

// --- Auth detection ---
// Instacart uses HttpOnly session cookies (__Host-instacart_sid). Auth state is detected
// by reading the Apollo Client cache for a loaded CurrentUser with a non-guest session.

interface ApolloClient {
  cache?: {
    extract?: () => Record<string, unknown>;
  };
}

export const isAuthenticated = (): boolean => {
  const client = getPageGlobal('__APOLLO_CLIENT__') as ApolloClient | undefined;
  if (!client?.cache?.extract) return false;

  const cache = client.cache.extract() as Record<string, unknown>;
  // SharedCurrentUser is loaded on every page — check if user is non-guest
  const sharedUser = cache.SharedCurrentUser as
    | Record<string, { currentUser?: { guest?: boolean; id?: string } }>
    | undefined;
  if (!sharedUser) return false;

  const entry = sharedUser['{}'];
  return !!entry?.currentUser?.id && entry.currentUser.guest === false;
};

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

// --- User location context ---
// Many queries require zoneId, postalCode, and retailerIds. These are extracted from the
// Apollo cache entry for GetLastUserLocation.

export interface LocationContext {
  zoneId: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  retailerIds: string[];
}

export const getLocationContext = (): LocationContext | null => {
  const client = getPageGlobal('__APOLLO_CLIENT__') as ApolloClient | undefined;
  if (!client?.cache?.extract) return null;

  const cache = client.cache.extract() as Record<string, unknown>;
  const locEntry = cache.GetLastUserLocation as
    | Record<
        string,
        {
          lastUserLocation?: {
            zoneId?: string;
            postalCode?: string;
            coordinates?: { latitude?: number; longitude?: number };
          };
        }
      >
    | undefined;

  const loc = locEntry?.['{}']?.lastUserLocation;
  if (!loc?.zoneId || !loc?.postalCode) return null;

  // Extract available retailer IDs from the CrossRetailerBlankStateSuggestions cache entry.
  // The app pre-fetches this with the full list of retailer IDs for the user's zone.
  let retailerIds: string[] = [];
  const blankState = cache.CrossRetailerBlankStateSuggestions as Record<string, unknown> | undefined;
  if (blankState) {
    const firstKey = Object.keys(blankState)[0];
    if (firstKey) {
      try {
        const vars = JSON.parse(firstKey) as { retailerIds?: string[] };
        retailerIds = vars.retailerIds ?? [];
      } catch {
        // Ignore parse errors
      }
    }
  }

  return {
    zoneId: loc.zoneId,
    postalCode: loc.postalCode,
    latitude: loc.coordinates?.latitude ?? 0,
    longitude: loc.coordinates?.longitude ?? 0,
    retailerIds,
  };
};

// --- GraphQL API ---

const GQL_ENDPOINT = '/graphql';

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

export const gqlQuery = async <T>(operationName: string, variables: Record<string, unknown> = {}): Promise<T> => {
  const hash = getOperationHash(operationName);
  const extensions = JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } });
  const vars = JSON.stringify(variables);
  const url = `${GQL_ENDPOINT}?operationName=${operationName}&variables=${encodeURIComponent(vars)}&extensions=${encodeURIComponent(extensions)}`;

  const init: FetchFromPageOptions = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-client-identifier': 'web',
    },
  };

  const result = (await fetchJSON<GqlResponse<T>>(url, init)) as GqlResponse<T>;
  handleGqlErrors(operationName, result);
  return result.data as T;
};

export const gqlMutation = async <T>(operationName: string, variables: Record<string, unknown> = {}): Promise<T> => {
  const hash = getOperationHash(operationName);
  const url = `${GQL_ENDPOINT}?operationName=${operationName}`;

  const body = JSON.stringify({
    operationName,
    variables,
    extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
  });

  const init: FetchFromPageOptions = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-client-identifier': 'web',
    },
    body,
  };

  const result = (await fetchJSON<GqlResponse<T>>(url, init)) as GqlResponse<T>;
  handleGqlErrors(operationName, result);
  return result.data as T;
};

// GraphQL responses may include partial errors alongside valid data (e.g., a "Cross Shop Load"
// error on a price field while the product data is still returned). Only throw if there are
// errors AND no data, or if the error indicates a persisted query hash mismatch.
const handleGqlErrors = <T>(operationName: string, result: GqlResponse<T>): void => {
  if (!result.errors?.length) {
    if (!result.data) {
      throw ToolError.internal(`No data returned for ${operationName}`);
    }
    return;
  }

  const msg = result.errors.map(e => e.message).join('; ');

  if (msg.includes('PersistedQueryNotFound') || msg.includes('persisted_query_not_found')) {
    cachedHashMap = null;
    throw ToolError.internal(
      `Persisted query hash expired for "${operationName}" — Instacart may have deployed a new client version. Please reload the page and try again.`,
    );
  }

  // If data was returned alongside errors, the errors are partial (non-fatal) — log and continue
  if (result.data) {
    log.debug(`Partial GraphQL errors in ${operationName}: ${msg}`);
    return;
  }

  throw ToolError.internal(`GraphQL error in ${operationName}: ${msg}`);
};
