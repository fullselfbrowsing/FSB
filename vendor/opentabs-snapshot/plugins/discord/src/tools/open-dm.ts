import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { discordApi } from '../discord-api.js';
import { mapUser, userSchema } from './schemas.js';

export const openDm = defineTool({
  name: 'open_dm',
  displayName: 'Open DM',
  description: 'Open or get an existing direct message channel with a user. For group DMs, pass multiple user IDs.',
  summary: 'Open a direct message conversation',
  icon: 'message-circle',
  group: 'DMs',
  input: z.object({
    recipient_ids: z
      .array(z.string())
      .min(1)
      .describe('Array of user IDs to open a DM with (1 for DM, 2+ for group DM)'),
  }),
  output: z.object({
    channel_id: z.string().describe('The DM channel ID'),
    type: z.number().describe('Channel type (1=DM, 3=group DM)'),
    recipients: z.array(userSchema).describe('Users in the DM'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      recipients: params.recipient_ids,
    };

    const data = await discordApi<{
      id?: string;
      type?: number;
      recipients?: Record<string, unknown>[];
    }>('/users/@me/channels', { method: 'POST', body });

    return {
      channel_id: data.id ?? '',
      type: data.type ?? 1,
      recipients: (data.recipients ?? []).map(r => mapUser(r)),
    };
  },
});
