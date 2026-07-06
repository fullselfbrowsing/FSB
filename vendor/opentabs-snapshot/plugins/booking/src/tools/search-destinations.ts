import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, extractApolloCache } from '../booking-api.js';
import { destinationSchema } from './schemas.js';

export const searchDestinations = defineTool({
  name: 'search_destinations',
  displayName: 'Search Destinations',
  description:
    'Search for destinations on Booking.com by text query. Returns matching cities, regions, countries, landmarks, and hotels with their destination IDs. Use the returned dest_id and dest_type for more precise property searches.',
  summary: 'Search for travel destinations',
  icon: 'map-pin',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Destination search text (e.g., "Paris", "Tokyo", "Hilton London")'),
  }),
  output: z.object({
    destinations: z.array(destinationSchema).describe('Matching destinations'),
  }),
  handle: async params => {
    // Use the search results page which includes autocomplete suggestions in the Apollo cache
    const doc = await fetchPage(
      `/searchresults.html?ss=${encodeURIComponent(params.query)}&checkin=&checkout=&group_adults=2&no_rooms=1`,
    );
    const cache = extractApolloCache(doc);

    if (!cache?.ROOT_QUERY) return { destinations: [] };

    const destinations: Array<{
      dest_id: string;
      dest_type: string;
      label: string;
      city: string;
      country: string;
      region: string;
      image_url: string;
    }> = [];

    // Look for autocomplete suggestions in the cache
    for (const [key, value] of Object.entries(cache.ROOT_QUERY)) {
      if (typeof value !== 'object' || value === null) continue;
      const v = value as Record<string, unknown>;

      if (key.includes('autoCompleteSuggestions') || v.__typename === 'AutoCompleteSuggestions') {
        const results = (v.results ?? []) as Array<Record<string, unknown>>;
        for (const r of results) {
          destinations.push({
            dest_id: String(r.destId ?? r.id ?? ''),
            dest_type: String(r.destType ?? r.type ?? ''),
            label: String(r.label ?? r.value ?? r.name ?? ''),
            city: String(r.city ?? r.cityName ?? ''),
            country: String(r.country ?? r.countryName ?? ''),
            region: String(r.region ?? ''),
            image_url: String(r.imageUrl ?? ''),
          });
        }
      }
    }

    // Also extract breadcrumbs as destination info
    for (const [, value] of Object.entries(cache.ROOT_QUERY)) {
      if (typeof value !== 'object' || value === null) continue;
      const v = value as Record<string, unknown>;

      if (v.__typename === 'SearchQueries') {
        const searchKey = Object.keys(v).find(k => k.startsWith('search('));
        if (!searchKey) continue;
        const searchData = v[searchKey] as Record<string, unknown> | undefined;
        const breadcrumbs = (searchData?.breadcrumbs ?? []) as Array<Record<string, unknown>>;
        const destLocation = searchData?.destinationLocation as Record<string, unknown> | undefined;

        if (destLocation && destinations.length === 0) {
          destinations.push({
            dest_id: String(destLocation.destId ?? ''),
            dest_type: String(destLocation.destType ?? ''),
            label: String(destLocation.name ?? params.query),
            city: String(destLocation.name ?? ''),
            country: breadcrumbs.length > 0 ? String(breadcrumbs[0]?.name ?? '') : '',
            region: breadcrumbs.length > 1 ? String(breadcrumbs[1]?.name ?? '') : '',
            image_url: '',
          });
        }

        for (const bc of breadcrumbs) {
          if (!destinations.some(d => d.dest_id === String(bc.destId))) {
            destinations.push({
              dest_id: String(bc.destId ?? ''),
              dest_type: String(bc.destType ?? ''),
              label: String(bc.name ?? ''),
              city: bc.destType === 'CITY' ? String(bc.name ?? '') : '',
              country: bc.destType === 'COUNTRY' ? String(bc.name ?? '') : '',
              region: bc.destType === 'REGION' ? String(bc.name ?? '') : '',
              image_url: '',
            });
          }
        }
      }
    }

    return { destinations };
  },
});
