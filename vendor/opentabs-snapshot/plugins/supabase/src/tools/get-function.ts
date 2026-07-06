import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { functionSchema, mapFunction } from './schemas.js';

export const getFunction = defineTool({
  name: 'get_function',
  displayName: 'Get Edge Function',
  description: 'Get details of a specific Edge Function by its slug.',
  summary: 'Get details of an Edge Function',
  icon: 'zap',
  group: 'Edge Functions',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
    function_slug: z.string().min(1).describe('Function slug (URL-friendly name)'),
  }),
  output: z.object({
    function: functionSchema.describe('Edge Function details'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/projects/${params.ref}/functions/${params.function_slug}`);
    return { function: mapFunction(data) };
  },
});
