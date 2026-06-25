import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, extractApolloCache, buildSearchUrl } from '../booking-api.js';
import { propertySchema, mapProperty } from './schemas.js';
import type { RawSearchResult } from './schemas.js';

export const searchProperties = defineTool({
  name: 'search_properties',
  displayName: 'Search Properties',
  description:
    'Search for hotels, apartments, and other properties on Booking.com by destination, dates, and guests. Returns up to 25 results per page with pricing, ratings, and location details. Use offset for pagination.',
  summary: 'Search for properties by destination and dates',
  icon: 'search',
  group: 'Search',
  input: z.object({
    destination: z
      .string()
      .describe('Destination city, region, or property name (e.g., "Paris", "London", "New York")'),
    checkin: z.string().describe('Check-in date in YYYY-MM-DD format'),
    checkout: z.string().describe('Check-out date in YYYY-MM-DD format'),
    adults: z.number().int().min(1).max(30).optional().describe('Number of adults (default 2)'),
    children: z.number().int().min(0).max(10).optional().describe('Number of children (default 0)'),
    rooms: z.number().int().min(1).max(30).optional().describe('Number of rooms (default 1)'),
    offset: z.number().int().min(0).optional().describe('Result offset for pagination (default 0, increment by 25)'),
  }),
  output: z.object({
    properties: z.array(propertySchema).describe('List of matching properties'),
    total_results: z.number().describe('Total number of matching properties'),
    results_per_page: z.number().describe('Number of results per page'),
    destination_name: z.string().describe('Resolved destination name'),
  }),
  handle: async params => {
    const searchUrl = buildSearchUrl({
      destination: params.destination,
      checkin: params.checkin,
      checkout: params.checkout,
      adults: params.adults,
      children: params.children,
      rooms: params.rooms,
      offset: params.offset,
    });

    const doc = await fetchPage(searchUrl);
    const cache = extractApolloCache(doc);

    if (!cache?.ROOT_QUERY) {
      return { properties: [], total_results: 0, results_per_page: 25, destination_name: params.destination };
    }

    // The search data is nested under ROOT_QUERY.searchQueries.search({...})
    const searchQueries = cache.ROOT_QUERY.searchQueries as Record<string, unknown> | undefined;
    if (!searchQueries) {
      return { properties: [], total_results: 0, results_per_page: 25, destination_name: params.destination };
    }

    // Find the main search key (starts with 'search(')
    const searchKey = Object.keys(searchQueries).find(k => k.startsWith('search('));
    const searchData = searchKey ? (searchQueries[searchKey] as Record<string, unknown>) : null;

    if (!searchData) {
      return { properties: [], total_results: 0, results_per_page: 25, destination_name: params.destination };
    }

    const results = (searchData.results as RawSearchResult[] | undefined) ?? [];
    const pagination = searchData.pagination as { nbResultsTotal?: number; nbResultsPerPage?: number } | undefined;
    const breadcrumbs = searchData.breadcrumbs as Array<{ name?: string }> | undefined;

    const destinationName =
      breadcrumbs
        ?.map(b => b.name)
        .filter(Boolean)
        .pop() ?? params.destination;

    return {
      properties: results.map(mapProperty),
      total_results: pagination?.nbResultsTotal ?? results.length,
      results_per_page: pagination?.nbResultsPerPage ?? 25,
      destination_name: destinationName,
    };
  },
});
