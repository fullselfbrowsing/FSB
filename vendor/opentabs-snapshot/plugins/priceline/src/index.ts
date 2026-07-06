import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './priceline-api.js';
import { findCheapestFlightDate } from './tools/find-cheapest-flight-date.js';
import { getAbandonedItems } from './tools/get-abandoned-items.js';
import { getCustomerCoupons } from './tools/get-customer-coupons.js';
import { getCustomerProfile } from './tools/get-customer-profile.js';
import { getFavoriteHotels } from './tools/get-favorite-hotels.js';
import { getFlightPriceCalendar } from './tools/get-flight-price-calendar.js';
import { getHotelDescriptions } from './tools/get-hotel-descriptions.js';
import { getHotelFilters } from './tools/get-hotel-filters.js';
import { getMerchandisingBadges } from './tools/get-merchandising-badges.js';
import { getPriceGuidance } from './tools/get-price-guidance.js';
import { listFlightPriceWatches } from './tools/list-flight-price-watches.js';
import { navigateToFlightSearch } from './tools/navigate-to-flight-search.js';
import { navigateToHotel } from './tools/navigate-to-hotel.js';
import { navigateToSearch } from './tools/navigate-to-search.js';
import { searchAirports } from './tools/search-airports.js';
import { searchHotels } from './tools/search-hotels.js';
import { searchLocations } from './tools/search-locations.js';
import { searchPointsOfInterest } from './tools/search-points-of-interest.js';

class PricelinePlugin extends OpenTabsPlugin {
  readonly name = 'priceline';
  readonly description = 'OpenTabs plugin for Priceline';
  override readonly displayName = 'Priceline';
  readonly urlPatterns = ['*://*.priceline.com/*'];
  override readonly homepage = 'https://www.priceline.com';
  readonly tools: ToolDefinition[] = [
    // Search
    searchLocations,
    searchPointsOfInterest,
    navigateToSearch,
    // Hotels
    searchHotels,
    getHotelDescriptions,
    getHotelFilters,
    getMerchandisingBadges,
    getPriceGuidance,
    navigateToHotel,
    // Flights
    searchAirports,
    getFlightPriceCalendar,
    findCheapestFlightDate,
    listFlightPriceWatches,
    navigateToFlightSearch,
    // Account
    getCustomerProfile,
    getCustomerCoupons,
    getFavoriteHotels,
    getAbandonedItems,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new PricelinePlugin();
