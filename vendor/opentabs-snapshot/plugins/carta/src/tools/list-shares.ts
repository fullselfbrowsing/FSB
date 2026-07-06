import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';
import { shareSchema, mapShare } from './schemas.js';

interface SharesResponse {
  rows: Array<Record<string, unknown>>;
}

export const listShares = defineTool({
  name: 'list_shares',
  displayName: 'List Shares',
  description:
    'List all share certificates for a company in the portfolio. Shows certificate labels, quantities, stock types, cost basis, and exercise origins.',
  summary: 'List share certificates',
  icon: 'file-text',
  group: 'Holdings',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({
    shares: z.array(shareSchema),
  }),
  handle: async params => {
    const ctx = requireContext();
    const data = await api<SharesResponse>(
      `/api/investors/holdings/portfolio/${ctx.portfolioId}/corporation/${params.corporation_id}/shares/`,
    );
    return {
      shares: data.rows.map(mapShare),
    };
  },
});
