// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../confluence-api.js';

export const searchPages = defineTool({
  name: 'search_pages',
  displayName: 'Search Pages',
  description: 'Search for Confluence pages using a CQL (Confluence Query Language) query string.',
  summary: 'Search pages with CQL',
  icon: 'search',
  group: 'Pages',
  input: z.object({
    cql: z.string().min(1).describe('CQL query string (e.g. type = page AND space = ENG)'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of results to return'),
    cursor: z.string().optional().describe('Opaque cursor for pagination'),
  }),
  output: z.object({
    results: z
      .array(z.object({ id: z.string(), title: z.string() }))
      .describe('Matching pages'),
  }),
  handle: async (params: { cql: string }) => {
    // NEVER executed by the importer. Upstream: api GET /wiki/rest/api/search (default method, read).
    const data = await api<{ results: Array<{ id: string; title: string }> }>('/wiki/rest/api/search', {
      query: { cql: params.cql },
    });
    return data;
  },
});
