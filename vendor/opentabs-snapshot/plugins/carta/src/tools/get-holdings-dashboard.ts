import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';
import { holdingsDashboardSchema } from './schemas.js';

interface DashboardResponse {
  held_since: string | null;
  cash_cost: number | null;
  ownership: string | null;
  currency: string;
  show_cost_card: boolean;
  captable_access_level: string;
}

export const getHoldingsDashboard = defineTool({
  name: 'get_holdings_dashboard',
  displayName: 'Get Holdings Dashboard',
  description:
    'Get a summary dashboard for holdings in a specific company, including cost basis, ownership percentage, and how long shares have been held.',
  summary: 'Get holdings summary for a company',
  icon: 'layout-dashboard',
  group: 'Holdings',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({ dashboard: holdingsDashboardSchema }),
  handle: async params => {
    const ctx = requireContext();
    const data = await api<DashboardResponse>(
      `/api/investors/holdings/portfolio/${ctx.portfolioId}/corporation/${params.corporation_id}/holdings-dashboard/`,
    );
    return {
      dashboard: {
        held_since: data.held_since,
        cash_cost: data.cash_cost,
        ownership: data.ownership,
        currency: data.currency,
        show_cost_card: data.show_cost_card,
        captable_access_level: data.captable_access_level,
      },
    };
  },
});
