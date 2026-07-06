import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { pageSchema, mapPage } from './schemas.js';
import type { RawPage } from './schemas.js';

export const getSitePages = defineTool({
  name: 'get_site_pages',
  displayName: 'Get Site Pages',
  description:
    'Get all pages for a Webflow site. Returns page titles, slugs, types, and draft/archive status. Use get_site_hosting for hosting-specific page details.',
  summary: 'List pages in a site',
  icon: 'file-text',
  group: 'Sites',
  input: z.object({
    site_short_name: z.string().describe('Site short name / URL slug'),
  }),
  output: z.object({
    pages: z.array(pageSchema),
  }),
  handle: async params => {
    const data = await api<RawPage[]>(`/sites/${params.site_short_name}/pages`);
    return {
      pages: (data ?? []).map(mapPage),
    };
  },
});
