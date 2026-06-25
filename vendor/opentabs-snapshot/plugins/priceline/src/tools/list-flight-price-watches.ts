import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { flyGraphql, getEmail } from '../priceline-api.js';
import { type RawFlightPriceWatch, flightPriceWatchSchema, mapFlightPriceWatch } from './schemas.js';

const PRICE_WATCH_LIST_QUERY = `
  query PriceWatches($input: AirPriceWatchGetListRequest!) {
    airPriceWatchGetListResponse(input: $input) {
      status statusCode statusMessage email
      error { code message }
      priceWatchGetListResp
    }
  }`;

interface RawPriceWatchResponse {
  airPriceWatchGetListResponse?: {
    status?: string;
    statusCode?: string;
    statusMessage?: string;
    error?: { code?: string; message?: string } | null;
    priceWatchGetListResp?: {
      priceWatches?: RawFlightPriceWatch[];
      optedInData?: RawFlightPriceWatch[];
      optedOutData?: RawFlightPriceWatch[];
    } | null;
  };
}

const generateRequestId = (): string => {
  return `opentabs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const listFlightPriceWatches = defineTool({
  name: 'list_flight_price_watches',
  displayName: 'List Flight Price Watches',
  description:
    "List the authenticated user's active Priceline flight price watches. Returns watches the user has set up to track fare changes on specific routes. Each entry includes origin, destination, travel dates, cabin class, current price, and target price.",
  summary: "List user's flight price alerts",
  icon: 'bell',
  group: 'Flights',
  input: z.object({
    include_inactive: z
      .boolean()
      .optional()
      .describe('Include inactive (paused or expired) watches in addition to active ones (default false)'),
  }),
  output: z.object({
    price_watches: z.array(flightPriceWatchSchema).describe('Active flight price watches for the signed-in user'),
  }),
  handle: async params => {
    const email = getEmail();
    const variables = {
      input: {
        email,
        requestId: generateRequestId(),
        includeInactive: params.include_inactive ?? false,
        includeOptedOut: false,
      },
    };
    const data = await flyGraphql<RawPriceWatchResponse>('PriceWatches', variables, PRICE_WATCH_LIST_QUERY);
    const resp = data.airPriceWatchGetListResponse;
    if (resp?.status === 'ERROR') {
      throw ToolError.internal(`Price watch list error: ${resp.statusMessage ?? 'unknown error'}`);
    }
    if (resp?.error) {
      throw ToolError.internal(`Price watch list error: ${resp.error.message ?? 'unknown error'}`);
    }
    const list = resp?.priceWatchGetListResp?.priceWatches ?? resp?.priceWatchGetListResp?.optedInData ?? [];
    return { price_watches: list.map(mapFlightPriceWatch) };
  },
});
