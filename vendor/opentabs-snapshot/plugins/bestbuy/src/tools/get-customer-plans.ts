import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bestbuy-api.js';
import { mapPlan, planSchema, type RawPlan } from './schemas.js';

interface PlansResponse {
  plans?: RawPlan[];
}

export const getCustomerPlans = defineTool({
  name: 'get_customer_plans',
  displayName: 'Get Customer Plans',
  description:
    'Get active plans and subscriptions for the current Best Buy account. Returns Geek Squad protection plans, Best Buy membership plans, and any other active service plans.',
  summary: 'Get active plans and subscriptions',
  icon: 'shield-check',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    plans: z.array(planSchema).describe('Active plans and subscriptions'),
  }),
  handle: async () => {
    const data = await api<PlansResponse>('/profile/rest/customerplans/carouselplans');

    return { plans: (data.plans ?? []).map(mapPlan) };
  },
});
