import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const deleteSite = defineTool({
  name: 'delete_site',
  displayName: 'Delete Site',
  description:
    'Permanently delete a Netlify site by its ID. This removes the site, all deploys, and associated configuration. This action cannot be undone.',
  summary: 'Delete a site permanently',
  icon: 'trash-2',
  group: 'Sites',
  input: z.object({
    site_id: z.string().describe('The site ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/sites/${params.site_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
