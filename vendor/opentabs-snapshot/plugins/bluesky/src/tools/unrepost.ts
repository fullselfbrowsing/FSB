import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getDid } from '../bluesky-api.js';

export const unrepost = defineTool({
  name: 'unrepost',
  displayName: 'Unrepost',
  description: 'Remove a repost. Requires the AT URI of the repost record (returned by repost).',
  summary: 'Remove a repost',
  icon: 'x',
  group: 'Posts',
  input: z.object({
    repost_uri: z.string().describe('AT URI of the repost record to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the repost was successfully removed'),
  }),
  handle: async params => {
    const rkey = params.repost_uri.split('/').pop() ?? '';

    await api('com.atproto.repo.deleteRecord', {
      method: 'POST',
      body: {
        repo: getDid(),
        collection: 'app.bsky.feed.repost',
        rkey,
      },
    });

    return { success: true };
  },
});
