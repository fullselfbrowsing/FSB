import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';

interface EquityGrantsResponse {
  rows: Array<Record<string, unknown>>;
  totals: Record<string, unknown>;
}

const grantSchema = z.object({
  id: z.number(),
  label: z.string(),
  issue_date: z.string(),
  issuable_type: z.string(),
  status: z.string(),
  quantity: z.number(),
  vested: z.number(),
  exercised: z.number(),
  exercisable: z.number(),
  cost_to_exercise: z.number(),
});

export const listEquityGrants = defineTool({
  name: 'list_equity_grants',
  displayName: 'List Equity Grants',
  description:
    'List all equity grants (across all types) for a company. Provides a unified view of options, RSUs, SARs, and other grant types with totals.',
  summary: 'List all equity grants',
  icon: 'award',
  group: 'Holdings',
  input: z.object({
    corporation_id: z.number().int().min(1).describe('Corporation ID from list_companies'),
  }),
  output: z.object({
    grants: z.array(grantSchema),
    totals: z.object({
      quantity: z.number(),
      vested: z.number(),
      exercised: z.number(),
      exercisable: z.number(),
      cost_to_exercise: z.number(),
    }),
  }),
  handle: async params => {
    const ctx = requireContext();
    const data = await api<EquityGrantsResponse>(
      `/api/investors/holdings/portfolio/${ctx.portfolioId}/corporation/${params.corporation_id}/equity-grants/`,
    );
    return {
      grants: data.rows.map(r => ({
        id: Number(r.id ?? 0),
        label: String(r.label ?? ''),
        issue_date: String(r.issue_date ?? ''),
        issuable_type: String(r.issuable_type ?? ''),
        status: String(r.status ?? ''),
        quantity: Number(r.quantity ?? 0),
        vested: Number(r.vested ?? 0),
        exercised: Number(r.exercised ?? 0),
        exercisable: Number(r.exercisable ?? 0),
        cost_to_exercise: Number(r.cost_to_exercise ?? 0),
      })),
      totals: {
        quantity: Number(data.totals.quantity ?? 0),
        vested: Number(data.totals.vested ?? 0),
        exercised: Number(data.totals.exercised ?? 0),
        exercisable: Number(data.totals.exercisable ?? 0),
        cost_to_exercise: Number(data.totals.cost_to_exercise ?? 0),
      },
    };
  },
});
