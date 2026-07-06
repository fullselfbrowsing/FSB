import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawSubscription, mapSubscription, subscriptionSchema } from './schemas.js';

export const listSubscriptions = defineTool({
  name: 'list_subscriptions',
  displayName: 'List Subscriptions',
  description:
    'List all Azure subscriptions accessible to the current user. Returns subscription ID, display name, state, and tenant ID.',
  summary: 'List all Azure subscriptions',
  icon: 'credit-card',
  group: 'Subscriptions',
  input: z.object({}),
  output: z.object({
    subscriptions: z.array(subscriptionSchema).describe('List of subscriptions'),
  }),
  handle: async () => {
    const data = await armApi<ArmListResponse<RawSubscription>>('/subscriptions');
    return { subscriptions: (data.value ?? []).map(mapSubscription) };
  },
});
