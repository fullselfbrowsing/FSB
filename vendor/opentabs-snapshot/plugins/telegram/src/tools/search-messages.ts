import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type MessagesResult, getInputPeer, invokeApi } from '../telegram-api.js';
import { type RawMessage, mapMessage, messageSchema } from './schemas.js';

export const searchMessages = defineTool({
  name: 'search_messages',
  displayName: 'Search Messages',
  description:
    'Search for messages by text query. Search within a specific conversation by providing peer_id, or search globally across all chats by setting peer_id to 0.',
  summary: 'Search messages by keyword',
  icon: 'search',
  group: 'Messages',
  input: z.object({
    query: z.string().min(1).describe('Search query text'),
    peer_id: z.number().optional().describe('Peer ID to search within (0 or omit for global search)'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of results (default 20, max 100)'),
    offset_id: z.number().int().optional().describe('Message ID to start from for pagination'),
  }),
  output: z.object({
    messages: z.array(messageSchema).describe('Matching messages'),
    count: z.number().describe('Total number of matching messages'),
  }),
  handle: async params => {
    const limit = params.limit ?? 20;
    const peerId = params.peer_id ?? 0;

    const peer = peerId === 0 ? { _: 'inputPeerEmpty' } : await getInputPeer(peerId);

    const result = await invokeApi<MessagesResult>('messages.search', {
      peer,
      q: params.query,
      filter: { _: 'inputMessagesFilterEmpty' },
      min_date: 0,
      max_date: 0,
      offset_id: params.offset_id ?? 0,
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
