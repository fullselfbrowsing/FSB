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

export const getAttraction = defineTool({
  name: 'get_attraction',
  displayName: 'Get Attraction',
  description:
    'Get detailed information about a TripAdvisor attraction or thing to do including ratings, address, and AI review summary. Provide the attraction URL path.',
  summary: 'Get attraction details',
  icon: 'landmark',
  group: 'Attractions',
  input: z.object({
    url: z
      .string()
      .describe('Attraction page URL path (e.g., "/Attraction_Review-g60713-d104675-Reviews-Alcatraz_Island-...")'),
  }),
  output: z.object({
    attraction: locationSchema,
    ai_summary: aiSummarySchema,
    keywords: z.array(z.string()).describe('Popular keywords from reviews'),
    is_saved: z.boolean().describe('Whether the attraction is saved by the current user'),
  }),
  handle: async params => {
    const [ldJsonData, ssrData] = await Promise.all([fetchLdJson(params.url), fetchSsrData(params.url)]);

    const ldAttraction = ldJsonData.find(
      d => d['@type'] === 'TouristAttraction' || d['@type'] === 'LocalBusiness' || d['@type'] === 'Place',
    ) as RawLocation | undefined;

    const rawLocation: RawLocation = { ...(ldAttraction ?? {}) };

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
      attraction: mapLocation(rawLocation),
      ai_summary: mapAiSummary(aiSummary?.[0] ?? {}),
      keywords: keywords.filter(Boolean),
      is_saved: isSaved?.[0] ?? false,
    };
  },
});
