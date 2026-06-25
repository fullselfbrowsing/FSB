import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { deploySchema, type RawDeploy, mapDeploy } from './schemas.js';

export const getDeploy = defineTool({
  name: 'get_deploy',
  displayName: 'Get Deploy',
  description:
    'Get detailed information about a specific Netlify deploy by its ID. Returns state, URLs, branch, commit, context, framework, error message, and lock status.',
  summary: 'Get deploy details by ID',
  icon: 'rocket',
  group: 'Deploys',
  input: z.object({
    deploy_id: z.string().describe('The deploy ID to retrieve'),
  }),
  output: deploySchema,
  handle: async params => {
    const raw = await api<RawDeploy>(`/deploys/${params.deploy_id}`);
    return mapDeploy(raw);
  },
});
