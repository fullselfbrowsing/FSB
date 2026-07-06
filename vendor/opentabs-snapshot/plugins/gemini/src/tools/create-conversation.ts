import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { sendMessage as apiSendMessage } from '../gemini-api.js';
import { messageSchema, mapMessage } from './schemas.js';

export const createConversation = defineTool({
  name: 'create_conversation',
  displayName: 'Create Conversation',
  description:
    'Create a new Gemini conversation by sending an initial message. Returns the new conversation ID, response ID, and the AI response text. Use the returned conversation_id, response_id, and response_choice_id with send_message to continue the conversation.',
  summary: 'Start a new Gemini conversation',
  icon: 'plus',
  group: 'Conversations',
  input: z.object({
    text: z.string().describe('Initial message text to start the conversation'),
    model_id: z.string().optional().describe('Model ID to use (from list_models). Defaults to the active model.'),
  }),
  output: z.object({
    message: messageSchema.describe('Gemini response with new conversation context'),
  }),
  handle: async params => {
    const result = await apiSendMessage(params.text, undefined, undefined, undefined, params.model_id);
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
