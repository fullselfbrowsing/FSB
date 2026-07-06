import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './tripadvisor-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';

// Navigation
import { getBreadcrumbs } from './tools/get-breadcrumbs.js';
import { getNeighborhood } from './tools/get-neighborhood.js';

// Restaurants
import { listRestaurants } from './tools/list-restaurants.js';
import { getRestaurant } from './tools/get-restaurant.js';
import { getRestaurantAwards } from './tools/get-restaurant-awards.js';

// Hotels
import { listHotels } from './tools/list-hotels.js';
import { getHotel } from './tools/get-hotel.js';

// Attractions
import { listAttractions } from './tools/list-attractions.js';
import { getAttraction } from './tools/get-attraction.js';

// Reviews
import { getReviews } from './tools/get-reviews.js';

// Saves
import { checkSaved } from './tools/check-saved.js';

class TripAdvisorPlugin extends OpenTabsPlugin {
  readonly name = 'tripadvisor';
  readonly description = 'OpenTabs plugin for Tripadvisor';
  override readonly displayName = 'Tripadvisor';
  readonly urlPatterns = ['*://*.tripadvisor.com/*'];
  override readonly homepage = 'https://www.tripadvisor.com';

  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,

    // Navigation
    getBreadcrumbs,
    getNeighborhood,

    // Restaurants
    listRestaurants,
    getRestaurant,
    getRestaurantAwards,

    // Hotels
    listHotels,
    getHotel,

    // Attractions
    listAttractions,
    getAttraction,

    // Reviews
    getReviews,

    // Saves
    checkSaved,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TripAdvisorPlugin();
