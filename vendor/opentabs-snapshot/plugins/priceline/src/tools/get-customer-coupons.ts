import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../priceline-api.js';

const PERSISTED_HASH = 'a1131592ee367b7b6dbe778e942d09d7d0219d5eacf47810a1894116d7454b6d';

interface CouponData {
  customerCoupons?: Array<{
    couponCode?: string;
    description?: string;
    expirationDate?: string;
    minSpend?: number;
    discount?: number;
    discountType?: string;
  }>;
}

interface CouponError {
  customerCouponError?: string;
  __typename?: string;
}

interface CouponsResponse {
  customerCoupons?: CouponData | CouponError;
}

const isCouponError = (v: CouponData | CouponError): v is CouponError => {
  return 'customerCouponError' in v;
};

export const getCustomerCoupons = defineTool({
  name: 'get_customer_coupons',
  displayName: 'Get Customer Coupons',
  description:
    'Get available coupons for the authenticated user. Coupons can be filtered by product type (STAY, FLY, DRIVE). Returns coupon codes, descriptions, expiration dates, and discount amounts.',
  summary: 'Get your available coupons',
  icon: 'ticket',
  group: 'Account',
  input: z.object({
    product: z.enum(['STAY', 'FLY', 'DRIVE']).optional().describe('Product type to filter coupons (default STAY)'),
  }),
  output: z.object({
    coupons: z
      .array(
        z.object({
          coupon_code: z.string().describe('Coupon code'),
          description: z.string().describe('Coupon description'),
          expiration_date: z.string().describe('Expiration date'),
          min_spend: z.number().describe('Minimum spend amount'),
          discount: z.number().describe('Discount amount'),
          discount_type: z.string().describe('Discount type (PERCENT, FIXED)'),
        }),
      )
      .describe('Available coupons'),
    message: z.string().describe('Status message (e.g., no coupons found)'),
  }),
  handle: async params => {
    const data = await graphql<CouponsResponse>(
      'CustomerCoupons',
      {
        customerRequestOptions: {
          products: [params.product ?? 'STAY'],
        },
      },
      PERSISTED_HASH,
    );

    const result = data.customerCoupons;
    if (!result || isCouponError(result)) {
      return {
        coupons: [],
        message: (result as CouponError | undefined)?.customerCouponError ?? 'No coupons available',
      };
    }

    const couponData = result as CouponData;
    const coupons = (couponData.customerCoupons ?? []).map(c => ({
      coupon_code: c.couponCode ?? '',
      description: c.description ?? '',
      expiration_date: c.expirationDate ?? '',
      min_spend: c.minSpend ?? 0,
      discount: c.discount ?? 0,
      discount_type: c.discountType ?? '',
    }));

    return { coupons, message: coupons.length > 0 ? 'OK' : 'No coupons available' };
  },
});
