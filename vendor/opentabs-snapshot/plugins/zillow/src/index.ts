import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './zillow-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getMarketOverview } from './tools/get-market-overview.js';
import { getSavedHomes } from './tools/get-saved-homes.js';
import { searchByAddress } from './tools/search-by-address.js';
import { searchByOwner } from './tools/search-by-owner.js';
import { searchForRent } from './tools/search-for-rent.js';
import { searchForSale } from './tools/search-for-sale.js';
import { searchForeclosures } from './tools/search-foreclosures.js';
import { searchLocations } from './tools/search-locations.js';
import { searchNewConstruction } from './tools/search-new-construction.js';
import { searchOpenHouses } from './tools/search-open-houses.js';
import { searchRecentlySold } from './tools/search-recently-sold.js';

class ZillowPlugin extends OpenTabsPlugin {
  readonly name = 'zillow';
  readonly description = 'OpenTabs plugin for Zillow real estate search';
  override readonly displayName = 'Zillow';
  readonly urlPatterns = ['*://*.zillow.com/*'];
  override readonly homepage = 'https://www.zillow.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    // Search
    searchLocations,
    searchForSale,
    searchForRent,
    searchRecentlySold,
    searchOpenHouses,
    searchNewConstruction,
    searchForeclosures,
    searchByOwner,
    // Properties
    searchByAddress,
    // Saved Homes
    getSavedHomes,
    // Market
    getMarketOverview,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new ZillowPlugin();
