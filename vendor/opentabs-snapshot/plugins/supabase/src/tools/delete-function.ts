import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const deleteFunction = defineTool({
  name: 'delete_function',
  displayName: 'Delete Edge Function',
  description: 'Delete an Edge Function from a Supabase project.',
  summary: 'Delete an Edge Function',
  icon: 'trash-2',
  group: 'Edge Functions',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
    function_slug: z.string().min(1).describe('Function slug to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the function was deleted'),
  }),
  handle: async params => {
    await api(`/projects/${params.ref}/functions/${params.function_slug}`, { method: 'DELETE' });
    return { success: true };
  },
});
