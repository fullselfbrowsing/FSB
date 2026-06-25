import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { createThread } from '../teams-api.js';

export const createChat = defineTool({
  name: 'create_chat',
  displayName: 'Create Chat',
  description:
    'Create a new chat conversation with one or more users. Pass user MRIs (e.g., "8:live:username") as members. The current user is added automatically.',
  summary: 'Create a new chat conversation',
  icon: 'plus-circle',
  group: 'Chats',
  input: z.object({
    members: z
      .array(z.string().min(1))
      .min(1)
      .describe('User MRI identifiers to add to the chat (e.g., ["8:live:username"])'),
    topic: z.string().optional().describe('Optional chat topic/title'),
  }),
  output: z.object({
    conversation_id: z.string().describe('The created conversation/thread ID'),
  }),
  handle: async params => {
    const members = params.members.map(id => ({ id, role: 'User' }));
    const properties: Record<string, unknown> = {
      threadType: 'chat',
      chatFilesIndexId: `uniqueid_${Date.now()}`,
    };
    if (params.topic) {
      properties.topic = params.topic;
    }

    const threadId = await createThread(members, properties);
    return { conversation_id: threadId };
  },
});
