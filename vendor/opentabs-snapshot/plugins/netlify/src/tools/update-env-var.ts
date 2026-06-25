import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { envVarSchema, type RawEnvVar, mapEnvVar } from './schemas.js';

const envVarValueInput = z.object({
  value: z.string().describe('The variable value'),
  context: z.string().describe('Deploy context (e.g. "all", "production", "deploy-preview", "branch-deploy", "dev")'),
  context_parameter: z.string().optional().describe('Branch name when context is branch-specific'),
});

export const updateEnvVar = defineTool({
  name: 'update_env_var',
  displayName: 'Update Environment Variable',
  description:
    'Replace an existing environment variable for a Netlify account. Replaces all values for the variable. Optionally scope to a specific site.',
  summary: 'Update an environment variable',
  icon: 'pencil',
  group: 'Environment',
  input: z.object({
    account_id: z.string().describe('The account ID the variable belongs to'),
    key: z.string().describe('The environment variable key name to update'),
    site_id: z.string().optional().describe('Optional site ID to scope to a specific site'),
    scopes: z
      .array(z.string())
      .optional()
      .describe('Scopes where the variable is available (e.g. ["builds", "functions", "runtime"])'),
    values: z.array(envVarValueInput).describe('New context-specific values for this variable'),
    is_secret: z.boolean().optional().describe('Whether the variable value should be masked'),
  }),
  output: envVarSchema,
  handle: async params => {
    const body: Record<string, unknown> = { values: params.values };
    if (params.scopes !== undefined) body.scopes = params.scopes;
    if (params.is_secret !== undefined) body.is_secret = params.is_secret;
    const raw = await api<RawEnvVar>(`/accounts/${params.account_id}/env/${encodeURIComponent(params.key)}`, {
      method: 'PUT',
      query: { site_id: params.site_id },
      body,
    });
    return mapEnvVar(raw);
  },
});
