import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawTableColumn } from './schemas.js';
import { tableColumnSchema, mapTableColumn } from './schemas.js';

export const addTableColumn = defineTool({
  name: 'add_table_column',
  displayName: 'Add Table Column',
  description:
    'Add a new column to a table. Provide values as a 2D array where the first value is the header name and subsequent values are the data for each existing row. Optionally specify an insertion index.',
  summary: 'Add a column to a table',
  icon: 'plus',
  group: 'Tables',
  input: z.object({
    table: z.string().describe('Table name or ID'),
    values: z.array(z.array(z.unknown())).describe('2D column values — first entry is the header, rest are data rows'),
    index: z.number().int().min(0).optional().describe('Zero-based column insertion index. Appends at end if omitted.'),
  }),
  output: z.object({ column: tableColumnSchema }),
  handle: async params => {
    const body: Record<string, unknown> = { values: params.values };
    if (params.index !== undefined) body.index = params.index;
    const data = await workbookApi<RawTableColumn>(`/tables('${encodeURIComponent(params.table)}')/columns`, {
      method: 'POST',
      body,
    });
    return { column: mapTableColumn(data) };
  },
});
