import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { siteSchema, type RawSite, mapSite } from './schemas.js';

export const rollbackDeploy = defineTool({
  name: 'rollback_deploy',
  displayName: 'Rollback Deploy',
  description:
    'Rollback a site to its previously published deploy. This is a quick way to revert the site without specifying a deploy ID.',
  summary: 'Rollback site to previous deploy',
  icon: 'undo-2',
  group: 'Deploys',
  input: z.object({
    site_id: z.string().describe('The site ID to rollback'),
  }),
  output: siteSchema,
  handle: async params => {
    const raw = await api<RawSite>(`/sites/${params.site_id}/rollback`, {
      method: 'PUT',
    });
    return mapSite(raw);
  },
});
