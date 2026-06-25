import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './airbnb-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getUserThumbnail } from './tools/get-user-thumbnail.js';
import { listWishlists } from './tools/list-wishlists.js';
import { getWishlistItems } from './tools/get-wishlist-items.js';
import { listMessageThreads } from './tools/list-message-threads.js';
import { getMessageThread } from './tools/get-message-thread.js';
import { getInboxFilters } from './tools/get-inbox-filters.js';
import { searchSuggestions } from './tools/search-suggestions.js';
import { getSearchResults } from './tools/get-search-results.js';
import { getListingFromPage } from './tools/get-listing-from-page.js';
import { getHeaderInfo } from './tools/get-header-info.js';
import { isHost } from './tools/is-host.js';
import { getMapViewportInfo } from './tools/get-map-viewport-info.js';
import { removeFromWishlist } from './tools/remove-from-wishlist.js';

class AirbnbPlugin extends OpenTabsPlugin {
  readonly name = 'airbnb';
  readonly description = 'OpenTabs plugin for Airbnb';
  override readonly displayName = 'Airbnb';
  override readonly homepage = 'https://www.airbnb.com';
  readonly urlPatterns = ['*://*.airbnb.com/*'];
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    getUserThumbnail,
    listWishlists,
    getWishlistItems,
    removeFromWishlist,
    listMessageThreads,
    getMessageThread,
    getInboxFilters,
    searchSuggestions,
    getSearchResults,
    getListingFromPage,
    getHeaderInfo,
    isHost,
    getMapViewportInfo,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new AirbnbPlugin();
