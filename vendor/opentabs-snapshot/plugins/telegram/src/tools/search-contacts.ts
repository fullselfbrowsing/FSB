import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type ContactsFound, invokeApi } from '../telegram-api.js';
import { type RawChat, type RawUser, chatSchema, mapChat, mapUser, userSchema } from './schemas.js';

export const searchContacts = defineTool({
  name: 'search_contacts',
  displayName: 'Search Contacts',
  description:
    'Search for Telegram users and chats by name, username, or phone number. Returns matching users and public chats/channels.',
  summary: 'Search for users and chats',
  icon: 'search',
  group: 'Contacts',
  input: z.object({
    query: z.string().min(1).describe('Search query (name, username, or phone number)'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of results (default 20)'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('Matching user profiles'),
    chats: z.array(chatSchema).describe('Matching public chats and channels'),
  }),
  handle: async params => {
    const result = await invokeApi<ContactsFound>('contacts.search', {
      q: params.query,
      limit: params.limit ?? 20,
    });

    const users = ((result.users ?? []) as RawUser[]).map(mapUser);
    const chats = ((result.chats ?? []) as RawChat[]).map(c => mapChat(c));

    return { users, chats };
  },
});
