import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { envVarSchema, type RawEnvVar, mapEnvVar } from './schemas.js';

export const getEnvVar = defineTool({
  name: 'get_env_var',
  displayName: 'Get Environment Variable',
  description:
    'Get a specific environment variable by key for a Netlify account. Optionally scope to a specific site. Returns the variable name, scopes, context-specific values, and secret status.',
  summary: 'Get environment variable by key',
  icon: 'file-text',
  group: 'Environment',
  input: z.object({
    account_id: z.string().describe('The account ID the variable belongs to'),
    key: z.string().describe('The environment variable key name'),
    site_id: z.string().optional().describe('Optional site ID to scope to a specific site'),
  }),
  output: envVarSchema,
  handle: async params => {
    const raw = await api<RawEnvVar>(`/accounts/${params.account_id}/env/${encodeURIComponent(params.key)}`, {
      query: { site_id: params.site_id },
    });
    return mapEnvVar(raw);
  },
});
