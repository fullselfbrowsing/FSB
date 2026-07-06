import { redditOAuthPost } from '../reddit-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface MessageResponse {
  json: {
    errors: Array<[string, string, string]>;
    data?: Record<string, unknown>;
  };
}

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description: 'Send a private message to another Reddit user',
  summary: 'Send a private message',
  icon: 'send',
  group: 'Messages',
  input: z.object({
    to: z.string().min(1).describe('Recipient username (without u/ prefix)'),
    subject: z.string().min(1).describe('Message subject'),
    text: z.string().min(1).describe('Message body (supports Reddit markdown)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was sent'),
  }),
  handle: async params => {
    const data = await redditOAuthPost<MessageResponse>('/api/compose', {
      to: params.to,
      subject: params.subject,
      text: params.text,
    });

    if (data.json.errors.length > 0) {
      const errorMsg = data.json.errors.map(e => e[1]).join('; ');
      throw ToolError.validation(`Reddit API error: ${errorMsg}`);
    }

    return { success: true };
  },
});
