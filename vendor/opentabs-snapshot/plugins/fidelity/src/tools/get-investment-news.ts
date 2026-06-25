import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { newsItemSchema, mapNewsItem } from './schemas.js';
import type { RawNewsItem } from './schemas.js';

export const getInvestmentNews = defineTool({
  name: 'get_investment_news',
  displayName: 'Get Investment News',
  description:
    'Get recent news articles related to specific ticker symbols in your portfolio. Returns headlines with source and date.',
  summary: 'News for your portfolio holdings',
  icon: 'newspaper',
  group: 'Market Data',
  input: z.object({
    symbols: z.array(z.string().min(1)).min(1).describe('Ticker symbols to get news for (e.g., ["AAPL", "VOO"])'),
    count: z.number().int().min(1).max(50).optional().describe('Number of articles to return (default 20, max 50)'),
  }),
  output: z.object({
    articles: z.array(newsItemSchema).describe('News articles'),
  }),
  handle: async params => {
    interface NewsResponse {
      investmentsNews: RawNewsItem[];
    }

    const symbolsStr = params.symbols.map(s => `"${s}"`).join(', ');
    const count = params.count ?? 20;

    const query = `query getInvestmentsNews {
      investmentsNews(symbols: [${symbolsStr}], number: ${count}) {
        text resId wirename resTime resDate symbols __typename
      }
    }`;

    const data = await portfolioGraphql<NewsResponse>('getInvestmentsNews', query);

    return {
      articles: (data.investmentsNews ?? []).map(n => mapNewsItem(n)),
    };
  },
});
