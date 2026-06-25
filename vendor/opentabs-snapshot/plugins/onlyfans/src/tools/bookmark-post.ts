import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';

export const bookmarkPost = defineTool({
  name: 'bookmark_post',
  displayName: 'Bookmark Post',
  description:
    'Toggle the bookmark/save status on a post. If the post is already bookmarked, it will be removed from bookmarks.',
  summary: 'Bookmark or unbookmark a post',
  icon: 'bookmark-plus',
  group: 'Bookmarks',
  input: z.object({
    post_id: z.number().int().describe('Post ID to bookmark/unbookmark'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/posts/${params.post_id}/bookmarks/${params.post_id}`, { method: 'POST' });
    return { success: true };
  },
});
