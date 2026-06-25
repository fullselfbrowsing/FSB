// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../airtable-api.js';

export const deleteRecord = defineTool({
  name: 'delete_record',
  displayName: 'Delete Record',
  description: 'Permanently delete a record from an Airtable table by its record ID. This action cannot be undone.',
  summary: 'Delete a record permanently',
  icon: 'trash-2',
  group: 'Records',
  input: z.object({
    base_id: z.string().min(1).describe('Base ID containing the table'),
    table_id_or_name: z.string().min(1).describe('Table ID or name containing the record'),
    record_id: z.string().min(1).describe('Record ID to delete'),
  }),
  output: z.object({
    id: z.string().describe('The deleted record ID'),
    deleted: z.boolean().describe('Whether the record was successfully deleted'),
  }),
  handle: async (params: { base_id: string; table_id_or_name: string; record_id: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid DELETE /:base_id/:table/:record_id (destructive).
    await apiVoid(`/${params.base_id}/${params.table_id_or_name}/${params.record_id}`, { method: 'DELETE' });
    return { id: params.record_id, deleted: true };
  },
});
