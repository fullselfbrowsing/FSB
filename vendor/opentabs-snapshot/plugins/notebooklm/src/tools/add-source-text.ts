import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const addSourceText = defineTool({
  name: 'add_source_text',
  displayName: 'Add Source Text',
  description:
    'Add plain text as a source to a notebook. Use this to provide custom content for NotebookLM to analyze.',
  summary: 'Add text as a source',
  icon: 'file-text',
  group: 'Sources',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
    title: z.string().describe('Title for the text source'),
    text: z.string().describe('Text content to add as a source'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the source was added successfully'),
  }),
  handle: async params => {
    const source = [null, [params.title, params.text]];
    await rpc('izAoDd', [[source], params.notebook_id], `/notebook/${params.notebook_id}`);
    return { success: true };
  },
});
