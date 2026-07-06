import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getDid } from '../bluesky-api.js';

export const deletePost = defineTool({
  name: 'delete_post',
  displayName: 'Delete Post',
  description:
    'Delete a post by its AT URI. Only the post author can delete their own posts. The rkey is extracted from the URI.',
  summary: 'Delete a post',
  icon: 'trash-2',
  group: 'Posts',
  input: z.object({
    uri: z.string().describe('AT URI of the post to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the post was successfully deleted'),
  }),
  handle: async params => {
    const rkey = params.uri.split('/').pop() ?? '';

    await api('com.atproto.repo.deleteRecord', {
      method: 'POST',
      body: {
        repo: getDid(),
        collection: 'app.bsky.feed.post',
        rkey,
      },
    });

    return { success: true };
  },
});
