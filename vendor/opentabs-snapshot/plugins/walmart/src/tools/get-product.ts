import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPageData } from '../walmart-api.js';
import { mapProductDetail, productDetailSchema, type RawIdml, type RawProduct } from './schemas.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description:
    'Get detailed information about a Walmart product by its US item ID. Returns price, description, specifications, reviews summary, and availability.',
  summary: 'Get product details by item ID',
  icon: 'package',
  group: 'Products',
  input: z.object({
    us_item_id: z.string().describe('Walmart US item ID (numeric string, e.g., "13943258180")'),
  }),
  output: z.object({ product: productDetailSchema }),
  handle: async params => {
    const data = await fetchPageData(`/ip/item/${params.us_item_id}`);

    const initialData = data.initialData as Record<string, unknown> | undefined;
    const innerData = initialData?.data as Record<string, unknown> | undefined;
    const product = innerData?.product as RawProduct | undefined;

    if (!product) {
      throw ToolError.notFound(`Product not found: ${params.us_item_id}`);
    }

    const idml = innerData?.idml as RawIdml | undefined;

    return { product: mapProductDetail(product, idml) };
  },
});
