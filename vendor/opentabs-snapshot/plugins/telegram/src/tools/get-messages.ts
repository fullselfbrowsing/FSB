import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type MessagesResult, getInputPeer, invokeApi } from '../telegram-api.js';
import { type RawMessage, mapMessage, messageSchema } from './schemas.js';

export const getMessages = defineTool({
  name: 'get_messages',
  displayName: 'Get Messages',
  description:
    'Get message history for a conversation. Returns messages in reverse chronological order. Use offset_id to paginate (pass the oldest message ID from the previous page). Pass peer_id=0 or omit it to read Saved Messages.',
  summary: 'Get messages from a chat',
  icon: 'messages-square',
  group: 'Messages',
  input: z.object({
    peer_id: z
      .number()
      .describe('Peer ID of the conversation (user ID, chat ID, or channel ID). Use 0 for Saved Messages.'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of messages to return (default 20, max 100)'),
    offset_id: z
      .number()
      .int()
      .optional()
      .describe('Message ID to start from for pagination (returns messages before this ID)'),
  }),
  output: z.object({
    messages: z.array(messageSchema).describe('List of messages'),
    count: z.number().describe('Total number of messages in this chat'),
  }),
  handle: async params => {
    const limit = params.limit ?? 20;
    const offsetId = params.offset_id ?? 0;

    const peer = params.peer_id === 0 ? { _: 'inputPeerSelf' } : await getInputPeer(params.peer_id);

    const result = await invokeApi<MessagesResult>('messages.getHistory', {
      peer,
      offset_id: offsetId,
      offset_date: 0,
      add_offset: 0,
      limit,
      max_id: 0,
      min_id: 0,
      hash: 0,
    });

    const messages = ((result.messages ?? []) as RawMessage[]).map(mapMessage);

    return {
      messages,
      count: result.count ?? messages.length,
    };
  },
});
