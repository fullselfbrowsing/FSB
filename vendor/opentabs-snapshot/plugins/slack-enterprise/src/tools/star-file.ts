import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const starFile = defineTool({
  name: 'star_file',
  displayName: 'Star File',
  description: 'Add a star to a Slack file for quick access later.',
  summary: 'Star a file',
  icon: 'star',
  group: 'Stars',
  input: z.object({
    file: z.string().describe('File ID to star (e.g., F1234567890)'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('stars.add', { file: params.file });
    return { success: true };
  },
});
