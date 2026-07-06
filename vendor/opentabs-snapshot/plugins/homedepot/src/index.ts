import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './homedepot-api.js';
import { searchProducts } from './tools/search-products.js';
import { getProduct } from './tools/get-product.js';
import { searchStores } from './tools/search-stores.js';
import { getCart } from './tools/get-cart.js';
import { getSavedItems } from './tools/get-saved-items.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { addToCart } from './tools/add-to-cart.js';
import { navigateToCheckout } from './tools/navigate-to-checkout.js';
import { navigateToProduct } from './tools/navigate-to-product.js';
import { getStoreContext } from './tools/get-store-context.js';

class HomeDepotPlugin extends OpenTabsPlugin {
  readonly name = 'homedepot';
  readonly description = 'OpenTabs plugin for The Home Depot';
  override readonly displayName = 'Home Depot';
  readonly urlPatterns = ['*://*.homedepot.com/*'];
  override readonly homepage = 'https://www.homedepot.com';
  readonly tools: ToolDefinition[] = [
    searchProducts,
    getProduct,
    searchStores,
    getCart,
    getSavedItems,
    getCurrentUser,
    addToCart,
    navigateToCheckout,
    navigateToProduct,
    getStoreContext,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new HomeDepotPlugin();
