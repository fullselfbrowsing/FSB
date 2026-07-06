import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { deploySchema, type RawDeploy, mapDeploy } from './schemas.js';

export const restoreDeploy = defineTool({
  name: 'restore_deploy',
  displayName: 'Restore Deploy',
  description:
    'Restore a previous deploy by creating a new deploy with the same content. The restored deploy becomes the published version for the site.',
  summary: 'Restore a previous deploy',
  icon: 'rotate-ccw',
  group: 'Deploys',
  input: z.object({
    site_id: z.string().describe('The site ID the deploy belongs to'),
    deploy_id: z.string().describe('The deploy ID to restore'),
  }),
  output: deploySchema,
  handle: async params => {
    const raw = await api<RawDeploy>(`/sites/${params.site_id}/deploys/${params.deploy_id}/restore`, {
      method: 'POST',
    });
    return mapDeploy(raw);
  },
});
