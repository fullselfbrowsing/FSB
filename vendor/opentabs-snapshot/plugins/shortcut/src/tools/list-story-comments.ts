import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawComment, commentSchema, mapComment } from './schemas.js';

export const listStoryComments = defineTool({
  name: 'list_story_comments',
  displayName: 'List Story Comments',
  description: 'List all comments on a story, ordered by creation date.',
  summary: 'List comments on a story',
  icon: 'message-square',
  group: 'Stories',
  input: z.object({
    story_id: z.number().int().describe('Story numeric ID'),
  }),
  output: z.object({
    comments: z.array(commentSchema).describe('Comments on the story'),
  }),
  handle: async params => {
    const data = await api<RawComment[]>(`/stories/${params.story_id}/comments`);
    return { comments: (data ?? []).map(mapComment) };
  },
});
