import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { findChatByIdOrThrow, isChatGroup, queryGroupInviteCode } from '../whatsapp-api.js';

export const getGroupInviteLink = defineTool({
  name: 'get_group_invite_link',
  displayName: 'Get Group Invite Link',
  description: 'Get the invite link for a WhatsApp group. Only group admins can retrieve the invite link.',
  summary: 'Get group invite link',
  icon: 'link',
  group: 'Groups',
  input: z.object({
    chat_id: z.string().min(1).describe('Group chat ID (must be a group chat)'),
  }),
  output: z.object({
    invite_link: z.string().describe('Group invite URL (https://chat.whatsapp.com/...)'),
  }),
  handle: async params => {
    const chat = findChatByIdOrThrow(params.chat_id);
    if (!isChatGroup(chat)) throw ToolError.validation('Chat is not a group');
    const code = await queryGroupInviteCode(chat);
    return { invite_link: `https://chat.whatsapp.com/${code}` };
  },
});
