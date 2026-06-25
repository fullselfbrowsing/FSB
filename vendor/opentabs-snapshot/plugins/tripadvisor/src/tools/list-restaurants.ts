import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchSsrData, findSsrOperation } from '../tripadvisor-api.js';
import { searchResultSchema, mapSearchResult, type RawSearchResult } from './schemas.js';

interface ShelfItem {
  locationId?: number;
  name?: string;
  detailPageRoute?: { webLinkUrl?: string };
  thumbnail?: {
    photo?: { photoSizeDynamic?: { urlTemplate?: string } };
  };
  reviewSummary?: { count?: number; rating?: number };
}

interface ShelfData {
  shelves?: Array<{
    shelves?: Array<{
      items?: ShelfItem[];
    }>;
  }>;
}

const shelfItemToSearchResult = (item: ShelfItem): RawSearchResult => ({
  locationId: item.locationId,
  name: item.name,
  route: { webLinkUrl: item.detailPageRoute?.webLinkUrl },
  photo: item.thumbnail?.photo,
  rating: item.reviewSummary?.rating,
  reviewCount: item.reviewSummary?.count,
  resultType: 'EATERY',
});

export const listRestaurants = defineTool({
  name: 'list_restaurants',
  displayName: 'List Restaurants',
  description:
    'List restaurants in a city or area on TripAdvisor. Returns a page of restaurant listings with names, ratings, and URLs. Uses the geo-based restaurant listing page URL. Use offset URLs for pagination (e.g., "-oa30-" for page 2).',
  summary: 'List restaurants in an area',
  icon: 'list',
  group: 'Restaurants',
  input: z.object({
    url: z
      .string()
      .describe(
        'Restaurant listing page URL path (e.g., "/Restaurants-g60713-San_Francisco_California.html" or with offset "/Restaurants-g60713-oa30-San_Francisco_California.html")',
      ),
  }),
  output: z.object({
    restaurants: z.array(searchResultSchema).describe('Restaurant listings'),
  }),
  handle: async params => {
    const ssrData = await fetchSsrData(params.url);

    const shelvesData = findSsrOperation(ssrData, 'RestaurantShelf_getCoverpageShelvesV3') as ShelfData | null;

    const crossSell = findSsrOperation(ssrData, 'RestaurantShelf_getCrossSellShelf') as { items?: ShelfItem[] } | null;

    const results: RawSearchResult[] = [];
    const seen = new Set<number>();

    if (shelvesData?.shelves) {
      for (const slot of shelvesData.shelves) {
        if (slot.shelves) {
          for (const shelf of slot.shelves) {
            if (shelf.items) {
              for (const item of shelf.items) {
                const id = item.locationId ?? 0;
                if (id > 0 && !seen.has(id)) {
                  seen.add(id);
                  results.push(shelfItemToSearchResult(item));
                }
              }
            }
          }
        }
      }
    }

    if (results.length === 0 && crossSell?.items) {
      for (const item of crossSell.items) {
        const id = item.locationId ?? 0;
        if (id > 0 && !seen.has(id)) {
          seen.add(id);
          results.push(shelfItemToSearchResult(item));
        }
      }
    }

    return {
      restaurants: results.map(mapSearchResult),
    };
  },
});
