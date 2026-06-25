// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../yelp-api.js';

export const getBusiness = defineTool({
  name: 'get_business',
  displayName: 'Get Business',
  description: 'Get the full details, hours, photos, rating, and contact info of a single Yelp business by its ID.',
  summary: 'look up a business on yelp',
  icon: 'store',
  group: 'Businesses',
  input: z.object({
    business_id: z.string().min(1).describe('The Yelp business ID to fetch'),
  }),
  output: z.object({
    business: z.object({
      id: z.string(),
      name: z.string(),
      rating: z.number(),
    }).describe('The business detail'),
  }),
  handle: async (params: { business_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v3/businesses/:id (default method, a READ).
    const data = await api<{ business: { id: string; name: string; rating: number } }>(
      `/v3/businesses/${params.business_id}`,
      {}
    );
    return { business: data.business };
  },
});
