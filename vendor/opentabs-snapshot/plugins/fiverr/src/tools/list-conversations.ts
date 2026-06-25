import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchInboxJson } from '../fiverr-api.js';
import { conversationSummarySchema, mapConversationSummary, type RawContact } from './schemas.js';

export const listConversations = defineTool({
  name: 'list_conversations',
  displayName: 'List Conversations',
  description:
    'List the logged-in user’s Fiverr inbox conversations, most recent first. Each entry includes the ' +
    'other participant’s username, unread count, a preview of the latest message, and the timestamp. ' +
    'Pass a username from a result to `get_conversation` to read the full thread.',
  summary: 'List Fiverr inbox conversations',
  icon: 'messages-square',
  group: 'Messages',
  input: z.object({}),
  output: z.object({
    conversations: z.array(conversationSummarySchema).describe('Inbox conversations, most recent first'),
  }),
  handle: async () => {
    const contacts = await fetchInboxJson<RawContact[]>('/inbox/contacts');
    const contactList = Array.isArray(contacts) ? contacts : [];
    return { conversations: contactList.map(mapConversationSummary) };
  },
});
