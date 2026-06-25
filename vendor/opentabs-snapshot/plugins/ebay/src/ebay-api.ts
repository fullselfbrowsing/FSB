import { ToolError, fetchFromPage, getPageGlobal, httpStatusToToolError, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// eBay uses HttpOnly session cookies (not accessible via document.cookie).
// Auth is detected via the `window.GHpre` page global which contains user
// identity data on every page for logged-in users. The actual API auth uses
// session cookies sent automatically via credentials: 'include'.

interface EbayAuth {
  userId: string;
  firstName: string;
}

const getAuth = (): EbayAuth | null => {
  const userId = getPageGlobal('GHpre.userId') as string | undefined;
  if (!userId) return null;
  const firstName = (getPageGlobal('GHpre.fn') as string | undefined) ?? '';
  return { userId, firstName };
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

export const getCurrentUser = (): EbayAuth => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to eBay.');
  return auth;
};

// --- HTML fetcher ---
// eBay is primarily server-rendered. HTML pages can be 1-2MB, so we use raw
// fetch with a generous timeout to avoid dispatch chain timeouts.

const requireAuth = (): void => {
  if (!getAuth()) throw ToolError.auth('Not authenticated — please log in to eBay.');
};

export const fetchPage = async (url: string): Promise<string> => {
  requireAuth();

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`Page request timed out: ${url}`);
    throw ToolError.internal(`Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) throw httpStatusToToolError(response, `Failed to fetch ${url}`);
  return response.text();
};

// --- JSON fetcher ---
// A few eBay endpoints return JSON (autocomplete, watch/unwatch).

export const fetchJson = async <T>(url: string): Promise<T> => {
  requireAuth();

  const response = await fetchFromPage(url, {
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
};

// --- Search HTML parser ---
// Parses search result items from eBay's server-rendered HTML.

export interface RawSearchItem {
  title: string;
  price: string;
  itemId: string;
  url: string;
  image: string;
  condition: string;
  shipping: string;
  bids: string;
}

const parseCardItem = (card: Element): RawSearchItem | null => {
  const linkEl = card.querySelector('a[href*="/itm/"]');
  const href = linkEl?.getAttribute('href') ?? '';
  const itemId = href.match(/\/itm\/(\d+)/)?.[1] ?? '';
  if (!itemId || itemId === '123456') return null;

  const titleEl = card.querySelector('[role="heading"]') ?? card.querySelector('.s-card__title');
  const title = titleEl?.textContent?.trim() ?? '';

  const priceEl = card.querySelector('[class*="price"]');
  const price = priceEl?.textContent?.trim() ?? '';

  const imgEl = card.querySelector('img');
  const image = imgEl?.getAttribute('src') ?? '';

  const allText = card.textContent ?? '';

  const conditionMatch = allText.match(/(Brand New|New|Pre-Owned|Used|Refurbished|Open Box|For parts)/i);
  const condition = conditionMatch?.[1] ?? '';

  const shippingMatch = allText.match(/(Free shipping|\+\$[\d.]+\s*shipping)/i);
  const shipping = shippingMatch?.[1] ?? '';

  const bidsMatch = allText.match(/(\d+)\s*bid/i);
  const bids = bidsMatch?.[1] ?? '';

  const cleanUrl = href.startsWith('http') ? (href.split('?')[0] ?? href) : `https://www.ebay.com/itm/${itemId}`;

  return {
    title,
    price,
    itemId,
    url: cleanUrl,
    image,
    condition,
    shipping,
    bids,
  };
};

export const parseSearchResults = (html: string): RawSearchItem[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const cards = doc.querySelectorAll('li.s-card');
  const items: RawSearchItem[] = [];

  for (const card of cards) {
    const item = parseCardItem(card);
    if (item) items.push(item);
  }

  return items;
};

// --- Item detail parser ---
// Parses JSON-LD Product schema from eBay item pages.

export interface RawItemDetail {
  itemId: string;
  title: string;
  price: string;
  currency: string;
  listPrice: string;
  condition: string;
  availability: string;
  images: string[];
  seller: string;
  sellerUrl: string;
  url: string;
  brand: string;
  description: string;
  shipping: string;
  returnPolicy: string;
}

export const parseItemDetail = (html: string, itemId: string): RawItemDetail => {
  // Parse JSON-LD Product schema (eBay uses unquoted type attribute)
  const ldJsonRegex = /<script type=application\/ld\+json>([\s\S]*?)<\/script>/g;
  let productData: Record<string, unknown> | null = null;

  let ldMatch: RegExpExecArray | null = ldJsonRegex.exec(html);
  while (ldMatch !== null) {
    try {
      const jsonStr = ldMatch[1] ?? '';
      const data = JSON.parse(jsonStr.trim()) as Record<string, unknown>;
      if (data['@type'] === 'Product') {
        productData = data;
        break;
      }
    } catch {
      // skip invalid JSON
    }
    ldMatch = ldJsonRegex.exec(html);
  }

  if (!productData) {
    throw ToolError.notFound(`Item ${itemId} not found or has no product data`);
  }

  const offers = (productData.offers ?? {}) as Record<string, unknown>;
  const priceSpec = (offers.priceSpecification ?? {}) as Record<string, unknown>;

  const shippingDetails = offers.shippingDetails;
  let shippingCost = '';
  if (Array.isArray(shippingDetails) && shippingDetails.length > 0) {
    const detail = shippingDetails[0] as Record<string, unknown>;
    const rate = detail.shippingRate as Record<string, unknown> | undefined;
    if (rate) {
      const val = String(rate.value ?? '');
      const cur = String(rate.currency ?? '');
      shippingCost = val === '0' || val === '0.0' ? 'Free' : `${cur} ${val}`;
    }
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const sellerEl = doc.querySelector('[data-testid="str-title"] a, .x-sellercard-atf__info__about-seller a');
  const sellerName = sellerEl?.textContent?.trim() ?? '';
  const sellerHref = sellerEl?.getAttribute('href') ?? '';

  const descriptionEl = doc.querySelector('.x-item-description, [data-testid="item-description"]');
  const description = descriptionEl?.textContent?.trim()?.substring(0, 500) ?? '';

  const returnEl = doc.querySelector('.x-returns-minview, [data-testid="x-returns-minview"]');
  const returnPolicy = returnEl?.textContent?.trim() ?? '';

  const name = String(productData.name ?? '');
  const conditionUrl = String(offers.itemCondition ?? '');
  const conditionMap: Record<string, string> = {
    'https://schema.org/NewCondition': 'New',
    'https://schema.org/UsedCondition': 'Used',
    'https://schema.org/RefurbishedCondition': 'Refurbished',
    'https://schema.org/DamagedCondition': 'For Parts',
  };

  const brandObj = productData.brand as Record<string, unknown> | undefined;

  return {
    itemId,
    title: name.replace(/&#034;/g, '"').replace(/&amp;/g, '&'),
    price: String(offers.price ?? ''),
    currency: String(offers.priceCurrency ?? 'USD'),
    listPrice: String(priceSpec.price ?? ''),
    condition: conditionMap[conditionUrl] ?? '',
    availability: String(offers.availability ?? '').replace('https://schema.org/', ''),
    images: Array.isArray(productData.image) ? (productData.image as string[]) : [],
    seller: sellerName,
    sellerUrl: sellerHref,
    url: String(offers.url ?? ''),
    brand: String(brandObj?.name ?? ''),
    description,
    shipping: shippingCost,
    returnPolicy,
  };
};

// --- Watch/Unwatch ---
// eBay provides JSON endpoints for watching/unwatching items.
// SRT tokens are page-scoped CSRF tokens. Any SRT from the page works for any
// item on that page. We extract a generic SRT rather than item-specific ones.

export const extractSrt = (html: string): string => {
  const srtMatch = html.match(/srt=([a-f0-9]{80,})/);
  if (!srtMatch) {
    throw ToolError.validation('Could not extract SRT (CSRF) token from the page');
  }
  return srtMatch[1] ?? '';
};

export interface WatchResponse {
  action?: number;
  item?: string;
  status?: boolean;
  statusId?: number;
  result?: number;
  signin?: number;
  listDetails?: Array<{
    listId?: number;
    listName?: string;
    itemAdded?: boolean;
    maxLimitReached?: boolean;
  }>;
}

// --- Watchlist parser ---
// Parses watchlist items from the My eBay watchlist HTML page.

export interface RawWatchlistItem {
  title: string;
  itemId: string;
  price: string;
  url: string;
  image: string;
  timeLeft: string;
}

export const parseWatchlist = (html: string): RawWatchlistItem[] => {
  // Extract unique item IDs from all /itm/ links on the watchlist page.
  // The watchlist HTML is complex — we only reliably extract item IDs, then
  // return them as minimal entries. Use get_item for full details.
  const itemIds = new Set<string>();
  const regex = /\/itm\/(\d{8,})/g;
  let m: RegExpExecArray | null = regex.exec(html);
  while (m !== null) {
    itemIds.add(m[1] ?? '');
    m = regex.exec(html);
  }

  return [...itemIds]
    .filter(id => id.length > 0)
    .map(id => ({
      title: '',
      itemId: id,
      price: '',
      url: `https://www.ebay.com/itm/${id}`,
      image: '',
      timeLeft: '',
    }));
};

// --- Total results count parser ---
export const parseResultCount = (html: string): number => {
  // eBay shows "X,XXX+ results" or "X results for ..."
  const countMatch = html.match(/(\d[\d,]*)\+?\s*results/i);
  if (!countMatch) return 0;
  return Number.parseInt((countMatch[1] ?? '0').replace(/,/g, ''), 10);
};
