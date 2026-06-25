import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';
import { streamSchema, mapStream } from './schemas.js';
import type { RawStream } from './schemas.js';

export const getStreamsByGame = defineTool({
  name: 'get_streams_by_game',
  displayName: 'Get Streams by Game',
  description:
    'Get live streams for a specific game/category. Provide either the game name (e.g., "Just Chatting") or game ID. Returns streams sorted by viewer count.',
  summary: 'Get live streams for a game or category',
  icon: 'radio',
  group: 'Streams',
  input: z.object({
    name: z.string().optional().describe('Game name (e.g., "Just Chatting", "Fortnite")'),
    id: z.string().optional().describe('Game ID (alternative to name)'),
    first: z.number().int().min(1).max(25).optional().describe('Number of streams to return (default 10, max 25)'),
  }),
  output: z.object({ streams: z.array(streamSchema) }),
  handle: async params => {
    const first = params.first ?? 10;
    const gameArg = params.id ? `id: "${params.id}"` : `name: "${params.name}"`;
    if (!params.id && !params.name) {
      throw ToolError.validation('Either name or id is required');
    }
    const data = await gql<{
      game: { streams: { edges: Array<{ node: RawStream }> } } | null;
    }>(`{
      game(${gameArg}) {
        streams(first: ${first}) {
          edges {
            node {
              id title viewersCount type createdAt
              broadcaster { id login displayName profileImageURL(width: 70) }
              game { id name }
            }
          }
        }
      }
    }`);
    if (!data.game) throw ToolError.notFound('Game not found');
    return {
      streams: (data.game.streams?.edges ?? []).map(e => mapStream(e.node)),
    };
  },
});
