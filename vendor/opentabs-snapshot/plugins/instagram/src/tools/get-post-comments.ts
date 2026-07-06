import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawComment, commentSchema, mapComment } from './schemas.js';

interface CommentsResponse {
  comments?: RawComment[];
  comment_count?: number;
  has_more_comments?: boolean;
  next_min_id?: string;
}

export const getPostComments = defineTool({
  name: 'get_post_comments',
  displayName: 'Get Post Comments',
  description: 'Get comments on a post. Use the media ID (numeric pk portion). Supports cursor pagination via min_id.',
  summary: 'Get comments on a post',
  icon: 'message-circle',
  group: 'Posts',
  input: z.object({
    media_id: z.string().describe('Media numeric pk (e.g. "3849123669892697076")'),
    min_id: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    comments: z.array(commentSchema).describe('Post comments'),
    comment_count: z.number().int().describe('Total comment count'),
    has_more: z.boolean().describe('Whether more comments are available'),
    next_min_id: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await api<CommentsResponse>(`/media/${params.media_id}/comments/`, {
      query: { can_support_threading: 'true', min_id: params.min_id },
    });
    return {
      comments: (data.comments ?? []).map(mapComment),
      comment_count: data.comment_count ?? 0,
      has_more: data.has_more_comments ?? false,
      next_min_id: data.next_min_id ?? '',
    };
  },
});
