import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { autocomplete, search } from '../zillow-api.js';
import { listingSchema, mapListing } from './schemas.js';

export const searchByAddress = defineTool({
  name: 'search_by_address',
  displayName: 'Search by Address',
  description:
    'Look up a specific property by its street address. First resolves the address to coordinates via autocomplete, then searches for matching properties nearby. Returns the closest matching listing with full details including Zestimate, tax assessment, and rental estimate.',
  summary: 'Look up a property by street address',
  icon: 'map-pin',
  group: 'Properties',
  input: z.object({
    address: z.string().min(1).describe('Street address to look up (e.g., "123 Main St, San Francisco, CA")'),
  }),
  output: z.object({
    listings: z.array(listingSchema).describe('Matching properties (usually 1 for exact address match)'),
  }),
  handle: async params => {
    const results = await autocomplete(params.address);
    const addressResult = results.find(r => r.resultType === 'Address');

    if (!addressResult?.metaData?.lat || !addressResult?.metaData?.lng) {
      throw ToolError.notFound(`No property found for address: ${params.address}`);
    }

    const lat = addressResult.metaData.lat;
    const lng = addressResult.metaData.lng;
    const delta = 0.005;

    const data = await search(
      {
        mapBounds: {
          west: lng - delta,
          east: lng + delta,
          south: lat - delta,
          north: lat + delta,
        },
        filterState: {},
        isMapVisible: true,
      },
      { cat1: ['listResults'] },
    );

    const listings = data.cat1?.searchResults?.listResults ?? [];

    // If autocomplete returned a zpid, filter to that specific property
    if (addressResult.metaData.zpid) {
      const zpidStr = String(addressResult.metaData.zpid);
      const match = listings.filter(l => l.zpid === zpidStr);
      if (match.length > 0) {
        return { listings: match.map(mapListing) };
      }
    }

    return { listings: listings.slice(0, 5).map(mapListing) };
  },
});
