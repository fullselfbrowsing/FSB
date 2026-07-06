import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './target-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getLoyaltyDetails } from './tools/get-loyalty-details.js';
import { getSavingsSummary } from './tools/get-savings-summary.js';
import { findNearbyStores } from './tools/find-nearby-stores.js';
import { getStore } from './tools/get-store.js';
import { searchProducts } from './tools/search-products.js';
import { getProduct } from './tools/get-product.js';
import { getCart } from './tools/get-cart.js';
import { addToCart } from './tools/add-to-cart.js';
import { updateCartItemQuantity } from './tools/update-cart-item-quantity.js';
import { removeCartItem } from './tools/remove-cart-item.js';
import { applyPromoCode } from './tools/apply-promo-code.js';
import { navigateToCheckout } from './tools/navigate-to-checkout.js';
import { listFavorites } from './tools/list-favorites.js';
import { listShoppingLists } from './tools/list-shopping-lists.js';
import { getShoppingList } from './tools/get-shopping-list.js';
import { listOrders } from './tools/list-orders.js';
import { getOrder } from './tools/get-order.js';

class TargetPlugin extends OpenTabsPlugin {
  readonly name = 'target';
  readonly description = 'OpenTabs plugin for Target';
  override readonly displayName = 'Target';
  readonly urlPatterns = ['*://*.target.com/*'];
  override readonly homepage = 'https://www.target.com';

  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    getLoyaltyDetails,
    getSavingsSummary,
    findNearbyStores,
    getStore,
    searchProducts,
    getProduct,
    getCart,
    addToCart,
    updateCartItemQuantity,
    removeCartItem,
    applyPromoCode,
    navigateToCheckout,
    listFavorites,
    listShoppingLists,
    getShoppingList,
    listOrders,
    getOrder,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TargetPlugin();
