import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';

export const unmuteActor = defineTool({
  name: 'unmute_actor',
  displayName: 'Unmute User',
  description: 'Unmute a user.',
  summary: 'Unmute a user',
  icon: 'volume-2',
  group: 'Social Graph',
  input: z.object({
    actor: z.string().describe('DID or handle of the user to unmute'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the unmute operation succeeded'),
  }),
  handle: async params => {
    await api('app.bsky.graph.unmuteActor', {
      method: 'POST',
      body: { actor: params.actor },
    });

    return { success: true };
  },
});
