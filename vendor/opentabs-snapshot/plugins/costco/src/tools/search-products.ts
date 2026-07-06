import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchProducts } from '../costco-api.js';
import { mapProduct, productSchema } from './schemas.js';

export const searchProducts = defineTool({
  name: 'search_products',
  displayName: 'Search Products',
  description:
    'Search for products on Costco by reading the current search results page and enriching with full product details from the API. The browser must already be on a Costco search results page — call navigate_to_search first to navigate to the search page, wait for it to load, then call this tool to extract and enrich the results.',
  summary: 'Extract and enrich products from the current search page',
  icon: 'search',
  group: 'Products',
  input: z.object({
    max_results: z
      .number()
      .int()
      .min(1)
      .max(24)
      .optional()
      .describe('Maximum number of results to return (default 10, max 24)'),
  }),
  output: z.object({
    results: z.array(productSchema).describe('Product search results with full details'),
    total_found: z.number().int().describe('Number of unique products found on the search page'),
  }),
  handle: async params => {
    const max = params.max_results ?? 10;

    // Extract item numbers from the already-rendered search results DOM
    const itemNumbers = extractItemNumbersFromDom(max);
    if (itemNumbers.length === 0) {
      throw ToolError.validation(
        'No search results found on the current page. Call navigate_to_search with a keyword first, then retry.',
      );
    }

    // Enrich with full product data via the GraphQL API
    const resp = await fetchProducts(itemNumbers);
    const catalog = resp.data?.products?.catalogData ?? [];
    const fulfillment = resp.data?.products?.fulfillmentData ?? [];
    const fulfillmentMap = new Map(fulfillment.map(f => [f.itemNumber ?? '', f]));

    return {
      results: catalog.map(c => mapProduct(c, fulfillmentMap.get(c.itemNumber ?? ''))),
      total_found: itemNumbers.length,
    };
  },
});

/** Extract unique product item numbers from the current search results DOM. */
const extractItemNumbersFromDom = (max: number): string[] => {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*=".product."]');
  const seen = new Set<string>();
  const items: string[] = [];

  for (const link of links) {
    const match = link.href.match(/\.product\.(\d+)\.html/);
    if (!match) continue;

    const itemNumber = match[1] ?? '';
    if (!itemNumber || seen.has(itemNumber)) continue;

    // Skip non-product links (e.g., "See Details" buttons)
    const name = link.textContent?.trim() ?? '';
    if (!name || name === 'See Details') continue;

    seen.add(itemNumber);
    items.push(itemNumber);
    if (items.length >= max) break;
  }

  return items;
};
