import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getDid } from '../bluesky-api.js';

export const unlikePost = defineTool({
  name: 'unlike_post',
  displayName: 'Unlike Post',
  description: 'Remove a like from a post. Requires the AT URI of the like record (returned by like_post).',
  summary: 'Remove a like from a post',
  icon: 'heart-off',
  group: 'Posts',
  input: z.object({
    like_uri: z.string().describe('AT URI of the like record to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the like was successfully removed'),
  }),
  handle: async params => {
    const rkey = params.like_uri.split('/').pop() ?? '';

    await api('com.atproto.repo.deleteRecord', {
      method: 'POST',
      body: {
        repo: getDid(),
        collection: 'app.bsky.feed.like',
        rkey,
      },
    });

    return { success: true };
  },
});
