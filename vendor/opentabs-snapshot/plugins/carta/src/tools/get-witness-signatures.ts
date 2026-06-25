import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';

interface WitnessResponse {
  results: Array<Record<string, unknown>>;
  num_pages: number;
  page: number;
  page_size: number;
}

export const getWitnessSignatures = defineTool({
  name: 'get_witness_signatures',
  displayName: 'Get Witness Signatures',
  description: 'Get pending witness signature requests for option agreements in the portfolio.',
  summary: 'Get witness signature requests',
  icon: 'pen-tool',
  group: 'Documents',
  input: z.object({}),
  output: z.object({
    results: z.array(z.record(z.string(), z.unknown())),
    num_pages: z.number(),
    page: z.number(),
  }),
  handle: async () => {
    const ctx = requireContext();
    const data = await api<WitnessResponse>(`/common/api/witness-signatures/portfolio/${ctx.portfolioId}/`);
    return {
      results: data.results,
      num_pages: data.num_pages,
      page: data.page,
    };
  },
});
