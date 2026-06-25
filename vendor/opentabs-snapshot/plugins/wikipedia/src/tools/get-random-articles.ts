import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';
import { randomPageSchema, mapRandomPage } from './schemas.js';
import type { RawRandomPage } from './schemas.js';

interface RandomResponse {
  query?: {
    random?: RawRandomPage[];
  };
}

export const getRandomArticles = defineTool({
  name: 'get_random_articles',
  displayName: 'Get Random Articles',
  description:
    'Get random Wikipedia articles. Returns article IDs and titles. Useful for discovering content or selecting a random topic.',
  summary: 'Get random Wikipedia articles',
  icon: 'shuffle',
  group: 'Articles',
  input: z.object({
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of random articles to return (default 5, max 20)'),
  }),
  output: z.object({
    articles: z.array(randomPageSchema),
  }),
  handle: async params => {
    const data = await api<RandomResponse>({
      action: 'query',
      list: 'random',
      rnlimit: params.count ?? 5,
      rnnamespace: 0,
    });

    return {
      articles: (data.query?.random ?? []).map(mapRandomPage),
    };
  },
});
