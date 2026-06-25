import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../atlas-api.js';
import { type RawBillingPlan, billingPlanSchema, mapBillingPlan } from './schemas.js';

export const getBillingPlan = defineTool({
  name: 'get_billing_plan',
  displayName: 'Get Billing Plan',
  description:
    'Get the billing plan for the current MongoDB Atlas organization including plan type, display name, and whether it is a paid plan.',
  summary: 'Get organization billing plan',
  icon: 'credit-card',
  group: 'Billing',
  input: z.object({}),
  output: z.object({ plan: billingPlanSchema.describe('The billing plan') }),
  handle: async () => {
    const orgId = getOrgId();
    const raw = await api<RawBillingPlan>(`/billing/plan/${orgId}`);
    return { plan: mapBillingPlan(raw) };
  },
});
