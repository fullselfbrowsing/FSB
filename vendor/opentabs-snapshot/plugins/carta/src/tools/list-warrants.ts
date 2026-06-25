import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';

interface WarrantsResponse {
  rows: Array<Record<string, unknown>>;
}

const warrantSchema = z.object({
  id: z.number(),
  label: z.string(),
  issue_date: z.string(),
  issuable_type: z.string(),
  status: z.string(),
  quantity: z.number(),
  currency: z.string(),
});

export const listWarrants = defineTool({
  name: 'list_warrants',
  displayName: 'List Warrants',
  description: 'List all warrant holdings for a company in the portfolio.',
  summary: 'List warrants',
  icon: 'scroll',
  group: 'Holdings',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({
    warrants: z.array(warrantSchema),
  }),
  handle: async params => {
    const ctx = requireContext();
    const data = await api<WarrantsResponse>(
      `/api/investors/holdings/portfolio/${ctx.portfolioId}/corporation/${params.corporation_id}/warrants/`,
    );
    return {
      warrants: data.rows.map(r => ({
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
