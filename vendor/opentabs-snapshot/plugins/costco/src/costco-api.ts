import {
  type FetchFromPageOptions,
  ToolError,
  buildQueryString,
  fetchFromPage,
  getAuthCache,
  getCookie,
  getPageGlobal,
  getSessionStorage,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// ─── Constants ─────────────────────────────────────────────────────────────

export const PRODUCT_CLIENT_ID = '4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf';
export const INVENTORY_CLIENT_ID = '481b1aec-aa3b-454b-b81b-48187e28f205';

export const PRODUCT_API = 'https://ecom-api.costco.com/ebusiness/product/v1/products/graphql';
export const INVENTORY_API = 'https://ecom-api.costco.com/ebusiness/inventory/v1/inventorylevels/availability/batch';
export const GEOCODE_API = 'https://geocodeservice.costco.com/Locations';
export const DIGITAL_API = 'https://api.digital.costco.com';

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface CostcoAuth {
  token: string;
  hashedUserId: string;
}

const getAuth = (): CostcoAuth | null => {
  const cached = getAuthCache<CostcoAuth>('costco');
  if (cached) return cached;

  const hashedUserId = getCookie('hashedUserId');
  if (!hashedUserId) return null;

  // JWT is stored in sessionStorage under authToken_<hashedUserId>
  const token = getSessionStorage(`authToken_${hashedUserId}`);
  if (!token) return null;

  const auth: CostcoAuth = { token, hashedUserId };
  setAuthCache('costco', auth);
  return auth;
};

export const isAuthenticated = (): boolean => {
  // Check the digitalData authStatus flag (more reliable than cookie checks)
  const authStatus = getPageGlobal('digitalData.authStatus') as string | undefined;
  if (authStatus === 'Authenticated') return true;
  return getAuth() !== null;
};

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 8000 });
    return true;
  } catch {
    return false;
  }
};

// ─── Member data from cookies ───────────────────────────────────────────────

export interface MemberData {
  hashedUserId: string;
  loggedIn: boolean;
  memberTier: string;
  memberType: string;
  storeId: string;
  memberNumber: string;
  email: string;
}

export const getMemberData = (): MemberData | null => {
  const wcMember = getCookie('wcMember');
  if (!wcMember) return null;

  const parts = wcMember.split(',');
  if (parts.length < 10) return null;

  return {
    hashedUserId: parts[0] ?? '',
    loggedIn: parts[1] === '1',
    memberTier: parts[2] ?? '',
    memberType: parts[3] ?? '',
    storeId: parts[6] ?? '',
    memberNumber: parts[8] ?? '',
    email: parts[9] ?? '',
  };
};

export const getWarehouseNumber = (): string => {
  // Extract warehouse number from WAREHOUSEDELIVERY_WHS cookie
  const whsCookie = getCookie('WAREHOUSEDELIVERY_WHS');
  if (!whsCookie) return '847'; // default
  try {
    const whs = JSON.parse(whsCookie) as { nearestWarehouse?: { catalog?: string } };
    // e.g., "1004-wh" → "1004"
    const catalog = whs?.nearestWarehouse?.catalog ?? '';
    return catalog.replace('-wh', '') || '847';
  } catch {
    return '847';
  }
};

export const getDistributionCenters = (): string[] => {
  const whsCookie = getCookie('WAREHOUSEDELIVERY_WHS');
  if (!whsCookie) return [];
  try {
    const whs = JSON.parse(whsCookie) as {
      distributionCenters?: string[];
      groceryCenters?: string[];
    };
    return [...(whs?.distributionCenters ?? []), ...(whs?.groceryCenters ?? [])];
  } catch {
    return [];
  }
};

// ─── Product GraphQL API ─────────────────────────────────────────────────────

