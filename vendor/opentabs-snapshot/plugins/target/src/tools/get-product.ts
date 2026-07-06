import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { redskyApi } from '../target-api.js';
import { productDetailSchema, mapProductDetail } from './schemas.js';
import type { RawProductDetail } from './schemas.js';

interface ProductResponse {
  data?: { product?: RawProductDetail };
}

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description:
    'Get detailed information about a Target product by its TCIN (Target item number). Returns title, description, price, brand, rating, reviews, bullet features, and image. Use search_products to find TCINs.',
  summary: 'Get product details by TCIN',
  icon: 'package',
  group: 'Products',
  input: z.object({
    tcin: z.string().describe('Target item number (TCIN) — e.g., "85978618"'),
  }),
  output: z.object({ product: productDetailSchema }),
  handle: async params => {
    const data = await redskyApi<ProductResponse>('redsky_aggregations/v1/web/pdp_client_v1', {
      tcin: params.tcin,
      has_pricing_store_id: true,
      has_store_positions_store_id: true,
    });
    return { product: mapProductDetail(data.data?.product ?? {}) };
  },
});
