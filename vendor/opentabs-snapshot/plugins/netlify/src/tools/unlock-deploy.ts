import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { deploySchema, type RawDeploy, mapDeploy } from './schemas.js';

export const unlockDeploy = defineTool({
  name: 'unlock_deploy',
  displayName: 'Unlock Deploy',
  description:
    'Unlock a previously locked deploy, re-enabling auto-publishing. New deploys will be published automatically again.',
  summary: 'Unlock a deploy to re-enable auto-publish',
  icon: 'unlock',
  group: 'Deploys',
  input: z.object({
    deploy_id: z.string().describe('The deploy ID to unlock'),
  }),
  output: deploySchema,
  handle: async params => {
    const raw = await api<RawDeploy>(`/deploys/${params.deploy_id}/unlock`, {
      method: 'POST',
    });
    return mapDeploy(raw);
  },
});
