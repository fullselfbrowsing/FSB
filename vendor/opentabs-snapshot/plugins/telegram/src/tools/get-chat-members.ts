import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputChannel, invokeApi } from '../telegram-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getChatMembers = defineTool({
  name: 'get_chat_members',
  displayName: 'Get Chat Members',
  description:
    'Get the member list of a group chat or channel. For channels/supergroups, set is_channel=true and optionally filter by query text.',
  summary: 'List members of a group or channel',
  icon: 'users',
  group: 'Groups',
  input: z.object({
    peer_id: z.number().describe('Chat or channel numeric ID'),
    is_channel: z.boolean().optional().describe('Whether this is a channel/supergroup (default false — regular group)'),
    query: z.string().optional().describe('Filter members by name (channels/supergroups only)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of members to return (default 50, max 200)'),
    offset: z.number().int().optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    members: z.array(userSchema).describe('Member user profiles'),
    count: z.number().describe('Total number of members'),
  }),
  handle: async params => {
    const isChannel = params.is_channel ?? false;
    const limit = params.limit ?? 50;

    if (isChannel) {
      const inputChannel = await getInputChannel(params.peer_id);
      const result = await invokeApi<TLObject & { count?: number; participants: TLObject[]; users: TLObject[] }>(
        'channels.getParticipants',
        {
          channel: inputChannel,
          filter: params.query
            ? { _: 'channelParticipantsSearch', q: params.query }
            : { _: 'channelParticipantsRecent' },
          offset: params.offset ?? 0,
          limit,
          hash: 0,
        },
      );

      const members = ((result.users ?? []) as RawUser[]).map(mapUser);
      return { members, count: result.count ?? members.length };
    }

    // Regular group — get full chat to access participants
    const result = await invokeApi<TLObject>('messages.getFullChat', {
      chat_id: params.peer_id,
    });

    const data = result as {
      full_chat?: { participants?: { participants?: { user_id?: number }[] } };
      users?: TLObject[];
    };

    const users = ((data.users ?? []) as RawUser[]).map(mapUser);
    const participantCount = data.full_chat?.participants?.participants?.length ?? users.length;

    return { members: users, count: participantCount };
  },
});
