import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { GraphListResponse, RawTableRow } from './schemas.js';
import { tableRowSchema, mapTableRow } from './schemas.js';

export const getTableRows = defineTool({
  name: 'get_table_rows',
  displayName: 'Get Table Rows',
  description:
    'Get all data rows from a table. Returns row values as 2D arrays. Each row is an array of cell values. Does not include the header row.',
  summary: 'Get all rows from a table',
  icon: 'rows-3',
  group: 'Tables',
  input: z.object({
    table: z.string().describe('Table name or ID'),
  }),
  output: z.object({ rows: z.array(tableRowSchema) }),
  handle: async params => {
    const data = await workbookApi<GraphListResponse<RawTableRow>>(
      `/tables('${encodeURIComponent(params.table)}')/rows`,
    );
    return { rows: (data.value ?? []).map(mapTableRow) };
  },
});
