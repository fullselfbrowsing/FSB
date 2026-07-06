import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './steam-api.js';
import { addToWishlist } from './tools/add-to-wishlist.js';
import { followApp } from './tools/follow-app.js';
import { generateDiscoveryQueue } from './tools/generate-discovery-queue.js';
import { getAppDetails } from './tools/get-app-details.js';
import { getAppReviews } from './tools/get-app-reviews.js';
import { getAppUserDetails } from './tools/get-app-user-details.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getFeaturedCategories } from './tools/get-featured-categories.js';
import { getFeatured } from './tools/get-featured.js';
import { getPopularTags } from './tools/get-popular-tags.js';
import { getUserData } from './tools/get-user-data.js';
import { ignoreApp } from './tools/ignore-app.js';
import { removeFromWishlist } from './tools/remove-from-wishlist.js';
import { searchStore } from './tools/search-store.js';
import { unignoreApp } from './tools/unignore-app.js';

class SteamPlugin extends OpenTabsPlugin {
  readonly name = 'steam';
  readonly description = 'OpenTabs plugin for Steam Store';
  override readonly displayName = 'Steam';
  readonly urlPatterns = ['*://store.steampowered.com/*'];
  override readonly homepage = 'https://store.steampowered.com';
  readonly tools: ToolDefinition[] = [
    searchStore,
    getAppDetails,
    getFeatured,
    getFeaturedCategories,
    getAppReviews,
    getPopularTags,
    getCurrentUser,
    getUserData,
    addToWishlist,
    removeFromWishlist,
    getAppUserDetails,
    followApp,
    ignoreApp,
    unignoreApp,
    generateDiscoveryQueue,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new SteamPlugin();
