import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';

export const deleteWorksheet = defineTool({
  name: 'delete_worksheet',
  displayName: 'Delete Worksheet',
  description:
    'Delete a worksheet from the currently open Excel workbook by name. The workbook must have at least two worksheets — you cannot delete the last one.',
  summary: 'Delete a worksheet by name',
  icon: 'trash-2',
  group: 'Worksheets',
  input: z.object({
    name: z.string().describe('Name of the worksheet to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await workbookApi(`/worksheets('${encodeURIComponent(params.name)}')`, { method: 'DELETE' });
    return { success: true };
  },
});
