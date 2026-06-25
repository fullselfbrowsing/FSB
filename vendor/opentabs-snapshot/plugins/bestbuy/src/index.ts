import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './bestbuy-api.js';
import { addToCart } from './tools/add-to-cart.js';
import { getCart } from './tools/get-cart.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getCustomerPlans } from './tools/get-customer-plans.js';
import { getProduct } from './tools/get-product.js';
import { getProductReviews } from './tools/get-product-reviews.js';
import { getPurchaseDetails } from './tools/get-purchase-details.js';
import { getSavedCards } from './tools/get-saved-cards.js';
import { listPurchases } from './tools/list-purchases.js';
import { navigateToCheckout } from './tools/navigate-to-checkout.js';
import { searchProducts } from './tools/search-products.js';

class BestBuyPlugin extends OpenTabsPlugin {
  readonly name = 'bestbuy';
  readonly description = 'OpenTabs plugin for Best Buy';
  override readonly displayName = 'Best Buy';
  override readonly homepage = 'https://www.bestbuy.com';
  readonly urlPatterns = ['*://*.bestbuy.com/*'];
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    getSavedCards,
    getCustomerPlans,
    // Products
    searchProducts,
    getProduct,
    getProductReviews,
    // Cart
    getCart,
    addToCart,
    navigateToCheckout,
    // Purchases
    listPurchases,
    getPurchaseDetails,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new BestBuyPlugin();
