import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { sendMessage as apiSendMessage } from '../gemini-api.js';
import { messageSchema, mapMessage } from './schemas.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description:
    'Send a message to Google Gemini and receive a response. Creates a new conversation if no conversation context is provided. To continue an existing conversation, pass conversation_id, response_id, and response_choice_id from a previous response. Optionally specify a model_id to use a specific model (from list_models). The response includes the full text and conversation context for follow-up messages.',
  summary: 'Send a message to Gemini and get a response',
  icon: 'send',
  group: 'Chat',
  input: z.object({
    text: z.string().describe('Message text to send to Gemini'),
    conversation_id: z
      .string()
      .optional()
      .describe('Conversation ID to continue (e.g., "c_ab3da395ea4fb30b"). Omit to start a new conversation.'),
    response_id: z
      .string()
      .optional()
      .describe(
        'Response ID from the previous turn (e.g., "r_7d6e8f6883d3d249"). Required when continuing a conversation.',
      ),
    response_choice_id: z
      .string()
      .optional()
      .describe(
        'Response choice ID from the previous turn (e.g., "rc_ec1efdaca48d5324"). Required when continuing a conversation.',
      ),
    model_id: z.string().optional().describe('Model ID to use (from list_models). Defaults to the active model.'),
  }),
  output: z.object({
    message: messageSchema.describe('Gemini response with conversation context'),
  }),
  handle: async params => {
    const result = await apiSendMessage(
      params.text,
      params.conversation_id,
      params.response_id,
      params.response_choice_id,
      params.model_id,
    );
    const mapped = mapMessage(result);
    if (mapped.conversation_id) {
      const urlId = mapped.conversation_id.replace(/^c_/, '');
      setTimeout(() => {
        window.location.href = `https://gemini.google.com/app/${urlId}`;
      }, 200);
    }
    return { message: mapped };
  },
});
