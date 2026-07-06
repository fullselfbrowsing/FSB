import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchSsrData, findSsrOperation } from '../tripadvisor-api.js';
import { reviewSchema, mapReview, type RawReview } from './schemas.js';

export const getReviews = defineTool({
  name: 'get_reviews',
  displayName: 'Get Reviews',
  description:
    'Get reviews for a TripAdvisor location (restaurant, hotel, or attraction). Returns the most recent reviews with ratings, text, and author info. Use offset in the URL path to paginate (e.g., "-or15-" for page 2).',
  summary: 'Get location reviews',
  icon: 'message-square',
  group: 'Reviews',
  input: z.object({
    url: z
      .string()
      .describe(
        'Location review page URL path (e.g., "/Restaurant_Review-g60713-d480544-Reviews-..." or with offset "/Restaurant_Review-g60713-d480544-Reviews-or15-...")',
      ),
  }),
  output: z.object({
    reviews: z.array(reviewSchema).describe('List of reviews'),
    total_count: z.number().int().describe('Total number of reviews'),
    rating: z.number().describe('Overall rating (0-5)'),
  }),
  handle: async params => {
    const ssrData = await fetchSsrData(params.url);

    const reviewListData = findSsrOperation(ssrData, 'ReviewsProxy_getReviewListPageForLocation') as Array<{
      totalCount?: number;
      reviews?: RawReview[];
    }> | null;

    const reviewList = reviewListData?.[0];
    const rawReviews = reviewList?.reviews ?? [];

    const reviewSummary = findSsrOperation(ssrData, 'reviewSummaryInfo') as Array<{
      responseData?: { rating?: number; count?: number };
    }> | null;

    return {
      reviews: rawReviews.map(mapReview),
      total_count: reviewList?.totalCount ?? reviewSummary?.[0]?.responseData?.count ?? 0,
      rating: reviewSummary?.[0]?.responseData?.rating ?? 0,
    };
  },
});
