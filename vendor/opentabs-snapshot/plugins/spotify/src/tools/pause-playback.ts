import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const pausePlayback = defineTool({
  name: 'pause_playback',
  displayName: 'Pause Playback',
  description: 'Pause the current playback on the user\u2019s active device.',
  summary: 'Pause playback',
  icon: 'pause',
  group: 'Playback',
  input: z.object({
    device_id: z.string().optional().describe('Device ID to pause playback on'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether playback was paused successfully'),
  }),
  handle: async params => {
    await api('/me/player/pause', { method: 'PUT', query: { device_id: params.device_id } });
    return { success: true };
  },
});
