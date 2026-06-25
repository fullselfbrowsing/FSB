import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { threadApi } from '../teams-api.js';

const memberSchema = z.object({
  id: z.string().describe('Member MRI (e.g., "8:live:username")'),
  role: z.string().describe('Member role (e.g., "Admin", "User")'),
});

export const getConversationDetails = defineTool({
  name: 'get_conversation_details',
  displayName: 'Get Conversation Details',
  description:
    'Get detailed information about a chat conversation including its members, topic, creator, and creation time.',
  summary: 'Get chat details and members',
  icon: 'info',
  group: 'Chats',
  input: z.object({
    conversation_id: z.string().min(1).describe('Conversation/thread ID'),
  }),
  output: z.object({
    id: z.string().describe('Conversation/thread ID'),
    topic: z.string().describe('Chat topic/title'),
    creator: z.string().describe('Creator MRI'),
    created_at: z.string().describe('Creation timestamp'),
    thread_type: z.string().describe('Thread type (e.g., "chat")'),
    members: z.array(memberSchema).describe('Chat members'),
  }),
  handle: async params => {
    const data = await threadApi<{
      id?: string;
      properties?: Record<string, unknown>;
      members?: Array<{ id?: string; role?: string }>;
    }>(params.conversation_id, '?view=msnp24Equivalent');

    return {
      id: data.id ?? params.conversation_id,
      topic: String(data.properties?.topic ?? ''),
      creator: String(data.properties?.creator ?? ''),
      created_at: String(data.properties?.createdat ?? ''),
      thread_type: String(data.properties?.threadType ?? ''),
      members: (data.members ?? []).map(m => ({
        id: m.id ?? '',
        role: m.role ?? '',
      })),
    };
  },
});
