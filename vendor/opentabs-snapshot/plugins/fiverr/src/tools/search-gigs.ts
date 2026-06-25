import { buildQueryString, defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPerseusProps } from '../fiverr-api.js';
import { gigSummarySchema, mapGigSummary, type RawGigSummary } from './schemas.js';

interface SearchProps {
  // Fiverr embeds a currency descriptor object, not a bare ISO code.
  currency?: { name?: string };
  listings?: Array<{ gigs?: RawGigSummary[] }>;
  rawListingData?: { num_found?: number; has_more?: boolean };
}

export const searchGigs = defineTool({
  name: 'search_gigs',
  displayName: 'Search Gigs',
  description:
    'Search Fiverr for gigs (services) matching a query. Returns a ranked page of gigs with title, ' +
    'seller, level, rating, starting price, and a link to each gig page. Use the `page` parameter to ' +
    'paginate. Pass a gig URL from a result to `get_gig_details` for full information. Reads Fiverr’s ' +
    'server-rendered search page — the most reliable source given Fiverr’s bot protection.',
  summary: 'Search Fiverr gigs by keyword',
  icon: 'search',
  group: 'Gigs',
  input: z.object({
    query: z.string().min(1).describe('Search keywords (e.g., "logo design", "wordpress developer")'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (default 1)'),
  }),
  output: z.object({
    gigs: z.array(gigSummarySchema).describe('Gigs on this page of results'),
    total_found: z.number().describe('Total number of gigs matching the query'),
    has_more: z.boolean().describe('Whether more result pages are available'),
    page: z.number().describe('The page number returned'),
  }),
  handle: async params => {
    const page = params.page ?? 1;
    const qs = buildQueryString({ query: params.query, page });
    const props = (await fetchPerseusProps(`/search/gigs?${qs}`)) as SearchProps;

    const gigs = props.listings?.[0]?.gigs;
    if (!Array.isArray(gigs)) {
      throw ToolError.notFound(`No results found for "${params.query}".`);
    }

    const currency = props.currency?.name ?? 'USD';
    return {
      gigs: gigs.map(g => mapGigSummary(g, currency)),
      total_found: props.rawListingData?.num_found ?? gigs.length,
      has_more: props.rawListingData?.has_more ?? false,
      page,
    };
  },
});
