import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { buildSchema, type RawBuild, mapBuild } from './schemas.js';

export const listBuilds = defineTool({
  name: 'list_builds',
  displayName: 'List Builds',
  description:
    'List builds for a Netlify site. Returns build ID, associated deploy ID, commit SHA, completion status, and error messages. Supports pagination.',
  summary: 'List site builds',
  icon: 'hammer',
  group: 'Builds',
  input: z.object({
    site_id: z.string().describe('The site ID to list builds for'),
    page: z.number().optional().describe('Page number for pagination (starts at 1)'),
    per_page: z.number().optional().describe('Number of builds per page (default 20)'),
  }),
  output: z.object({
    items: z.array(buildSchema).describe('List of builds'),
  }),
  handle: async params => {
    const raw = await api<RawBuild[]>(`/sites/${params.site_id}/builds`, {
      query: {
        page: params.page,
        per_page: params.per_page,
      },
    });
    return { items: raw.map(mapBuild) };
  },
});
