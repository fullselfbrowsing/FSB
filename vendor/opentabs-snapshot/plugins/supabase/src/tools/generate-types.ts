import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const generateTypes = defineTool({
  name: 'generate_types',
  displayName: 'Generate TypeScript Types',
  description:
    'Generate TypeScript type definitions from a Supabase project database schema. ' +
    'Returns the full TypeScript types for all tables, views, and functions.',
  summary: 'Generate TypeScript types from the DB schema',
  icon: 'file-code',
  group: 'Database',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    types: z.string().describe('Generated TypeScript type definitions'),
  }),
  handle: async params => {
    const data = await api<{ types?: string }>(`/projects/${params.ref}/types/typescript`);
    return { types: data.types ?? '' };
  },
});
