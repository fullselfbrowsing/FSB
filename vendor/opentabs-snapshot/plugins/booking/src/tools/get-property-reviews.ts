import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, extractApolloCache, buildSearchUrl } from '../booking-api.js';
import { mapProperty } from './schemas.js';
import type { RawSearchResult } from './schemas.js';

export const getPropertyReviews = defineTool({
  name: 'get_property_reviews',
  displayName: 'Get Property Reviews',
  description:
    'Get the review summary for a property on Booking.com by searching for it. Returns the overall score, score breakdown by category, and review count. For individual review text, use navigate_to_property to open the property page.',
  summary: 'Get property review scores',
  icon: 'star',
  group: 'Properties',
  input: z.object({
    property_name: z.string().describe('Property name to search for'),
    city: z.string().describe('City where the property is located'),
    checkin: z.string().describe('Check-in date in YYYY-MM-DD format'),
    checkout: z.string().describe('Check-out date in YYYY-MM-DD format'),
  }),
  output: z.object({
    property_name: z.string().describe('Property name'),
    review_score: z.number().describe('Overall review score out of 10'),
    review_score_word: z.string().describe('Review score label (e.g., Wonderful, Very Good)'),
    review_count: z.number().describe('Total number of reviews'),
    star_rating: z.number().describe('Star rating (0-5)'),
  }),
  handle: async params => {
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
    const searchKey = searchQueries ? Object.keys(searchQueries).find(k => k.startsWith('search(')) : undefined;
    const searchData = searchKey ? (searchQueries?.[searchKey] as Record<string, unknown>) : null;
    const results = (searchData?.results as RawSearchResult[] | undefined) ?? [];

    if (results.length === 0) {
      throw ToolError.notFound(`No results found for "${params.property_name}" in ${params.city}`);
    }

    const nameNorm = params.property_name.toLowerCase();
    const match = results.find(r => r.displayName?.text?.toLowerCase().includes(nameNorm));
    const result = match ?? results[0];
    if (!result) {
      throw ToolError.notFound(`No results found for "${params.property_name}" in ${params.city}`);
    }
    const mapped = mapProperty(result);

    return {
      property_name: mapped.name,
      review_score: mapped.review_score,
      review_score_word: mapped.review_score_word,
      review_count: mapped.review_count,
      star_rating: mapped.star_rating,
    };
  },
});
