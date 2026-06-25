import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToNotebook = defineTool({
  name: 'navigate_to_notebook',
  displayName: 'Navigate to Notebook',
  description: 'Navigate the browser to a specific notebook page in NotebookLM.',
  summary: 'Open a notebook',
  icon: 'external-link',
  group: 'Notebooks',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether navigation was initiated'),
  }),
  handle: async params => {
    window.location.href = `/notebook/${params.notebook_id}`;
    return { success: true };
  },
});
