import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { GraphListResponse, RawTable } from './schemas.js';
import { tableSchema, mapTable } from './schemas.js';

export const listTables = defineTool({
  name: 'list_tables',
  displayName: 'List Tables',
  description:
    'List all tables in the currently open Excel workbook. Returns table names, IDs, and display settings. Optionally filter by worksheet name to list only tables in a specific sheet.',
  summary: 'List all tables in the workbook',
  icon: 'table',
  group: 'Tables',
  input: z.object({
    worksheet: z
      .string()
      .optional()
      .describe('Worksheet name to filter tables by. Omit to list tables from all sheets.'),
  }),
  output: z.object({ tables: z.array(tableSchema) }),
  handle: async params => {
    const path = params.worksheet ? `/worksheets('${encodeURIComponent(params.worksheet)}')/tables` : '/tables';
    const data = await workbookApi<GraphListResponse<RawTable>>(path);
    return { tables: (data.value ?? []).map(mapTable) };
  },
});
