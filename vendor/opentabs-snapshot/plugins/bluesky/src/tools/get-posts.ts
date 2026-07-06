import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapPost, postSchema } from './schemas.js';

export const getPosts = defineTool({
  name: 'get_posts',
  displayName: 'Get Posts',
  description: 'Get multiple posts by their AT URIs. Returns up to 25 posts in a single request.',
  summary: 'Get multiple posts by URI',
  icon: 'list',
  group: 'Feed',
  input: z.object({
    uris: z.array(z.string()).min(1).max(25).describe('Array of AT URIs of posts to fetch (max 25)'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Array of fetched posts'),
  }),
  handle: async params => {
    const data = await api<{ posts?: Record<string, unknown>[] }>('app.bsky.feed.getPosts', {
      query: { uris: params.uris },
    });
    return {
      posts: (data.posts ?? []).map(mapPost),
    };
  },
});
