import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawSubscription, type StripeList, mapSubscription, subscriptionSchema } from './schemas.js';

export const searchSubscriptions = defineTool({
  name: 'search_subscriptions',
  displayName: 'Search Subscriptions',
  description:
    'Search subscriptions using Stripe search syntax. Example queries: "status:\'active\'", "customer:\'cus_xxx\'".',
  summary: 'Search subscriptions by query',
  icon: 'search',
  group: 'Subscriptions',
  input: z.object({
    query: z.string().describe('Search query using Stripe search syntax'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
  }),
  output: z.object({
    subscriptions: z.array(subscriptionSchema).describe('Matching subscriptions'),
    has_more: z.boolean().describe('Whether more results exist'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawSubscription>>('/subscriptions/search', {
      query: { query: params.query, limit: params.limit },
    });
    return {
      subscriptions: (data.data ?? []).map(mapSubscription),
      has_more: data.has_more ?? false,
    };
  },
});
