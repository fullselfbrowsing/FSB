import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc, FEATURE_FLAGS } from '../notebooklm-api.js';
import { notebookSchema, mapNotebook } from './schemas.js';

export const getNotebook = defineTool({
  name: 'get_notebook',
  displayName: 'Get Notebook',
  description: 'Get details of a specific notebook by ID, including title, source count, and timestamps.',
  summary: 'Get notebook details',
  icon: 'book-open',
  group: 'Notebooks',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
  }),
  output: z.object({
    notebook: notebookSchema,
  }),
  handle: async params => {
    const data = await rpc<unknown[][]>(
      'rLM1Ne',
      [params.notebook_id, null, [...FEATURE_FLAGS], null, 0],
      `/notebook/${params.notebook_id}`,
    );
    const inner = (data?.[0] as unknown[]) ?? [];
    return { notebook: mapNotebook(inner) };
  },
});
