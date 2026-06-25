import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const seekToPosition = defineTool({
  name: 'seek_to_position',
  displayName: 'Seek to Position',
  description: 'Seek to a specific position in the currently playing track.',
  summary: 'Seek to a position in the current track',
  icon: 'fast-forward',
  group: 'Playback',
  input: z.object({
    position_ms: z.number().int().describe('Position in milliseconds to seek to'),
    device_id: z.string().optional().describe('Device ID to seek on'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether seek was successful'),
  }),
  handle: async params => {
    await api('/me/player/seek', {
      method: 'PUT',
      query: {
        position_ms: params.position_ms,
        device_id: params.device_id,
      },
    });
    return { success: true };
  },
});
