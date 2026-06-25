import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapProfileBasic, profileBasicSchema } from './schemas.js';

export const searchUsersTypeahead = defineTool({
  name: 'search_users_typeahead',
  displayName: 'Search Users Typeahead',
  description:
    'Typeahead search for users. Returns a quick list of matching users for autocomplete. Faster than full search but returns fewer results.',
  summary: 'Typeahead search for users',
  icon: 'at-sign',
  group: 'Profiles',
  input: z.object({
    q: z.string().describe('Search query'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('Maximum number of results to return (default 8, max 10)'),
  }),
  output: z.object({
    profiles: z.array(profileBasicSchema).describe('Matching user profiles'),
  }),
  handle: async params => {
    const data = await api<{ actors: Record<string, unknown>[] }>('app.bsky.actor.searchActorsTypeahead', {
      query: { q: params.q, limit: params.limit },
    });
    return { profiles: data.actors.map(mapProfileBasic) };
  },
});
