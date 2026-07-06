import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { deploySchema, type RawDeploy, mapDeploy } from './schemas.js';

export const listDeploys = defineTool({
  name: 'list_deploys',
  displayName: 'List Deploys',
  description:
    'List deploys for a Netlify site. Returns deploy state, branch, commit info, context, framework, and timestamps. Supports pagination.',
  summary: 'List site deploys',
  icon: 'list',
  group: 'Deploys',
  input: z.object({
    site_id: z.string().describe('The site ID to list deploys for'),
    page: z.number().optional().describe('Page number for pagination (starts at 1)'),
    per_page: z.number().optional().describe('Number of deploys per page (default 20)'),
  }),
  output: z.object({
    items: z.array(deploySchema).describe('List of deploys'),
  }),
  handle: async params => {
    const raw = await api<RawDeploy[]>(`/sites/${params.site_id}/deploys`, {
      query: {
        page: params.page,
        per_page: params.per_page,
      },
    });
    return { items: raw.map(mapDeploy) };
  },
});
