import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawRange } from './schemas.js';
import { rangeSchema, mapRange } from './schemas.js';

export const updateRange = defineTool({
  name: 'update_range',
  displayName: 'Update Range',
  description:
    'Write values, formulas, or number formats to a specific range in a worksheet. The values must be a 2D array matching the range dimensions. Use null within the array to skip a cell. Pass formulas starting with "=" (e.g., "=SUM(A1:A10)"). Use "" (empty string) to clear a cell.',
  summary: 'Write values or formulas to a range',
  icon: 'pencil',
  group: 'Ranges',
  input: z.object({
    worksheet: z.string().describe('Worksheet name (e.g., "Sheet1")'),
    address: z.string().describe('Range address in A1 notation (e.g., "A1:C3")'),
    values: z
      .array(z.array(z.unknown()))
      .optional()
      .describe('2D array of values to write. Dimensions must match the range.'),
    formulas: z
      .array(z.array(z.unknown()))
      .optional()
      .describe('2D array of formulas to write. Each formula starts with "=".'),
    number_format: z
      .array(z.array(z.string()))
      .optional()
      .describe('2D array of number format codes (e.g., "0.00", "m/d/yyyy")'),
  }),
  output: z.object({ range: rangeSchema }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.values !== undefined) body.values = params.values;
    if (params.formulas !== undefined) body.formulas = params.formulas;
    if (params.number_format !== undefined) body.numberFormat = params.number_format;
    const data = await workbookApi<RawRange>(
      `/worksheets('${encodeURIComponent(params.worksheet)}')/range(address='${encodeURIComponent(params.address)}')`,
      { method: 'PATCH', body },
    );
    return { range: mapRange(data) };
  },
});
