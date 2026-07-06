import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const removeListMember = defineTool({
  name: 'remove_list_member',
  displayName: 'Remove List Member',
  description: 'Remove a user from a list.',
  summary: 'Remove a user from a list',
  icon: 'user-minus',
  group: 'Lists',
  input: z.object({
    list_id: z.string().min(1).describe('List ID'),
    user_id: z.string().min(1).describe('User ID to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the member was removed'),
  }),
  handle: async params => {
    await graphqlMutation('ListRemoveMember', {
      listId: params.list_id,
      userId: params.user_id,
    });
    return { success: true };
  },
});
