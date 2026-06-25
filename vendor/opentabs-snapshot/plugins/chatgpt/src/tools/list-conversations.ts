// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';

export const listConversations = defineTool({
  name: 'list_conversations',
  displayName: 'List Conversations',
  description: 'List your recent ChatGPT conversations. Optionally page through with an offset and limit.',
  summary: 'show me my chatgpt conversations',
  icon: 'list',
  group: 'Conversations',
  input: z.object({
    offset: z.number().int().min(0).optional().describe('Number of conversations to skip'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of conversations to return'),
  }),
  output: z.object({
    conversations: z.array(z.object({
      id: z.string(),
      title: z.string(),
    })).describe('Recent conversations'),
  }),
  handle: async (params: { offset?: number; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /conversations (default method).
    const data = await api<{ conversations: { id: string; title: string }[] }>('/conversations', {
      query: { offset: params.offset, limit: params.limit },
    });
    return { conversations: data.conversations };
  },
});
