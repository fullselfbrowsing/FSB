import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getDid } from '../bluesky-api.js';

export const repost = defineTool({
  name: 'repost',
  displayName: 'Repost',
  description:
    "Repost a post. Requires the post's AT URI and CID. Returns the URI of the repost record (needed for unreposting).",
  summary: 'Repost a post',
  icon: 'repeat-2',
  group: 'Posts',
  input: z.object({
    uri: z.string().describe('AT URI of the post to repost'),
    cid: z.string().describe('CID of the post to repost'),
  }),
  output: z.object({
    repost_uri: z.string().describe('AT URI of the repost record (needed for unreposting)'),
  }),
  handle: async params => {
    const data = await api<{ uri: string; cid: string }>('com.atproto.repo.createRecord', {
      method: 'POST',
      body: {
        repo: getDid(),
        collection: 'app.bsky.feed.repost',
        record: {
          $type: 'app.bsky.feed.repost',
          subject: { uri: params.uri, cid: params.cid },
          createdAt: new Date().toISOString(),
        },
      },
    });

    return { repost_uri: data.uri };
  },
});
