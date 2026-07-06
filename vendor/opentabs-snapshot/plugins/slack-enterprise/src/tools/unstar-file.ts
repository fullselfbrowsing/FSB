import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const unstarFile = defineTool({
  name: 'unstar_file',
  displayName: 'Unstar File',
  description: 'Remove a star from a Slack file.',
  summary: 'Unstar a file',
  icon: 'star-off',
  group: 'Stars',
  input: z.object({
    file: z.string().describe('File ID to unstar (e.g., F1234567890)'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('stars.remove', { file: params.file });
    return { success: true };
  },
});
