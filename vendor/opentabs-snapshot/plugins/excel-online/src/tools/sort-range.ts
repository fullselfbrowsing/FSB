import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';

export const sortRange = defineTool({
  name: 'sort_range',
  displayName: 'Sort Range',
  description:
    'Sort data in a range by one or more columns. Each sort field specifies a zero-based column index and sort direction. Multiple fields create multi-level sorts (primary, secondary, etc.).',
  summary: 'Sort data in a range by columns',
  icon: 'arrow-up-down',
  group: 'Ranges',
  input: z.object({
    worksheet: z.string().describe('Worksheet name (e.g., "Sheet1")'),
    address: z.string().describe('Range address to sort (e.g., "A1:C10")'),
    fields: z
      .array(
        z.object({
          key: z.number().int().min(0).describe('Zero-based column index to sort by'),
          ascending: z.boolean().optional().describe('Sort ascending (default true)'),
        }),
      )
      .min(1)
      .describe('Sort fields in priority order'),
    has_headers: z.boolean().optional().describe('Whether the first row is a header row (default false)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const fields = params.fields.map(f => ({
      key: f.key,
      ascending: f.ascending ?? true,
    }));
    await workbookApi(
      `/worksheets('${encodeURIComponent(params.worksheet)}')/range(address='${encodeURIComponent(params.address)}')/sort/apply`,
      {
        method: 'POST',
        body: {
          fields,
          matchCase: false,
          hasHeaders: params.has_headers ?? false,
          method: 'PinYin',
        },
      },
    );
    return { success: true };
  },
});
