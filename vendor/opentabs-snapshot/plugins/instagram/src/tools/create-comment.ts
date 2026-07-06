import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawComment, commentSchema, mapComment } from './schemas.js';

interface CommentResponse {
  comment?: RawComment;
}

export const createComment = defineTool({
  name: 'create_comment',
  displayName: 'Create Comment',
  description: 'Post a comment on an Instagram post. Returns the created comment.',
  summary: 'Comment on a post',
  icon: 'message-circle',
  group: 'Posts',
  input: z.object({
    media_id: z.string().describe('Media numeric pk'),
    text: z.string().describe('Comment text'),
  }),
  output: z.object({ comment: commentSchema }),
  handle: async params => {
    const data = await api<CommentResponse>(`/web/comments/${params.media_id}/add/`, {
      method: 'POST',
      body: `comment_text=${encodeURIComponent(params.text)}`,
      formEncoded: true,
    });
    return { comment: mapComment(data.comment ?? {}) };
  },
});
