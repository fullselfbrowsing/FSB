import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const skipToPrevious = defineTool({
  name: 'skip_to_previous',
  displayName: 'Skip to Previous',
  description: 'Skip to the previous track in the playback queue.',
  summary: 'Skip to previous track',
  icon: 'skip-back',
  group: 'Playback',
  input: z.object({
    device_id: z.string().optional().describe('Device ID to skip on'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether skip was successful'),
  }),
  handle: async params => {
    await api('/me/player/previous', { method: 'POST', query: { device_id: params.device_id } });
    return { success: true };
  },
});
