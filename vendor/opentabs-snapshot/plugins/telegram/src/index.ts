import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './telegram-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';

// Conversations
import { getConversation } from './tools/get-conversation.js';
import { listConversations } from './tools/list-conversations.js';
import { markConversationRead } from './tools/mark-conversation-read.js';
import { setTyping } from './tools/set-typing.js';

// Messages
import { deleteMessages } from './tools/delete-messages.js';
import { editMessage } from './tools/edit-message.js';
import { forwardMessages } from './tools/forward-messages.js';
import { getMessages } from './tools/get-messages.js';
import { pinMessage } from './tools/pin-message.js';
import { searchMessages } from './tools/search-messages.js';
import { sendMessage } from './tools/send-message.js';
import { unpinMessage } from './tools/unpin-message.js';

// Contacts
import { addContact } from './tools/add-contact.js';
import { deleteContact } from './tools/delete-contact.js';
import { listContacts } from './tools/list-contacts.js';
import { searchContacts } from './tools/search-contacts.js';

// Users
import { getUser } from './tools/get-user.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { resolveUsername } from './tools/resolve-username.js';

// Groups
import { createGroup } from './tools/create-group.js';
import { getChatInfo } from './tools/get-chat-info.js';
import { getChatMembers } from './tools/get-chat-members.js';

class TelegramPlugin extends OpenTabsPlugin {
  readonly name = 'telegram';
  readonly description = 'OpenTabs plugin for Telegram';
  override readonly displayName = 'Telegram';
  readonly urlPatterns = ['*://web.telegram.org/*'];
  override readonly homepage = 'https://web.telegram.org/k/';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    // Conversations
    listConversations,
    getConversation,
    markConversationRead,
    setTyping,
    // Messages
    getMessages,
    sendMessage,
    editMessage,
    deleteMessages,
    forwardMessages,
    pinMessage,
    unpinMessage,
    searchMessages,
    // Contacts
    listContacts,
    searchContacts,
    addContact,
    deleteContact,
    // Users
    getUser,
    getUserProfile,
    resolveUsername,
    // Groups
    getChatInfo,
    getChatMembers,
    createGroup,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TelegramPlugin();
