import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const deleteSecrets = defineTool({
  name: 'delete_secrets',
  displayName: 'Delete Secrets',
  description: 'Delete one or more secrets (environment variables) from a Supabase project.',
  summary: 'Delete project secrets by name',
  icon: 'key-round',
  group: 'Secrets',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
    names: z.array(z.string().min(1)).min(1).describe('Names of secrets to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the secrets were deleted'),
  }),
  handle: async params => {
    await api(`/projects/${params.ref}/secrets`, {
      method: 'DELETE',
      body: params.names as unknown as Record<string, unknown>,
    });
    return { success: true };
  },
});
