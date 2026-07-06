import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { mapMessage, messageSchema } from './schemas.js';

export const searchMessages = defineTool({
  name: 'search_messages',
  displayName: 'Search Messages',
  description:
    'Search for messages across Slack channels with optional pagination and sorting. Supports Slack search modifiers (e.g., "from:@user in:#channel before:2024-01-01").',
  summary: 'Search messages across channels',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search query string — supports Slack search modifiers'),
    count: z.number().optional().default(20).describe('Number of results to return per page (default 20, max 100)'),
    page: z.number().optional().default(1).describe('Page number of results to return (default 1)'),
    sort: z
      .enum(['score', 'timestamp'])
      .optional()
      .default('score')
      .describe('Sort by relevance score or recency (default "score")'),
    sort_dir: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort direction (default "desc")'),
  }),
  output: z.object({
    messages: z.array(messageSchema),
    total: z.number(),
    page: z.number(),
    pages: z.number(),
  }),
  handle: async params => {
    const data = await slackApi<{
      messages: {
        matches: Array<Record<string, unknown>>;
        total: number;
        page: number;
        pages: number;
        paging: { page: number; pages: number; total: number };
      };
    }>('search.messages', {
      query: params.query,
      count: Math.min(params.count ?? 20, 100),
      page: params.page ?? 1,
      sort: params.sort ?? 'score',
      sort_dir: params.sort_dir ?? 'desc',
    });

    const matches = data.messages?.matches ?? [];
    const paging = data.messages?.paging ?? { page: 1, pages: 1, total: 0 };

    return {
      messages: matches.map(mapMessage),
      total: paging.total ?? data.messages?.total ?? 0,
      page: paging.page ?? 1,
      pages: paging.pages ?? 1,
    };
  },
});
