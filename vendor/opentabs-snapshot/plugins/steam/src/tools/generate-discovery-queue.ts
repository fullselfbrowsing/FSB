import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storePost } from '../steam-api.js';

interface DiscoveryQueueResponse {
  queue?: number[];
}

export const generateDiscoveryQueue = defineTool({
  name: 'generate_discovery_queue',
  displayName: 'Generate Discovery Queue',
  description:
    "Generate a new personalized discovery queue of game recommendations. Returns a list of app IDs tailored to the user's preferences and library. Use get_app_details to look up each app.",
  summary: 'Get personalized game recommendations',
  icon: 'compass',
  group: 'Discovery',
  input: z.object({
    queue_type: z
      .number()
      .int()
      .min(0)
      .max(2)
      .optional()
      .describe('Queue type: 0 = new releases (default), 1 = popular upcoming, 2 = deals'),
  }),
  output: z.object({
    queue: z.array(z.number()).describe('App IDs in the discovery queue'),
  }),
  handle: async params => {
    const data = await storePost<DiscoveryQueueResponse>('/explore/generatenewdiscoveryqueue', {
      queuetype: params.queue_type ?? 0,
    });
    return { queue: data.queue ?? [] };
  },
});
