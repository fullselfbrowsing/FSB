import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { postSummarySchema, type RawPost, mapPostSummary } from './schemas.js';

interface PostResponsesData {
  post: {
    id: string;
    postResponses: { count: number };
    threadedPostResponses: {
      posts: RawPost[];
      pagingInfo: { next: { limit: number; to: string | null } | null };
    };
  } | null;
}

export const getPostResponses = defineTool({
  name: 'get_post_responses',
  displayName: 'Get Post Responses',
  description:
    'Get responses (comments) on a Medium post. Returns the response count, response posts, and an opaque next_cursor. Pass next_cursor back as cursor to fetch the next page — this is the only way to retrieve responses past the first page.',
  summary: 'Get comments on a post',
  icon: 'message-circle',
  group: 'Posts',
  input: z.object({
    post_id: z.string().describe('Medium post ID'),
    limit: z.number().int().min(1).max(25).optional().describe('Maximum responses to return (default 10)'),
    cursor: z
      .string()
      .optional()
      .describe('Opaque pagination cursor from a previous response (next_cursor). Omit to fetch the first page.'),
  }),
  output: z.object({
    total_count: z.number().describe('Total number of responses'),
    responses: z.array(postSummarySchema),
    has_next: z.boolean().describe('Whether more responses are available'),
    next_cursor: z
      .string()
      .nullable()
      .describe('Opaque cursor to pass as cursor on the next call, or null if no more pages'),
  }),
  handle: async params => {
    const limit = params.limit ?? 10;
    const paging: { limit: number; to?: string } = { limit };
    if (params.cursor) paging.to = params.cursor;
    const data = await gql<PostResponsesData>(
      'PostResponsesQuery',
      `query PostResponsesQuery($postId: ID!, $paging: PagingOptions) {
        post(id: $postId) {
          id
          postResponses { count }
          threadedPostResponses(paging: $paging) {
            posts {
              id title mediumUrl firstPublishedAt clapCount voterCount
              creator { id name username }
              extendedPreviewContent { subtitle }
            }
            pagingInfo { next { limit to } }
          }
        }
      }`,
      { postId: params.post_id, paging },
    );
    if (!data.post) throw ToolError.notFound(`Post not found: ${params.post_id}`);
    const next = data.post.threadedPostResponses?.pagingInfo?.next ?? null;
    return {
      total_count: data.post.postResponses?.count ?? 0,
      responses: (data.post.threadedPostResponses?.posts ?? []).map(mapPostSummary),
      has_next: next?.to != null,
      next_cursor: next?.to ?? null,
    };
  },
});
