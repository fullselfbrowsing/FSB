import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const copyNotebook = defineTool({
  name: 'copy_notebook',
  displayName: 'Copy Notebook',
  description: 'Create a copy of an existing notebook, including all sources, notes, and artifacts.',
  summary: 'Copy a notebook',
  icon: 'copy',
  group: 'Notebooks',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID to copy'),
  }),
  output: z.object({
    notebook_id: z.string().describe('ID of the newly created copy'),
  }),
  handle: async params => {
    const data = await rpc<unknown[]>('te3DCe', [params.notebook_id]);
    const id = (data?.[2] as string) ?? '';
    return { notebook_id: id };
  },
});
