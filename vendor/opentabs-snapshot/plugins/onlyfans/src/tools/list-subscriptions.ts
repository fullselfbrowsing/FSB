import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawSubscription, mapSubscription, subscriptionSchema } from './schemas.js';

export const listSubscriptions = defineTool({
  name: 'list_subscriptions',
  displayName: 'List Subscriptions',
  description: 'List your active subscriptions to other creators. Shows who you are currently subscribed to.',
  summary: 'List your active subscriptions',
  icon: 'credit-card',
  group: 'Subscriptions',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Number of subscriptions to return (default 10)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
    type: z.enum(['active', 'expired', 'all']).optional().describe('Subscription type filter (default "active")'),
  }),
  output: z.object({
    subscriptions: z.array(subscriptionSchema).describe('Subscription list'),
  }),
  handle: async params => {
    const data = await api<RawSubscription[]>('/subscriptions/subscribes', {
      query: {
        limit: params.limit ?? 10,
        offset: params.offset ?? 0,
        type: params.type ?? 'active',
      },
    });
    return { subscriptions: (data ?? []).map(mapSubscription) };
  },
});
