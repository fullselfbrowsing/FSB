import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';

export const deleteMessage = defineTool({
  name: 'delete_message',
  displayName: 'Delete Message',
  description: 'Delete a message by its SID. This action is permanent and cannot be undone.',
  summary: 'Delete Message',
  icon: 'trash-2',
  group: 'Messages',
  input: z.object({
    sid: z.string().describe('Message SID to delete (e.g., SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the message was successfully deleted'),
  }),
  handle: async params => {
    await api<Record<string, never>>(`/Messages/${params.sid}.json`, { method: 'DELETE' });
    return { success: true };
  },
});
