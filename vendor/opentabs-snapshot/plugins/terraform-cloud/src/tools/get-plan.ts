import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { planSchema, mapPlan } from './schemas.js';
import type { RawPlan } from './schemas.js';

export const getPlan = defineTool({
  name: 'get_plan',
  displayName: 'Get Plan',
  description:
    "Get details about a plan including resource changes and status. Use the plan ID from a run's relationships.",
  summary: 'Get plan details',
  icon: 'file-text',
  group: 'Plans',
  input: z.object({
    plan_id: z.string().describe('Plan ID (e.g., "plan-...")'),
  }),
  output: z.object({
    plan: planSchema,
  }),
  handle: async params => {
    const data = await api<JsonApiResponse<RawPlan>>(`/plans/${encodeURIComponent(params.plan_id)}`);

    return {
      plan: mapPlan(data.data.id, data.data.attributes),
    };
  },
});
