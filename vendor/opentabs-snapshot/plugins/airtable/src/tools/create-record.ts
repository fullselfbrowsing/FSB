// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../airtable-api.js';

export const createRecord = defineTool({
  name: 'create_record',
  displayName: 'Create Record',
  description: 'Create a new record in an Airtable table with the provided field values.',
  summary: 'Create a new record',
  icon: 'plus',
  group: 'Records',
  input: z.object({
    base_id: z.string().min(1).describe('Base ID containing the table'),
    table_id_or_name: z.string().min(1).describe('Table ID or name to create the record in'),
    fields: z.record(z.string(), z.unknown()).describe('Field name/value pairs for the new record'),
    typecast: z.boolean().optional().describe('Automatically typecast field values to match the column type'),
  }),
  output: z.object({
    id: z.string().describe('The created record ID'),
    fields: z.record(z.string(), z.unknown()).describe('The created record field values'),
  }),
  handle: async (params: { base_id: string; table_id_or_name: string; fields: Record<string, unknown> }) => {
    // NEVER executed by the importer. Upstream: api POST /:base_id/:table.
    const data = await api<{ id: string; fields: Record<string, unknown> }>(
      `/${params.base_id}/${params.table_id_or_name}`,
      { method: 'POST', body: { fields: params.fields } }
    );
    return data;
  },
});
