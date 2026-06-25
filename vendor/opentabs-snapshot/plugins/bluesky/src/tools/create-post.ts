// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../bluesky-api.js';

export const createPost = defineTool({
  name: 'create_post',
  displayName: 'Create Post',
  description:
    'Post a new entry to your Bluesky feed. Publishes the text to your account; this is publicly visible. Optionally reply to an existing post.',
  summary: 'post to bluesky',
  icon: 'plus',
  group: 'Feed',
  input: z.object({
    text: z.string().min(1).max(300).describe('The text content of the post (max 300 graphemes)'),
    reply_to_uri: z.string().optional().describe('AT-URI of the post to reply to (omit to start a new post)'),
    langs: z.array(z.string()).optional().describe('BCP-47 language tags for the post'),
  }),
  output: z.object({
    post: z.object({
      uri: z.string(),
      cid: z.string(),
    }).describe('The created post record'),
  }),
  handle: async (params: { text: string; reply_to_uri?: string; langs?: string[] }) => {
    // NEVER executed by the importer. Upstream: api POST com.atproto.repo.createRecord
    // (create -> WRITE; the {method:'POST'} literal reinforces the write class on both axes).
    const data = await api<{ post: { uri: string; cid: string } }>('/xrpc/com.atproto.repo.createRecord', {
      method: 'POST',
      body: { text: params.text, reply_to_uri: params.reply_to_uri, langs: params.langs },
    });
    return { post: data.post };
  },
});
