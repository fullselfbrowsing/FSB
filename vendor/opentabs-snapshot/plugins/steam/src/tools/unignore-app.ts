import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storePost } from '../steam-api.js';

interface IgnoreResponse {
  success: boolean;
}

export const unignoreApp = defineTool({
  name: 'unignore_app',
  displayName: 'Unignore App',
  description: 'Remove an app from the ignored list so it appears in recommendations and discovery queues again.',
  summary: 'Show an app in recommendations again',
  icon: 'eye',
  group: 'Library',
  input: z.object({
    appid: z.number().int().describe('Steam app ID to unignore'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const data = await storePost<IgnoreResponse>('/recommended/ignorerecommendation/', {
      appid: params.appid,
      remove: 1,
      snr: '1_5_9__205',
    });
    return { success: data.success ?? false };
  },
});
