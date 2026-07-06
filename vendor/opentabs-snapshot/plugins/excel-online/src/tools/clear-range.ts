import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';

export const clearRange = defineTool({
  name: 'clear_range',
  displayName: 'Clear Range',
  description:
    'Clear the contents, formatting, or both from a range of cells. Use apply_to to control what is cleared: "All" clears everything, "Contents" clears values and formulas only, "Formats" clears formatting only.',
  summary: 'Clear cell contents or formatting',
  icon: 'eraser',
  group: 'Ranges',
  input: z.object({
    worksheet: z.string().describe('Worksheet name (e.g., "Sheet1")'),
    address: z.string().describe('Range address in A1 notation (e.g., "A1:C10")'),
    apply_to: z.enum(['All', 'Contents', 'Formats']).optional().describe('What to clear (default "All")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await workbookApi(
      `/worksheets('${encodeURIComponent(params.worksheet)}')/range(address='${encodeURIComponent(params.address)}')/clear`,
      { method: 'POST', body: { applyTo: params.apply_to ?? 'All' } },
    );
    return { success: true };
  },
});
