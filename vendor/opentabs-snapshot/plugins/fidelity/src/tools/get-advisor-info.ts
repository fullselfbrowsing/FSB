import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fidelityRest } from '../fidelity-api.js';

export const getAdvisorInfo = defineTool({
  name: 'get_advisor_info',
  displayName: 'Get Advisor Info',
  description: 'Get information about your assigned financial advisor and service model at Fidelity.',
  summary: 'View your advisor assignment',
  icon: 'user-check',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    has_advisor: z.boolean().describe('Whether an advisor is assigned'),
    service_model: z.string().describe('Service model (e.g., Std, Premium)'),
    advisors: z
      .array(
        z.object({
          name: z.string().describe('Advisor name'),
          phone: z.string().describe('Advisor phone number'),
          email: z.string().describe('Advisor email'),
        }),
      )
      .describe('Assigned advisors'),
  }),
  handle: async () => {
    interface AdvisorResponse {
      hasAdvisor?: boolean;
      advisors?: Array<{
        name?: string;
        phone?: string;
        email?: string;
      }>;
      serviceModel?: string;
    }

    const data = await fidelityRest<AdvisorResponse>('/ftgw/digital/client-relationship/api/advisors');

    return {
      has_advisor: data.hasAdvisor ?? false,
      service_model: data.serviceModel ?? '',
      advisors: (data.advisors ?? []).map(a => ({
        name: a.name ?? '',
        phone: a.phone ?? '',
        email: a.email ?? '',
      })),
    };
  },
});
