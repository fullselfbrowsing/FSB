import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawTableRow } from './schemas.js';
import { tableRowSchema, mapTableRow } from './schemas.js';

export const addTableRow = defineTool({
  name: 'add_table_row',
  displayName: 'Add Table Row',
  description:
    'Add one or more rows to a table. Values is a 2D array where each inner array is a row. The number of values in each row must match the number of table columns. Optionally specify an insertion index (0-based); rows are appended at the end if omitted.',
  summary: 'Add rows to a table',
  icon: 'plus',
  group: 'Tables',
  input: z.object({
    table: z.string().describe('Table name or ID'),
    values: z.array(z.array(z.unknown())).describe('2D array of row values. Each inner array is one row.'),
    index: z.number().int().min(0).optional().describe('Zero-based insertion index. Appends at end if omitted.'),
  }),
  output: z.object({ row: tableRowSchema }),
  handle: async params => {
    const data = await workbookApi<RawTableRow>(`/tables('${encodeURIComponent(params.table)}')/rows`, {
      method: 'POST',
      body: { values: params.values, index: params.index ?? null },
    });
    return { row: mapTableRow(data) };
  },
});
