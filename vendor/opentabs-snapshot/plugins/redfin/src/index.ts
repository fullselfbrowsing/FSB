import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './redfin-api.js';
import { searchLocations } from './tools/search-locations.js';
import { searchProperties } from './tools/search-properties.js';
import { getPropertyDetails } from './tools/get-property-details.js';
import { getPropertyEstimate } from './tools/get-property-estimate.js';
import { getPropertyHistory } from './tools/get-property-history.js';
import { getPropertySchools } from './tools/get-property-schools.js';
import { getPropertyRiskFactors } from './tools/get-property-risk-factors.js';
import { getPropertyAmenities } from './tools/get-property-amenities.js';
import { getPropertyParcelInfo } from './tools/get-property-parcel-info.js';
import { getComparableRentals } from './tools/get-comparable-rentals.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getFavorites } from './tools/get-favorites.js';

class RedfinPlugin extends OpenTabsPlugin {
  readonly name = 'redfin';
  readonly description = 'OpenTabs plugin for Redfin real estate';
  override readonly displayName = 'Redfin';
  readonly urlPatterns = ['*://*.redfin.com/*'];
  override readonly homepage = 'https://www.redfin.com';
  readonly tools: ToolDefinition[] = [
    // Search & Discovery
    searchLocations,
    searchProperties,
    // Property Details
    getPropertyDetails,
    getPropertyEstimate,
    getPropertyHistory,
    getPropertySchools,
    getPropertyRiskFactors,
    getPropertyAmenities,
    getPropertyParcelInfo,
    getComparableRentals,
    // Account
    getCurrentUser,
    getFavorites,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new RedfinPlugin();
