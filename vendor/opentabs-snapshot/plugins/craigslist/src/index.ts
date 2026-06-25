import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './craigslist-api.js';
import { deletePaymentCard } from './tools/delete-payment-card.js';
import { getChatMessages } from './tools/get-chat-messages.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getSavedSearchCounts } from './tools/get-saved-search-counts.js';
import { listChatConversations } from './tools/list-chat-conversations.js';
import { listPaymentCards } from './tools/list-payment-cards.js';
import { listRenewablePostings } from './tools/list-renewable-postings.js';
import { renewAllPostings } from './tools/renew-all-postings.js';
import { setDefaultPaymentCard } from './tools/set-default-payment-card.js';

class CraigslistPlugin extends OpenTabsPlugin {
  readonly name = 'craigslist';
  readonly description = 'OpenTabs plugin for Craigslist';
  override readonly displayName = 'Craigslist';
  readonly urlPatterns = ['*://*.craigslist.org/*'];
  override readonly homepage = 'https://accounts.craigslist.org/';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    // Chat
    listChatConversations,
    getChatMessages,
    // Billing
    listPaymentCards,
    deletePaymentCard,
    setDefaultPaymentCard,
    // Postings
    listRenewablePostings,
    renewAllPostings,
    // Searches
    getSavedSearchCounts,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new CraigslistPlugin();
