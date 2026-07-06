import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { commentSchema, mapComment } from './schemas.js';

export const listComments = defineTool({
  name: 'list_comments',
  displayName: 'List Comments',
  description: 'List comments on a Jira issue with pagination support.',
  summary: 'List comments on an issue',
  icon: 'message-circle',
  group: 'Comments',
  input: z.object({
    issue_key: z.string().describe('Issue key (e.g. "KAN-1") or issue ID'),
    max_results: z.number().optional().describe('Maximum number of comments to return (default 20)'),
    start_at: z.number().optional().describe('Index of the first comment to return for pagination'),
    order_by: z
      .string()
      .optional()
      .describe('Sort order: "created" (oldest first) or "-created" (newest first, default)'),
  }),
  output: z.object({
    comments: z.array(commentSchema).describe('Comments on the issue'),
    total: z.number().describe('Total number of comments'),
    start_at: z.number().describe('Starting index of returned results'),
  }),
  handle: async params => {
    const data = await api<{
      comments?: Record<string, unknown>[];
      total?: number;
      startAt?: number;
    }>(`/issue/${encodeURIComponent(params.issue_key)}/comment`, {
      query: {
        maxResults: params.max_results ?? 20,
        startAt: params.start_at ?? 0,
        orderBy: params.order_by ?? '-created',
      },
    });
    return {
      comments: (data.comments ?? []).map(mapComment),
      total: data.total ?? 0,
      start_at: data.startAt ?? 0,
    };
  },
});
