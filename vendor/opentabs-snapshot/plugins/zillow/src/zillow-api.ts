import {
  ToolError,
  fetchJSON,
  getPageGlobal,
  waitUntil,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
} from '@opentabs-dev/plugin-sdk';
import type { FetchFromPageOptions } from '@opentabs-dev/plugin-sdk';

// --- Types ---

interface ZillowAuth {
  isLoggedIn: boolean;
  guid: string;
  zuid: string;
}

interface SearchQueryState {
  pagination?: { currentPage: number };
  mapBounds: { west: number; east: number; south: number; north: number };
  regionSelection?: { regionId: number; regionType: number }[];
  filterState: Record<string, unknown>;
  isMapVisible: boolean;
}

interface SearchWants {
  cat1: string[];
  cat2?: string[];
}

export interface SearchResponse {
  user?: RawSearchUser;
  cat1?: {
    searchResults?: {
      listResults?: RawListing[];
      totalResultCount?: number;
    };
  };
  categoryTotals?: {
    cat1?: { totalResultCount?: number };
    cat2?: { totalResultCount?: number };
  };
  regionState?: {
    regionInfo?: { regionId?: number; regionType?: number; regionName?: string; displayName?: string }[];
  };
}

export interface RawSearchUser {
  isLoggedIn?: boolean;
  guid?: string;
  zuid?: string;
  email?: string;
  displayName?: string;
  fullName?: string;
  savedHomesCount?: number;
  savedHomeIds?: string[];
  claimedHomeIds?: string[];
  isAgent?: boolean;
  phoneNumber?: string;
}

export interface RawListing {
  zpid?: string;
  detailUrl?: string;
  statusType?: string;
  statusText?: string;
  price?: string;
  unformattedPrice?: number;
  address?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZipcode?: string;
  beds?: number;
  baths?: number;
  area?: number;
  latLong?: { latitude?: number; longitude?: number };
  imgSrc?: string;
  zestimate?: number;
  isSaved?: boolean;
  listingType?: string;
  has3DModel?: boolean;
  hasVideo?: boolean;
  hdpData?: {
    homeInfo?: RawHomeInfo;
  };
}

export interface RawHomeInfo {
  zpid?: number;
  streetAddress?: string;
  zipcode?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  price?: number;
  bathrooms?: number;
  bedrooms?: number;
  livingArea?: number;
  homeType?: string;
  homeStatus?: string;
  daysOnZillow?: number;
  zestimate?: number;
  rentZestimate?: number;
  taxAssessedValue?: number;
  lotAreaValue?: number;
  lotAreaUnit?: string;
  currency?: string;
  country?: string;
  unit?: string;
  timeOnZillow?: number;
  dateSold?: string;
  isZillowOwned?: boolean;
}

export interface AutocompleteResult {
  display?: string;
  resultType?: string;
  metaData?: {
    city?: string;
    state?: string;
    county?: string;
    country?: string;
    lat?: number;
    lng?: number;
    regionId?: number;
    regionType?: string;
    zipCode?: string;
    zpid?: number;
    streetName?: string;
    streetNumber?: string;
    unitNumber?: string;
    addressType?: string;
  };
}

interface AutocompleteResponse {
  results?: AutocompleteResult[];
}

// --- Auth ---

const getAuth = (): ZillowAuth | null => {
  const cached = getAuthCache<ZillowAuth>('zillow');
  if (cached?.isLoggedIn) return cached;

  // Check __NEXT_DATA__ for user session
  const isLoggedIn = getPageGlobal('__PFS_TOPNAV_DATA__.isLoggedIn') as boolean | undefined;
  const guid = getPageGlobal('__NEXT_DATA__.props.guid') as string | undefined;
  const zuid = getPageGlobal('__NEXT_DATA__.props.zuid') as string | undefined;

  if (!guid) return null;

  const auth: ZillowAuth = {
    isLoggedIn: isLoggedIn ?? false,
    guid: guid ?? '',
    zuid: zuid ?? '',
  };
  setAuthCache('zillow', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

// --- Search API ---

const SEARCH_URL = 'https://www.zillow.com/async-create-search-page-state';

let requestCounter = 0;

export const search = async (queryState: SearchQueryState, wants: SearchWants): Promise<SearchResponse> => {
  requestCounter++;

  const init: FetchFromPageOptions = {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchQueryState: queryState,
      wants,
      requestId: requestCounter,
    }),
  };

  try {
    const data = await fetchJSON<SearchResponse>(SEARCH_URL, init);
    return data ?? {};
  } catch (err: unknown) {
    if (err instanceof ToolError) {
      // On auth errors, clear cached auth
      if (err.category === 'auth') clearAuthCache('zillow');
      throw err;
    }
    throw ToolError.internal(`Search API error: ${err instanceof Error ? err.message : String(err)}`);
  }
};

// --- Autocomplete API ---

const AUTOCOMPLETE_URL = 'https://www.zillowstatic.com/autocomplete/v3/suggestions';

export const autocomplete = async (query: string): Promise<AutocompleteResult[]> => {
  const url = `${AUTOCOMPLETE_URL}?q=${encodeURIComponent(query)}&abKey=6b25a67b-4c78-4f09-87dc-7698c41a4efc&clientId=homepage-render`;

  const data = await fetchJSON<AutocompleteResponse>(url, {
    credentials: 'omit',
  });

  return data?.results ?? [];
};

// --- User data ---

export const getUserFromSearchResponse = async (): Promise<RawSearchUser> => {
  // The search API returns user data in every response. Make a minimal search
  // to extract current user information.
  const data = await search(
    {
      mapBounds: { west: -122.5, east: -122.3, south: 37.7, north: 37.8 },
      filterState: {},
      isMapVisible: false,
    },
    { cat1: ['total'] },
  );

  if (!data.user) throw ToolError.auth('Not authenticated — please log in to Zillow.');
  return data.user;
};

// --- Region type mapping ---

export const REGION_TYPE_MAP: Record<string, number> = {
  city: 6,
  county: 4,
  zipcode: 7,
  neighborhood: 8,
  state: 2,
  address: 0,
};
