import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, extractApolloCache, buildSearchUrl } from '../booking-api.js';
import { propertySchema, mapProperty } from './schemas.js';
import type { RawSearchResult } from './schemas.js';

export const getProperty = defineTool({
  name: 'get_property',
  displayName: 'Get Property',
  description:
    'Get detailed information about a specific property on Booking.com by searching for it. Provide the property name and city to find it, along with check-in/check-out dates for pricing.',
  summary: 'Get property details by name and location',
  icon: 'building',
  group: 'Properties',
  input: z.object({
    property_name: z.string().describe('Property name or partial name to search for'),
    city: z.string().describe('City where the property is located'),
    checkin: z.string().describe('Check-in date in YYYY-MM-DD format (for pricing)'),
    checkout: z.string().describe('Check-out date in YYYY-MM-DD format (for pricing)'),
  }),
  output: z.object({
    property: propertySchema,
  }),
  handle: async params => {
    // Search for the property by name + city
    const searchUrl = buildSearchUrl({
      destination: `${params.property_name} ${params.city}`,
      checkin: params.checkin,
      checkout: params.checkout,
    });

    const doc = await fetchPage(searchUrl);
    const cache = extractApolloCache(doc);

    if (!cache?.ROOT_QUERY) {
      throw ToolError.notFound(`No results found for "${params.property_name}" in ${params.city}`);
    }

    const searchQueries = cache.ROOT_QUERY.searchQueries as Record<string, unknown> | undefined;
    if (!searchQueries) {
      throw ToolError.notFound(`No results found for "${params.property_name}" in ${params.city}`);
    }

    const searchKey = Object.keys(searchQueries).find(k => k.startsWith('search('));
    const searchData = searchKey ? (searchQueries[searchKey] as Record<string, unknown>) : null;
    const results = (searchData?.results as RawSearchResult[] | undefined) ?? [];

    if (results.length === 0) {
      throw ToolError.notFound(`No results found for "${params.property_name}" in ${params.city}`);
    }

    // Find the best matching property by name
    const nameNorm = params.property_name.toLowerCase();
    const match = results.find(r => r.displayName?.text?.toLowerCase().includes(nameNorm));
    const result = match ?? results[0];
    if (!result) {
      throw ToolError.notFound(`No results found for "${params.property_name}" in ${params.city}`);
    }

    return { property: mapProperty(result) };
  },
});
