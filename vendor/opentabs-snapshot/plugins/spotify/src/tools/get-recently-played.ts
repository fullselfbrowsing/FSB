import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';
import { type RawPlayHistory, mapPlayHistory, playHistorySchema } from './schemas.js';

export const getRecentlyPlayed = defineTool({
  name: 'get_recently_played',
  displayName: 'Get Recently Played',
  description:
    'Get tracks the user has recently played. Returns up to 50 items with track details and the timestamp of each play. Use before/after cursors for pagination.',
  summary: 'Get recently played tracks',
  icon: 'clock',
  group: 'Playback',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Number of items to return (1-50, default 20)'),
    before: z
      .number()
      .int()
      .optional()
      .describe('Unix timestamp in milliseconds \u2014 return items played before this time'),
    after: z
      .number()
      .int()
      .optional()
      .describe('Unix timestamp in milliseconds \u2014 return items played after this time'),
  }),
  output: z.object({
    items: z.array(playHistorySchema).describe('List of recently played tracks with timestamps'),
  }),
  handle: async params => {
    const data = await api<{ items: RawPlayHistory[] }>('/me/player/recently-played', {
      query: { limit: params.limit, before: params.before, after: params.after },
    });
    return {
      items: (data.items ?? []).map(mapPlayHistory),
    };
  },
});
