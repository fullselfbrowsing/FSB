import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './instacart-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';
import { getLocationContextTool } from './tools/get-location-context.js';
import { listAddresses } from './tools/list-addresses.js';

// Shopping
import { getProduct } from './tools/get-product.js';
import { searchProducts } from './tools/search-products.js';

// Cart
import { deleteCart } from './tools/delete-cart.js';
import { getCart } from './tools/get-cart.js';
import { listActiveCarts } from './tools/list-active-carts.js';
import { navigateToCheckout } from './tools/navigate-to-checkout.js';
import { updateCartItems } from './tools/update-cart-items.js';

// Orders
import { getOrder } from './tools/get-order.js';
import { listOrders } from './tools/list-orders.js';

class InstacartPlugin extends OpenTabsPlugin {
  readonly name = 'instacart';
  readonly description =
    'OpenTabs plugin for Instacart — search products, manage carts, browse stores, and view orders';
  override readonly displayName = 'Instacart';
  readonly urlPatterns = ['*://*.instacart.com/*'];
  override readonly homepage = 'https://www.instacart.com/';

  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    listAddresses,
    getLocationContextTool,

    // Shopping
    searchProducts,
    getProduct,

    // Cart
    listActiveCarts,
    getCart,
    updateCartItems,
    deleteCart,
    navigateToCheckout,

    // Orders
    listOrders,
    getOrder,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new InstacartPlugin();
