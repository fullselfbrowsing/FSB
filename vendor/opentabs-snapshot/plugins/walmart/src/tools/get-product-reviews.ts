import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPageData } from '../walmart-api.js';
import {
  mapReview,
  mapReviewSummary,
  type RawReview,
  type RawReviewSummary,
  reviewSchema,
  reviewSummarySchema,
} from './schemas.js';

export const getProductReviews = defineTool({
  name: 'get_product_reviews',
  displayName: 'Get Product Reviews',
  description:
    'Get customer reviews for a Walmart product. Returns review summary and individual reviews with ratings and text.',
  summary: 'Get product reviews by item ID',
  icon: 'message-square',
  group: 'Products',
  input: z.object({
    us_item_id: z.string().describe('Walmart US item ID'),
  }),
  output: z.object({
    summary: reviewSummarySchema,
    reviews: z.array(reviewSchema),
  }),
  handle: async params => {
    const data = await fetchPageData(`/ip/item/${params.us_item_id}`);

    const initialData = data.initialData as Record<string, unknown> | undefined;
    const innerData = initialData?.data as Record<string, unknown> | undefined;
    const reviewsData = innerData?.reviews as Record<string, unknown> | undefined;

    if (!reviewsData) {
      throw ToolError.notFound(`Reviews not found for product: ${params.us_item_id}`);
    }

    const rawSummary = (
      reviewsData.roundedAverageOverallRating !== undefined
        ? reviewsData
        : (reviewsData.reviewStatistics ?? reviewsData)
    ) as RawReviewSummary;

    const customerReviews = (reviewsData.customerReviews ?? []) as RawReview[];
    const reviews = customerReviews.map(mapReview);

    return {
      summary: mapReviewSummary(rawSummary),
      reviews,
    };
  },
});
