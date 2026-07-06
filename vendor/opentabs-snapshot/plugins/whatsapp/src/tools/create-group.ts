import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { createGroup as createGroupAction } from '../whatsapp-api.js';

export const createGroup = defineTool({
  name: 'create_group',
  displayName: 'Create Group',
  description:
    'Create a new WhatsApp group with a subject and list of participant phone number IDs. Participant IDs should be in the format "15551234567@c.us".',
  summary: 'Create a new group chat',
  icon: 'users-round',
  group: 'Groups',
  input: z.object({
    subject: z.string().min(1).describe('Group name/subject'),
    participant_ids: z
      .array(z.string().min(1))
      .min(1)
      .describe('Participant phone number IDs (e.g., ["15551234567@c.us"])'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the group was created'),
  }),
  handle: async params => {
    await createGroupAction(params.subject, params.participant_ids);
    return { success: true };
  },
});
