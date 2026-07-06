import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './dominos-api.js';

// Account
import { getCustomer } from './tools/get-customer.js';
import { getSavedAddresses } from './tools/get-saved-addresses.js';
import { getSavedCards } from './tools/get-saved-cards.js';
import { getLoyaltyPoints } from './tools/get-loyalty-points.js';
import { getLoyaltyRewards } from './tools/get-loyalty-rewards.js';

// Stores
import { searchAddress } from './tools/search-address.js';
import { findStoresByAddress } from './tools/find-stores-by-address.js';

// Menu
import { getMenuCategories } from './tools/get-menu-categories.js';
import { getCategoryProducts } from './tools/get-category-products.js';
import { getProduct } from './tools/get-product.js';
import { getDeal } from './tools/get-deal.js';

// Cart & Ordering
import { createCart } from './tools/create-cart.js';
import { getCart } from './tools/get-cart.js';
import { addProductToCart } from './tools/add-product-to-cart.js';
import { updateProductQuantity } from './tools/update-product-quantity.js';
import { addDealToCart } from './tools/add-deal-to-cart.js';
import { removeDealFromCart } from './tools/remove-deal-from-cart.js';
import { getCheckoutSummary } from './tools/get-checkout-summary.js';
import { navigateToCheckout } from './tools/navigate-to-checkout.js';
import { placeOrderCash } from './tools/place-order-cash.js';

class DominosPlugin extends OpenTabsPlugin {
  readonly name = 'dominos';
  readonly description = "OpenTabs plugin for Domino's Pizza";
  override readonly displayName = "Domino's";
  readonly urlPatterns = ['*://*.dominos.com/*'];
  override readonly homepage = 'https://www.dominos.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCustomer,
    getSavedAddresses,
    getSavedCards,
    getLoyaltyPoints,
    getLoyaltyRewards,

    // Stores
    searchAddress,
    findStoresByAddress,

    // Menu
    getMenuCategories,
    getCategoryProducts,
    getProduct,
    getDeal,

    // Cart & Ordering
    createCart,
    getCart,
    addProductToCart,
    updateProductQuantity,
    addDealToCart,
    removeDealFromCart,
    getCheckoutSummary,
    navigateToCheckout,
    placeOrderCash,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new DominosPlugin();
