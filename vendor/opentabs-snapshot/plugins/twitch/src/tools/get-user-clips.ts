import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';
import { clipSchema, mapClip } from './schemas.js';
import type { RawClip } from './schemas.js';

export const getUserClips = defineTool({
  name: 'get_user_clips',
  displayName: 'Get User Clips',
  description:
    'Get clips from a Twitch channel sorted by view count. Provide the broadcaster login name and optionally filter by time period.',
  summary: 'Get clips from a Twitch channel',
  icon: 'clapperboard',
  group: 'Clips',
  input: z.object({
    login: z.string().describe('Broadcaster login name (e.g., "shroud")'),
    period: z
      .enum(['LAST_DAY', 'LAST_WEEK', 'LAST_MONTH', 'ALL_TIME'])
      .optional()
      .describe('Time period filter (default ALL_TIME)'),
    first: z.number().int().min(1).max(25).optional().describe('Number of clips to return (default 10, max 25)'),
  }),
  output: z.object({ clips: z.array(clipSchema) }),
  handle: async params => {
    const first = params.first ?? 10;
    const period = params.period ?? 'ALL_TIME';
    const data = await gql<{
      user: { clips: { edges: Array<{ node: RawClip }> } } | null;
    }>(`{
      user(login: "${params.login}") {
        clips(first: ${first}, criteria: { period: ${period} }) {
          edges {
            node {
              id slug title viewCount createdAt thumbnailURL durationSeconds
              broadcaster { id login displayName }
              game { id name }
            }
          }
        }
      }
    }`);
    if (!data.user) throw ToolError.notFound(`User "${params.login}" not found`);
    return {
      clips: (data.user.clips?.edges ?? []).map(e => mapClip(e.node)),
    };
  },
});
