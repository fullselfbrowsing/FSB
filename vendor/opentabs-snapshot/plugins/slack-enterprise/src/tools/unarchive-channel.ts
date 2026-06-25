import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const unarchiveChannel = defineTool({
  name: 'unarchive_channel',
  displayName: 'Unarchive Channel',
  description:
    'Unarchive a Slack channel, restoring it to the active channel list. All previous messages and members are preserved.',
  summary: 'Unarchive a channel',
  icon: 'archive-restore',
  group: 'Conversations',
  input: z.object({
    channel: z.string().describe('Channel ID to unarchive (e.g., C1234567890)'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('conversations.unarchive', { channel: params.channel });
    return { success: true };
  },
});
