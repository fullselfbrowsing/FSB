import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { envVarSchema, type RawEnvVar, mapEnvVar } from './schemas.js';

const envVarValueInput = z.object({
  value: z.string().describe('The variable value'),
  context: z.string().describe('Deploy context (e.g. "all", "production", "deploy-preview", "branch-deploy", "dev")'),
});

const envVarInput = z.object({
  key: z.string().describe('Environment variable name'),
  scopes: z
    .array(z.string())
    .optional()
    .describe('Scopes where the variable is available (e.g. ["builds", "functions", "runtime"])'),
  values: z.array(envVarValueInput).describe('Context-specific values for this variable'),
  is_secret: z.boolean().optional().describe('Whether the variable value should be masked'),
});

export const createEnvVars = defineTool({
  name: 'create_env_vars',
  displayName: 'Create Environment Variables',
  description:
    'Create one or more environment variables for a Netlify account. Each variable can have multiple context-specific values (e.g. different values for production vs deploy previews). Optionally scope to a specific site.',
  summary: 'Create environment variables',
  icon: 'plus',
  group: 'Environment',
  input: z.object({
    account_id: z.string().describe('The account ID to create variables in'),
    site_id: z.string().optional().describe('Optional site ID to scope variables to a specific site'),
    variables: z.array(envVarInput).describe('Array of environment variables to create'),
  }),
  output: z.object({
    items: z.array(envVarSchema).describe('List of created environment variables'),
  }),
  handle: async params => {
    const raw = await api<RawEnvVar[]>(`/accounts/${params.account_id}/env`, {
      method: 'POST',
      query: { site_id: params.site_id },
      body: params.variables,
    });
    return { items: raw.map(mapEnvVar) };
  },
});