/** Build an inline GraphQL query for products (Costco's BFF rejects parameterized variables). */
const buildProductQuery = (
  itemNumbers: string[],
  clientId: string,
  locale: string,
  warehouseNumber: string,
): string => {
  const items = itemNumbers.map(n => `"${n}"`).join(',');
  return `query {
  products(
    itemNumbers: [${items}],
    clientId: "${clientId}",
    locale: "${locale}",
    warehouseNumber: "${warehouseNumber}"
  ) {
    catalogData {
      itemNumber itemId published locale buyable programTypes
      priceData { price listPrice }
      attributes { key value type pills identifier }
      description { shortDescription longDescription marketingStatement promotionalStatement auxDescription2 }
      additionalFieldData {
        rating numberOfRating dispPriceInCartOnly eligibleForReviews
        fsa membershipReqd productClassType maxItemOrderQty minItemOrderQty
      }
      fieldData { mfPartNumber mfName imageName startDate endDate }
    }
    fulfillmentData {
      itemNumber warehouseNumber channel currency price listPrice
      discounts { promoAmount promoType promoStartDate promoEndDate maximumCount }
      shippingInfo { fulfillmentMethods externalCarrier }
    }
  }
}`;
};

export interface RawProductCatalog {
  itemNumber?: string;
  itemId?: string;
  published?: boolean;
  buyable?: number;
  programTypes?: string;
  priceData?: { price?: string; listPrice?: string };
  attributes?: Array<{ key?: string; value?: string; type?: string; pills?: string; identifier?: string }>;
  description?: {
    shortDescription?: string;
    longDescription?: string;
    marketingStatement?: string;
    promotionalStatement?: string;
    auxDescription2?: string;
  };
  additionalFieldData?: {
    rating?: string;
    numberOfRating?: number;
    dispPriceInCartOnly?: number;
    eligibleForReviews?: number;
    fsa?: number;
    membershipReqd?: number;
    productClassType?: string;
    maxItemOrderQty?: string;
    minItemOrderQty?: string;
  };
  fieldData?: {
    mfPartNumber?: string;
    mfName?: string;
    imageName?: string;
    startDate?: string;
    endDate?: string;
  };
}

export interface RawFulfillment {
  itemNumber?: string;
  warehouseNumber?: string;
  channel?: string;
  currency?: string;
  price?: number;
  listPrice?: number;
  discounts?: Array<{
    promoAmount?: number;
    promoType?: string;
    promoStartDate?: string;
    promoEndDate?: string;
    maximumCount?: number;
  }>;
  shippingInfo?: {
    fulfillmentMethods?: string[];
    externalCarrier?: number;
  };
}

export interface RawProductResponse {
  data?: {
    products?: {
      catalogData?: RawProductCatalog[];
      fulfillmentData?: RawFulfillment[];
    };
  };
  errors?: Array<{ message?: string }>;
}

export const fetchProducts = async (itemNumbers: string[], warehouseNumber?: string): Promise<RawProductResponse> => {
  const whNum = warehouseNumber ?? getWarehouseNumber();
  const query = buildProductQuery(itemNumbers, PRODUCT_CLIENT_ID, 'en-us', whNum);
  // Cross-origin API — must use credentials:'omit' (CORS does not allow credentials)
  const resp = await fetchFromPage(PRODUCT_API, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      'client-identifier': PRODUCT_CLIENT_ID,
      'costco.env': 'ecom',
      'costco.service': 'restProduct',
    },
    body: JSON.stringify({ query, variables: {} }),
  } as FetchFromPageOptions);
  if (resp.status === 204) return {};
  return (await resp.json()) as RawProductResponse;
};

// ─── Inventory API ───────────────────────────────────────────────────────────

export interface RawInventoryItem {
  itemNumber?: string;
  programTypes?: {
    siteControlledInventory?: { availability?: string; fulfillmentCenter?: string };
    '3rdPartyDelivery'?: { availability?: string; fulfillmentCenter?: string };
    inWarehouse?: { availability?: string; fulfillmentCenter?: string };
    useWarehouseInventory?: {
      availability?: string;
      fulfillmentCenter?: string;
      buyable?: boolean;
      orderCutOff?: string;
      orderPickup?: string;
      maxUnitsAvailable?: number;
    };
  };
}

