import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const deleteEnvVar = defineTool({
  name: 'delete_env_var',
  displayName: 'Delete Environment Variable',
  description:
    'Delete an environment variable from a Netlify account by its key name. Optionally scope to a specific site. This action cannot be undone.',
  summary: 'Delete an environment variable',
  icon: 'trash-2',
  group: 'Environment',
  input: z.object({
    account_id: z.string().describe('The account ID the variable belongs to'),
    key: z.string().describe('The environment variable key name to delete'),
    site_id: z.string().optional().describe('Optional site ID to scope to a specific site'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/accounts/${params.account_id}/env/${encodeURIComponent(params.key)}`, {
      method: 'DELETE',
      query: { site_id: params.site_id },
    });
    return { success: true };
  },
});
