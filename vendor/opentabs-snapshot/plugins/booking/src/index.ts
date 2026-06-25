import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './booking-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getGeniusStatus } from './tools/get-genius-status.js';
import { getProperty } from './tools/get-property.js';
import { getPropertyReviews } from './tools/get-property-reviews.js';
import { listTrips } from './tools/list-trips.js';
import { listWishlists } from './tools/list-wishlists.js';
import { navigateToProperty } from './tools/navigate-to-property.js';
import { navigateToSearch } from './tools/navigate-to-search.js';
import { searchDestinations } from './tools/search-destinations.js';
import { searchProperties } from './tools/search-properties.js';

class BookingPlugin extends OpenTabsPlugin {
  readonly name = 'booking';
  readonly description = 'OpenTabs plugin for Booking.com';
  override readonly displayName = 'Booking.com';
  readonly urlPatterns = ['*://*.booking.com/*'];
  override readonly homepage = 'https://www.booking.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    getGeniusStatus,
    // Search
    searchProperties,
    searchDestinations,
    // Properties
    getProperty,
    getPropertyReviews,
    // Trips
    listTrips,
    // Wishlists
    listWishlists,
    // Navigation
    navigateToProperty,
    navigateToSearch,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new BookingPlugin();
