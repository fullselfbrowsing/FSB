import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { noteSchema, type RawNote, mapNote } from './schemas.js';

export const getPostNotes = defineTool({
  name: 'get_post_notes',
  displayName: 'Get Post Notes',
  description: 'Get notes (likes, reblogs, replies) on a Tumblr post. Filter by mode to see specific note types.',
  summary: 'Get notes on a post',
  icon: 'message-circle',
  group: 'Posts',
  input: z.object({
    blog_name: z.string().describe('Blog name or URL that owns the post'),
    post_id: z.string().describe('Post ID to get notes for'),
    mode: z
      .enum(['all', 'likes', 'conversation', 'reblog_with_tags', 'reblogs_with_tags'])
      .optional()
      .describe('Note filter mode'),
  }),
  output: z.object({
    notes: z.array(noteSchema).describe('Post notes (likes, reblogs, replies)'),
    total_notes: z.number().describe('Total note count for pagination hint'),
  }),
  handle: async params => {
    const res = await api<{ notes: RawNote[]; total_notes: number }>(`/blog/${params.blog_name}/notes`, {
      query: { id: params.post_id, mode: params.mode ?? 'all' },
    });
    return {
      notes: (res.notes ?? []).map(mapNote),
      total_notes: res.total_notes,
    };
  },
});
