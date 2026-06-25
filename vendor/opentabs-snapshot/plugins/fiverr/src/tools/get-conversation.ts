import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchInboxJson, normalizeFiverrUsername } from '../fiverr-api.js';
import { conversationSchema, mapConversation, type RawConversation } from './schemas.js';

export const getConversation = defineTool({
  name: 'get_conversation',
  displayName: 'Get Conversation',
  description:
    'Read the full message thread of a Fiverr conversation with a specific user. Returns messages ' +
    '(oldest first) with sender, recipient, text, timestamp, and attachment count, plus the unread ' +
    'count and whether the oldest page has been reached. Pass the other participant’s username, as ' +
    'returned by `list_conversations`.',
  summary: 'Read a conversation thread',
  icon: 'message-square-text',
  group: 'Messages',
  input: z.object({
    username: z.string().min(1).describe('The other participant’s username (from `list_conversations`)'),
  }),
  output: z.object({ conversation: conversationSchema }),
  handle: async params => {
    const username = normalizeFiverrUsername(params.username);
    const raw = await fetchInboxJson<RawConversation>(`/inbox/contacts/${encodeURIComponent(username)}`);
    if (!raw?.conversationId) {
      throw ToolError.notFound(`No conversation found with "${username}".`);
    }
    return { conversation: mapConversation(raw) };
  },
});
