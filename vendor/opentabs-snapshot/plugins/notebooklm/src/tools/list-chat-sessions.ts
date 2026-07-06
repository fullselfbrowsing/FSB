import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';
import { chatSessionSchema, mapChatSession } from './schemas.js';

export const listChatSessions = defineTool({
  name: 'list_chat_sessions',
  displayName: 'List Chat Sessions',
  description:
    'List chat sessions in a notebook. Each notebook has one or more chat sessions that contain conversation history.',
  summary: 'List chat sessions',
  icon: 'messages-square',
  group: 'Chat',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
    limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
  }),
  output: z.object({
    sessions: z.array(chatSessionSchema).describe('List of chat sessions'),
  }),
  handle: async params => {
    const data = await rpc<unknown[]>(
      'hPTbtc',
      [[], null, params.notebook_id, params.limit ?? 20],
      `/notebook/${params.notebook_id}`,
    );
    const sessionsList = (data?.[0] as unknown[][] | undefined) ?? [];
    return {
      sessions: sessionsList.map(s => mapChatSession(s)),
    };
  },
});
