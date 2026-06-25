import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../spotify-api.js';

export const skipToNext = defineTool({
  name: 'skip_to_next',
  displayName: 'Skip to Next',
  description: 'Skip to the next track in the playback queue.',
  summary: 'Skip to next track',
  icon: 'skip-forward',
  group: 'Playback',
  input: z.object({
    device_id: z.string().optional().describe('Device ID to skip on'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether skip was successful'),
  }),
  handle: async params => {
    await api('/me/player/next', { method: 'POST', query: { device_id: params.device_id } });
    return { success: true };
  },
});
