import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUsername, normalizeFiverrUsername, requireContext } from '../fiverr-api.js';

export const draftMessage = defineTool({
  name: 'draft_message',
  displayName: 'Draft Message',
  description:
    'Prepare a Fiverr message to a recipient without sending it. Validates the recipient and body and ' +
    'returns a structured preview (sender, recipient, body, character count). Use this to compose and ' +
    'confirm a message before calling `send_message`. Makes no network request and sends nothing.',
  summary: 'Compose a message preview without sending',
  icon: 'pencil',
  group: 'Messages',
  input: z.object({
    recipient_username: z.string().min(1).describe('Username of the person the message would be sent to'),
    body: z.string().min(1).describe('Message text to compose'),
  }),
  output: z.object({
    from: z.string().describe('Logged-in user’s username (the sender)'),
    recipient_username: z.string().describe('Recipient username'),
    body: z.string().describe('Composed message text'),
    char_count: z.number().describe('Number of characters in the body'),
    ready_to_send: z.boolean().describe('True when the draft is valid and ready to pass to send_message'),
  }),
  handle: async params => {
    requireContext();
    const recipient = normalizeFiverrUsername(params.recipient_username, 'recipient_username');
    const body = params.body.trim();
    return {
      from: getUsername(),
      recipient_username: recipient,
      body,
      char_count: body.length,
      ready_to_send: recipient.length > 0 && body.length > 0,
    };
  },
});
