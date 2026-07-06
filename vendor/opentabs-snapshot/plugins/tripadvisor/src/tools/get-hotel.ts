import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchLdJson, fetchSsrData, findSsrOperation } from '../tripadvisor-api.js';
import {
  locationSchema,
  mapLocation,
  aiSummarySchema,
  mapAiSummary,
  type RawLocation,
  type RawAiSummary,
} from './schemas.js';

export const getHotel = defineTool({
  name: 'get_hotel',
  displayName: 'Get Hotel',
  description:
    'Get detailed information about a TripAdvisor hotel including ratings, address, AI review summary, and price range. Provide the hotel URL path.',
  summary: 'Get hotel details',
  icon: 'hotel',
  group: 'Hotels',
  input: z.object({
    url: z
      .string()
      .describe('Hotel page URL path (e.g., "/Hotel_Review-g60713-d224953-Reviews-Hotel_Nikko_San_Francisco-...")'),
  }),
  output: z.object({
    hotel: locationSchema,
    ai_summary: aiSummarySchema,
    keywords: z.array(z.string()).describe('Popular keywords from reviews'),
    is_saved: z.boolean().describe('Whether the hotel is saved by the current user'),
  }),
  handle: async params => {
    const [ldJsonData, ssrData] = await Promise.all([fetchLdJson(params.url), fetchSsrData(params.url)]);

    const ldHotel = ldJsonData.find(d => d['@type'] === 'Hotel' || d['@type'] === 'LodgingBusiness') as
      | RawLocation
      | undefined;

    const rawLocation: RawLocation = { ...(ldHotel ?? {}) };

    const reviewSummary = findSsrOperation(ssrData, 'reviewSummaryInfo') as Array<{
      responseData?: { rating?: number; count?: number };
    }> | null;
    if (reviewSummary?.[0]?.responseData) {
      rawLocation.rating = reviewSummary[0].responseData.rating;
      rawLocation.numReviews = reviewSummary[0].responseData.count;
    }

    const aiSummary = findSsrOperation(ssrData, 'ReviewsProxy_getAiReviewSummaryWeb') as RawAiSummary[] | null;

    const keywordsData = findSsrOperation(ssrData, 'keywords') as Array<{
      responseData?: { keywords?: Array<{ keyword?: string }> };
    }> | null;
    const keywords = keywordsData?.[0]?.responseData?.keywords?.map(k => k.keyword ?? '') ?? [];

    const isSaved = findSsrOperation(ssrData, 'isSaved') as boolean[] | null;

    const opf = findSsrOperation(ssrData, 'Opf_getOnPageFactorsForLocale') as Array<{
      factors?: Array<{ key?: string; value?: string }>;
    }> | null;
    const rankingFactor = opf?.[0]?.factors?.find(f => f.key === 'MASTHEAD_H1');
    if (rankingFactor?.value) {
      rawLocation.rankingString = rankingFactor.value;
    }

    return {
      hotel: mapLocation(rawLocation),
      ai_summary: mapAiSummary(aiSummary?.[0] ?? {}),
      keywords: keywords.filter(Boolean),
      is_saved: isSaved?.[0] ?? false,
    };
  },
});
