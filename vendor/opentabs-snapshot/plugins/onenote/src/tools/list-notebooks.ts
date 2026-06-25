import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawNotebook, mapNotebook, notebookSchema } from './schemas.js';

interface ListNotebooksResponse {
  value?: RawNotebook[];
}

export const listNotebooks = defineTool({
  name: 'list_notebooks',
  displayName: 'List Notebooks',
  description:
    'List all OneNote notebooks for the current user. Returns notebook names, IDs, creation dates, and sharing status. Results are sorted by last modified date (newest first).',
  summary: 'List all OneNote notebooks',
  icon: 'book-open',
  group: 'Notebooks',
  input: z.object({
    order_by: z
      .string()
      .optional()
      .describe(
        'OData $orderby expression (default "lastModifiedDateTime desc"). Examples: "displayName", "createdDateTime desc"',
      ),
    top: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of notebooks to return (default 20, max 100)'),
  }),
  output: z.object({
    notebooks: z.array(notebookSchema).describe('List of notebooks'),
  }),
  handle: async params => {
    const data = await api<ListNotebooksResponse>('/me/onenote/notebooks', {
      query: {
        $orderby: params.order_by ?? 'lastModifiedDateTime desc',
        $top: params.top ?? 20,
      },
    });
    return { notebooks: (data.value ?? []).map(mapNotebook) };
  },
});
