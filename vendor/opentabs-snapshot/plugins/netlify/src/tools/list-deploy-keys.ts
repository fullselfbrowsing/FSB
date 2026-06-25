import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { deployKeySchema, type RawDeployKey, mapDeployKey } from './schemas.js';

export const listDeployKeys = defineTool({
  name: 'list_deploy_keys',
  displayName: 'List Deploy Keys',
  description:
    'List all deploy keys for the authenticated user. Deploy keys are SSH public keys used for authenticating deploys from CI/CD systems.',
  summary: 'List deploy keys',
  icon: 'key',
  group: 'Deploy Keys',
  input: z.object({}),
  output: z.object({
    items: z.array(deployKeySchema).describe('List of deploy keys'),
  }),
  handle: async () => {
    const raw = await api<RawDeployKey[]>('/deploy_keys');
    return { items: raw.map(mapDeployKey) };
  },
});
