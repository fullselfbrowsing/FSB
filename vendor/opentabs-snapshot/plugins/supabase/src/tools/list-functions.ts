import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { functionSchema, mapFunction } from './schemas.js';

export const listFunctions = defineTool({
  name: 'list_functions',
  displayName: 'List Edge Functions',
  description: 'List all Edge Functions deployed to a Supabase project.',
  summary: 'List all Edge Functions for a project',
  icon: 'zap',
  group: 'Edge Functions',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    functions: z.array(functionSchema).describe('List of Edge Functions'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/functions`);
    return { functions: data.map(mapFunction) };
  },
});
