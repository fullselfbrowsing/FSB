import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { unblockContact as unblockContactAction } from '../whatsapp-api.js';

export const unblockContact = defineTool({
  name: 'unblock_contact',
  displayName: 'Unblock Contact',
  description: 'Unblock a previously blocked WhatsApp contact. The contact will be able to send you messages again.',
  summary: 'Unblock a contact',
  icon: 'shield-check',
  group: 'Contacts',
  input: z.object({
    contact_id: z.string().min(1).describe('Contact ID to unblock'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await unblockContactAction(params.contact_id);
    return { success: true };
  },
});
