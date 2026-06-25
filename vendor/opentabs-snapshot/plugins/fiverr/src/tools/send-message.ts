import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { normalizeFiverrUsername, sendInboxMessage } from '../fiverr-api.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description:
    'Send a message to another Fiverr user’s inbox. Provide the recipient username and the message ' +
    'text. This is a write action — it delivers a real message immediately. Compose with `draft_message` ' +
    'first to review the content before sending. Note: if a Fiverr AI assistant currently manages the ' +
    'conversation, the first manual message takes over the thread from the assistant.',
  summary: 'Send a message to a Fiverr user',
  icon: 'send',
  group: 'Messages',
  input: z.object({
    recipient_username: z.string().min(1).describe('Username of the recipient'),
    body: z.string().min(1).describe('Message text to send'),
  }),
  output: z.object({
    success: z.boolean().describe('True when Fiverr returned an ID for the created message'),
    message_id: z.string().describe('ID of the created message, empty if the API did not return one'),
  }),
  handle: async params => {
    const recipient = normalizeFiverrUsername(params.recipient_username, 'recipient_username');
    const body = params.body.trim();
    if (!body) throw ToolError.validation('body is required.');

    const result = await sendInboxMessage(recipient, body);
    return { success: result.messageId.length > 0, message_id: result.messageId };
  },
});
