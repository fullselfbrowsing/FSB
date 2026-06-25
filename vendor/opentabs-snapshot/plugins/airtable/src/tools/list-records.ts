// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../airtable-api.js';

export const listRecords = defineTool({
  name: 'list_records',
  displayName: 'List Records',
  description: 'List records from an Airtable table. Optionally filter, sort, and page through results.',
  summary: 'List records in a table',
  icon: 'list',
  group: 'Records',
  input: z.object({
    base_id: z.string().min(1).describe('Base ID containing the table'),
    table_id_or_name: z.string().min(1).describe('Table ID or name to list records from'),
    view: z.string().optional().describe('View ID or name to use for filtering/sorting'),
    filter_by_formula: z.string().optional().describe('Airtable formula to filter records'),
    max_records: z.number().int().min(1).optional().describe('Maximum number of records to return'),
    page_size: z.number().int().min(1).max(100).optional().describe('Number of records per page'),
    offset: z.string().optional().describe('Pagination offset token from a prior response'),
  }),
  output: z.object({
    records: z
      .array(z.object({ id: z.string(), fields: z.record(z.string(), z.unknown()) }))
      .describe('List of records'),
    offset: z.string().optional().describe('Pagination offset for the next page'),
  }),
  handle: async (params: { base_id: string; table_id_or_name: string }) => {
    // NEVER executed by the importer. Upstream: api GET /:base_id/:table (default method, read).
    const data = await api<{ records: Array<{ id: string; fields: Record<string, unknown> }> }>(
      `/${params.base_id}/${params.table_id_or_name}`
    );
    return data;
  },
});
