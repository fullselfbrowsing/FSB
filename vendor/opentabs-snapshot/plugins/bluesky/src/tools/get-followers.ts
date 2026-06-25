import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapProfile, profileSchema } from './schemas.js';

export const getFollowers = defineTool({
  name: 'get_followers',
  displayName: 'Get Followers',
  description: "Get a user's followers list. Supports cursor-based pagination.",
  summary: "Get a user's followers",
  icon: 'users',
  group: 'Social Graph',
  input: z.object({
    actor: z.string().describe('DID or handle of the user whose followers to retrieve'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(50)
      .optional()
      .describe('Number of followers to return (1-100, default 50)'),
  }),
  output: z.object({
    profiles: z.array(profileSchema).describe('List of follower profiles'),
    cursor: z.string().describe('Pagination cursor for the next page (empty if no more results)'),
  }),
  handle: async params => {
    const data = await api<{ followers: Record<string, unknown>[]; cursor?: string }>('app.bsky.graph.getFollowers', {
      query: { actor: params.actor, cursor: params.cursor, limit: params.limit },
    });

    return {
      profiles: data.followers.map(mapProfile),
      cursor: data.cursor ?? '',
    };
  },
});
