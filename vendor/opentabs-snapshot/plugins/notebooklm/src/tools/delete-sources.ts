import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const deleteSources = defineTool({
  name: 'delete_sources',
  displayName: 'Delete Sources',
  description: 'Delete one or more sources from a notebook.',
  summary: 'Delete sources',
  icon: 'file-x',
  group: 'Sources',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
    source_ids: z.array(z.string()).min(1).describe('Array of source UUIDs to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const sourceRefs = params.source_ids.map(id => [id]);
    await rpc('tGMBJ', [sourceRefs, [2]], `/notebook/${params.notebook_id}`);
    return { success: true };
  },
});
