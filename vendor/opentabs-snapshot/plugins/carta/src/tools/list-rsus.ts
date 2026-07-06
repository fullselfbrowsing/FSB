import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';
import { rsuSchema, mapRsu } from './schemas.js';

interface RsuResponse {
  rows: Array<Record<string, unknown>>;
}

export const listRsus = defineTool({
  name: 'list_rsus',
  displayName: 'List RSUs',
  description:
    'List all restricted stock unit (RSU) grants for a company in the portfolio. Shows grant labels, quantities, vesting status, settled shares, and settlement eligibility.',
  summary: 'List RSU grants',
  icon: 'lock',
  group: 'Holdings',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({
    rsus: z.array(rsuSchema),
  }),
  handle: async params => {
    const ctx = requireContext();
    const data = await api<RsuResponse>(
      `/api/investors/holdings/portfolio/${ctx.portfolioId}/corporation/${params.corporation_id}/rsu/`,
    );
    return {
      rsus: data.rows.map(mapRsu),
    };
  },
});
