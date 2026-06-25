import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';
import { type RawQueue, mapQueue, publicTrackSchema } from './schemas.js';

export const getQueue = defineTool({
  name: 'get_queue',
  displayName: 'Get Queue',
  description:
    "Get the current playback queue including the currently playing track and upcoming tracks. Returns the user's queue as managed by Spotify.",
  summary: 'Get the current playback queue',
  icon: 'list',
  group: 'Playback',
  input: z.object({}),
  output: z.object({
    currently_playing: publicTrackSchema.describe('Currently playing track'),
    queue: z.array(publicTrackSchema).describe('Upcoming tracks in the queue'),
  }),
  handle: async () => {
    const data = await api<RawQueue>('/me/player/queue');
    return mapQueue(data);
  },
});
