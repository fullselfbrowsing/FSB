import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';
import { streamSchema, mapStream } from './schemas.js';
import type { RawStream } from './schemas.js';

export const getTopStreams = defineTool({
  name: 'get_top_streams',
  displayName: 'Get Top Streams',
  description:
    'Get the top live streams on Twitch sorted by viewer count. Returns stream title, viewer count, broadcaster info, and the game being played.',
  summary: 'Get top live streams by viewer count',
  icon: 'radio',
  group: 'Streams',
  input: z.object({
    first: z.number().int().min(1).max(25).optional().describe('Number of streams to return (default 10, max 25)'),
  }),
  output: z.object({ streams: z.array(streamSchema) }),
  handle: async params => {
    const first = params.first ?? 10;
    const data = await gql<{
      streams: { edges: Array<{ node: RawStream }> };
    }>(`{
      streams(first: ${first}) {
        edges {
          node {
            id title viewersCount type createdAt
            broadcaster { id login displayName profileImageURL(width: 70) }
            game { id name }
          }
        }
      }
    }`);
    return {
      streams: (data.streams?.edges ?? []).map(e => mapStream(e.node)),
    };
  },
});
