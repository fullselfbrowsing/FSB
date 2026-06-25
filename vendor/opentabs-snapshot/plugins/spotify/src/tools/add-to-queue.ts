import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const addToQueue = defineTool({
  name: 'add_to_queue',
  displayName: 'Add to Queue',
  description:
    'Add a track or episode to the end of the playback queue. Requires the Spotify URI of the item (e.g., "spotify:track:4iV5W9uYEdYUVa79Axb7Rh").',
  summary: 'Add a track or episode to the playback queue',
  icon: 'list-plus',
  group: 'Playback',
  input: z.object({
    uri: z
      .string()
      .describe('Spotify URI of the track or episode to add (e.g., "spotify:track:4iV5W9uYEdYUVa79Axb7Rh")'),
    device_id: z.string().optional().describe('Device ID to target. If omitted, targets the active device.'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the item was added to the queue successfully'),
  }),
  handle: async params => {
    await api('/me/player/queue', {
      method: 'POST',
      query: { uri: params.uri, device_id: params.device_id },
    });
    return { success: true };
  },
});
