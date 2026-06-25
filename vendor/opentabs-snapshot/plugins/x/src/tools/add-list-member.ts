import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const addListMember = defineTool({
  name: 'add_list_member',
  displayName: 'Add List Member',
  description: 'Add a user to a list.',
  summary: 'Add a user to a list',
  icon: 'user-plus',
  group: 'Lists',
  input: z.object({
    list_id: z.string().min(1).describe('List ID'),
    user_id: z.string().min(1).describe('User ID to add'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the member was added'),
  }),
  handle: async params => {
    await graphqlMutation('ListAddMember', {
      listId: params.list_id,
      userId: params.user_id,
    });
    return { success: true };
  },
});
