import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './yelp-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { searchBusinesses } from './tools/search-businesses.js';
import { getBusiness } from './tools/get-business.js';
import { autocomplete } from './tools/autocomplete.js';
import { navigateToSearch } from './tools/navigate-to-search.js';
import { navigateToBusiness } from './tools/navigate-to-business.js';
import { getCurrentPageBusinesses } from './tools/get-current-page-businesses.js';

class YelpPlugin extends OpenTabsPlugin {
  readonly name = 'yelp';
  readonly description = 'OpenTabs plugin for Yelp';
  override readonly displayName = 'Yelp';
  readonly urlPatterns = ['*://www.yelp.com/*'];
  override readonly homepage = 'https://www.yelp.com';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    searchBusinesses,
    getBusiness,
    autocomplete,
    navigateToSearch,
    navigateToBusiness,
    getCurrentPageBusinesses,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new YelpPlugin();
