import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { discordApi } from '../discord-api.js';
import { mapUser, userSchema } from './schemas.js';

export const listDms = defineTool({
  name: 'list_dms',
  displayName: 'List DMs',
  description: 'List all open direct message channels for the authenticated user',
  summary: 'List open direct message channels',
  icon: 'mail',
  group: 'DMs',
  input: z.object({}),
  output: z.object({
    channels: z
      .array(
        z.object({
          id: z.string().describe('DM channel ID'),
          type: z.number().describe('Channel type (1=DM, 3=group DM)'),
          recipients: z.array(userSchema).describe('Users in the DM'),
          last_message_id: z.string().nullable().describe('ID of the last message'),
        }),
      )
      .describe('List of DM channels'),
  }),
  handle: async () => {
    const data = await discordApi<Record<string, unknown>>('/users/@me/channels');

    interface RawDm {
      id?: string;
      type?: number;
      recipients?: Record<string, unknown>[];
      last_message_id?: string | null;
    }

    const channels = Array.isArray(data)
      ? (data as RawDm[]).map(c => ({
          id: c.id ?? '',
          type: c.type ?? 1,
          recipients: (c.recipients ?? []).map(r => mapUser(r)),
          last_message_id: c.last_message_id ?? null,
        }))
      : [];
    return { channels };
  },
});
