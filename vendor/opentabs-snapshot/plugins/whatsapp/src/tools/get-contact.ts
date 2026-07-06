import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findContactById, serializeContact } from '../whatsapp-api.js';
import { contactSchema } from './schemas.js';

export const getContact = defineTool({
  name: 'get_contact',
  displayName: 'Get Contact',
  description: 'Get details for a specific WhatsApp contact by their ID. Use list_contacts to find contact IDs.',
  summary: 'Get a single contact by ID',
  icon: 'contact',
  group: 'Contacts',
  input: z.object({
    contact_id: z.string().min(1).describe('Contact ID (e.g., "15551234567@c.us")'),
  }),
  output: z.object({ contact: contactSchema }),
  handle: async params => {
    const contact = findContactById(params.contact_id);
    if (!contact) throw ToolError.notFound(`Contact not found: ${params.contact_id}`);
    return { contact: serializeContact(contact) };
  },
});
