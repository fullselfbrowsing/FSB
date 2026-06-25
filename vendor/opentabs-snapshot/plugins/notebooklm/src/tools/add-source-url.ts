import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const addSourceUrl = defineTool({
  name: 'add_source_url',
  displayName: 'Add Source URL',
  description: 'Add a website URL as a source to a notebook. NotebookLM will fetch and index the page content.',
  summary: 'Add a website source',
  icon: 'link',
  group: 'Sources',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
    url: z.string().describe('Website URL to add as a source'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the source was added successfully'),
  }),
  handle: async params => {
    const source = [null, null, [params.url]];
    await rpc('izAoDd', [[source], params.notebook_id], `/notebook/${params.notebook_id}`);
    return { success: true };
  },
});
