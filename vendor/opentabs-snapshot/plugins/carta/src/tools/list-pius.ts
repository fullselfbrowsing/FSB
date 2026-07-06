import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';

interface PiuResponse {
  rows: Array<Record<string, unknown>>;
}

const piuSchema = z.object({
  id: z.number(),
  label: z.string(),
  issue_date: z.string(),
  issuable_type: z.string(),
  status: z.string(),
  quantity: z.number(),
  currency: z.string(),
});

export const listPius = defineTool({
  name: 'list_pius',
  displayName: 'List PIUs',
  description: 'List all profits interest units (PIUs) for a company in the portfolio.',
  summary: 'List profits interest units',
  icon: 'percent',
  group: 'Holdings',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({
    pius: z.array(piuSchema),
  }),
  handle: async params => {
    const ctx = requireContext();
    const data = await api<PiuResponse>(
      `/api/investors/holdings/portfolio/${ctx.portfolioId}/corporation/${params.corporation_id}/piu/`,
    );
    return {
      pius: data.rows.map(r => ({
        id: Number(r.id ?? 0),
        label: String(r.label ?? ''),
        issue_date: String(r.issue_date ?? ''),
        issuable_type: String(r.issuable_type ?? ''),
        status: String(r.status ?? ''),
        quantity: Number(r.quantity ?? 0),
        currency: String(r.currency ?? '$'),
      })),
    };
  },
});
