import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './ebay-api.js';
import { getCurrentUserTool } from './tools/get-current-user.js';
import { getDeals } from './tools/get-deals.js';
import { getItem } from './tools/get-item.js';
import { getSellerProfile } from './tools/get-seller-profile.js';
import { getWatchlist } from './tools/get-watchlist.js';
import { searchItems } from './tools/search-items.js';
import { searchSuggestions } from './tools/search-suggestions.js';
import { watchItem } from './tools/watch-item.js';

class EbayPlugin extends OpenTabsPlugin {
  readonly name = 'ebay';
  readonly description = 'OpenTabs plugin for eBay';
  override readonly displayName = 'eBay';
  readonly urlPatterns = ['*://*.ebay.com/*'];
  override readonly homepage = 'https://www.ebay.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUserTool,
    // Search
    searchItems,
    searchSuggestions,
    // Items
    getItem,
    // Watchlist
    getWatchlist,
    watchItem,
    // Users
    getSellerProfile,
    // Browse
    getDeals,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new EbayPlugin();
