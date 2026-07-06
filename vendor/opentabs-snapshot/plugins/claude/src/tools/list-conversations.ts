import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orgApi } from '../claude-api.js';
import { type RawConversation, conversationSchema, mapConversation } from './schemas.js';

export const listConversations = defineTool({
  name: 'list_conversations',
  displayName: 'List Conversations',
  description:
    'List all chat conversations in the current Claude organization. Returns conversation metadata including name, model, timestamps, and starred status.',
  summary: 'List all conversations',
  icon: 'list',
  group: 'Conversations',
  input: z.object({}),
  output: z.object({
    conversations: z.array(conversationSchema).describe('List of conversations'),
  }),
  handle: async () => {
    const data = await orgApi<RawConversation[]>('/chat_conversations');
    return { conversations: data.map(mapConversation) };
  },
});
