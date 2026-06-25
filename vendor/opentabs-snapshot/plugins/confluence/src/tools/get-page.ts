// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../confluence-api.js';

export const getPage = defineTool({
  name: 'get_page',
  displayName: 'Get Page',
  description: 'Get detailed information about a specific Confluence page by its ID, optionally including the body.',
  summary: 'Get a page by ID',
  icon: 'file',
  group: 'Pages',
  input: z.object({
    page_id: z.string().min(1).describe('Page ID to retrieve'),
    body_format: z
      .enum(['storage', 'atlas_doc_format', 'view'])
      .optional()
      .describe('Body content format to return'),
  }),
  output: z.object({
    id: z.string().describe('Page ID'),
    title: z.string().describe('Page title'),
  }),
  handle: async (params: { page_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /wiki/api/v2/pages/:id (default method).
    const data = await api<{ id: string; title: string }>(`/wiki/api/v2/pages/${params.page_id}`);
    return data;
  },
});
