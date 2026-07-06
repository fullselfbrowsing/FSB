import { z } from 'zod';
import { stripHtml } from '../walmart-api.js';

// ---------------------------------------------------------------------------
// User / Account
// ---------------------------------------------------------------------------

export const userProfileSchema = z.object({
  first_name: z.string().describe('First name'),
  last_name_initial: z.string().describe('Last name initial'),
  email: z.string().describe('Email address (may be empty for privacy)'),
  ceid: z.string().describe('Customer encrypted ID'),
});

export interface RawUserProfile {
  firstName?: string;
  lastName?: string;
  lastNameInitial?: string;
  emailAddress?: string;
  ceid?: string;
}

export const mapUserProfile = (u: RawUserProfile) => ({
  first_name: u.firstName ?? '',
  last_name_initial: u.lastNameInitial ?? u.lastName ?? '',
  email: u.emailAddress ?? '',
  ceid: u.ceid ?? '',
});

// ---------------------------------------------------------------------------
// Search Result Item
// ---------------------------------------------------------------------------

export const searchItemSchema = z.object({
  us_item_id: z.string().describe('Walmart US item ID'),
  name: z.string().describe('Product name'),
  brand: z.string().describe('Brand name'),
  price: z.string().describe('Display price (e.g., "$499.00")'),
  price_value: z.number().describe('Numeric price in USD'),
  was_price: z.string().describe('Original price if on sale, empty otherwise'),
  average_rating: z.number().describe('Average customer rating (0-5)'),
  num_reviews: z.number().int().describe('Number of customer reviews'),
  image_url: z.string().describe('Product thumbnail image URL'),
  url: z.string().describe('Relative product page URL'),
  availability: z.string().describe('Availability status (e.g., "IN_STOCK")'),
  fulfillment_badge: z.string().describe('Fulfillment info (e.g., "2-day shipping")'),
  seller_name: z.string().describe('Seller name'),
  snap_eligible: z.boolean().describe('Whether item is SNAP/EBT eligible'),
});

export interface RawSearchItem {
  usItemId?: string;
  name?: string;
  brand?: string;
  priceInfo?: {
    linePrice?: string;
    linePriceDisplay?: string;
    currentPrice?: { price?: number; priceString?: string };
    wasPrice?: string;
  };
  averageRating?: number;
  numberOfReviews?: number;
  imageInfo?: { thumbnailUrl?: string };
  canonicalUrl?: string;
  availabilityStatusV2?: { value?: string; display?: string };
  fulfillmentBadge?: string;
  fulfillmentBadges?: string[];
  sellerName?: string;
  snapEligible?: boolean;
}

export const mapSearchItem = (i: RawSearchItem) => ({
  us_item_id: i.usItemId ?? '',
  name: i.name ?? '',
  brand: i.brand ?? '',
  price: i.priceInfo?.linePriceDisplay ?? i.priceInfo?.linePrice ?? i.priceInfo?.currentPrice?.priceString ?? '',
  price_value: i.priceInfo?.currentPrice?.price ?? 0,
  was_price: i.priceInfo?.wasPrice ?? '',
  average_rating: i.averageRating ?? 0,
  num_reviews: i.numberOfReviews ?? 0,
  image_url: i.imageInfo?.thumbnailUrl ?? '',
  url: i.canonicalUrl ?? '',
  availability: i.availabilityStatusV2?.value ?? '',
  fulfillment_badge: i.fulfillmentBadge ?? (i.fulfillmentBadges ? i.fulfillmentBadges.join(', ') : ''),
  seller_name: i.sellerName ?? '',
  snap_eligible: i.snapEligible ?? false,
});

// ---------------------------------------------------------------------------
// Product Detail
// ---------------------------------------------------------------------------

