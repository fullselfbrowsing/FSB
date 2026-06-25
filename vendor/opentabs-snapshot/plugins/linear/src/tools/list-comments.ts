import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { commentSchema, mapComment, paginationSchema } from './schemas.js';

export const listComments = defineTool({
  name: 'list_comments',
  displayName: 'List Comments',
  description: 'List comments on a Linear issue, ordered by creation date.',
  summary: 'List comments on an issue',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    issue_id: z.string().describe('Issue UUID to list comments for'),
    limit: z.number().optional().describe('Maximum number of comments to return (default 25, max 50)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    comments: z.array(commentSchema).describe('List of comments on the issue'),
    pagination: paginationSchema.describe('Pagination info for fetching more results'),
  }),
  handle: async params => {
    const limit = Math.min(params.limit ?? 25, 50);

    const data = await graphql<{
      issue: {
        comments: {
          nodes: Record<string, unknown>[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };
    }>(
      `query ListComments($id: String!, $first: Int, $after: String) {
        issue(id: $id) {
          comments(first: $first, after: $after) {
            nodes {
              id body createdAt updatedAt editedAt
              user { name displayName }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: params.issue_id, first: limit, after: params.after },
    );

    if (!data.issue) throw ToolError.notFound('Issue not found');
    const result = data.issue.comments;
    return {
      comments: result.nodes.map(n => mapComment(n as Parameters<typeof mapComment>[0])),
      pagination: {
        has_next_page: result.pageInfo?.hasNextPage ?? false,
        end_cursor: result.pageInfo?.endCursor ?? '',
      },
    };
  },
});
