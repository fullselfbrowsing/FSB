import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { search, REGION_TYPE_MAP } from '../zillow-api.js';

export const getMarketOverview = defineTool({
  name: 'get_market_overview',
  displayName: 'Get Market Overview',
  description:
    'Get a market overview for a location showing total listings counts across categories: for sale, for rent, and recently sold. Useful for understanding market activity in a specific area.',
  summary: 'Get market listing counts for an area',
  icon: 'bar-chart-3',
  group: 'Market',
  input: z.object({
    region_id: z.number().int().describe('Zillow region ID (from search_locations)'),
    region_type: z
      .string()
      .optional()
      .describe('Region type: "city", "county", "zipcode", "neighborhood" (default "city")'),
  }),
  output: z.object({
    for_sale_total: z.number().describe('Total properties for sale'),
    for_rent_total: z.number().describe('Total rental listings'),
    recently_sold_total: z.number().describe('Total recently sold properties'),
  }),
  handle: async params => {
    const regionType = REGION_TYPE_MAP[params.region_type ?? 'city'] ?? 6;
    const defaultBounds = { west: -180, east: 180, south: -90, north: 90 };

    // Fetch for-sale count
    const forSaleData = await search(
      {
        mapBounds: defaultBounds,
        regionSelection: [{ regionId: params.region_id, regionType }],
        filterState: {},
        isMapVisible: false,
      },
      { cat1: ['total'] },
    );

    // Fetch rental count
    const rentalData = await search(
      {
        mapBounds: defaultBounds,
        regionSelection: [{ regionId: params.region_id, regionType }],
        filterState: {
          isForRent: { value: true },
          isForSaleByAgent: { value: false },
          isForSaleByOwner: { value: false },
          isNewConstruction: { value: false },
          isComingSoon: { value: false },
          isAuction: { value: false },
          isForSaleForeclosure: { value: false },
        },
        isMapVisible: false,
      },
      { cat1: ['total'] },
    );

    // Fetch recently sold count
    const soldData = await search(
      {
        mapBounds: defaultBounds,
        regionSelection: [{ regionId: params.region_id, regionType }],
        filterState: {
          isRecentlySold: { value: true },
          isForSaleByAgent: { value: false },
          isForSaleByOwner: { value: false },
          isNewConstruction: { value: false },
          isComingSoon: { value: false },
          isAuction: { value: false },
          isForSaleForeclosure: { value: false },
        },
        isMapVisible: false,
      },
      { cat1: ['total'] },
    );

    return {
      for_sale_total: forSaleData.categoryTotals?.cat1?.totalResultCount ?? 0,
      for_rent_total: rentalData.categoryTotals?.cat1?.totalResultCount ?? 0,
      recently_sold_total: soldData.categoryTotals?.cat1?.totalResultCount ?? 0,
    };
  },
});
