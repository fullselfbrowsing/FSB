import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';
import { companySchema, mapCompany } from './schemas.js';

interface CompanyListResponse {
  count: number;
  results: {
    companies: Array<Record<string, unknown>>;
  };
}

export const listCompanies = defineTool({
  name: 'list_companies',
  displayName: 'List Companies',
  description:
    'List all companies in the portfolio. Returns company names, IDs, and basic info. Use the corporation_id in other tools to get details.',
  summary: 'List portfolio companies',
  icon: 'building',
  group: 'Portfolio',
  input: z.object({}),
  output: z.object({
    count: z.number(),
    companies: z.array(companySchema),
  }),
  handle: async () => {
    const ctx = requireContext();
    const data = await api<CompanyListResponse>(`/api/investors/portfolio/fund/${ctx.portfolioId}/list/`);
    return {
      count: data.count,
      companies: data.results.companies.map(mapCompany),
    };
  },
});
