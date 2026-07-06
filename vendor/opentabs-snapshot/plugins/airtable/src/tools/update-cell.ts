import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../airtable-api.js';

export const updateCell = defineTool({
  name: 'update_cell',
  displayName: 'Update Cell',
  description:
    'Update a single cell value in a record. The value format depends on the field type: text fields accept strings, number fields accept numbers, select fields accept an object like {"id": "selXxx"}, and so on. Use get_base_schema to discover field IDs and types.',
  summary: 'Update a single cell value in a record',
  icon: 'pencil',
  group: 'Records',
  input: z.object({
    base_id: z.string().describe('Base ID (app prefix)'),
    table_id: z.string().describe('Table ID (tbl prefix)'),
    record_id: z.string().describe('Record ID (rec prefix)'),
    field_id: z.string().describe('Field/column ID (fld prefix)'),
    value: z
      .union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.string(), z.unknown()), z.array(z.unknown())])
      .describe('New cell value — type depends on the field type'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the update succeeded'),
  }),
  handle: async params => {
    await apiPost<null>(
      `row/${params.record_id}/updatePrimitiveCell`,
      {
        tableId: params.table_id,
        rowId: params.record_id,
        columnId: params.field_id,
        cellValue: params.value,
      },
      { appId: params.base_id },
    );

    return { success: true };
  },
});
