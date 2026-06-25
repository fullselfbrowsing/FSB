import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';

export const createComment = defineTool({
  name: 'create_comment',
  displayName: 'Create Comment',
  description: 'Post a comment on a YouTube video. The comment is posted as the authenticated user.',
  summary: 'Post a comment on a video',
  icon: 'message-square-plus',
  group: 'Comments',
  input: z.object({
    video_id: z.string().describe('YouTube video ID to comment on'),
    text: z.string().describe('Comment text'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the comment was posted successfully'),
  }),
  handle: async params => {
    await api('comment/create_comment', {
      commentText: params.text,
      createCommentParams: btoa(`\x12\x0b${params.video_id}`),
    });
    return { success: true };
  },
});
