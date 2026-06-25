import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
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

export const getRecord = defineTool({
  name: 'get_record',
  displayName: 'Get Record',
  description: 'Get a single record (row) by its ID. Returns all cell values for the record.',
  summary: 'Get a single record by ID',
  icon: 'file-text',
  group: 'Records',
  input: z.object({
    base_id: z.string().describe('Base ID (app prefix)'),
    table_id: z.string().describe('Table ID (tbl prefix)'),
    record_id: z.string().describe('Record ID (rec prefix)'),
  }),
  output: z.object({
    record: recordSchema.describe('The requested record'),
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
    const row = (tableData?.rows ?? []).find(r => r.id === params.record_id);

    if (!row) throw ToolError.notFound(`Record ${params.record_id} not found in table ${params.table_id}`);

    return { record: mapRecord(row) };
  },
});
