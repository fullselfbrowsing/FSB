import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const toggleShuffle = defineTool({
  name: 'toggle_shuffle',
  displayName: 'Toggle Shuffle',
  description: 'Enable or disable shuffle mode for the current playback. When enabled, tracks play in random order.',
  summary: 'Enable or disable shuffle mode',
  icon: 'shuffle',
  group: 'Playback',
  input: z.object({
    state: z.boolean().describe('Whether to enable (true) or disable (false) shuffle mode'),
    device_id: z.string().optional().describe('Device ID to target. If omitted, targets the active device.'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether shuffle mode was toggled successfully'),
  }),
  handle: async params => {
    await api('/me/player/shuffle', {
      method: 'PUT',
      query: { state: params.state, device_id: params.device_id },
    });
    return { success: true };
  },
});
