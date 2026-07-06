import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchLdJson, fetchSsrData, findSsrOperation } from '../tripadvisor-api.js';
import {
  locationSchema,
  mapLocation,
  subratingsSchema,
  mapSubratings,
  aiSummarySchema,
  mapAiSummary,
  type RawLocation,
  type RawSubratings,
  type RawAiSummary,
} from './schemas.js';

export const getRestaurant = defineTool({
  name: 'get_restaurant',
  displayName: 'Get Restaurant',
  description:
    'Get detailed information about a TripAdvisor restaurant including ratings, subratings, cuisine, address, hours, AI review summary, and price range. Provide the restaurant URL path (e.g., "/Restaurant_Review-g60713-d480544-Reviews-...").',
  summary: 'Get restaurant details',
  icon: 'utensils',
  group: 'Restaurants',
  input: z.object({
    url: z
      .string()
      .describe(
        'Restaurant page URL path (e.g., "/Restaurant_Review-g60713-d480544-Reviews-Brenda_s_French_Soul_Food-San_Francisco_California.html")',
      ),
  }),
  output: z.object({
    restaurant: locationSchema,
    subratings: subratingsSchema,
    ai_summary: aiSummarySchema,
    keywords: z.array(z.string()).describe('Popular keywords from reviews'),
    is_saved: z.boolean().describe('Whether the restaurant is saved by the current user'),
  }),
  handle: async params => {
    const [ldJsonData, ssrData] = await Promise.all([fetchLdJson(params.url), fetchSsrData(params.url)]);

    // Extract FoodEstablishment from LD+JSON
    const ldRestaurant = ldJsonData.find(d => d['@type'] === 'FoodEstablishment' || d['@type'] === 'Restaurant') as
      | RawLocation
      | undefined;

    // Get location details from SSR
    const locationsData = findSsrOperation(ssrData, 'locations') as
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | null;

    // Merge LD+JSON with SSR data for the richest result
    const rawLocation: RawLocation = {
      ...(ldRestaurant ?? {}),
      ...(Array.isArray(locationsData) ? (locationsData[0] ?? {}) : {}),
    };

    // Extract review summary info for rating/count
    const reviewSummary = findSsrOperation(ssrData, 'reviewSummaryInfo') as Array<{
      responseData?: { rating?: number; count?: number };
    }> | null;
    if (reviewSummary?.[0]?.responseData) {
      rawLocation.rating = reviewSummary[0].responseData.rating;
      rawLocation.numReviews = reviewSummary[0].responseData.count;
    }

    // Get subratings
    const subratingsData = findSsrOperation(ssrData, 'restaurantSubratingsData') as {
      restaurants?: Array<{ sub_ratings?: RawSubratings }>;
    } | null;
    const rawSubratings = subratingsData?.restaurants?.[0]?.sub_ratings ?? {};

    // Get AI summary
    const aiSummary = findSsrOperation(ssrData, 'ReviewsProxy_getAiReviewSummaryWeb') as RawAiSummary[] | null;

    // Get keywords
    const keywordsData = findSsrOperation(ssrData, 'keywords') as Array<{
      responseData?: { keywords?: Array<{ keyword?: string }> };
    }> | null;
    const keywords = keywordsData?.[0]?.responseData?.keywords?.map(k => k.keyword ?? '') ?? [];

    // Get saved status
    const isSaved = findSsrOperation(ssrData, 'isSaved') as boolean[] | null;

    // Get ranking from SEO factors
    const opf = findSsrOperation(ssrData, 'Opf_getOnPageFactorsForLocale') as Array<{
      factors?: Array<{ key?: string; value?: string }>;
    }> | null;
    const rankingFactor = opf?.[0]?.factors?.find(f => f.key === 'MASTHEAD_H1');
    if (rankingFactor?.value) {
      rawLocation.rankingString = rankingFactor.value;
    }

    return {
      restaurant: mapLocation(rawLocation),
      subratings: mapSubratings(rawSubratings),
      ai_summary: mapAiSummary(aiSummary?.[0] ?? {}),
      keywords: keywords.filter(Boolean),
      is_saved: isSaved?.[0] ?? false,
    };
  },
});
