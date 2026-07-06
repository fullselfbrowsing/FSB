import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';

export const archiveChannel = defineTool({
  name: 'archive_channel',
  displayName: 'Archive Channel',
  description:
    'Archive a Slack channel. Archived channels are hidden from the channel list but messages are preserved. Members can still search archived channel history.',
  summary: 'Archive a channel',
  icon: 'archive',
  group: 'Conversations',
  input: z.object({
    channel: z.string().describe('Channel ID to archive (e.g., C1234567890)'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async params => {
    await slackApi('conversations.archive', { channel: params.channel });
    return { success: true };
  },
});
