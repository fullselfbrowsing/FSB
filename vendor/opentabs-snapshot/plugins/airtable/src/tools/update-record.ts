// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../airtable-api.js';

export const updateRecord = defineTool({
  name: 'update_record',
  displayName: 'Update Record',
  description:
    'Update an existing Airtable record. A PATCH only changes the provided fields; omitted fields are left unchanged.',
  summary: 'Update an existing record',
  icon: 'pencil',
  group: 'Records',
  input: z.object({
    base_id: z.string().min(1).describe('Base ID containing the table'),
    table_id_or_name: z.string().min(1).describe('Table ID or name containing the record'),
    record_id: z.string().min(1).describe('Record ID to update'),
    fields: z.record(z.string(), z.unknown()).describe('Field name/value pairs to update'),
    typecast: z.boolean().optional().describe('Automatically typecast field values to match the column type'),
  }),
  output: z.object({
    id: z.string().describe('The updated record ID'),
    fields: z.record(z.string(), z.unknown()).describe('The updated record field values'),
  }),
  handle: async (params: { base_id: string; table_id_or_name: string; record_id: string; fields: Record<string, unknown> }) => {
    // NEVER executed by the importer. Upstream: api PATCH /:base_id/:table/:record_id.
    const data = await api<{ id: string; fields: Record<string, unknown> }>(
      `/${params.base_id}/${params.table_id_or_name}/${params.record_id}`,
      { method: 'PATCH', body: { fields: params.fields } }
    );
    return data;
  },
});
