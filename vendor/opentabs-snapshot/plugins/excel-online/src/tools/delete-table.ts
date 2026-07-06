import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';

export const deleteTable = defineTool({
  name: 'delete_table',
  displayName: 'Delete Table',
  description:
    'Delete a table by name or ID. This removes the table object but keeps the data in the cells. Use convert_table_to_range instead if you want to explicitly convert first.',
  summary: 'Delete a table',
  icon: 'trash-2',
  group: 'Tables',
  input: z.object({
    table: z.string().describe('Table name or ID'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await workbookApi(`/tables('${encodeURIComponent(params.table)}')`, { method: 'DELETE' });
    return { success: true };
  },
});
