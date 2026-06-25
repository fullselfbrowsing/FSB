import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';

export const muteActor = defineTool({
  name: 'mute_actor',
  displayName: 'Mute User',
  description: 'Mute a user. Their posts will no longer appear in your feed.',
  summary: 'Mute a user',
  icon: 'volume-x',
  group: 'Social Graph',
  input: z.object({
    actor: z.string().describe('DID or handle of the user to mute'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the mute operation succeeded'),
  }),
  handle: async params => {
    await api('app.bsky.graph.muteActor', {
      method: 'POST',
      body: { actor: params.actor },
    });

    return { success: true };
  },
});
