import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './doordash-api.js';
import { bookmarkStore } from './tools/bookmark-store.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getNotifications } from './tools/get-notifications.js';
import { getOrder } from './tools/get-order.js';
import { listAddresses } from './tools/list-addresses.js';
import { listOrders } from './tools/list-orders.js';
import { listPaymentMethods } from './tools/list-payment-methods.js';
import { markNotificationsRead } from './tools/mark-notifications-read.js';
import { unbookmarkStore } from './tools/unbookmark-store.js';
import { updateDefaultAddress } from './tools/update-default-address.js';
import { updateProfile } from './tools/update-profile.js';

class DoorDashPlugin extends OpenTabsPlugin {
  readonly name = 'doordash';
  readonly description = 'OpenTabs plugin for DoorDash';
  override readonly displayName = 'DoorDash';
  readonly urlPatterns = ['*://*.doordash.com/*'];
  override readonly homepage = 'https://www.doordash.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    updateProfile,
    listAddresses,
    updateDefaultAddress,
    listPaymentMethods,
    getNotifications,
    markNotificationsRead,
    // Orders
    listOrders,
    getOrder,
    // Stores
    bookmarkStore,
    unbookmarkStore,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new DoorDashPlugin();
