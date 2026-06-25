// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../confluence-api.js';

export const createPage = defineTool({
  name: 'create_page',
  displayName: 'Create Page',
  description:
    'Create a new page in a Confluence space. Requires a space_id and a title at minimum. Optionally set the body content and a parent page.',
  summary: 'Create a new page',
  icon: 'plus',
  group: 'Pages',
  input: z.object({
    space_id: z.string().min(1).describe('Space ID to create the page in'),
    title: z.string().min(1).describe('Page title'),
    body: z.string().optional().describe('Page body content in storage (HTML) format'),
    parent_id: z.string().optional().describe('Parent page ID to nest this page under'),
    status: z.enum(['current', 'draft']).optional().describe('Page status: "current" or "draft"'),
  }),
  output: z.object({
    id: z.string().describe('The created page ID'),
    title: z.string().describe('The created page title'),
  }),
  handle: async (params: { space_id: string; title: string }) => {
    // NEVER executed by the importer. Upstream: api POST /wiki/api/v2/pages.
    const data = await api<{ id: string; title: string }>('/wiki/api/v2/pages', {
      method: 'POST',
      body: { spaceId: params.space_id, title: params.title },
    });
    return data;
  },
});
