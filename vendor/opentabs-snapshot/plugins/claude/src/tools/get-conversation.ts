// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../claude-api.js';

export const getConversation = defineTool({
  name: 'get_conversation',
  displayName: 'Get Conversation',
  description: 'Get the full message history of a single Claude conversation by its ID.',
  summary: 'open a claude conversation',
  icon: 'message-square',
  group: 'Conversations',
  input: z.object({
    conversation_id: z.string().min(1).describe('Conversation ID to retrieve'),
  }),
  output: z.object({
    conversation: z.object({
      id: z.string(),
      name: z.string(),
      messages: z.array(z.object({ role: z.string(), content: z.string() })),
    }).describe('The conversation and its messages'),
  }),
  handle: async (params: { conversation_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /chat_conversations/:id (default method).
    const data = await api<{ conversation: { id: string; name: string; messages: { role: string; content: string }[] } }>(
      `/chat_conversations/${encodeURIComponent(params.conversation_id)}`
    );
    return { conversation: data.conversation };
  },
});
