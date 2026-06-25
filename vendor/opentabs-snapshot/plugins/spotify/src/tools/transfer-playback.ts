import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const transferPlayback = defineTool({
  name: 'transfer_playback',
  displayName: 'Transfer Playback',
  description:
    'Transfer playback to a different device. Use get_available_devices to discover device IDs. Optionally start playback on the target device.',
  summary: 'Transfer playback to a different device',
  icon: 'arrow-right',
  group: 'Playback',
  input: z.object({
    device_id: z.string().describe('ID of the device to transfer playback to'),
    play: z
      .boolean()
      .optional()
      .describe('Whether to start playing on the target device. If omitted, keeps current play state.'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether playback was transferred successfully'),
  }),
  handle: async params => {
    await api('/me/player', {
      method: 'PUT',
      body: { device_ids: [params.device_id], play: params.play },
    });
    return { success: true };
  },
});