export const productDetailSchema = z.object({
  us_item_id: z.string().describe('Walmart US item ID'),
  name: z.string().describe('Product name'),
  brand: z.string().describe('Brand name'),
  short_description: z.string().describe('Short product description'),
  long_description: z.string().describe('Long product description (plain text)'),
  price: z.string().describe('Display price (e.g., "$499.00")'),
  price_value: z.number().describe('Numeric price in USD'),
  was_price: z.string().describe('Original price if on sale'),
  average_rating: z.number().describe('Average customer rating (0-5)'),
  num_reviews: z.number().int().describe('Number of customer reviews'),
  image_url: z.string().describe('Main product image URL'),
  url: z.string().describe('Relative product page URL'),
  availability: z.string().describe('Availability status'),
  seller_name: z.string().describe('Seller name'),
  seller_id: z.string().describe('Seller ID'),
  item_type: z.string().describe('Item type (e.g., "REGULAR")'),
  upc: z.string().describe('Universal Product Code'),
  category: z.string().describe('Product category path'),
  fulfillment_summary: z.array(z.string()).describe('Fulfillment options (shipping, pickup, delivery)'),
  specifications: z
    .array(
      z.object({
        name: z.string().describe('Specification name'),
        value: z.string().describe('Specification value'),
      }),
    )
    .describe('Product specifications'),
  highlights: z.array(z.string()).describe('Product highlights'),
  snap_eligible: z.boolean().describe('Whether item is SNAP/EBT eligible'),
  return_policy: z.string().describe('Return policy text'),
});

export interface RawProduct {
  usItemId?: string;
  name?: string;
  brand?: string;
  shortDescription?: string;
  canonicalUrl?: string;
  priceInfo?: {
    currentPrice?: { price?: number; priceString?: string };
    wasPrice?: string;
  };
  averageRating?: number;
  numberOfReviews?: number;
  imageInfo?: {
    thumbnailUrl?: string;
    allImages?: Array<{ url?: string }>;
  };
  availabilityStatus?: string;
  availabilityStatusV2?: { value?: string };
  sellerName?: string;
  sellerDisplayName?: string;
  sellerId?: string;
  type?: string;
  upc?: string;
  category?: { path?: Array<{ name?: string }> };
  fulfillmentLabel?: Array<{ message?: string }>;
  snapEligible?: boolean;
  returnPolicy?: { returnable?: boolean; freeReturns?: boolean; returnPolicyText?: string };
}

export interface RawIdml {
  longDescription?: string;
  shortDescription?: string;
  specifications?: Array<{ name?: string; value?: string }>;
  productHighlights?: Array<{ name?: string; value?: string }>;
}

export const mapProductDetail = (p: RawProduct, idml?: RawIdml) => ({
  us_item_id: p.usItemId ?? '',
  name: p.name ?? '',
  brand: p.brand ?? '',
  short_description: stripHtml(p.shortDescription),
  long_description: stripHtml(idml?.longDescription),
  price: p.priceInfo?.currentPrice?.priceString ?? '',
  price_value: p.priceInfo?.currentPrice?.price ?? 0,
  was_price: p.priceInfo?.wasPrice ?? '',
  average_rating: p.averageRating ?? 0,
  num_reviews: p.numberOfReviews ?? 0,
  image_url: p.imageInfo?.thumbnailUrl ?? '',
  url: p.canonicalUrl ?? '',
  availability: p.availabilityStatusV2?.value ?? p.availabilityStatus ?? '',
  seller_name: p.sellerDisplayName ?? p.sellerName ?? '',
  seller_id: p.sellerId ?? '',
  item_type: p.type ?? '',
  upc: p.upc ?? '',
  category: p.category?.path?.map(c => c.name ?? '').join(' > ') ?? '',
  fulfillment_summary: p.fulfillmentLabel?.map(f => f.message ?? '').filter(Boolean) ?? [],
  specifications:
    idml?.specifications?.map(s => ({
      name: s.name ?? '',
      value: stripHtml(s.value),
    })) ?? [],
  highlights: idml?.productHighlights?.map(h => `${h.name ?? ''}: ${h.value ?? ''}`) ?? [],
  snap_eligible: p.snapEligible ?? false,
  return_policy: p.returnPolicy?.returnPolicyText ?? '',
});

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export const reviewSchema = z.object({
  title: z.string().describe('Review title'),
  text: z.string().describe('Review body text'),
  rating: z.number().describe('Rating (1-5)'),
  author: z.string().describe('Review author display name'),
  date: z.string().describe('Review submission date'),
  positive_feedback: z.number().int().describe('Number of positive votes'),
  negative_feedback: z.number().int().describe('Number of negative votes'),
});

export interface RawReview {
  reviewTitle?: string;
  reviewText?: string;
  rating?: number;
  userNickname?: string;
  reviewSubmissionTime?: string;
  positiveFeedback?: number;
  negativeFeedback?: number;
}

