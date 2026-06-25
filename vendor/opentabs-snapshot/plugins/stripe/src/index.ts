import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './stripe-api.js';

// Account
import { getAccount } from './tools/get-account.js';

// Customers
import { createCustomer } from './tools/create-customer.js';
import { deleteCustomer } from './tools/delete-customer.js';
import { getCustomer } from './tools/get-customer.js';
import { listCustomers } from './tools/list-customers.js';
import { searchCustomers } from './tools/search-customers.js';
import { updateCustomer } from './tools/update-customer.js';

// Products & Prices
import { createPrice } from './tools/create-price.js';
import { createProduct } from './tools/create-product.js';
import { getPrice } from './tools/get-price.js';
import { getProduct } from './tools/get-product.js';
import { listPrices } from './tools/list-prices.js';
import { listProducts } from './tools/list-products.js';
import { updateProduct } from './tools/update-product.js';

// Payments
import { getPaymentIntent } from './tools/get-payment-intent.js';
import { listPaymentIntents } from './tools/list-payment-intents.js';
import { searchPaymentIntents } from './tools/search-payment-intents.js';

// Invoices
import { createInvoice } from './tools/create-invoice.js';
import { finalizeInvoice } from './tools/finalize-invoice.js';
import { getInvoice } from './tools/get-invoice.js';
import { listInvoices } from './tools/list-invoices.js';
import { searchInvoices } from './tools/search-invoices.js';
import { voidInvoice } from './tools/void-invoice.js';

// Subscriptions
import { getSubscription } from './tools/get-subscription.js';
import { listSubscriptions } from './tools/list-subscriptions.js';
import { searchSubscriptions } from './tools/search-subscriptions.js';

// Balance
import { getBalance } from './tools/get-balance.js';
import { listBalanceTransactions } from './tools/list-balance-transactions.js';

// Events
import { getEvent } from './tools/get-event.js';
import { listEvents } from './tools/list-events.js';

class StripePlugin extends OpenTabsPlugin {
  readonly name = 'stripe';
  readonly description = 'OpenTabs plugin for Stripe Dashboard';
  override readonly displayName = 'Stripe';
  readonly urlPatterns = ['*://dashboard.stripe.com/*'];
  override readonly homepage = 'https://dashboard.stripe.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getAccount,
    // Customers
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    searchCustomers,
    // Products & Prices
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    listPrices,
    getPrice,
    createPrice,
    // Payments
    listPaymentIntents,
    getPaymentIntent,
    searchPaymentIntents,
    // Invoices
    listInvoices,
    getInvoice,
    createInvoice,
    finalizeInvoice,
    voidInvoice,
    searchInvoices,
    // Subscriptions
    listSubscriptions,
    getSubscription,
    searchSubscriptions,
    // Balance
    getBalance,
    listBalanceTransactions,
    // Events
    listEvents,
    getEvent,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new StripePlugin();
