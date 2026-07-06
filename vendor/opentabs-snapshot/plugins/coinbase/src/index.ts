import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './coinbase-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';

// Portfolio
import { listPortfolios } from './tools/list-portfolios.js';

// Assets
import { getAssetByUuid } from './tools/get-asset-by-uuid.js';
import { getAssetBySlug } from './tools/get-asset-by-slug.js';
import { getAssetBySymbol } from './tools/get-asset-by-symbol.js';
import { getAssetCategories } from './tools/get-asset-categories.js';
import { getAssetNetworks } from './tools/get-asset-networks.js';

// Prices
import { getAssetPrice } from './tools/get-asset-price.js';
import { compareAssetPrices } from './tools/compare-asset-prices.js';

// Watchlists
import { listWatchlists } from './tools/list-watchlists.js';
import { createWatchlist } from './tools/create-watchlist.js';
import { deleteWatchlist } from './tools/delete-watchlist.js';
import { addWatchlistItem } from './tools/add-watchlist-item.js';
import { removeWatchlistItem } from './tools/remove-watchlist-item.js';

// Alerts
import { listPriceAlerts } from './tools/list-price-alerts.js';
import { createPriceAlert } from './tools/create-price-alert.js';
import { deletePriceAlert } from './tools/delete-price-alert.js';

class CoinbasePlugin extends OpenTabsPlugin {
  readonly name = 'coinbase';
  readonly description = 'OpenTabs plugin for Coinbase';
  override readonly displayName = 'Coinbase';
  readonly urlPatterns = ['*://*.coinbase.com/*'];
  override readonly homepage = 'https://www.coinbase.com/home';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,

    // Portfolio
    listPortfolios,

    // Assets
    getAssetByUuid,
    getAssetBySlug,
    getAssetBySymbol,
    getAssetCategories,
    getAssetNetworks,

    // Prices
    getAssetPrice,
    compareAssetPrices,

    // Watchlists
    listWatchlists,
    createWatchlist,
    deleteWatchlist,
    addWatchlistItem,
    removeWatchlistItem,

    // Alerts
    listPriceAlerts,
    createPriceAlert,
    deletePriceAlert,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new CoinbasePlugin();
