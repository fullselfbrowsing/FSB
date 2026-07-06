import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { blockContact as blockContactAction } from '../whatsapp-api.js';

export const blockContact = defineTool({
  name: 'block_contact',
  displayName: 'Block Contact',
  description: 'Block a WhatsApp contact. Blocked contacts cannot send you messages or see your profile information.',
  summary: 'Block a contact',
  icon: 'ban',
  group: 'Contacts',
  input: z.object({
    contact_id: z.string().min(1).describe('Contact ID to block'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await blockContactAction(params.contact_id);
    return { success: true };
  },
});
