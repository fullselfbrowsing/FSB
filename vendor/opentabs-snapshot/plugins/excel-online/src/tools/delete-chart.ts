import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';

export const deleteChart = defineTool({
  name: 'delete_chart',
  displayName: 'Delete Chart',
  description: 'Delete a chart from a worksheet by its name.',
  summary: 'Delete a chart',
  icon: 'trash-2',
  group: 'Charts',
  input: z.object({
    worksheet: z.string().describe('Worksheet name'),
    chart: z.string().describe('Chart name'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await workbookApi(
      `/worksheets('${encodeURIComponent(params.worksheet)}')/charts('${encodeURIComponent(params.chart)}')`,
      { method: 'DELETE' },
    );
    return { success: true };
  },
});
