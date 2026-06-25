import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './costco-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';

// Products
import { getProduct } from './tools/get-product.js';
import { getProducts } from './tools/get-products.js';
import { searchProducts } from './tools/search-products.js';

// Inventory
import { getProductAvailability } from './tools/get-product-availability.js';

// Locations
import { geocodeLocationTool } from './tools/geocode-location.js';

// Lists
import { getLists } from './tools/get-lists.js';
import { getListItems } from './tools/get-list-items.js';
import { createListTool } from './tools/create-list.js';
import { addToListTool } from './tools/add-to-list.js';
import { deleteListTool } from './tools/delete-list.js';
import { removeListItem } from './tools/remove-list-item.js';

// Navigation
import { navigateToProduct } from './tools/navigate-to-product.js';
import { navigateToCart } from './tools/navigate-to-cart.js';
import { navigateToCheckout } from './tools/navigate-to-checkout.js';
import { navigateToSearch } from './tools/navigate-to-search.js';

class CostcoPlugin extends OpenTabsPlugin {
  readonly name = 'costco';
  readonly description = 'OpenTabs plugin for Costco Wholesale';
  override readonly displayName = 'Costco';
  readonly urlPatterns = ['*://*.costco.com/*'];
  override readonly excludePatterns = ['*://sameday.costco.com/*', '*://signin.costco.com/*'];
  override readonly homepage = 'https://www.costco.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    // Products
    searchProducts,
    getProduct,
    getProducts,
    // Inventory
    getProductAvailability,
    // Locations
    geocodeLocationTool,
    // Lists
    getLists,
    getListItems,
    createListTool,
    addToListTool,
    removeListItem,
    deleteListTool,
    // Navigation
    navigateToProduct,
    navigateToSearch,
    navigateToCart,
    navigateToCheckout,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new CostcoPlugin();
