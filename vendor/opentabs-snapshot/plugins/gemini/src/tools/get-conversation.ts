import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentConversationId, getConversationMessages, navigateToConversation } from '../gemini-api.js';
import { turnSchema } from './schemas.js';

export const getConversation = defineTool({
  name: 'get_conversation',
  displayName: 'Get Conversation',
  description:
    'Get the messages of the currently active Gemini conversation. Returns the conversation ID and all visible message turns (prompt/response pairs). If a conversation_id is provided and it does not match the current URL, the browser navigates to that conversation first. Note: only messages visible on screen are returned — very long conversations may be truncated.',
  summary: 'Get messages from the current conversation',
  icon: 'message-square',
  group: 'Conversations',
  input: z.object({
    conversation_id: z
      .string()
      .optional()
      .describe('Conversation ID to load. If omitted, reads the current conversation.'),
  }),
  output: z.object({
    conversation_id: z.string().describe('Active conversation ID'),
    turns: z.array(turnSchema).describe('Message turns (prompt/response pairs)'),
  }),
  handle: async params => {
    const currentId = getCurrentConversationId();

    if (params.conversation_id && params.conversation_id !== currentId) {
      navigateToConversation(params.conversation_id);
      throw ToolError.internal(
        `Navigating to conversation ${params.conversation_id}. Please call get_conversation again after the page loads.`,
      );
    }

    if (!currentId) {
      throw ToolError.validation(
        'No conversation is currently active. Navigate to a conversation first or provide a conversation_id.',
      );
    }

    const messages = getConversationMessages();
    return {
      conversation_id: currentId,
      turns: messages.map(m => ({
        prompt: m.prompt,
        response: m.response,
      })),
    };
  },
});
