import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { deployKeySchema, type RawDeployKey, mapDeployKey } from './schemas.js';

export const createDeployKey = defineTool({
  name: 'create_deploy_key',
  displayName: 'Create Deploy Key',
  description:
    'Generate a new deploy key (SSH key pair). Returns the public key which can be added to your Git provider for deploy authentication.',
  summary: 'Create a new deploy key',
  icon: 'plus',
  group: 'Deploy Keys',
  input: z.object({}),
  output: deployKeySchema,
  handle: async () => {
    const raw = await api<RawDeployKey>('/deploy_keys', { method: 'POST' });
    return mapDeployKey(raw);
  },
});
