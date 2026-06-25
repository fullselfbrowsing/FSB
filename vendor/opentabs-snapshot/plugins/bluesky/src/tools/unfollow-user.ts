import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getDid } from '../bluesky-api.js';

export const unfollowUser = defineTool({
  name: 'unfollow_user',
  displayName: 'Unfollow User',
  description:
    'Unfollow a user. Requires the AT URI of the follow record (returned by follow_user or found in the viewer relationship).',
  summary: 'Unfollow a user',
  icon: 'user-minus',
  group: 'Social Graph',
  input: z.object({
    follow_uri: z.string().describe('AT URI of the follow record to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the unfollow operation succeeded'),
  }),
  handle: async params => {
    const repo = getDid();
    const rkey = params.follow_uri.split('/').pop() ?? '';

    await api('com.atproto.repo.deleteRecord', {
      method: 'POST',
      body: {
        repo,
        collection: 'app.bsky.graph.follow',
        rkey,
      },
    });

    return { success: true };
  },
});
