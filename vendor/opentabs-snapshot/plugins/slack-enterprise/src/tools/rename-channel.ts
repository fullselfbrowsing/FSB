import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { slackApi } from '../slack-enterprise-api.js';
import { channelSchema, mapChannel } from './schemas.js';

export const renameChannel = defineTool({
  name: 'rename_channel',
  displayName: 'Rename Channel',
  description: 'Rename a Slack channel. Names must be lowercase, max 80 chars, using hyphens instead of spaces.',
  summary: 'Rename a channel',
  icon: 'edit-3',
  group: 'Conversations',
  input: z.object({
    channel: z.string().describe('Channel ID to rename (e.g., C1234567890)'),
    name: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Channel name must be lowercase alphanumeric with hyphens/underscores')
      .max(80)
      .describe('New name for the channel (lowercase, no spaces, max 80 chars)'),
  }),
  output: z.object({ channel: channelSchema }),
  handle: async params => {
    const data = await slackApi<{ channel: Record<string, unknown> }>('conversations.rename', {
      channel: params.channel,
      name: params.name,
    });
    return { channel: mapChannel(data.channel) };
  },
});
