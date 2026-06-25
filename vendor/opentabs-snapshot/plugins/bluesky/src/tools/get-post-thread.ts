import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapThreadPost, threadPostSchema } from './schemas.js';

interface ThreadNode {
  post?: Record<string, unknown>;
  replies?: ThreadNode[];
}

/** Recursively flatten a thread tree into a flat array of posts. */
const flattenThread = (node: ThreadNode): Record<string, unknown>[] => {
  const result: Record<string, unknown>[] = [];
  if (node.post) result.push(node.post);
  if (node.replies) {
    for (const reply of node.replies) {
      result.push(...flattenThread(reply));
    }
  }
  return result;
};

export const getPostThread = defineTool({
  name: 'get_post_thread',
  displayName: 'Get Post Thread',
  description:
    'Get a post and its reply thread. Returns the root post and nested replies. Use depth to control how many levels of replies to fetch.',
  summary: 'Get a post and its reply thread',
  icon: 'message-square',
  group: 'Feed',
  input: z.object({
    uri: z.string().min(1).describe('AT URI of the post (e.g., at://did/app.bsky.feed.post/rkey)'),
    depth: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .optional()
      .describe('How many levels of replies to fetch (default 6, max 1000)'),
    parent_height: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .optional()
      .describe('How many levels of parent posts to fetch (default 80, max 1000)'),
  }),
  output: z.object({
    thread: z.array(threadPostSchema).describe('Flattened array of posts in the thread'),
  }),
  handle: async params => {
    const data = await api<{ thread?: ThreadNode }>('app.bsky.feed.getPostThread', {
      query: {
        uri: params.uri,
        depth: params.depth ?? 6,
        parentHeight: params.parent_height ?? 80,
      },
    });
    const posts = data.thread ? flattenThread(data.thread) : [];
    return {
      thread: posts.map(mapThreadPost),
    };
  },
});