export const fetchInventory = async (itemNumbers: string[]): Promise<RawInventoryItem[]> => {
  const distributionCenters = getDistributionCenters();
  const warehouseNumber = getWarehouseNumber();
  const selectedWarehouse = `${warehouseNumber}-wh`;

  // Cross-origin API — must use credentials:'omit'
  const resp = await fetchFromPage(INVENTORY_API, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      'client-identifier': INVENTORY_CLIENT_ID,
      'costco.env': 'PROD',
      'costco.service': 'restInventory',
    },
    body: JSON.stringify({ distributionCenters, itemNumbers, selectedWarehouse }),
  } as FetchFromPageOptions);
  if (resp.status === 204) return [];
  return (await resp.json()) as RawInventoryItem[];
};

// ─── Digital API (Lists/Wishlists) ───────────────────────────────────────────

interface ListApiInit extends FetchFromPageOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

const digitalApi = async <T>(path: string, options: ListApiInit = {}): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please sign in to costco.com.');

  const url = `${DIGITAL_API}${path}`;
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'client-id': PRODUCT_CLIENT_ID,
    Authorization: `Bearer ${auth.token}`,
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  // Cross-origin API — must use credentials:'omit' with bearer token
  const init: FetchFromPageOptions = { method, headers, body: options.body, credentials: 'omit' };
  const resp = await fetchFromPage(url, init);
  if (resp.status === 204) return {} as T;
  return (await resp.json()) as T;
};

export interface RawList {
  id?: string;
  title?: string;
  type?: string;
  description?: string;
  itemCount?: number;
  createdDate?: string;
  modifiedDate?: string;
}

export interface RawListEntry {
  id?: string;
  itemNumber?: string;
  comment?: string;
  quantity?: number;
  type?: string;
}

export const fetchLists = async (): Promise<RawList[]> => {
  return digitalApi<RawList[]>('/baskets/lists/');
};

export const fetchListEntries = async (listId: string): Promise<RawListEntry[]> => {
  return digitalApi<RawListEntry[]>(`/baskets/lists/${listId}/entries`);
};

export const addToList = async (
  listId: string,
  itemNumber: string,
  quantity: number,
  comment: string,
): Promise<RawListEntry> => {
  return digitalApi<RawListEntry>(`/baskets/lists/${listId}/entries`, {
    method: 'POST',
    body: JSON.stringify({
      comment,
      itemNumber,
      type: 'CostcoItemListEntry',
      quantity,
    }),
  });
};

export const createList = async (title: string, description: string): Promise<RawList> => {
  return digitalApi<RawList>('/baskets/lists/', {
    method: 'POST',
    body: JSON.stringify({
      type: 'WishList',
      title,
      description,
      items: [],
    }),
  });
};

export const deleteListEntry = async (listId: string, entryId: string): Promise<void> => {
  await digitalApi<unknown>(`/baskets/lists/${listId}/entries/${entryId}`, {
    method: 'DELETE',
  });
};

export const deleteList = async (listId: string): Promise<void> => {
  await digitalApi<unknown>(`/baskets/lists/${listId}`, {
    method: 'DELETE',
  });
};

// ─── Geocode API ─────────────────────────────────────────────────────────────

export interface RawGeoLocation {
  id?: string;
  postalCode?: string;
  city?: string;
  cityType?: string;
  country?: string;
  stateProvince?: string;
  stateProvinceAbbreviation?: string;
  timeZone?: string;
  latitude?: number;
  longitude?: number;
}

export const geocodeLocation = async (query: string, country: string): Promise<RawGeoLocation[]> => {
  const qs = buildQueryString({ q: query, country });
  // Cross-origin API with CORS: * — no credentials needed
  const resp = await fetchFromPage(`${GEOCODE_API}?${qs}`, {
    credentials: 'omit',
  } as FetchFromPageOptions);
  if (resp.status === 204) return [];
  return (await resp.json()) as RawGeoLocation[];
};
