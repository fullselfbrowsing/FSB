import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './gemini-api.js';
import { createConversation } from './tools/create-conversation.js';
import { getConversation } from './tools/get-conversation.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { listConversations } from './tools/list-conversations.js';
import { listModels } from './tools/list-models.js';
import { sendMessage } from './tools/send-message.js';

class GeminiPlugin extends OpenTabsPlugin {
  readonly name = 'gemini';
  readonly description = 'OpenTabs plugin for Google Gemini';
  override readonly displayName = 'Gemini';
  readonly urlPatterns = ['*://gemini.google.com/*'];
  override readonly homepage = 'https://gemini.google.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    // Models
    listModels,
    // Conversations
    listConversations,
    getConversation,
    createConversation,
    // Chat
    sendMessage,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new GeminiPlugin();
