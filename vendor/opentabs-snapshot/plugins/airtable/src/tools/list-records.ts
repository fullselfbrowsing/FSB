import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiGet } from '../airtable-api.js';
import { mapRecord, recordSchema } from './schemas.js';

interface RawRecord {
  id?: string;
  createdTime?: string;
  cellValuesByColumnId?: Record<string, unknown>;
}

interface RawTableData {
  id?: string;
  tableId?: string;
  rows?: RawRecord[];
}

interface ReadResult {
  tableDatas?: RawTableData[];
}

export const listRecords = defineTool({
  name: 'list_records',
  displayName: 'List Records',
  description:
    'List all records (rows) in a table. Returns record IDs, creation times, and cell values keyed by field ID. Use get_base_schema first to learn the field IDs and their types.',
  summary: 'List all records in a table',
  icon: 'table',
  group: 'Records',
  input: z.object({
    base_id: z.string().describe('Base ID (app prefix)'),
    table_id: z.string().describe('Table ID (tbl prefix)'),
  }),
  output: z.object({
    records: z.array(recordSchema).describe('All records in the table'),
  }),
  handle: async params => {
    const data = await apiGet<ReadResult>(
      `application/${params.base_id}/read`,
      {
        includeDataForTableIds: [params.table_id],
        shouldIncludeSchemaChecksum: false,
        mayOnlyIncludeRowAndCellDataForIncludedViews: false,
        allowMsgpackOfResult: false,
      },
      { appId: params.base_id },
    );

    const tableData = (data.tableDatas ?? []).find(td => td.id === params.table_id || td.tableId === params.table_id);
    const records = (tableData?.rows ?? []).map(mapRecord);

    return { records };
  },
});
