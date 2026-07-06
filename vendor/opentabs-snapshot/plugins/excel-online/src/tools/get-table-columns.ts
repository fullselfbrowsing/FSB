import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { GraphListResponse, RawTableColumn } from './schemas.js';
import { tableColumnSchema, mapTableColumn } from './schemas.js';

export const getTableColumns = defineTool({
  name: 'get_table_columns',
  displayName: 'Get Table Columns',
  description:
    'Get the column definitions of a table. Returns column names, IDs, and indices. Useful for understanding the table structure before reading or writing data.',
  summary: 'Get column definitions of a table',
  icon: 'columns-3',
  group: 'Tables',
  input: z.object({
    table: z.string().describe('Table name or ID'),
  }),
  output: z.object({ columns: z.array(tableColumnSchema) }),
  handle: async params => {
    const data = await workbookApi<GraphListResponse<RawTableColumn>>(
      `/tables('${encodeURIComponent(params.table)}')/columns`,
    );
    return { columns: (data.value ?? []).map(mapTableColumn) };
  },
});
