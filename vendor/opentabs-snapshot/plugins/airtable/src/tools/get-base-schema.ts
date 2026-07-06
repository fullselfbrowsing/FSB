import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiGet } from '../airtable-api.js';
import { mapTable, tableSchema } from './schemas.js';

interface RawColumn {
  id?: string;
  name?: string;
  type?: string;
  description?: string;
}

interface RawView {
  id?: string;
  name?: string;
  type?: string;
}

interface RawTableSchema {
  id?: string;
  name?: string;
  columns?: RawColumn[];
  views?: RawView[];
}

interface ReadResult {
  tableSchemas?: RawTableSchema[];
}

export const getBaseSchema = defineTool({
  name: 'get_base_schema',
  displayName: 'Get Base Schema',
  description:
    'Get the full schema of an Airtable base including all tables, fields (columns), and views. Use this to understand the structure before reading or writing records.',
  summary: 'Get all tables, fields, and views in a base',
  icon: 'database',
  group: 'Bases',
  input: z.object({
    base_id: z.string().describe('Base ID (app prefix, e.g., "appCJ2w2lRQp9Vxm0")'),
  }),
  output: z.object({
    tables: z.array(tableSchema).describe('All tables in the base with their fields and views'),
  }),
  handle: async params => {
    const data = await apiGet<ReadResult>(
      `application/${params.base_id}/read`,
      {
        includeDataForTableIds: [],
        shouldIncludeSchemaChecksum: false,
        mayOnlyIncludeRowAndCellDataForIncludedViews: true,
        allowMsgpackOfResult: false,
      },
      { appId: params.base_id },
    );

    const tables = (data.tableSchemas ?? []).map(mapTable);
    return { tables };
  },
});
