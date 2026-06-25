import { z } from 'zod';

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const productSummarySchema = z.object({
  item_id: z.string().describe('Product item ID'),
  name: z.string().describe('Product label/name'),
  brand: z.string().describe('Brand name'),
  model_number: z.string().describe('Model number'),
  url: z.string().describe('Product page URL path'),
  image_url: z.string().describe('Primary product image URL'),
  price: z.number().describe('Current price in dollars'),
  original_price: z.number().describe('Original price in dollars (before discount)'),
  unit_of_measure: z.string().describe('Unit of measure (e.g., "each")'),
  average_rating: z.string().describe('Average rating out of 5'),
  total_reviews: z.string().describe('Total number of reviews'),
  availability_type: z.string().describe('Availability status (e.g., "Online", "In Store")'),
});

export interface RawProductSummary {
  itemId?: string;
  identifiers?: {
    itemId?: string;
    productLabel?: string;
    brandName?: string;
    modelNumber?: string;
    storeSkuNumber?: string;
    canonicalUrl?: string;
  };
  media?: { images?: Array<{ url?: string; sizes?: string[] }> };
  pricing?: {
    value?: number;
    original?: number;
    mapAboveOriginalPrice?: boolean;
    message?: string;
    unitOfMeasure?: string;
  };
  reviews?: { ratingsReviews?: { averageRating?: string; totalReviews?: string } };
  availabilityType?: { type?: string; discontinued?: boolean };
}

export const mapProductSummary = (p: RawProductSummary) => ({
  item_id: p.itemId ?? p.identifiers?.itemId ?? '',
  name: p.identifiers?.productLabel ?? '',
  brand: p.identifiers?.brandName ?? '',
  model_number: p.identifiers?.modelNumber ?? '',
  url: p.identifiers?.canonicalUrl ?? '',
  image_url: p.media?.images?.[0]?.url ?? '',
  price: p.pricing?.value ?? 0,
  original_price: p.pricing?.original ?? p.pricing?.value ?? 0,
  unit_of_measure: p.pricing?.unitOfMeasure ?? '',
  average_rating: p.reviews?.ratingsReviews?.averageRating ?? '',
  total_reviews: p.reviews?.ratingsReviews?.totalReviews ?? '',
  availability_type: p.availabilityType?.type ?? '',
});

// ---------------------------------------------------------------------------
// Product Detail (extended)
// ---------------------------------------------------------------------------

export const productDetailSchema = productSummarySchema.extend({
  description: z.string().describe('Product description text'),
  store_sku: z.string().describe('Store SKU number'),
  parent_id: z.string().describe('Parent product ID (for variants)'),
  discontinued: z.boolean().describe('Whether the product is discontinued'),
  fulfillment_options: z.array(z.string()).describe('Available fulfillment types (e.g., "delivery", "pickup")'),
});

export interface RawProductDetail extends RawProductSummary {
  details?: { description?: string; collection?: { name?: string; url?: string } };
  fulfillment?: {
    fulfillmentOptions?: Array<{
      type?: string;
      services?: Array<{
        type?: string;
        locations?: Array<{
          isAnchor?: boolean;
          inventory?: { isInStock?: boolean; isLimitedQuantity?: boolean; quantity?: number };
        }>;
      }>;
    }>;
  };
}

export const mapProductDetail = (p: RawProductDetail) => ({
  ...mapProductSummary(p),
  description: p.details?.description ?? '',
  store_sku: p.identifiers?.storeSkuNumber ?? '',
  parent_id: (p.identifiers as { parentId?: string } | undefined)?.parentId ?? '',
  discontinued: p.availabilityType?.discontinued ?? false,
  fulfillment_options: p.fulfillment?.fulfillmentOptions?.map(o => o.type ?? '') ?? [],
});

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const storeSchema = z.object({
  store_id: z.string().describe('Store ID number'),
  store_name: z.string().describe('Store display name'),
  phone: z.string().describe('Store phone number'),
  street: z.string().describe('Street address'),
  city: z.string().describe('City'),
  state: z.string().describe('State abbreviation'),
  postal_code: z.string().describe('ZIP/postal code'),
  hours: z.record(z.string(), z.string()).describe('Operating hours by day (e.g., { monday: "6:00-22:00" })'),
});

export interface RawStore {
  storeId?: string;
  storeName?: string;
  phone?: string;
  address?: { street?: string; city?: string; state?: string; postalCode?: string };
  storeHours?: Record<string, { open?: string; close?: string }>;
}

