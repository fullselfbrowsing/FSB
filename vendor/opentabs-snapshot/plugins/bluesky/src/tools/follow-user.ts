import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getDid } from '../bluesky-api.js';

export const followUser = defineTool({
  name: 'follow_user',
  displayName: 'Follow User',
  description: "Follow a user. Requires the target user's DID. Returns the follow record URI (needed for unfollowing).",
  summary: 'Follow a user',
  icon: 'user-plus',
  group: 'Social Graph',
  input: z.object({
    did: z.string().describe('DID of the user to follow'),
  }),
  output: z.object({
    follow_uri: z.string().describe('AT URI of the follow record (needed for unfollowing)'),
  }),
  handle: async params => {
    const repo = getDid();

    const data = await api<{ uri: string; cid: string }>('com.atproto.repo.createRecord', {
      method: 'POST',
      body: {
        repo,
        collection: 'app.bsky.graph.follow',
        record: {
          $type: 'app.bsky.graph.follow',
          subject: params.did,
          createdAt: new Date().toISOString(),
        },
      },
    });

    return { follow_uri: data.uri };
  },
});
