import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { threadApi } from '../teams-api.js';

export const setChannelTopic = defineTool({
  name: 'set_channel_topic',
  displayName: 'Set Channel Topic',
  description: 'Set or update the topic (title) of a Teams chat conversation.',
  summary: 'Set a chat topic',
  icon: 'hash',
  group: 'Chats',
  input: z.object({
    conversation_id: z.string().min(1).describe('Conversation/thread ID'),
    topic: z.string().min(1).describe('New topic text for the chat'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the topic was updated'),
  }),
  handle: async params => {
    await threadApi<Record<string, unknown>>(params.conversation_id, '/properties?name=topic', {
      method: 'PUT',
      body: { topic: params.topic },
    });
    return { success: true };
  },
});
