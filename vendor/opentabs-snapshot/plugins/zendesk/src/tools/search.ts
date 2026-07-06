import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { type RawSearchResult, mapSearchResult, searchResultSchema } from './schemas.js';

export const search = defineTool({
  name: 'search',
  displayName: 'Search',
  description:
    'Search across tickets, users, and organizations using Zendesk search syntax. ' +
    "Examples: 'type:ticket status:open', 'type:user role:agent', " +
    "'type:organization name:Acme', 'assignee:me priority:high'",
  summary: 'Search tickets, users, and organizations',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        'Zendesk search query string. Supports syntax like "type:ticket status:open", "assignee:me", "priority:high"',
      ),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Number of results per page (default 25, max 100)'),
    sort_by: z
      .string()
      .optional()
      .describe('Field to sort results by (e.g. "created_at", "updated_at", "priority", "status", "ticket_type")'),
    sort_order: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
  }),
  output: z.object({
    results: z.array(searchResultSchema).describe('List of search results'),
    count: z.number().int().describe('Total number of matching results'),
  }),
  handle: async params => {
    const data = await api<{ results: RawSearchResult[]; count: number }>('/search.json', {
      query: {
        query: params.query,
        page: params.page,
        per_page: params.per_page,
        sort_by: params.sort_by,
        sort_order: params.sort_order,
      },
    });
    return {
      results: (data.results ?? []).map(mapSearchResult),
      count: data.count ?? 0,
    };
  },
});
