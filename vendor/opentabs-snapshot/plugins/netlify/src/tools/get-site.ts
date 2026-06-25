import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { siteSchema, type RawSite, mapSite } from './schemas.js';

export const getSite = defineTool({
  name: 'get_site',
  displayName: 'Get Site',
  description:
    'Get detailed information about a specific Netlify site by its ID. Returns name, URLs, custom domain, framework, repo settings, SSL, and build configuration.',
  summary: 'Get site details by ID',
  icon: 'globe',
  group: 'Sites',
  input: z.object({
    site_id: z.string().describe('The site ID to retrieve'),
  }),
  output: siteSchema,
  handle: async params => {
    const raw = await api<RawSite>(`/sites/${params.site_id}`);
    return mapSite(raw);
  },
});
