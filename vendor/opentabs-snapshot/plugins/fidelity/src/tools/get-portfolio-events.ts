import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { portfolioGraphql } from '../fidelity-api.js';
import { portfolioEventSchema, mapPortfolioEvents } from './schemas.js';
import type { RawPortfolioEvent } from './schemas.js';

export const getPortfolioEvents = defineTool({
  name: 'get_portfolio_events',
  displayName: 'Get Portfolio Events',
  description:
    'Get upcoming and past portfolio events including earnings reports, ex-dividend dates, and 52-week highs/lows for positions in your portfolio.',
  summary: 'View portfolio earnings, dividends, and milestones',
  icon: 'calendar',
  group: 'Portfolio',
  input: z.object({
    direction: z.enum(['future', 'past']).optional().describe('Look at future or past events (default: future)'),
    symbols: z
      .array(z.string())
      .optional()
      .describe('Specific symbols to check. If omitted, uses top portfolio holdings.'),
  }),
  output: z.object({
    events: z.array(portfolioEventSchema).describe('Portfolio events'),
  }),
  handle: async params => {
    const direction = params.direction ?? 'future';
    const symbols = params.symbols ?? [];

    interface EventsResponse {
      getYourPortfolioEvents: {
        opportunity?: {
          opportunityDetails?: RawPortfolioEvent[];
        };
      };
    }

    const daysPast = direction === 'future' ? 0 : 14;
    const daysFuture = direction === 'future' ? 14 : 0;
    const positionsStr = symbols.map(s => `"${s}"`).join(', ');

    const query = `query getYourPortfolioEvents {
      getYourPortfolioEvents(reqBody: {daysPast: ${daysPast}, daysFuture: ${daysFuture}, postTypes: "summary", esschangeF1: 0, positions: [${positionsStr}], esschange: 0}) {
        opportunity {
          opportunityDetails {
            date days
            earnings { securityDetail { symbol secDesc __typename } reportDate changeSinceClosingPct lastPrice lastPriceDate __typename }
            dividends { securityDetail { symbol secDesc __typename } exDivDate changeSinceClosingPct lastPrice lastPriceDate __typename }
            fiftyTwoWeekHigh { securityDetail { symbol secDesc __typename } low high lastPriceDate __typename }
            fiftyTwoWeekLow { securityDetail { symbol secDesc __typename } low high lastPriceDate __typename }
            __typename
          }
          __typename
        }
        __typename
      }
    }`;

    const data = await portfolioGraphql<EventsResponse>('getYourPortfolioEvents', query);

    const details = data.getYourPortfolioEvents?.opportunity?.opportunityDetails ?? [];
    const events = details.flatMap(d => mapPortfolioEvents(d));

    return { events };
  },
});
