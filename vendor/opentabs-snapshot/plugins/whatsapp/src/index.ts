import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './whatsapp-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { listChats } from './tools/list-chats.js';
import { getChat } from './tools/get-chat.js';
import { archiveChat } from './tools/archive-chat.js';
import { pinChat } from './tools/pin-chat.js';
import { muteChat } from './tools/mute-chat.js';
import { markChatRead } from './tools/mark-chat-read.js';
import { deleteChat } from './tools/delete-chat.js';
import { clearChat } from './tools/clear-chat.js';
import { listMessages } from './tools/list-messages.js';
import { sendMessage } from './tools/send-message.js';
import { starMessage } from './tools/star-message.js';
import { deleteMessage } from './tools/delete-message.js';
import { revokeMessage } from './tools/revoke-message.js';
import { listContacts } from './tools/list-contacts.js';
import { getContact } from './tools/get-contact.js';
import { blockContact } from './tools/block-contact.js';
import { unblockContact } from './tools/unblock-contact.js';
import { createGroup } from './tools/create-group.js';
import { getGroupInviteLink } from './tools/get-group-invite-link.js';
import { revokeGroupInviteLink } from './tools/revoke-group-invite-link.js';

class WhatsAppPlugin extends OpenTabsPlugin {
  readonly name = 'whatsapp';
  readonly description = 'OpenTabs plugin for WhatsApp Web';
  override readonly displayName = 'WhatsApp';
  readonly urlPatterns = ['*://web.whatsapp.com/*'];
  override readonly homepage = 'https://web.whatsapp.com';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    listChats,
    getChat,
    archiveChat,
    pinChat,
    muteChat,
    markChatRead,
    deleteChat,
    clearChat,
    listMessages,
    sendMessage,
    starMessage,
    deleteMessage,
    revokeMessage,
    listContacts,
    getContact,
    blockContact,
    unblockContact,
    createGroup,
    getGroupInviteLink,
    revokeGroupInviteLink,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new WhatsAppPlugin();
