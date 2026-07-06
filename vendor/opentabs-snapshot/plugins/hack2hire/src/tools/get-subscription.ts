import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../hack2hire-api.js';
import { type RawSubscription, mapSubscription, subscriptionSchema } from './schemas.js';

export const getSubscription = defineTool({
  name: 'get_subscription',
  displayName: 'Get Subscription',
  description:
    "Get the authenticated user's subscription details — status (ACTIVE, CANCELED, EXPIRED, PENDING, TRIALING), payment method, plan duration code, current billing period start/end, and price.",
  summary: 'Get the current subscription details',
  icon: 'credit-card',
  group: 'Account',
  input: z.object({}),
  output: z.object({ subscription: subscriptionSchema }),
  handle: async () => {
    const data = await api<RawSubscription>('/user/subscription-detail');
    return { subscription: mapSubscription(data) };
  },
});
