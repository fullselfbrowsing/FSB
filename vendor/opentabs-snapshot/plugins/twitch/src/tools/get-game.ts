import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';
import { gameSchema, mapGame } from './schemas.js';
import type { RawGame } from './schemas.js';

export const getGame = defineTool({
  name: 'get_game',
  displayName: 'Get Game',
  description:
    'Get details about a specific game/category on Twitch by name or ID. Returns viewer count, broadcaster count, and box art URL.',
  summary: 'Get game/category details',
  icon: 'gamepad-2',
  group: 'Games',
  input: z.object({
    name: z.string().optional().describe('Game name (e.g., "Just Chatting", "Fortnite")'),
    id: z.string().optional().describe('Game ID (alternative to name)'),
  }),
  output: z.object({ game: gameSchema }),
  handle: async params => {
    if (!params.id && !params.name) {
      throw ToolError.validation('Either name or id is required');
    }
    const gameArg = params.id ? `id: "${params.id}"` : `name: "${params.name}"`;
    const data = await gql<{ game: RawGame | null }>(`{
      game(${gameArg}) {
        id name displayName viewersCount broadcastersCount boxArtURL
      }
    }`);
    if (!data.game) throw ToolError.notFound('Game not found');
    return { game: mapGame(data.game) };
  },
});
