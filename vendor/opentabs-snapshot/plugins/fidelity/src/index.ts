import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './fidelity-api.js';
import { getPortfolioSummary } from './tools/get-portfolio-summary.js';
import { listAccounts } from './tools/list-accounts.js';
import { getPositions } from './tools/get-positions.js';
import { getBalanceHistory } from './tools/get-balance-history.js';
import { getQuotes } from './tools/get-quotes.js';
import { getMarketMovers } from './tools/get-market-movers.js';
import { getPortfolioEvents } from './tools/get-portfolio-events.js';
import { getInvestmentNews } from './tools/get-investment-news.js';
import { getTopNews } from './tools/get-top-news.js';
import { getCustomerOrders } from './tools/get-customer-orders.js';
import { getContributionData } from './tools/get-contribution-data.js';
import { getAdvisorInfo } from './tools/get-advisor-info.js';
import { getServiceMessages } from './tools/get-service-messages.js';

class FidelityPlugin extends OpenTabsPlugin {
  readonly name = 'fidelity';
  readonly description = 'OpenTabs plugin for Fidelity Investments';
  override readonly displayName = 'Fidelity';
  readonly urlPatterns = ['*://digital.fidelity.com/*'];
  override readonly homepage = 'https://digital.fidelity.com/ftgw/digital/portfolio/summary';
  readonly tools: ToolDefinition[] = [
    // Portfolio
    getPortfolioSummary,
    listAccounts,
    getPositions,
    getBalanceHistory,
    getPortfolioEvents,
    // Market Data
    getQuotes,
    getMarketMovers,
    getInvestmentNews,
    getTopNews,
    getCustomerOrders,
    // Retirement
    getContributionData,
    // Account
    getAdvisorInfo,
    getServiceMessages,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new FidelityPlugin();
