import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawComment, commentSchema, mapComment } from './schemas.js';

export const createStoryComment = defineTool({
  name: 'create_story_comment',
  displayName: 'Create Story Comment',
  description: 'Add a comment to a story. Supports Markdown formatting.',
  summary: 'Add a comment to a story',
  icon: 'message-square-plus',
  group: 'Stories',
  input: z.object({
    story_id: z.number().int().describe('Story numeric ID'),
    text: z.string().describe('Comment body in Markdown'),
  }),
  output: z.object({ comment: commentSchema }),
  handle: async params => {
    const data = await api<RawComment>(`/stories/${params.story_id}/comments`, {
      method: 'POST',
      body: { text: params.text },
    });
    return { comment: mapComment(data) };
  },
});
