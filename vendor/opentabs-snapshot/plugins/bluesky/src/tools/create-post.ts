import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getDid } from '../bluesky-api.js';

export const createPost = defineTool({
  name: 'create_post',
  displayName: 'Create Post',
  description:
    'Create a new Bluesky post. Supports plain text. For replies, provide the parent and root post URIs and CIDs.',
  summary: 'Create a new post',
  icon: 'pencil',
  group: 'Posts',
  input: z.object({
    text: z.string().max(300).describe('The text content of the post (max 300 characters)'),
    reply_to_uri: z.string().optional().describe('AT URI of the parent post to reply to'),
    reply_to_cid: z.string().optional().describe('CID of the parent post to reply to'),
    root_uri: z
      .string()
      .optional()
      .describe('AT URI of the root post in the thread (defaults to reply_to_uri for direct replies)'),
    root_cid: z
      .string()
      .optional()
      .describe('CID of the root post in the thread (defaults to reply_to_cid for direct replies)'),
  }),
  output: z.object({
    uri: z.string().describe('AT URI of the created post'),
    cid: z.string().describe('CID of the created post'),
  }),
  handle: async params => {
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text: params.text,
      createdAt: new Date().toISOString(),
      langs: ['en'],
    };

    if (params.reply_to_uri) {
      record.reply = {
        root: {
          uri: params.root_uri ?? params.reply_to_uri,
          cid: params.root_cid ?? params.reply_to_cid,
        },
        parent: {
          uri: params.reply_to_uri,
          cid: params.reply_to_cid,
        },
      };
    }

    const data = await api<{ uri: string; cid: string }>('com.atproto.repo.createRecord', {
      method: 'POST',
      body: {
        repo: getDid(),
        collection: 'app.bsky.feed.post',
        record,
      },
    });

    return { uri: data.uri, cid: data.cid };
  },
});
