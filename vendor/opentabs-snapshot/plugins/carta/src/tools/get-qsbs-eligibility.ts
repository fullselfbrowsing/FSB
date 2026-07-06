import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';

interface QsbsResponse {
  results: Array<Record<string, unknown>>;
}

export const getQsbsEligibility = defineTool({
  name: 'get_qsbs_eligibility',
  displayName: 'Get QSBS Eligibility',
  description:
    'Get Qualified Small Business Stock (QSBS) eligible sold shares for a company. QSBS shares may qualify for federal tax exclusion under Section 1202.',
  summary: 'Get QSBS eligible shares',
  icon: 'shield-check',
  group: 'Tax',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({
    results: z.array(z.record(z.string(), z.unknown())),
  }),
  handle: async params => {
    const ctx = requireContext();
    const data = await api<QsbsResponse>(
      `/api/tax-advisory/v1/qsbs/individual/corporation/${params.corporation_id}/portfolio/${ctx.portfolioId}/qsbs-eligible-sold-shares/`,
    );
    return { results: data.results };
  },
});
