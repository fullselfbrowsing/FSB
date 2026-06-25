import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getContactCollection, serializeContact } from '../whatsapp-api.js';
import { contactSchema } from './schemas.js';

export const listContacts = defineTool({
  name: 'list_contacts',
  displayName: 'List Contacts',
  description: 'List all WhatsApp contacts. Returns saved contacts with their name, push name, and business status.',
  summary: 'List all contacts',
  icon: 'contact',
  group: 'Contacts',
  input: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of contacts to return (default 100, max 500)'),
  }),
  output: z.object({
    contacts: z.array(contactSchema),
    total: z.number().int().describe('Total number of contacts'),
  }),
  handle: async params => {
    const col = getContactCollection();
    const models = col?.getModelsArray() ?? [];
    const limit = params.limit ?? 100;
    const contacts = models.slice(0, limit).map(serializeContact);
    return { contacts, total: models.length };
  },
});
