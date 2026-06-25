import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawSubscription, type StripeList, mapSubscription, subscriptionSchema } from './schemas.js';

export const listSubscriptions = defineTool({
  name: 'list_subscriptions',
  displayName: 'List Subscriptions',
  description:
    'List subscriptions in your Stripe account. Returns subscriptions sorted by creation date (newest first).',
  summary: 'List subscriptions with pagination',
  icon: 'repeat',
  group: 'Subscriptions',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
    starting_after: z.string().optional().describe('Subscription ID cursor for pagination'),
    customer: z.string().optional().describe('Filter by customer ID'),
    status: z
      .enum([
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused',
        'all',
      ])
      .optional()
      .describe('Filter by subscription status (default active)'),
  }),
  output: z.object({
    subscriptions: z.array(subscriptionSchema).describe('List of subscriptions'),
    has_more: z.boolean().describe('Whether more results exist'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawSubscription>>('/subscriptions', {
      query: {
        limit: params.limit,
        starting_after: params.starting_after,
        customer: params.customer,
        status: params.status,
      },
    });
    return {
      subscriptions: (data.data ?? []).map(mapSubscription),
      has_more: data.has_more ?? false,
    };
  },
});
