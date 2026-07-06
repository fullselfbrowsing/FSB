import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';
import { gameSchema, mapGame } from './schemas.js';
import type { RawGame } from './schemas.js';

export const getTopGames = defineTool({
  name: 'get_top_games',
  displayName: 'Get Top Games',
  description:
    'Get the top games/categories on Twitch sorted by viewer count. Returns game name, total viewers, number of broadcasters, and box art URL.',
  summary: 'Get top games and categories by viewer count',
  icon: 'gamepad-2',
  group: 'Games',
  input: z.object({
    first: z.number().int().min(1).max(25).optional().describe('Number of games to return (default 10, max 25)'),
  }),
  output: z.object({ games: z.array(gameSchema) }),
  handle: async params => {
    const first = params.first ?? 10;
    const data = await gql<{
      games: { edges: Array<{ node: RawGame }> };
    }>(`{
      games(first: ${first}, options: { sort: VIEWER_COUNT }) {
        edges {
          node { id name displayName viewersCount broadcastersCount boxArtURL }
        }
      }
    }`);
    return {
      games: (data.games?.edges ?? []).map(e => mapGame(e.node)),
    };
  },
});
