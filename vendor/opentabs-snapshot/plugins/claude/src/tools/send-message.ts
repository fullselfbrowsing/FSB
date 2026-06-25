import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiStream, getOrgId } from '../claude-api.js';

export const sendMessage = defineTool({
  name: 'send_message',
  displayName: 'Send Message',
  description:
    'Send a message in an existing Claude conversation and get the assistant response. Uses the streaming completion endpoint to generate a reply.',
  summary: 'Send a message and get a response',
  icon: 'send',
  group: 'Conversations',
  input: z.object({
    conversation_uuid: z.string().describe('UUID of the conversation to send the message in'),
    message: z.string().describe('Message text to send'),
    model: z.string().optional().describe('Model to use (default claude-sonnet-4-6)'),
  }),
  output: z.object({
    response: z.string().describe('The assistant response text'),
  }),
  handle: async params => {
    const orgId = getOrgId();
    const response = await apiStream(
      `/organizations/${orgId}/chat_conversations/${params.conversation_uuid}/completion`,
      {
        prompt: params.message,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        model: params.model ?? 'claude-sonnet-4-6',
        attachments: [],
        files: [],
        rendering_mode: 'text',
      },
    );

    return { response };
  },
});
