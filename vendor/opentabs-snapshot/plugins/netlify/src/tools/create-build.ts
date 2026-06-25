import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { buildSchema, type RawBuild, mapBuild } from './schemas.js';

export const createBuild = defineTool({
  name: 'create_build',
  displayName: 'Create Build',
  description:
    'Trigger a new build for a Netlify site. This starts a fresh build and deploy using the current site configuration and linked repository.',
  summary: 'Trigger a new site build',
  icon: 'play',
  group: 'Builds',
  input: z.object({
    site_id: z.string().describe('The site ID to trigger a build for'),
  }),
  output: buildSchema,
  handle: async params => {
    const raw = await api<RawBuild>(`/sites/${params.site_id}/builds`, {
      method: 'POST',
    });
    return mapBuild(raw);
  },
});
