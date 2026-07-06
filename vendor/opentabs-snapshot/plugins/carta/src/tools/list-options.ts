import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';
import { optionGrantSchema, mapOptionGrant } from './schemas.js';

interface OptionsResponse {
  rows: Array<Record<string, unknown>>;
}

export const listOptions = defineTool({
  name: 'list_options',
  displayName: 'List Options',
  description:
    'List all stock option grants (ISOs, NSOs) for a company in the portfolio. Shows grant labels, quantities, vesting status, exercise price, and exercisability.',
  summary: 'List stock option grants',
  icon: 'ticket',
  group: 'Holdings',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({
    options: z.array(optionGrantSchema),
  }),
  handle: async params => {
    const ctx = requireContext();
    const data = await api<OptionsResponse>(
      `/api/investors/holdings/portfolio/${ctx.portfolioId}/corporation/${params.corporation_id}/options/`,
    );
    return {
      options: data.rows.map(mapOptionGrant),
    };
  },
});
