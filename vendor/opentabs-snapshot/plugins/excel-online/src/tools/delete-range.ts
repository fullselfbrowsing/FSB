import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';

export const deleteRange = defineTool({
  name: 'delete_range',
  displayName: 'Delete Range',
  description:
    'Delete cells at a range address, shifting remaining cells up or to the left. Use shift="Up" to pull cells up or shift="Left" to pull cells left.',
  summary: 'Delete cells and shift remaining data',
  icon: 'between-vertical-end',
  group: 'Ranges',
  input: z.object({
    worksheet: z.string().describe('Worksheet name (e.g., "Sheet1")'),
    address: z.string().describe('Range address of cells to delete (e.g., "A2:A5")'),
    shift: z.enum(['Up', 'Left']).describe('Direction to shift remaining cells: "Up" or "Left"'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await workbookApi(
      `/worksheets('${encodeURIComponent(params.worksheet)}')/range(address='${encodeURIComponent(params.address)}')/delete`,
      { method: 'POST', body: { shift: params.shift } },
    );
    return { success: true };
  },
});
