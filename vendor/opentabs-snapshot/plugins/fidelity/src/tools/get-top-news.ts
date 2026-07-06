import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { newsItemSchema, mapNewsItem } from './schemas.js';
import type { RawNewsItem } from './schemas.js';

export const getTopNews = defineTool({
  name: 'get_top_news',
  displayName: 'Get Top News',
  description: 'Get the latest top financial and market news headlines.',
  summary: 'Top financial news headlines',
  icon: 'rss',
  group: 'Market Data',
  input: z.object({}),
  output: z.object({
    articles: z.array(newsItemSchema).describe('Top news articles'),
  }),
  handle: async () => {
    interface TopNewsResponse {
      topNews: RawNewsItem[];
    }

    const query = `query getTopNews {
      topNews { text resId wirename receivedTime receivedDate __typename }
    }`;

    const data = await portfolioGraphql<TopNewsResponse>('getTopNews', query);

    return {
      articles: (data.topNews ?? []).map(n => mapNewsItem(n)),
    };
  },
});
