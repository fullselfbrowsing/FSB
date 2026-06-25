import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const setVolume = defineTool({
  name: 'set_volume',
  displayName: 'Set Volume',
  description: 'Set the playback volume on the user\u2019s active device.',
  summary: 'Set playback volume',
  icon: 'volume-2',
  group: 'Playback',
  input: z.object({
    volume_percent: z.number().int().min(0).max(100).describe('Volume percentage to set (0-100)'),
    device_id: z.string().optional().describe('Device ID to set volume on'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether volume was set successfully'),
  }),
  handle: async params => {
    await api('/me/player/volume', {
      method: 'PUT',
      query: {
        volume_percent: params.volume_percent,
        device_id: params.device_id,
      },
    });
    return { success: true };
  },
});
