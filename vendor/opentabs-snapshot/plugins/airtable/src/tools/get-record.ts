// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../airtable-api.js';

export const getRecord = defineTool({
  name: 'get_record',
  displayName: 'Get Record',
  description: 'Get a single record from an Airtable table by its record ID.',
  summary: 'Get a record by ID',
  icon: 'file',
  group: 'Records',
  input: z.object({
    base_id: z.string().min(1).describe('Base ID containing the table'),
    table_id_or_name: z.string().min(1).describe('Table ID or name containing the record'),
    record_id: z.string().min(1).describe('Record ID to retrieve'),
  }),
  output: z.object({
    id: z.string().describe('Record ID'),
    fields: z.record(z.string(), z.unknown()).describe('Record field values'),
  }),
  handle: async (params: { base_id: string; table_id_or_name: string; record_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /:base_id/:table/:record_id (default method).
    const data = await api<{ id: string; fields: Record<string, unknown> }>(
      `/${params.base_id}/${params.table_id_or_name}/${params.record_id}`
    );
    return data;
  },
});
