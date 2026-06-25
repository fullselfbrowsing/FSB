import { defineTool, fetchJSON, fetchText } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapProduct, productSchema, type RawPriceBlock } from './schemas.js';

export const searchProducts = defineTool({
  name: 'search_products',
  displayName: 'Search Products',
  description:
    "Search the Best Buy product catalog by keyword. Returns product name, price, brand, rating, and availability. Results are from the user's local store for pricing and availability.",
  summary: 'Search for products on Best Buy',
  icon: 'search',
  group: 'Products',
  input: z.object({
    keyword: z.string().describe('Search keyword (e.g., "airpods", "4K TV", "laptop")'),
    count: z.number().int().min(1).max(24).optional().describe('Number of results (default 10, max 24)'),
  }),
  output: z.object({
    products: z.array(productSchema).describe('Matching products with pricing and availability'),
  }),
  handle: async params => {
    const max = params.count ?? 10;
    const searchUrl = `/site/searchpage.jsp?st=${encodeURIComponent(params.keyword)}`;
    const html = await fetchText(searchUrl);

    // Extract SKU IDs from the search results HTML
    const skuIds = new Set<string>();
    for (const m of html.matchAll(/data-sku-id="(\d+)"/g)) {
      if (m[1]) skuIds.add(m[1]);
    }

    // Fallback: look for "skuId":"XXXXXX" patterns in embedded JSON
    if (skuIds.size === 0) {
      for (const m of html.matchAll(/"skuId"\s*:\s*"(\d+)"/g)) {
        if (m[1]) skuIds.add(m[1]);
      }
    }

    if (skuIds.size === 0) {
      return { products: [] };
    }

    // Limit to requested count and fetch product details
    const limitedSkus = [...skuIds].slice(0, max);
    const blocks = await fetchJSON<RawPriceBlock[]>(`/api/3.0/priceBlocks?skus=${limitedSkus.join(',')}`);

    const products = (blocks ?? []).map(mapProduct).filter(p => p.name !== '');
    return { products };
  },
});
