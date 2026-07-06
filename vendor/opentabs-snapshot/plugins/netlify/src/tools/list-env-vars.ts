import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { envVarSchema, type RawEnvVar, mapEnvVar } from './schemas.js';

export const listEnvVars = defineTool({
  name: 'list_env_vars',
  displayName: 'List Environment Variables',
  description:
    'List all environment variables for a Netlify account. Optionally scope to a specific site. Returns variable names, scopes, context-specific values, and secret status.',
  summary: 'List environment variables',
  icon: 'file-text',
  group: 'Environment',
  input: z.object({
    account_id: z.string().describe('The account ID to list environment variables for'),
    site_id: z.string().optional().describe('Optional site ID to scope variables to a specific site'),
  }),
  output: z.object({
    items: z.array(envVarSchema).describe('List of environment variables'),
  }),
  handle: async params => {
    const raw = await api<RawEnvVar[]>(`/accounts/${params.account_id}/env`, {
      query: { site_id: params.site_id },
    });
    return { items: raw.map(mapEnvVar) };
  },
});
