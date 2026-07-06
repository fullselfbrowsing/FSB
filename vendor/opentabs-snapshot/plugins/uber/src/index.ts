import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './uber-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getEnabledProducts } from './tools/get-enabled-products.js';
import { getMembership } from './tools/get-membership.js';
import { getPastActivities } from './tools/get-past-activities.js';
import { getProductSuggestions } from './tools/get-product-suggestions.js';
import { getTravelStatus } from './tools/get-travel-status.js';
import { getUpcomingActivities } from './tools/get-upcoming-activities.js';
import { searchLocations } from './tools/search-locations.js';

class UberPlugin extends OpenTabsPlugin {
  readonly name = 'uber';
  readonly description = 'OpenTabs plugin for Uber';
  override readonly displayName = 'Uber';
  readonly urlPatterns = ['*://*.uber.com/*'];
  override readonly homepage = 'https://www.uber.com';

  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    getMembership,

    // Activities
    getPastActivities,
    getUpcomingActivities,

    // Rides
    searchLocations,
    getTravelStatus,

    // Products
    getProductSuggestions,
    getEnabledProducts,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new UberPlugin();
