import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';

interface Entity {
  id: number;
  name: string;
  logo_url: string | null;
  requires_two_factor: boolean;
  tabs_url: string;
  show_asc820_banner: boolean;
}

const entitySchema = z.object({
  id: z.number(),
  name: z.string(),
  has_logo: z.boolean(),
  requires_two_factor: z.boolean(),
});

export const getEntities = defineTool({
  name: 'get_entities',
  displayName: 'Get Entities',
  description:
    'Get detailed entity information for all companies in the portfolio, including security requirements and available features.',
  summary: 'Get portfolio entity details',
  icon: 'briefcase',
  group: 'Portfolio',
  input: z.object({}),
  output: z.object({
    entities: z.array(entitySchema),
  }),
  handle: async () => {
    const ctx = requireContext();
    const data = await api<Entity[]>(`/api/investors/portfolio/fund/${ctx.portfolioId}/entities/`);
    return {
      entities: data.map(e => ({
        id: e.id,
        name: e.name,
        has_logo: e.logo_url != null,
        requires_two_factor: e.requires_two_factor,
      })),
    };
  },
});
