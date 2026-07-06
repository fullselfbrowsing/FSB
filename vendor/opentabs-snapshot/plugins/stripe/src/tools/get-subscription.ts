import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawSubscription, mapSubscription, subscriptionSchema } from './schemas.js';

export const getSubscription = defineTool({
  name: 'get_subscription',
  displayName: 'Get Subscription',
  description: 'Get detailed information about a specific subscription by its ID.',
  summary: 'Get a subscription by ID',
  icon: 'repeat',
  group: 'Subscriptions',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (e.g., sub_xxx)'),
  }),
  output: z.object({ subscription: subscriptionSchema }),
  handle: async params => {
    const data = await api<RawSubscription>(`/subscriptions/${params.subscription_id}`);
    return { subscription: mapSubscription(data) };
  },
});
