import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { replaySchema, mapReplay } from './schemas.js';

export const getReplay = defineTool({
  name: 'get_replay',
  displayName: 'Get Replay',
  description:
    'Get detailed information about a specific replay including its status, accuracy, and associated session.',
  summary: 'Get replay details',
  icon: 'video',
  group: 'Replays',
  input: z.object({
    replay_id: z.string().describe('Replay ID'),
  }),
  output: z.object({ replay: replaySchema }),
  handle: async ({ replay_id }) => {
    const data = await graphql<{ replay: Record<string, unknown> }>(queries.GET_REPLAY, { replayId: replay_id });
    return { replay: mapReplay(data.replay) };
  },
});
