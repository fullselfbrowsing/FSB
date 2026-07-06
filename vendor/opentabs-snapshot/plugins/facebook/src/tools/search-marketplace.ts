import { defineTool, fetchFromPage } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { marketplaceListingSchema, mapMarketplaceListing } from './schemas.js';

export const searchMarketplace = defineTool({
  name: 'search_marketplace',
  displayName: 'Search Marketplace',
  description:
    'Search Facebook Marketplace for items. Fetches the marketplace search page and extracts listing data from the server-rendered response. ' +
    'Returns listings with title, price, seller, location, and image.',
  summary: 'Search Marketplace listings',
  icon: 'shopping-bag',
  group: 'Marketplace',
  input: z.object({
    query: z.string().describe("Search keywords (e.g., 'laptop', 'couch')"),
  }),
  output: z.object({
    listings: z.array(marketplaceListingSchema),
    search_url: z.string().describe('URL to view full marketplace search results'),
  }),
  handle: async params => {
    const searchUrl = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(params.query)}`;

    // Fetch the marketplace search page HTML (same-origin, cookies included)
    const resp = await fetchFromPage(searchUrl, {
      headers: { Accept: 'text/html' },
    });
    const html = await resp.text();

    // Extract SSR preloaded listing data from embedded JSON scripts
    const listings: Array<{
      id: string;
      title: string;
      price: string;
      price_amount: string;
      location: string;
      seller_name: string;
      image_url: string;
      is_sold: boolean;
      category_id: string;
    }> = [];

    // Find JSON blobs in the HTML containing marketplace data
    // Facebook embeds Relay preloader data in script tags
    const scriptPattern = /<!--\s*-->(?:<script[^>]*type="application\/json"[^>]*>)([\s\S]*?)(?:<\/script>)/g;
    const allScripts = [...html.matchAll(scriptPattern)].map(m => m[1]);

    // Also try the simpler pattern
    const simplePattern = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
    for (const m of html.matchAll(simplePattern)) {
      allScripts.push(m[1]);
    }

    for (const scriptContent of allScripts) {
      if (!scriptContent?.includes('MarketplaceSearchContentContainer')) continue;

      try {
        const data = JSON.parse(scriptContent ?? '');
        const reqs: unknown[] = data?.require ?? [];
        for (const req of reqs) {
          const r = req as unknown[];
          if (r[0] !== 'ScheduledServerJS') continue;
          const bboxes = (r[3] ?? []) as Array<{
            __bbox?: { require?: unknown[] };
          }>;
          for (const bbox of bboxes) {
            const innerReqs = (bbox?.__bbox?.require ?? []) as Array<unknown[]>;
            for (const inner of innerReqs) {
              if (inner[0] !== 'RelayPrefetchedStreamCache' || inner[1] !== 'next') continue;
              const args = inner[3] as unknown[] | undefined;
              const key = args?.[0] as string | undefined;
              if (!key?.includes('MarketplaceSearchContentContainer')) continue;

              const payload = args?.[1] as { __bbox?: { result?: { data?: Record<string, unknown> } } } | undefined;
              const resultData = payload?.__bbox?.result?.data;
              const search = resultData?.marketplace_search as { feed_units?: { edges?: unknown[] } } | undefined;
              const edges = (search?.feed_units?.edges ?? []) as Array<{
                node?: { listing?: Record<string, unknown> };
              }>;

              for (const edge of edges) {
                if (!edge.node?.listing) continue;
                listings.push(mapMarketplaceListing({ node: { listing: edge.node.listing } }));
              }
            }
          }
        }
      } catch {
        // Skip unparseable scripts
      }
    }

    return { listings, search_url: searchUrl };
  },
});
