import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const renameNotebook = defineTool({
  name: 'rename_notebook',
  displayName: 'Rename Notebook',
  description: 'Rename a notebook by setting a new title.',
  summary: 'Rename a notebook',
  icon: 'pencil',
  group: 'Notebooks',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
    title: z.string().describe('New notebook title'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await rpc(
      's0tc2d',
      [params.notebook_id, [[null, null, null, [null, params.title]]]],
      `/notebook/${params.notebook_id}`,
    );
    return { success: true };
  },
});
