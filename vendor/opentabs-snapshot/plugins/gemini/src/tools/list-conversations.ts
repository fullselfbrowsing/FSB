import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConversationsFromDOM } from '../gemini-api.js';
import { conversationSchema, mapConversation } from './schemas.js';

export const listConversations = defineTool({
  name: 'list_conversations',
  displayName: 'List Conversations',
  description:
    'List recent chat conversations visible in the Gemini sidebar. Returns conversation IDs, titles, and URLs. The sidebar must be open for conversations to be visible. Use the conversation ID with send_message to continue a conversation.',
  summary: 'List recent Gemini conversations',
  icon: 'list',
  group: 'Conversations',
  input: z.object({}),
  output: z.object({
    conversations: z.array(conversationSchema).describe('Conversations from the sidebar'),
  }),
  handle: async () => {
    const conversations = getConversationsFromDOM();
    return { conversations: conversations.map(mapConversation) };
  },
});
