// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../craigslist-api.js';

export const postListing = defineTool({
  name: 'post_listing',
  displayName: 'Post Listing',
  description:
    'Post a new Craigslist classified listing in a region and category. NOTE this is NOT a payment op, but Craigslist is a sensitive marketplace origin so the write is consent-gated.',
  summary: 'post a new listing on craigslist',
  icon: 'plus-circle',
  group: 'Listings',
  input: z.object({
    title: z.string().min(1).describe('The listing title'),
    body: z.string().min(1).describe('The listing body/description'),
    region: z.string().min(1).describe('City or region subdomain to post in (e.g. sfbay)'),
    category: z.string().min(1).describe('Category to post under (e.g. for-sale)'),
    price: z.number().int().optional().describe('Optional asking price'),
  }),
  output: z.object({
    listing: z.object({
      id: z.string(),
      url: z.string(),
    }).describe('The posted listing'),
  }),
  handle: async (params: { title: string; body: string; region: string; category: string; price?: number }) => {
    // NEVER executed by the importer. Upstream: api POST /listing -- posts a new ad
    // (post -> a WRITE via the {method:'POST'} literal; NOT a payment op -- 'post' is not a
    // payment verb and 'post_listing' is not a payment op-name). backing:'dom' keeps it DOM-only.
    const data = await api<{ listing: { id: string; url: string } }>('/listing', {
      method: 'POST',
      body: {
        title: params.title,
        body: params.body,
        region: params.region,
        category: params.category,
        price: params.price,
      },
    });
    return { listing: data.listing };
  },
});
