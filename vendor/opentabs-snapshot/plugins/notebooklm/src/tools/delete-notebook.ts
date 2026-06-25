import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const deleteNotebook = defineTool({
  name: 'delete_notebook',
  displayName: 'Delete Notebook',
  description:
    'Delete one or more notebooks by their IDs. This permanently removes the notebook, all sources, notes, and chat history.',
  summary: 'Delete notebooks',
  icon: 'trash-2',
  group: 'Notebooks',
  input: z.object({
    notebook_ids: z.array(z.string()).min(1).describe('Array of notebook UUIDs to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await rpc('WWINqb', [params.notebook_ids, null]);
    return { success: true };
  },
});
