import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';

export const muteThread = defineTool({
  name: 'mute_thread',
  displayName: 'Mute Thread',
  description: 'Mute a thread. Notifications from this thread will be suppressed.',
  summary: 'Mute a thread',
  icon: 'bell-off',
  group: 'Social Graph',
  input: z.object({
    root: z.string().describe('AT URI of the root post of the thread to mute'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the mute operation succeeded'),
  }),
  handle: async params => {
    await api('app.bsky.graph.muteThread', {
      method: 'POST',
      body: { root: params.root },
    });

    return { success: true };
  },
});
