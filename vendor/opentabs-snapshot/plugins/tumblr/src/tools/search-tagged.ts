import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawPost, mapPost, postSchema } from './schemas.js';

export const searchTagged = defineTool({
  name: 'search_tagged',
  displayName: 'Search Tagged',
  description: 'Search for Tumblr posts with a specific tag. Returns posts in reverse chronological order.',
  summary: 'Search posts by tag',
  icon: 'search',
  group: 'Explore',
  input: z.object({
    tag: z.string().describe('Tag to search for (without # prefix)'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of posts to return (default 20, max 20)'),
    before: z.number().optional().describe('Unix timestamp for pagination — return posts before this time'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Posts matching the tag'),
  }),
  handle: async params => {
    const data = await api<RawPost[]>('/tagged', {
      query: {
        tag: params.tag,
        limit: params.limit,
        before: params.before,
        npf: true,
      },
    });
    return { posts: (data ?? []).map(mapPost) };
  },
});
