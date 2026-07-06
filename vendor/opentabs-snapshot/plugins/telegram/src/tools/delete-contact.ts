import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputUser, invokeApi } from '../telegram-api.js';

export const deleteContact = defineTool({
  name: 'delete_contact',
  displayName: 'Delete Contact',
  description: 'Remove a user from your Telegram contacts.',
  summary: 'Remove a contact',
  icon: 'user-minus',
  group: 'Contacts',
  input: z.object({
    user_id: z.number().describe('User ID of the contact to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the contact was removed'),
  }),
  handle: async params => {
    const inputUser = await getInputUser(params.user_id);

    await invokeApi<TLObject>('contacts.deleteContacts', {
      id: [inputUser],
    });

    return { success: true };
  },
});
