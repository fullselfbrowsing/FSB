import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const createSecrets = defineTool({
  name: 'create_secrets',
  displayName: 'Create Secrets',
  description:
    'Create or update one or more secrets (environment variables) for a Supabase project. ' +
    'Existing secrets with the same name are overwritten.',
  summary: 'Create or update project secrets',
  icon: 'key-round',
  group: 'Secrets',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
    secrets: z
      .array(
        z.object({
          name: z.string().min(1).describe('Secret name'),
          value: z.string().min(1).describe('Secret value'),
        }),
      )
      .min(1)
      .describe('Secrets to create or update'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the secrets were created'),
  }),
  handle: async params => {
    await api(`/projects/${params.ref}/secrets`, {
      method: 'POST',
      body: params.secrets as unknown as Record<string, unknown>,
    });
    return { success: true };
  },
});
