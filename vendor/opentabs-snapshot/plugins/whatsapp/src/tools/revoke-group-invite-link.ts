import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, isChatGroup, revokeGroupInvite } from '../whatsapp-api.js';

export const revokeGroupInviteLink = defineTool({
  name: 'revoke_group_invite_link',
  displayName: 'Revoke Group Invite Link',
  description:
    'Revoke the current invite link for a WhatsApp group, generating a new one. The old link will no longer work. Only group admins can revoke invite links.',
  summary: 'Revoke and regenerate group invite link',
  icon: 'link-2-off',
  group: 'Groups',
  input: z.object({
    chat_id: z.string().min(1).describe('Group chat ID (must be a group chat)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    if (!isChatGroup(chat)) throw ToolError.validation('Chat is not a group');
    await revokeGroupInvite(chat);
    return { success: true };
  },
});
