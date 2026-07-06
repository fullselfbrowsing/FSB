import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapProfile, profileSchema } from './schemas.js';

export const getFollows = defineTool({
  name: 'get_follows',
  displayName: 'Get Follows',
  description: 'Get the list of accounts a user follows. Supports cursor-based pagination.',
  summary: 'Get accounts a user follows',
  icon: 'user-plus',
  group: 'Social Graph',
  input: z.object({
    actor: z.string().describe('DID or handle of the user whose follows to retrieve'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(50)
      .optional()
      .describe('Number of follows to return (1-100, default 50)'),
  }),
  output: z.object({
    profiles: z.array(profileSchema).describe('List of followed profiles'),
    cursor: z.string().describe('Pagination cursor for the next page (empty if no more results)'),
  }),
  handle: async params => {
    const data = await api<{ follows: Record<string, unknown>[]; cursor?: string }>('app.bsky.graph.getFollows', {
      query: { actor: params.actor, cursor: params.cursor, limit: params.limit },
    });

    return {
      profiles: data.follows.map(mapProfile),
      cursor: data.cursor ?? '',
    };
  },
});