export const mapReview = (r: RawReview) => ({
  title: r.reviewTitle ?? '',
  text: r.reviewText ?? '',
  rating: r.rating ?? 0,
  author: r.userNickname ?? '',
  date: r.reviewSubmissionTime ?? '',
  positive_feedback: r.positiveFeedback ?? 0,
  negative_feedback: r.negativeFeedback ?? 0,
});

// ---------------------------------------------------------------------------
// Review Summary
// ---------------------------------------------------------------------------

export const reviewSummarySchema = z.object({
  average_rating: z.number().describe('Average rating (0-5)'),
  total_reviews: z.number().int().describe('Total number of reviews'),
  recommended_percentage: z.number().describe('Percentage of customers who recommend this product'),
  five_star_count: z.number().int().describe('Count of 5-star reviews'),
  four_star_count: z.number().int().describe('Count of 4-star reviews'),
  three_star_count: z.number().int().describe('Count of 3-star reviews'),
  two_star_count: z.number().int().describe('Count of 2-star reviews'),
  one_star_count: z.number().int().describe('Count of 1-star reviews'),
});

export interface RawReviewSummary {
  averageOverallRating?: number;
  roundedAverageOverallRating?: number;
  totalReviewCount?: number;
  recommendedPercentage?: number;
  ratingValueFiveCount?: number;
  ratingValueFourCount?: number;
  ratingValueThreeCount?: number;
  ratingValueTwoCount?: number;
  ratingValueOneCount?: number;
}

export const mapReviewSummary = (r: RawReviewSummary) => ({
  average_rating: r.roundedAverageOverallRating ?? r.averageOverallRating ?? 0,
  total_reviews: r.totalReviewCount ?? 0,
  recommended_percentage: r.recommendedPercentage ?? 0,
  five_star_count: r.ratingValueFiveCount ?? 0,
  four_star_count: r.ratingValueFourCount ?? 0,
  three_star_count: r.ratingValueThreeCount ?? 0,
  two_star_count: r.ratingValueTwoCount ?? 0,
  one_star_count: r.ratingValueOneCount ?? 0,
});

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export const orderItemSchema = z.object({
  name: z.string().describe('Item name'),
  image_url: z.string().describe('Item thumbnail image URL'),
  quantity: z.number().int().describe('Quantity ordered'),
  status: z.string().describe('Item delivery status (e.g., "Delivered on Feb 24")'),
});

export interface RawOrderItem {
  name?: string;
  imageInfo?: { thumbnailUrl?: string };
  quantity?: number;
}

export interface RawOrderGroup {
  status?: { message?: { parts?: Array<{ text?: string }> } };
  items?: RawOrderItem[];
  fulfillmentType?: string;
  deliveryMessage?: string;
}

export const orderSchema = z.object({
  order_id: z.string().describe('Order ID'),
  display_id: z.string().describe('Display-friendly order ID'),
  order_date: z.string().describe('Order date'),
  title: z.string().describe('Order title (e.g., "Feb 21, 2026 order")'),
  item_count: z.number().int().describe('Total number of items in order'),
  is_in_store: z.boolean().describe('Whether this was an in-store purchase'),
  items: z.array(orderItemSchema).describe('Order items with status'),
});

export interface RawOrder {
  id?: string;
  displayId?: string;
  orderDate?: string;
  title?: string;
  shortTitle?: string;
  itemCount?: number;
  isInStore?: boolean;
  groups?: RawOrderGroup[];
}

export const mapOrder = (o: RawOrder) => {
  const items: Array<{
    name: string;
    image_url: string;
    quantity: number;
    status: string;
  }> = [];

  for (const group of o.groups ?? []) {
    const statusText = group.status?.message?.parts?.map(p => p.text ?? '').join('') ?? '';
    for (const item of group.items ?? []) {
      items.push({
        name: item.name ?? '',
        image_url: item.imageInfo?.thumbnailUrl ?? '',
        quantity: item.quantity ?? 1,
        status: statusText,
      });
    }
  }

  return {
    order_id: o.id ?? '',
    display_id: o.displayId ?? '',
    order_date: o.orderDate ?? '',
    title: o.shortTitle ?? o.title ?? '',
    item_count: o.itemCount ?? items.length,
    is_in_store: o.isInStore ?? false,
    items,
  };
};
