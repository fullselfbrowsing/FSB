import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';

const billingPlanSchema = z.object({
  name: z.string().describe('Plan name'),
  slug: z.string().describe('Plan slug identifier'),
  price: z.number().describe('Monthly plan price in cents'),
  billing_period: z.string().describe('Billing period (monthly or yearly)'),
  is_free: z.boolean().describe('Whether the plan is free'),
});

interface RawBillingPlan {
  name?: string;
  slug?: string;
  price?: number;
  billingPeriod?: string;
  isFree?: boolean;
}

export const getWorkspaceBilling = defineTool({
  name: 'get_workspace_billing',
  displayName: 'Get Workspace Billing',
  description:
    'Get the billing plan details for a Webflow workspace including plan name, price, and billing period. Returns empty fields for free-tier workspaces.',
  summary: 'Get workspace billing plan',
  icon: 'credit-card',
  group: 'Workspaces',
  input: z.object({
    workspace_slug: z.string().describe('Workspace URL slug'),
  }),
  output: z.object({ plan: billingPlanSchema }),
  handle: async params => {
    const data = await api<RawBillingPlan | null>(`/billing/plans/workspace/${params.workspace_slug}`);
    const p = data ?? {};
    return {
      plan: {
        name: p.name ?? 'free',
        slug: p.slug ?? 'free',
        price: p.price ?? 0,
        billing_period: p.billingPeriod ?? '',
        is_free: p.isFree ?? true,
      },
    };
  },
});
