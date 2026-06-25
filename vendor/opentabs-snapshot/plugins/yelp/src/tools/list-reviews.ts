// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../yelp-api.js';

export const listReviews = defineTool({
  name: 'list_reviews',
  displayName: 'List Reviews',
  description: 'List the recent reviews for a Yelp business by its ID. Returns review text, rating, and author.',
  summary: 'read reviews of a business on yelp',
  icon: 'star',
  group: 'Reviews',
  input: z.object({
    business_id: z.string().min(1).describe('The Yelp business ID whose reviews to read'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of reviews to return'),
  }),
  output: z.object({
    reviews: z.array(z.object({
      id: z.string(),
      rating: z.number(),
      text: z.string(),
    })).describe('The business’s reviews'),
  }),
  handle: async (params: { business_id: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v3/businesses/:id/reviews (default method, a READ).
    const data = await api<{ reviews: unknown[] }>(
      `/v3/businesses/${params.business_id}/reviews`,
      { query: { limit: params.limit } }
    );
    return { reviews: data.reviews as { id: string; rating: number; text: string }[] };
  },
});
