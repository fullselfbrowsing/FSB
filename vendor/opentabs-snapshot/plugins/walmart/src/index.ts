import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import { getCart } from './tools/get-cart.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getProduct } from './tools/get-product.js';
import { getProductReviews } from './tools/get-product-reviews.js';
import { getStore } from './tools/get-store.js';
import { listOrders } from './tools/list-orders.js';
import { navigateToCheckout } from './tools/navigate-to-checkout.js';
import { navigateToProduct } from './tools/navigate-to-product.js';
import { navigateToSearch } from './tools/navigate-to-search.js';
import { searchProducts } from './tools/search-products.js';
import { isAuthenticated, waitForAuth } from './walmart-api.js';

class WalmartPlugin extends OpenTabsPlugin {
  readonly name = 'walmart';
  readonly description = 'OpenTabs plugin for Walmart';
  override readonly displayName = 'Walmart';
  readonly urlPatterns = ['*://*.walmart.com/*'];
  override readonly homepage = 'https://www.walmart.com';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    searchProducts,
    getProduct,
    getProductReviews,
    getStore,
    listOrders,
    getCart,
    navigateToCheckout,
    navigateToProduct,
    navigateToSearch,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new WalmartPlugin();
