import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storePost } from '../steam-api.js';

interface IgnoreResponse {
  success: boolean;
}

export const ignoreApp = defineTool({
  name: 'ignore_app',
  displayName: 'Ignore App',
  description:
    'Mark an app as ignored so it no longer appears in recommendations and discovery queues. The app can be unignored later with unignore_app.',
  summary: 'Hide an app from recommendations',
  icon: 'eye-off',
  group: 'Library',
  input: z.object({
    appid: z.number().int().describe('Steam app ID to ignore'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const data = await storePost<IgnoreResponse>('/recommended/ignorerecommendation/', {
      appid: params.appid,
      snr: '1_5_9__205',
    });
    return { success: data.success ?? false };
  },
});
