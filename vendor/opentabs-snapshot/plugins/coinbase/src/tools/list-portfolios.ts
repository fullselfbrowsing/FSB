import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';
import { type RawPortfolio, mapPortfolio, portfolioSchema } from './schemas.js';

const QUERY = `query ListPortfolios {
  viewer {
    portfolios { uuid name type }
  }
}`;

interface Response {
  viewer: { portfolios: RawPortfolio[] };
}

export const listPortfolios = defineTool({
  name: 'list_portfolios',
  displayName: 'List Portfolios',
  description:
    'List all portfolios in the Coinbase account. Most users have a single "Primary" portfolio of type DEFAULT.',
  summary: 'List all portfolios',
  icon: 'briefcase',
  group: 'Portfolio',
  input: z.object({}),
  output: z.object({
    portfolios: z.array(portfolioSchema).describe('List of portfolios'),
  }),
  handle: async () => {
    const data = await gql<Response>(QUERY);
    return { portfolios: (data.viewer.portfolios ?? []).map(mapPortfolio) };
  },
});
