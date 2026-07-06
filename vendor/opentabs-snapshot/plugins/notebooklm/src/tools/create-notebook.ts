import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const createNotebook = defineTool({
  name: 'create_notebook',
  displayName: 'Create Notebook',
  description:
    'Create a new empty notebook in NotebookLM. Returns the new notebook ID. Sources can be added after creation.',
  summary: 'Create a new notebook',
  icon: 'plus',
  group: 'Notebooks',
  input: z.object({
    title: z.string().optional().describe('Notebook title (optional, defaults to untitled)'),
  }),
  output: z.object({
    notebook_id: z.string().describe('ID of the newly created notebook'),
  }),
  handle: async params => {
    const data = await rpc<unknown[]>('CCqFvf', [params.title ?? null]);
    const id = (data?.[2] as string) ?? '';
    return { notebook_id: id };
  },
});
