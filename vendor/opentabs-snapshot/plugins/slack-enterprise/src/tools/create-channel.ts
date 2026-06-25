import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getWorkspaceTeamId, slackApi } from '../slack-enterprise-api.js';
import { channelSchema, mapChannel } from './schemas.js';

export const createChannel = defineTool({
  name: 'create_channel',
  displayName: 'Create Channel',
  description:
    'Create a new public or private Slack channel. Channel names must be lowercase, max 80 characters, using hyphens instead of spaces. On Enterprise Grid, the channel is created in the current workspace.',
  summary: 'Create a new channel',
  icon: 'plus-circle',
  group: 'Conversations',
  input: z.object({
    name: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Channel name must be lowercase alphanumeric with hyphens/underscores')
      .max(80)
      .describe('Channel name (lowercase, no spaces, max 80 chars, use hyphens)'),
    is_private: z.boolean().optional().default(false).describe('Create a private channel (default false)'),
    topic: z.string().max(250).optional().describe('Initial topic for the channel (max 250 chars)'),
  }),
  output: z.object({ channel: channelSchema }),
  handle: async params => {
    const teamId = await getWorkspaceTeamId();
    const apiParams: Record<string, unknown> = {
      name: params.name,
      is_private: params.is_private ?? false,
      team_id: teamId,
    };

    const data = await slackApi<{ channel: Record<string, unknown> }>('conversations.create', apiParams);

    // Set topic if provided
    if (params.topic && data.channel?.id) {
      await slackApi('conversations.setTopic', {
        channel: data.channel.id as string,
        topic: params.topic,
      });
    }

    return { channel: mapChannel(data.channel) };
  },
});
