import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storeGet } from '../steam-api.js';
import { type RawReview, mapReview, reviewSchema, reviewSummarySchema } from './schemas.js';

interface ReviewsResponse {
  success: number;
  query_summary?: {
    total_reviews?: number;
    total_positive?: number;
    total_negative?: number;
    review_score_desc?: string;
  };
  reviews?: RawReview[];
  cursor?: string;
}

export const getAppReviews = defineTool({
  name: 'get_app_reviews',
  displayName: 'Get App Reviews',
  description:
    'Get user reviews for a Steam app. Returns a review summary (total counts, score label) and individual reviews with text, vote, playtime, and author info. Use cursor for pagination.',
  summary: 'Get user reviews for a Steam app',
  icon: 'message-square',
  group: 'Store',
  input: z.object({
    appid: z.number().int().describe('Steam app ID'),
    language: z.string().optional().describe('Language filter (default "all"). Use "english", "spanish", etc.'),
    num_per_page: z.number().int().min(1).max(100).optional().describe('Reviews per page (default 20, max 100)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    filter: z.enum(['recent', 'updated', 'all']).optional().describe('Review filter (default "all")'),
    review_type: z
      .enum(['all', 'positive', 'negative'])
      .optional()
      .describe('Filter by review sentiment (default "all")'),
  }),
  output: z.object({
    summary: reviewSummarySchema.describe('Aggregate review statistics'),
    reviews: z.array(reviewSchema).describe('Individual reviews'),
    cursor: z.string().describe('Cursor for fetching the next page'),
  }),
  handle: async params => {
    const data = await storeGet<ReviewsResponse>(`/appreviews/${params.appid}`, {
      json: 1,
      language: params.language ?? 'all',
      num_per_page: params.num_per_page ?? 20,
      cursor: params.cursor ?? '*',
      filter: params.filter ?? 'all',
      review_type: params.review_type ?? 'all',
    });
    const qs = data.query_summary;
    return {
      summary: {
        total_reviews: qs?.total_reviews ?? 0,
        total_positive: qs?.total_positive ?? 0,
        total_negative: qs?.total_negative ?? 0,
        review_score_desc: qs?.review_score_desc ?? '',
      },
      reviews: (data.reviews ?? []).map(mapReview),
      cursor: data.cursor ?? '',
    };
  },
});
