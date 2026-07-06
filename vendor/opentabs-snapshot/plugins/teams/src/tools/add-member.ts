import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { threadApi } from '../teams-api.js';

export const addMember = defineTool({
  name: 'invite_to_channel',
  displayName: 'Invite to Channel',
  description: 'Add a user to a Teams group chat by their MRI identifier (e.g., "8:live:username").',
  summary: 'Add a user to a group chat',
  icon: 'user-plus',
  group: 'Members',
  input: z.object({
    conversation_id: z.string().min(1).describe('Conversation/thread ID'),
    user: z.string().min(1).describe('User MRI to add (e.g., "8:live:username")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the member was added'),
  }),
  handle: async params => {
    await threadApi<Record<string, unknown>>(params.conversation_id, `/members/${encodeURIComponent(params.user)}`, {
      method: 'PUT',
      body: { role: 'User' },
    });
    return { success: true };
  },
});
