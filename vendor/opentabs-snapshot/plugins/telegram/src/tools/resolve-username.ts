import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type ResolvedPeer, invokeApi } from '../telegram-api.js';
import { type RawChat, type RawUser, chatSchema, mapChat, mapUser, userSchema } from './schemas.js';

export const resolveUsername = defineTool({
  name: 'resolve_username',
  displayName: 'Resolve Username',
  description:
    'Resolve a Telegram @username to a user or chat/channel. Returns the peer type and ID along with full profile data. The username should be provided without the @ prefix.',
  summary: 'Look up a user or channel by @username',
  icon: 'at-sign',
  group: 'Users',
  input: z.object({
    username: z.string().min(1).describe('Username to resolve (without the @ prefix)'),
  }),
  output: z.object({
    peer_type: z.string().describe('Resolved peer type: "user", "chat", or "channel"'),
    peer_id: z.number().describe('Resolved peer numeric ID'),
    users: z.array(userSchema).describe('User profiles (if resolved to a user)'),
    chats: z.array(chatSchema).describe('Chat/channel profiles (if resolved to a chat/channel)'),
  }),
  handle: async params => {
    const result = await invokeApi<ResolvedPeer>('contacts.resolveUsername', {
      username: params.username,
    });

    const peerType = result.peer?._?.replace('peer', '').toLowerCase() ?? 'user';
    const peerId =
      (result.peer as Record<string, number>).user_id ??
      (result.peer as Record<string, number>).channel_id ??
      (result.peer as Record<string, number>).chat_id ??
      0;

    const users = ((result.users ?? []) as RawUser[]).map(mapUser);
    const chats = ((result.chats ?? []) as RawChat[]).map(c => mapChat(c));

    return { peer_type: peerType, peer_id: peerId, users, chats };
  },
});