export const mapStore = (s: RawStore) => ({
  store_id: s.storeId ?? '',
  store_name: s.storeName ?? '',
  phone: s.phone ?? '',
  street: s.address?.street ?? '',
  city: s.address?.city ?? '',
  state: s.address?.state ?? '',
  postal_code: s.address?.postalCode ?? '',
  hours: Object.fromEntries(
    Object.entries(s.storeHours ?? {}).map(([day, h]) => [day, `${h.open ?? ''}-${h.close ?? ''}`]),
  ),
});

// ---------------------------------------------------------------------------
// Search Result (raw GraphQL shape for the searchModel response)
// ---------------------------------------------------------------------------

export interface RawSearchResult {
  searchReport?: { totalProducts?: number; keyword?: string };
  products?: RawProductSummary[];
}

// ---------------------------------------------------------------------------
// Cart Item
// ---------------------------------------------------------------------------

export const cartItemSchema = z.object({
  id: z.string().describe('Cart line item ID'),
  item_id: z.string().describe('Product item ID'),
  quantity: z.number().int().describe('Quantity in cart'),
  name: z.string().describe('Product name'),
  brand: z.string().describe('Brand name'),
  price: z.number().describe('Item price'),
  image_url: z.string().describe('Product image URL'),
  url: z.string().describe('Product page URL'),
  fulfillment_type: z.string().describe('Fulfillment method (pickup, delivery, etc.)'),
});

export interface RawCartItem {
  id?: string;
  quantity?: number | string;
  product?: {
    itemId?: string;
    identifiers?: {
      productLabel?: string;
      brandName?: string;
      canonicalUrl?: string;
    };
    pricing?: { value?: number; total?: number };
    media?: { images?: Array<{ url?: string }> };
  };
  fulfillmentType?: string;
}

export const mapCartItem = (item: RawCartItem) => ({
  id: item.id ?? '',
  item_id: item.product?.itemId ?? '',
  quantity: Number(item.quantity ?? 0),
  name: item.product?.identifiers?.productLabel ?? '',
  brand: item.product?.identifiers?.brandName ?? '',
  price: item.product?.pricing?.value ?? item.product?.pricing?.total ?? 0,
  image_url: item.product?.media?.images?.[0]?.url ?? '',
  url: item.product?.identifiers?.canonicalUrl ?? '',
  fulfillment_type: item.fulfillmentType ?? '',
});

// ---------------------------------------------------------------------------
// Cart Totals
// ---------------------------------------------------------------------------

export const cartTotalsSchema = z.object({
  total: z.number().nullable().describe('Cart total in dollars'),
  subtotal: z.number().nullable().describe('Cart subtotal before fees'),
  discount: z.number().nullable().describe('Total discount applied'),
  delivery_charge: z.number().nullable().describe('Delivery charge in dollars'),
});

export interface RawCartTotals {
  total?: number | null;
  totalWithNoDiscount?: number | null;
  totalDiscount?: number | null;
  deliveryCharge?: number | null;
}

export const mapCartTotals = (t: RawCartTotals) => ({
  total: t.total ?? null,
  subtotal: t.totalWithNoDiscount ?? null,
  discount: t.totalDiscount ?? null,
  delivery_charge: t.deliveryCharge ?? null,
});

// ---------------------------------------------------------------------------
// Save For Later Item
// ---------------------------------------------------------------------------

export const savedItemSchema = z.object({
  item_id: z.string().describe('Product item ID'),
  name: z.string().describe('Product name'),
  brand: z.string().describe('Brand name'),
  model_number: z.string().describe('Model number'),
  price: z.number().describe('Current price'),
  original_price: z.number().describe('Original price'),
  image_url: z.string().describe('Product image URL'),
  url: z.string().describe('Product page URL'),
  quantity: z.number().int().describe('Saved quantity'),
});

export interface RawSavedItem {
  quantity?: string | number;
  product?: {
    identifiers?: {
      itemId?: string;
      productLabel?: string;
      brandName?: string;
      modelNumber?: string;
      canonicalUrl?: string;
      storeSkuNumber?: string;
      productType?: string;
    };
    pricing?: { value?: number; original?: number; total?: number };
    media?: { images?: Array<{ url?: string }> };
  };
}

export const mapSavedItem = (item: RawSavedItem) => ({
  item_id: item.product?.identifiers?.itemId ?? '',
  name: item.product?.identifiers?.productLabel ?? '',
  brand: item.product?.identifiers?.brandName ?? '',
  model_number: item.product?.identifiers?.modelNumber ?? '',
  price: item.product?.pricing?.value ?? item.product?.pricing?.total ?? 0,
  original_price: item.product?.pricing?.original ?? item.product?.pricing?.value ?? 0,
  image_url: item.product?.media?.images?.[0]?.url ?? '',
  url: item.product?.identifiers?.canonicalUrl ?? '',
  quantity: Number(item.quantity ?? 1),
});
