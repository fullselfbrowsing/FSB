import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getPageData } from '../airbnb-api.js';

/** Recursively search for a listing detail object in the page data */
const findListingDetail = (obj: unknown, depth = 0): Record<string, unknown> | null => {
  if (depth > 15) return null;
  if (typeof obj !== 'object' || obj === null) return null;
  const record = obj as Record<string, unknown>;

  if ('pdpSections' in record || ('listingTitle' in record && 'listingDescription' in record)) {
    return record;
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findListingDetail(item, depth + 1);
        if (found) return found;
      }
    } else {
      const found = findListingDetail(value, depth + 1);
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

const extractStringArray = (obj: unknown, key: string): string[] => {
  if (typeof obj !== 'object' || obj === null) return [];
  const record = obj as Record<string, unknown>;
  const val = record[key];
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string');
  return [];
};

/** Recursively find an array of amenity-like objects */
const findAmenities = (obj: unknown, depth = 0): string[] => {
  if (depth > 10) return [];
  if (Array.isArray(obj)) {
    const names: string[] = [];
    for (const item of obj) {
      if (typeof item === 'object' && item !== null && 'title' in (item as Record<string, unknown>)) {
        const title = (item as Record<string, unknown>).title;
        if (typeof title === 'string') names.push(title);
      }
    }
    if (names.length > 0) return names;
  }
  if (typeof obj === 'object' && obj !== null) {
    const record = obj as Record<string, unknown>;
    if ('amenities' in record) {
      return findAmenities(record.amenities, depth + 1);
    }
    for (const value of Object.values(record)) {
      const found = findAmenities(value, depth + 1);
      if (found.length > 0) return found;
    }
  }
  return [];
};

/** Find image URLs in the page data */
const findImageUrls = (obj: unknown, depth = 0): string[] => {
  if (depth > 10) return [];
  if (Array.isArray(obj)) {
    const urls: string[] = [];
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        const record = item as Record<string, unknown>;
        const url = record.baseUrl ?? record.url ?? record.picture;
        if (typeof url === 'string' && url.startsWith('http')) urls.push(url);
      }
    }
    if (urls.length > 0) return urls.slice(0, 10);
  }
  if (typeof obj === 'object' && obj !== null) {
    const record = obj as Record<string, unknown>;
    if ('photos' in record) return findImageUrls(record.photos, depth + 1);
    if ('images' in record) return findImageUrls(record.images, depth + 1);
    if ('photoTour' in record) return findImageUrls(record.photoTour, depth + 1);
  }
  return [];
};

export const getListingFromPage = defineTool({
  name: 'get_listing_from_page',
  displayName: 'Get Listing From Page',
  description:
    'Extract listing details from the current Airbnb listing page. Navigate to a listing page first, then call this tool to read the listing data.',
  summary: 'Extract listing details from the current page',
  icon: 'home',
  group: 'Listings',
  input: z.object({}),
  output: z.object({
    listing: z
      .object({
        id: z.string().describe('Listing ID'),
        name: z.string().describe('Listing title'),
        description: z.string().describe('Listing description'),
        host_name: z.string().describe('Host display name'),
        location: z.string().describe('Listing location'),
        price_string: z.string().describe('Formatted price string'),
        rating: z.string().describe('Average rating text'),
        review_count: z.number().int().describe('Number of reviews'),
        image_urls: z.array(z.string()).describe('Listing image URLs'),
        amenities: z.array(z.string()).describe('Listing amenities'),
      })
      .nullable()
      .describe('Listing details, or null if not on a listing page'),
    message: z.string().nullable().describe('Status message if listing data is unavailable'),
  }),
  handle: async () => {
    const pageData = getPageData();

    if (!pageData) {
      return {
        listing: null,
        message: 'No page data found. Navigate to an Airbnb listing page first.',
      };
    }

    const detail = findListingDetail(pageData);

    if (!detail) {
      return {
        listing: null,
        message: 'Not on a listing page. Navigate to an Airbnb listing page (e.g., airbnb.com/rooms/12345) first.',
      };
    }

    const idMatch = window.location.pathname.match(/\/rooms\/(\d+)/);
    const id = idMatch?.[1] ?? extractString(detail, 'id') ?? '';

    const name =
      extractString(detail, 'listingTitle') ?? extractString(detail, 'name') ?? extractString(detail, 'title') ?? '';

    const description = extractString(detail, 'listingDescription') ?? extractString(detail, 'description') ?? '';

    const host = detail.host as Record<string, unknown> | undefined;
    const hostName = extractString(host ?? {}, 'name') ?? extractString(host ?? {}, 'firstName') ?? '';

    const location =
      extractString(detail, 'location') ??
      extractString(detail, 'locationTitle') ??
      extractString(detail, 'city') ??
      '';

    const priceString = extractString(detail, 'priceString') ?? extractString(detail, 'price') ?? '';
    const rating = extractString(detail, 'avgRatingLocalized') ?? extractString(detail, 'rating') ?? '';
    const reviewCount = typeof detail.reviewsCount === 'number' ? detail.reviewsCount : 0;

    const imageUrls = findImageUrls(detail) || extractStringArray(detail, 'imageUrls');
    const amenities = findAmenities(detail);

    return {
      listing: {
        id,
        name,
        description,
        host_name: hostName,
        location,
        price_string: priceString,
        rating,
        review_count: reviewCount,
        image_urls: imageUrls,
        amenities,
      },
      message: null,
    };
  },
});
