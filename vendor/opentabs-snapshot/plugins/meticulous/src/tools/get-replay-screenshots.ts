import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { screenshotSchema, mapScreenshot } from './schemas.js';

export const getReplayScreenshots = defineTool({
  name: 'get_replay_screenshots',
  displayName: 'Get Replay Screenshots',
  description: 'Get all screenshots captured during a specific replay.',
  summary: 'Get screenshots for a replay',
  icon: 'image',
  group: 'Replays',
  input: z.object({
    replay_id: z.string().describe('Replay ID'),
  }),
  output: z.object({
    replay_id: z.string(),
    screenshots: z.array(screenshotSchema),
  }),
  handle: async ({ replay_id }) => {
    const data = await graphql<{ replay: { id: string; screenshotsData: Array<Record<string, unknown>> } }>(
      queries.GET_REPLAY_SCREENSHOTS,
      { replayId: replay_id },
    );
    return {
      replay_id: data.replay.id,
      screenshots: (data.replay.screenshotsData ?? []).map(mapScreenshot),
    };
  },
});
