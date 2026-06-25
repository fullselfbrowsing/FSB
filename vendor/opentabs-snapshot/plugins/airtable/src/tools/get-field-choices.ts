import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiGet } from '../airtable-api.js';
import { mapChoice, selectChoiceSchema } from './schemas.js';

interface RawColumn {
  id?: string;
  name?: string;
  type?: string;
  typeOptions?: {
    choices?: Record<string, { id?: string; name?: string; color?: string }>;
    choiceOrder?: string[];
  };
}

interface RawTableSchema {
  id?: string;
  columns?: RawColumn[];
}

interface ReadResult {
  tableSchemas?: RawTableSchema[];
}

export const getFieldChoices = defineTool({
  name: 'get_field_choices',
  displayName: 'Get Field Choices',
  description:
    'Get the available choices for a single-select or multi-select field. Returns choice IDs, names, and colors. Use the choice ID (sel prefix) when setting cell values for select fields.',
  summary: 'Get select/multi-select field choices',
  icon: 'list',
  group: 'Fields',
  input: z.object({
    base_id: z.string().describe('Base ID (app prefix)'),
    table_id: z.string().describe('Table ID (tbl prefix)'),
    field_id: z.string().describe('Field/column ID (fld prefix) — must be a select or multiSelect type'),
  }),
  output: z.object({
    choices: z.array(selectChoiceSchema).describe('Available choices for the field'),
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

    const table = (data.tableSchemas ?? []).find(t => t.id === params.table_id);
    if (!table) throw ToolError.notFound(`Table ${params.table_id} not found`);

    const field = (table.columns ?? []).find(c => c.id === params.field_id);
    if (!field) throw ToolError.notFound(`Field ${params.field_id} not found in table ${params.table_id}`);

    if (field.type !== 'select' && field.type !== 'multiSelect')
      throw ToolError.validation(`Field ${params.field_id} is type "${field.type}", not a select field`);

    const choicesMap = field.typeOptions?.choices ?? {};
    const choiceOrder = field.typeOptions?.choiceOrder ?? Object.keys(choicesMap);

    const choices = choiceOrder.map(id => mapChoice(choicesMap[id] ?? { id }));

    return { choices };
  },
});
