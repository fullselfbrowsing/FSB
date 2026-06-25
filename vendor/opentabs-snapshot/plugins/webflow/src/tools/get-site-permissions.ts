import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { permissionsOutputSchema } from './schemas.js';

export const getSitePermissions = defineTool({
  name: 'get_site_permissions',
  displayName: 'Get Site Permissions',
  description:
    'Get the current user permissions for a specific Webflow site. Returns which actions the user can perform on the site.',
  summary: 'Get your site permissions',
  icon: 'shield',
  group: 'Sites',
  input: z.object({
    site_short_name: z.string().describe('Site short name / URL slug'),
  }),
  output: permissionsOutputSchema,
  handle: async params => {
    const data = await api<Record<string, Record<string, boolean>>>(`/sites/${params.site_short_name}/permissions`);
    return { permissions: data };
  },
});
