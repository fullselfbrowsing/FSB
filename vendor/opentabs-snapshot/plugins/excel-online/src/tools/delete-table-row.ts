import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';

export const deleteTableRow = defineTool({
  name: 'delete_table_row',
  displayName: 'Delete Table Row',
  description:
    'Delete a specific row from a table by its zero-based index. The row is permanently removed and subsequent rows shift up.',
  summary: 'Delete a row from a table by index',
  icon: 'trash-2',
  group: 'Tables',
  input: z.object({
    table: z.string().describe('Table name or ID'),
    index: z.number().int().min(0).describe('Zero-based row index to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await workbookApi(`/tables('${encodeURIComponent(params.table)}')/rows/$/itemAt(index=${params.index})`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
