import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './starbucks-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';
import { getCards } from './tools/get-cards.js';
import { getPaymentMethods } from './tools/get-payment-methods.js';

// Rewards
import { getRewards } from './tools/get-rewards.js';
import { getEarnRates } from './tools/get-earn-rates.js';

// Feed
import { getFeed } from './tools/get-feed.js';

// Stores
import { findStores } from './tools/find-stores.js';
import { toggleFavoriteStore } from './tools/toggle-favorite-store.js';

// Menu
import { getStoreMenu } from './tools/get-store-menu.js';
import { getProduct } from './tools/get-product.js';

// Orders
import { getPreviousOrders } from './tools/get-previous-orders.js';
import { getFavoriteProducts } from './tools/get-favorite-products.js';
import { addFavoriteProduct } from './tools/add-favorite-product.js';
import { deleteFavoriteProduct } from './tools/delete-favorite-product.js';
import { getStoreTimeSlots } from './tools/get-store-time-slots.js';
import { priceOrder } from './tools/price-order.js';

// Cart
import { getCart } from './tools/get-cart.js';
import { addProductToCart } from './tools/add-product-to-cart.js';
import { updateProductQuantity } from './tools/update-product-quantity.js';
import { navigateToCheckout } from './tools/navigate-to-checkout.js';

class StarbucksPlugin extends OpenTabsPlugin {
  readonly name = 'starbucks';
  readonly description =
    'OpenTabs plugin for Starbucks — manage rewards, find stores, browse the menu, price orders, and view your account';
  override readonly displayName = 'Starbucks';
  readonly urlPatterns = ['*://*.starbucks.com/*'];
  override readonly homepage = 'https://www.starbucks.com/account/for-you';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    getCards,
    getPaymentMethods,
    // Rewards
    getRewards,
    getEarnRates,
    // Feed
    getFeed,
    // Stores
    findStores,
    toggleFavoriteStore,
    // Menu
    getStoreMenu,
    getProduct,
    // Orders
    getPreviousOrders,
    getFavoriteProducts,
    addFavoriteProduct,
    deleteFavoriteProduct,
    getStoreTimeSlots,
    priceOrder,
    // Cart
    getCart,
    addProductToCart,
    updateProductQuantity,
    navigateToCheckout,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new StarbucksPlugin();
