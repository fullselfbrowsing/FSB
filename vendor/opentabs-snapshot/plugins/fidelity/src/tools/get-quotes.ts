import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { quoteSchema, mapQuote } from './schemas.js';
import type { RawQuote } from './schemas.js';

export const getQuotes = defineTool({
  name: 'get_quotes',
  displayName: 'Get Quotes',
  description:
    'Get real-time stock/fund quotes for specified ticker symbols. Returns last price, daily change, and security type. Also includes current market status (open/closed/pre-market).',
  summary: 'Get real-time stock quotes',
  icon: 'activity',
  group: 'Market Data',
  input: z.object({
    symbols: z.array(z.string().min(1)).min(1).describe('Ticker symbols to quote (e.g., ["AAPL", "VOO", "QQQ"])'),
  }),
  output: z.object({
    quotes: z.array(quoteSchema).describe('Quote data for each symbol'),
    market_status: z.string().describe('Current market status (e.g., Open, Closed)'),
    is_pre_market: z.boolean().describe('Whether it is currently pre-market hours'),
  }),
  handle: async params => {
    interface QuotesResponse {
      quotes: RawQuote[];
      marketStatus?: string;
      isPreMarket?: boolean;
    }

    const symbolStr = params.symbols.join(',');

    const query = `query GetQuotes($symbols: String!) {
      quotes(symbols: $symbols) {
        status { errorCode errorText __typename }
        requestSymbol
        quoteData {
          symbol name lastPrice netChgToday pctChgToday
          lastDate lastTime securityType instrumentType
          __typename
        }
        __typename
      }
      isPreMarket
      currentTime
      marketStatus
    }`;

    const data = await portfolioGraphql<QuotesResponse>('GetQuotes', query, {
      symbols: symbolStr,
    });

    return {
      quotes: (data.quotes ?? []).map(q => mapQuote(q)),
      market_status: data.marketStatus ?? '',
      is_pre_market: data.isPreMarket ?? false,
    };
  },
});
