import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';

export const unmuteThread = defineTool({
  name: 'unmute_thread',
  displayName: 'Unmute Thread',
  description: 'Unmute a thread.',
  summary: 'Unmute a thread',
  icon: 'bell',
  group: 'Social Graph',
  input: z.object({
    root: z.string().describe('AT URI of the root post of the thread to unmute'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the unmute operation succeeded'),
  }),
  handle: async params => {
    await api('app.bsky.graph.unmuteThread', {
      method: 'POST',
      body: { root: params.root },
    });

    return { success: true };
  },
});
