import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { mapSecret, secretSchema } from './schemas.js';

export const listSecrets = defineTool({
  name: 'list_secrets',
  displayName: 'List Secrets',
  description:
    'List all secrets (environment variables) for a Supabase project. ' + 'Secret values are masked in responses.',
  summary: 'List project secrets',
  icon: 'key',
  group: 'Secrets',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    secrets: z.array(secretSchema).describe('List of secrets'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/secrets`);
    return { secrets: data.map(mapSecret) };
  },
});
