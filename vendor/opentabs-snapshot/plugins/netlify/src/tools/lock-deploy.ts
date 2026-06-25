import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { deploySchema, type RawDeploy, mapDeploy } from './schemas.js';

export const lockDeploy = defineTool({
  name: 'lock_deploy',
  displayName: 'Lock Deploy',
  description:
    'Lock a deploy to prevent auto-publishing of new deploys. The locked deploy stays published until it is unlocked. Useful for pinning a known-good deploy in production.',
  summary: 'Lock a deploy to prevent auto-publish',
  icon: 'lock',
  group: 'Deploys',
  input: z.object({
    deploy_id: z.string().describe('The deploy ID to lock'),
  }),
  output: deploySchema,
  handle: async params => {
    const raw = await api<RawDeploy>(`/deploys/${params.deploy_id}/lock`, {
      method: 'POST',
    });
    return mapDeploy(raw);
  },
});
