// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../tripadvisor-api.js';

export const listReviews = defineTool({
  name: 'list_reviews',
  displayName: 'List Reviews',
  description: 'List the recent traveler reviews for a Tripadvisor location by its ID. Returns review text, rating, and trip type.',
  summary: 'read reviews of a location on tripadvisor',
  icon: 'star',
  group: 'Reviews',
  input: z.object({
    location_id: z.string().min(1).describe('The Tripadvisor location ID whose reviews to read'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of reviews to return'),
  }),
  output: z.object({
    reviews: z.array(z.object({
      id: z.string(),
      rating: z.number(),
      text: z.string(),
    })).describe('The location’s traveler reviews'),
  }),
  handle: async (params: { location_id: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /location/:id/reviews (default method, a READ).
    const data = await api<{ reviews: unknown[] }>(
      `/location/${params.location_id}/reviews`,
      { query: { limit: params.limit } }
    );
    return { reviews: data.reviews as { id: string; rating: number; text: string }[] };
  },
});
