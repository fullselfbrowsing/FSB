import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const setRepeatMode = defineTool({
  name: 'set_repeat_mode',
  displayName: 'Set Repeat Mode',
  description:
    'Set the repeat mode for the current playback. Options are "off" (no repeat), "context" (repeat the current context such as album or playlist), and "track" (repeat the current track).',
  summary: 'Set repeat mode (off, context, or track)',
  icon: 'repeat',
  group: 'Playback',
  input: z.object({
    state: z
      .enum(['off', 'context', 'track'])
      .describe('Repeat mode: "off", "context" (repeat album/playlist), or "track" (repeat current track)'),
    device_id: z.string().optional().describe('Device ID to target. If omitted, targets the active device.'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the repeat mode was set successfully'),
  }),
  handle: async params => {
    await api('/me/player/repeat', {
      method: 'PUT',
      query: { state: params.state, device_id: params.device_id },
    });
    return { success: true };
  },
});
