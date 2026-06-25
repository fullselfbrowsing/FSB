import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bestbuy-api.js';
import { mapPurchaseDetail, purchaseDetailSchema, type RawPurchaseDetail } from './schemas.js';

export const getPurchaseDetails = defineTool({
  name: 'get_purchase_details',
  displayName: 'Get Purchase Details',
  description:
    'Get detailed receipt information for an in-store purchase by its purchase key. The purchase key is in the format "STORENUM RECEIPTNUMBER DATE" (e.g., "1423 005 6042 020124"). Returns the full receipt text including itemized purchases, taxes, totals, and store information. Use list_purchases to find purchase keys for in-store orders.',
  summary: 'Get in-store purchase receipt',
  icon: 'receipt',
  group: 'Purchases',
  input: z.object({
    purchase_key: z
      .string()
      .describe(
        'In-store purchase key (e.g., "1423 005 6042 020124"). Found as the order ID for "STORE PURCHASE" type orders from list_purchases.',
      ),
  }),
  output: z.object({
    details: purchaseDetailSchema.describe('Receipt and purchase detail information'),
  }),
  handle: async params => {
    const encodedKey = encodeURIComponent(params.purchase_key);
    const data = await api<RawPurchaseDetail>(`/purchasehistory/rest/purchase-details?purchaseKey=${encodedKey}`);

    return { details: mapPurchaseDetail(data) };
  },
});
