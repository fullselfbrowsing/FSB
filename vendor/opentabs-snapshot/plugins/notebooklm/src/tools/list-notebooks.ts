import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc, FEATURE_FLAGS } from '../notebooklm-api.js';
import { notebookSchema, mapNotebook } from './schemas.js';

export const listNotebooks = defineTool({
  name: 'list_notebooks',
  displayName: 'List Notebooks',
  description:
    "List recently viewed notebooks in the user's NotebookLM account. Returns notebook IDs, titles, source counts, and timestamps.",
  summary: 'List recent notebooks',
  icon: 'library',
  group: 'Notebooks',
  input: z.object({}),
  output: z.object({
    notebooks: z.array(notebookSchema).describe('List of notebooks'),
  }),
  handle: async () => {
    const data = (await rpc<unknown[][]>('wXbhsf', [null, 1, null, [...FEATURE_FLAGS]])) ?? [];
    const notebooks = Array.isArray(data[0]) ? data[0].map((n: unknown) => mapNotebook(n as unknown[])) : [];
    return { notebooks };
  },
});
