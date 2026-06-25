import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawTable } from './schemas.js';
import { tableSchema, mapTable } from './schemas.js';

export const createTable = defineTool({
  name: 'create_table',
  displayName: 'Create Table',
  description:
    'Create a new table from a data range. The range should contain the data (and optionally a header row). Set has_headers=true if the first row contains column headers.',
  summary: 'Create a table from a data range',
  icon: 'table',
  group: 'Tables',
  input: z.object({
    address: z.string().describe('Range address containing the data (e.g., "Sheet1!A1:D10")'),
    has_headers: z.boolean().optional().describe('Whether the first row contains headers (default true)'),
  }),
  output: z.object({ table: tableSchema }),
  handle: async params => {
    const data = await workbookApi<RawTable>('/tables/add', {
      method: 'POST',
      body: {
        address: params.address,
        hasHeaders: params.has_headers ?? true,
      },
    });
    return { table: mapTable(data) };
  },
});
