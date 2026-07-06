import {
  ToolError,
  fetchText,
  fetchJSON,
  buildQueryString,
  getPageGlobal,
  getAuthCache,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface YelpAuth {
  userId: string;
}

const getAuth = (): YelpAuth | null => {
  const cached = getAuthCache<YelpAuth>('yelp');
  if (cached) return cached;

  const userId = getPageGlobal('yelp.react_root_props.userId') as string | undefined;
  if (!userId) return null;

  const auth: YelpAuth = { userId };
  setAuthCache('yelp', auth);
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

export const getUserId = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Yelp.');
  return auth.userId;
};

// --- Page data extraction ---

const REACT_ROOT_PROPS_REGEX =
  /window\.yelp\s*=\s*window\.yelp\s*\|\|\s*\{\};\s*window\.yelp\.react_root_props\s*=\s*(\{[\s\S]*?\});\s*(?:window\.yelp\.|<\/script>)/;

/**
 * Fetch a Yelp page and extract the embedded react_root_props JSON.
 * All Yelp pages are server-rendered with data embedded in a script tag.
 */
export const fetchPageData = async <T = Record<string, unknown>>(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> => {
  const qs = query ? buildQueryString(query) : '';
  const url = qs ? `${path}?${qs}` : path;

  const html = await fetchText(url, {
    headers: { Accept: 'text/html' },
  });

  const match = html.match(REACT_ROOT_PROPS_REGEX);
  if (!match?.[1]) {
    throw ToolError.internal(
      'Failed to extract page data — the page may have changed or a captcha is blocking the request.',
    );
  }

  try {
    return JSON.parse(match[1]) as T;
  } catch {
    throw ToolError.internal('Failed to parse page data JSON.');
  }
};

// --- Autocomplete API ---

interface AutocompleteResponse {
  response?: Array<{
    prefix?: string;
    suggestions?: Array<{
      query?: string;
      title?: string;
      subtitle?: string;
      type?: string;
      redirect_url?: string;
      thumbnail?: string;
    }>;
  }>;
}

export const fetchAutocompleteSuggestions = async (prefix: string, location: string): Promise<AutocompleteResponse> => {
  const data = await fetchJSON<AutocompleteResponse>(
    `/search_suggest/v2/prefetch?${buildQueryString({ prefix, loc: location })}`,
    { headers: { Accept: 'application/json' } },
  );
  return data ?? {};
};

// --- Page data types ---

export interface SearchPageData {
  userId?: string;
  legacyProps?: {
    searchAppProps?: {
      searchPageProps?: {
        mainContentComponentsListProps?: Record<string, SearchResultItem>;
        searchContext?: {
          totalResults?: number;
          startResult?: number;
          resultsPerPage?: number;
          searchCategory?: string;
        };
      };
    };
  };
}

export interface SearchResultItem {
  bizId?: string;
  searchResultBusiness?: RawSearchBusiness;
  scrollablePhotos?: {
    photoList?: Array<{ src?: string; srcset?: string }>;
  };
  searchResultLayoutType?: string;
  type?: string;
}

export interface RawSearchBusiness {
  alias?: string;
  name?: string;
  businessUrl?: string;
  rating?: number;
  reviewCount?: number;
  phone?: string;
  priceRange?: string;
  categories?: Array<{ title?: string; url?: string }>;
  neighborhoods?: string[];
  formattedAddress?: string;
  isAd?: boolean;
  ranking?: number;
  serviceArea?: string;
}

export interface BizDetailsPageData {
  userId?: string;
  legacyProps?: {
    bizDetailsProps?: {
      bizDetailsPageProps?: {
        businessId?: string;
        businessName?: string;
        shouldFetchPropsFromClient?: boolean;
      };
      bizDetailsMetaProps?: {
        businessId?: string;
        staticUrl?: string;
      };
    };
  };
}

/**
 * Extract search results from page data. Shared by search-businesses and
 * get-current-page-businesses tools.
 */
export const extractSearchResults = (
  data: SearchPageData,
): {
  items: SearchResultItem[];
  totalResults: number;
  startResult: number;
  resultsPerPage: number;
} => {
  const searchProps = data.legacyProps?.searchAppProps?.searchPageProps;
  const components = searchProps?.mainContentComponentsListProps ?? {};
  const context = searchProps?.searchContext;

  const items = Object.values(components).filter((item): item is SearchResultItem => !!item?.bizId);

  return {
    items,
    totalResults: context?.totalResults ?? 0,
    startResult: context?.startResult ?? 0,
    resultsPerPage: context?.resultsPerPage ?? 10,
  };
};
