import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawRange } from './schemas.js';
import { rangeSchema, mapRange } from './schemas.js';

export const getRange = defineTool({
  name: 'get_range',
  displayName: 'Get Range',
  description:
    'Get cell values, formulas, and formatting for a specific range in a worksheet. The range address uses A1 notation (e.g., "A1:C10"). Returns values, formulas, text, and number formats.',
  summary: 'Read cell values from a range',
  icon: 'grid-3x3',
  group: 'Ranges',
  input: z.object({
    worksheet: z.string().describe('Worksheet name (e.g., "Sheet1")'),
    address: z.string().describe('Range address in A1 notation (e.g., "A1:C10", "B2", "A:D")'),
  }),
  output: z.object({ range: rangeSchema }),
  handle: async params => {
    const data = await workbookApi<RawRange>(
      `/worksheets('${encodeURIComponent(params.worksheet)}')/range(address='${encodeURIComponent(params.address)}')`,
    );
    return { range: mapRange(data) };
  },
});
