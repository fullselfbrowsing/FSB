import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './expedia-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { listTrips } from './tools/list-trips.js';
import { navigateToAccount } from './tools/navigate-to-account.js';
import { navigateToHotel } from './tools/navigate-to-hotel.js';
import { navigateToTrips } from './tools/navigate-to-trips.js';
import { searchActivities } from './tools/search-activities.js';
import { searchCarRentals } from './tools/search-car-rentals.js';
import { searchCruises } from './tools/search-cruises.js';
import { searchFlights } from './tools/search-flights.js';
import { searchHotels } from './tools/search-hotels.js';
import { searchLocations } from './tools/search-locations.js';
import { searchPackages } from './tools/search-packages.js';

class ExpediaPlugin extends OpenTabsPlugin {
  readonly name = 'expedia';
  readonly description = 'OpenTabs plugin for Expedia';
  override readonly displayName = 'Expedia';
  readonly urlPatterns = ['*://*.expedia.com/*'];
  override readonly homepage = 'https://www.expedia.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    navigateToAccount,
    // Search
    searchLocations,
    // Hotels
    searchHotels,
    navigateToHotel,
    // Flights
    searchFlights,
    // Cars
    searchCarRentals,
    // Packages
    searchPackages,
    // Activities
    searchActivities,
    // Cruises
    searchCruises,
    // Trips
    listTrips,
    navigateToTrips,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new ExpediaPlugin();
