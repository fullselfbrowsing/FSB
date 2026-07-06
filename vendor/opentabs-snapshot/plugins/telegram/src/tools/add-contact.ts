import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputUser, invokeApi } from '../telegram-api.js';

export const addContact = defineTool({
  name: 'add_contact',
  displayName: 'Add Contact',
  description:
    'Add a user to your Telegram contacts by their user ID. You must provide a first name; last name and phone are optional.',
  summary: 'Add a user to contacts',
  icon: 'user-plus',
  group: 'Contacts',
  input: z.object({
    user_id: z.number().describe('User ID to add as a contact'),
    first_name: z.string().min(1).describe('First name for the contact'),
    last_name: z.string().optional().describe('Last name for the contact'),
    phone: z.string().optional().describe('Phone number for the contact'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the contact was added'),
  }),
  handle: async params => {
    const inputUser = await getInputUser(params.user_id);

    await invokeApi<TLObject>('contacts.addContact', {
      id: inputUser,
      first_name: params.first_name,
      last_name: params.last_name ?? '',
      phone: params.phone ?? '',
    });

    return { success: true };
  },
});
