import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type ContactsResult, invokeApi } from '../telegram-api.js';
import { type RawContact, type RawUser, contactSchema, mapContact, mapUser, userSchema } from './schemas.js';

export const listContacts = defineTool({
  name: 'list_contacts',
  displayName: 'List Contacts',
  description: 'List all contacts in the Telegram address book. Returns contact details with user profiles.',
  summary: 'List your Telegram contacts',
  icon: 'contact',
  group: 'Contacts',
  input: z.object({}),
  output: z.object({
    contacts: z.array(contactSchema).describe('Contact entries'),
    users: z.array(userSchema).describe('User profiles for each contact'),
  }),
  handle: async () => {
    const result = await invokeApi<ContactsResult>('contacts.getContacts', {
      hash: 0,
    });

    const contacts = ((result.contacts ?? []) as RawContact[]).map(mapContact);
    const users = ((result.users ?? []) as RawUser[]).map(mapUser);

    return { contacts, users };
  },
});
