import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { chatSchema, mapChat } from './schemas.js';
import type { RawChat } from './schemas.js';

export const newSession = defineTool({
  name: 'new_session',
  displayName: 'New Session',
  description: 'Create a new chat session. Returns the newly created chat.',
  summary: 'Create a new chat session',
  icon: 'plus',
  group: 'Chats',
  input: z.object({
    chat_type: z.number().int().optional().describe('Chat type (2=agent task)'),
  }),
  output: z.object({
    chat: chatSchema.describe('Newly created chat'),
  }),
  handle: async params => {
    const data = await apiPost<{ chat?: RawChat }>('/matrix/api/v1/chat/new_session', {
      ...(params.chat_type != null && { chat_type: params.chat_type }),
    });
    return {
      chat: mapChat(data.chat ?? {}),
    };
  },
});
