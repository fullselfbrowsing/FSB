// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../confluence-api.js';

export const updatePage = defineTool({
  name: 'update_page',
  displayName: 'Update Page',
  description:
    'Update an existing Confluence page. Confluence requires the new version number; only specified fields are changed.',
  summary: 'Update an existing page',
  icon: 'pencil',
  group: 'Pages',
  input: z.object({
    page_id: z.string().min(1).describe('Page ID to update'),
    version_number: z.number().int().min(1).describe('New version number (the current version + 1)'),
    title: z.string().optional().describe('New page title'),
    body: z.string().optional().describe('New page body content in storage (HTML) format'),
    status: z.enum(['current', 'draft']).optional().describe('Page status: "current" or "draft"'),
  }),
  output: z.object({
    id: z.string().describe('The updated page ID'),
    title: z.string().describe('The updated page title'),
  }),
  handle: async (params: { page_id: string; version_number: number; title?: string }) => {
    // NEVER executed by the importer. Upstream: api PUT /wiki/api/v2/pages/:id.
    const data = await api<{ id: string; title: string }>(`/wiki/api/v2/pages/${params.page_id}`, {
      method: 'PUT',
      body: { title: params.title, version: { number: params.version_number } },
    });
    return data;
  },
});
