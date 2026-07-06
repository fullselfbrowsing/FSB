import { defineTool, getCurrentUrl } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getPageData } from '../airbnb-api.js';

/** Recursively search for an array of listing-like objects in the page data */
const findListings = (obj: unknown, depth = 0): Array<Record<string, unknown>> | null => {
  if (depth > 15) return null;
  if (Array.isArray(obj)) {
    if (
      obj.length > 0 &&
      typeof obj[0] === 'object' &&
      obj[0] !== null &&
      ('listing' in obj[0] || 'avgRatingLocalized' in obj[0] || 'pricingQuote' in obj[0])
    ) {
      return obj as Array<Record<string, unknown>>;
    }
    for (const item of obj) {
      const found = findListings(item, depth + 1);
      if (found) return found;
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const value of Object.values(obj)) {
      const found = findListings(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
};

const extractString = (obj: unknown, key: string): string | null => {
  if (typeof obj !== 'object' || obj === null) return null;
  const record = obj as Record<string, unknown>;
  if (typeof record[key] === 'string') return record[key];
  return null;
};

const extractListing = (item: Record<string, unknown>) => {
  const listing = (item.listing ?? item) as Record<string, unknown>;

  const id = String(listing.id ?? item.id ?? '');
  const name = extractString(listing, 'name') ?? extractString(listing, 'title') ?? extractString(item, 'name') ?? '';

  const priceQuote = item.pricingQuote as Record<string, unknown> | undefined;
  const priceString = extractString(priceQuote ?? {}, 'priceString') ?? extractString(priceQuote ?? {}, 'price') ?? '';

  const rating = extractString(item, 'avgRatingLocalized') ?? extractString(listing, 'avgRatingLocalized') ?? '';
  const reviewCount =
    typeof item.reviewsCount === 'number'
      ? item.reviewsCount
      : typeof listing.reviewsCount === 'number'
        ? listing.reviewsCount
        : 0;
  const roomType = extractString(listing, 'roomTypeCategory') ?? extractString(listing, 'roomType') ?? '';
  const city = extractString(listing, 'city') ?? '';

  const contextualPictures = listing.contextualPictures ?? item.contextualPictures;
  let imageUrl: string | null = null;
  if (Array.isArray(contextualPictures) && contextualPictures.length > 0) {
    imageUrl = extractString(contextualPictures[0], 'picture') ?? null;
  }

  return {
    id,
    name,
    listing_url: id ? `https://www.airbnb.com/rooms/${id}` : '',
    price_string: priceString,
    rating,
    review_count: reviewCount as number,
    room_type: roomType,
    city,
    image_url: imageUrl,
  };
};

export const getSearchResults = defineTool({
  name: 'get_search_results',
  displayName: 'Get Search Results',
  description:
    'Extract search results from the current Airbnb search page. Navigate to a search page first, then call this tool to read the results.',
  summary: 'Extract search results from the current page',
  icon: 'map-pin',
  group: 'Search',
  input: z.object({}),
  output: z.object({
    results: z
      .array(
        z.object({
          id: z.string().describe('Listing ID'),
          name: z.string().describe('Listing name'),
          listing_url: z.string().describe('URL to the listing page'),
          price_string: z.string().describe('Formatted price string'),
          rating: z.string().describe('Average rating text'),
          review_count: z.number().int().describe('Number of reviews'),
          room_type: z.string().describe('Room type category'),
          city: z.string().describe('City name'),
          image_url: z.string().nullable().describe('Primary image URL'),
        }),
      )
      .describe('Search result listings'),
    result_count: z.number().int().describe('Number of results found'),
    page_url: z.string().describe('Current page URL'),
  }),
  handle: async () => {
    const pageData = getPageData();
    const pageUrl = getCurrentUrl();

    if (!pageData) {
      return {
        results: [],
        result_count: 0,
        page_url: pageUrl,
      };
    }

    const rawListings = findListings(pageData);

    if (!rawListings || rawListings.length === 0) {
      return {
        results: [],
        result_count: 0,
        page_url: pageUrl,
      };
    }

    const results = rawListings.map(extractListing).filter(r => r.id);

    return {
      results,
      result_count: results.length,
      page_url: pageUrl,
    };
  },
});
