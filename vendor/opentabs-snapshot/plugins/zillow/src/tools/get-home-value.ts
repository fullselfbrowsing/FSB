// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../zillow-api.js';

export const getHomeValue = defineTool({
  name: 'get_home_value',
  displayName: 'Get Home Value',
  description: 'Look up the estimated market value (Zestimate) and value history of a home by its address or Zillow listing ID.',
  summary: 'look up a home value on zillow',
  icon: 'chart-bar',
  group: 'Valuation',
  input: z.object({
    address: z.string().optional().describe('The home address to value'),
    listing_id: z.string().optional().describe('The Zillow listing ID (zpid) to value'),
  }),
  output: z.object({
    valuation: z.object({
      estimate: z.number(),
      currency: z.string(),
      address: z.string(),
    }).describe('The home-value estimate'),
  }),
  handle: async (params: { address?: string; listing_id?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /zestimate (default method, a READ).
    const data = await api<{ valuation: { estimate: number; currency: string; address: string } }>('/zestimate', {
      query: { address: params.address, listing_id: params.listing_id },
    });
    return { valuation: data.valuation };
  },
});
