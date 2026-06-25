import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../carta-api.js';

interface InboxCountResponse {
  value: number;
}

export const getInboxCount = defineTool({
  name: 'get_inbox_count',
  displayName: 'Get Inbox Count',
  description: 'Get the count of unread messages in the Carta communication center inbox.',
  summary: 'Get unread inbox count',
  icon: 'inbox',
  group: 'Communication',
  input: z.object({}),
  output: z.object({ unread_count: z.number() }),
  handle: async () => {
    const data = await api<InboxCountResponse>('/communication-center/v2/count/');
    return { unread_count: data.value };
  },
});
