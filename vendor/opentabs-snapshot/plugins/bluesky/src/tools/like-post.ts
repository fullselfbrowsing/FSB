import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getDid } from '../bluesky-api.js';

export const likePost = defineTool({
  name: 'like_post',
  displayName: 'Like Post',
  description:
    "Like a post. Requires the post's AT URI and CID. Returns the URI of the like record (needed for unliking).",
  summary: 'Like a post',
  icon: 'heart',
  group: 'Posts',
  input: z.object({
    uri: z.string().describe('AT URI of the post to like'),
    cid: z.string().describe('CID of the post to like'),
  }),
  output: z.object({
    like_uri: z.string().describe('AT URI of the like record (needed for unliking)'),
  }),
  handle: async params => {
    const data = await api<{ uri: string; cid: string }>('com.atproto.repo.createRecord', {
      method: 'POST',
      body: {
        repo: getDid(),
        collection: 'app.bsky.feed.like',
        record: {
          $type: 'app.bsky.feed.like',
          subject: { uri: params.uri, cid: params.cid },
          createdAt: new Date().toISOString(),
        },
      },
    });

    return { like_uri: data.uri };
  },
});
