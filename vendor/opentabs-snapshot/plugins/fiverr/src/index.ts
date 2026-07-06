import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './fiverr-api.js';
import { draftMessage } from './tools/draft-message.js';
import { getConversation } from './tools/get-conversation.js';
import { getCurrentPageContext } from './tools/get-current-page-context.js';
import { getGigDetails } from './tools/get-gig-details.js';
import { getSellerProfile } from './tools/get-seller-profile.js';
import { listConversations } from './tools/list-conversations.js';
import { searchGigs } from './tools/search-gigs.js';
import { sendMessage } from './tools/send-message.js';

class FiverrPlugin extends OpenTabsPlugin {
  readonly name = 'fiverr';
  readonly description = 'OpenTabs plugin for Fiverr';
  override readonly displayName = 'Fiverr';
  readonly urlPatterns = ['*://*.fiverr.com/*'];
  override readonly homepage = 'https://www.fiverr.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentPageContext,
    // Gigs
    searchGigs,
    getGigDetails,
    // Sellers
    getSellerProfile,
    // Messages
    listConversations,
    getConversation,
    draftMessage,
    sendMessage,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new FiverrPlugin();
