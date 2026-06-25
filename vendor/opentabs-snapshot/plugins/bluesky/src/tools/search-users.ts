import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapProfile, profileSchema } from './schemas.js';

export const searchUsers = defineTool({
  name: 'search_users',
  displayName: 'Search Users',
  description:
    'Search for users by keyword. Returns paginated results matching the query against handles and display names.',
  summary: 'Search for users',
  icon: 'search',
  group: 'Profiles',
  input: z.object({
    q: z.string().describe('Search query'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of results to return (default 25, max 100)'),
  }),
  output: z.object({
    profiles: z.array(profileSchema).describe('Matching user profiles'),
    cursor: z.string().describe('Pagination cursor for the next page'),
  }),
  handle: async params => {
    const data = await api<{ actors: Record<string, unknown>[]; cursor?: string }>('app.bsky.actor.searchActors', {
      query: { q: params.q, cursor: params.cursor, limit: params.limit },
    });
    return {
      profiles: data.actors.map(mapProfile),
      cursor: data.cursor ?? '',
    };
  },
});
