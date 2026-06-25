import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type RawSubscription, mapSubscription, subscriptionSchema } from './schemas.js';

export const getSubscription = defineTool({
  name: 'get_subscription',
  displayName: 'Get Subscription',
  description: 'Get detailed information about a specific Azure subscription by its ID.',
  summary: 'Get subscription details',
  icon: 'credit-card',
  group: 'Subscriptions',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
  }),
  output: z.object({ subscription: subscriptionSchema }),
  handle: async params => {
    const data = await armApi<RawSubscription>(`/subscriptions/${params.subscription_id}`);
    return { subscription: mapSubscription(data) };
  },
});
