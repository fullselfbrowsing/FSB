import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawRange } from './schemas.js';
import { rangeSchema, mapRange } from './schemas.js';

export const insertRange = defineTool({
  name: 'insert_range',
  displayName: 'Insert Range',
  description:
    'Insert new blank cells at a range address, shifting existing cells down or to the right. Use shift="Down" to push cells down or shift="Right" to push cells right.',
  summary: 'Insert cells and shift existing data',
  icon: 'between-vertical-start',
  group: 'Ranges',
  input: z.object({
    worksheet: z.string().describe('Worksheet name (e.g., "Sheet1")'),
    address: z.string().describe('Range address where new cells are inserted (e.g., "A2:A5")'),
    shift: z.enum(['Down', 'Right']).describe('Direction to shift existing cells: "Down" or "Right"'),
  }),
  output: z.object({ range: rangeSchema }),
  handle: async params => {
    const data = await workbookApi<RawRange>(
      `/worksheets('${encodeURIComponent(params.worksheet)}')/range(address='${encodeURIComponent(params.address)}')/insert`,
      { method: 'POST', body: { shift: params.shift } },
    );
    return { range: mapRange(data) };
  },
});
