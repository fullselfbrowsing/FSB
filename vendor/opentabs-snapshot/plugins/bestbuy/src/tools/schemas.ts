import { z } from 'zod';

// --- Customer ---

export const customerSchema = z.object({
  id: z.string().describe('Best Buy global user ID (UUID)'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  email: z.string().describe('Email address'),
  phone: z.string().describe('Phone number'),
  loyalty_member_id: z.string().describe('My Best Buy rewards member ID'),
  loyalty_tier: z.string().describe('Loyalty tier (e.g., "CORE TIER")'),
  loyalty_tier_code: z.string().describe('Loyalty tier code'),
});

export interface RawCustomerPrimaryInfo {
  primaryEmailAddress?: string;
  phone?: {
    countryCode?: string;
    areaCode?: string;
    number?: string;
    type?: string;
  };
}

export const mapCustomer = (
  pageCustomer: {
    globalBbyId?: string;
    firstName?: string;
    lastName?: string;
    emailAddress?: string;
    loyaltyMemberId?: string;
    loyaltyMemberType?: string;
    loyaltyTierCode?: string;
  },
  primaryInfo: RawCustomerPrimaryInfo,
) => {
  const phone = primaryInfo.phone;
  const phoneNumber = phone ? `${phone.areaCode ?? ''}${phone.number ?? ''}` : '';

  return {
    id: pageCustomer.globalBbyId ?? '',
    first_name: pageCustomer.firstName ?? '',
    last_name: pageCustomer.lastName ?? '',
    email: primaryInfo.primaryEmailAddress ?? pageCustomer.emailAddress ?? '',
    phone: phoneNumber,
    loyalty_member_id: pageCustomer.loyaltyMemberId ?? '',
    loyalty_tier: pageCustomer.loyaltyMemberType ?? '',
    loyalty_tier_code: pageCustomer.loyaltyTierCode ?? '',
  };
};

// --- Credit Card ---

export const creditCardSchema = z.object({
  id: z.string().describe('Card ID'),
  type: z.string().describe('Card type (e.g., "MASTERCARD", "VISA")'),
  last_4_digits: z.string().describe('Last 4 digits of card number'),
  expiration: z.string().describe('Expiration date (MM/YYYY)'),
  is_default: z.boolean().describe('Whether this is the primary payment method'),
  cardholder_name: z.string().describe('Name on card'),
  billing_address: z.string().describe('Billing address summary'),
});

export interface RawCreditCard {
  id?: string;
  type?: string;
  last4Digits?: string;
  expirationDate?: { month?: string; year?: string; date?: string };
  default?: boolean;
  cardHolderName?: string;
  billingAddress?: {
    addressLine1?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export const mapCreditCard = (c: RawCreditCard) => ({
  id: c.id ?? '',
  type: c.type ?? '',
  last_4_digits: c.last4Digits ?? '',
  expiration: c.expirationDate?.date ?? '',
  is_default: c.default ?? false,
  cardholder_name: c.cardHolderName ?? '',
  billing_address: c.billingAddress
    ? [c.billingAddress.addressLine1, c.billingAddress.city, c.billingAddress.state, c.billingAddress.zip]
        .filter(Boolean)
        .join(', ')
    : '',
});

// --- Product Image ---

export const productImageSchema = z.object({
  url: z.string().describe('Image URL'),
  alt_text: z.string().describe('Image alt text'),
});

interface RawImage {
  href?: string;
  piscesHref?: string;
  altText?: string;
}

export const mapImage = (img?: RawImage) => ({
  url: img?.piscesHref ?? img?.href ?? '',
  alt_text: img?.altText ?? '',
});

// --- Order Line Item ---

export const orderLineSchema = z.object({
  id: z.string().describe('Line item ID'),
  sku_id: z.string().describe('Best Buy SKU ID'),
  name: z.string().describe('Product short name'),
  brand: z.string().describe('Product brand'),
  model: z.string().describe('Product model number'),
  current_price: z.number().describe('Current product price in USD'),
  quantity: z.number().int().describe('Quantity purchased'),
  fulfillment_type: z.string().describe('Fulfillment type (e.g., "inStorePickup", "shipping")'),
  status: z.string().describe('Tracking status (e.g., "Delivered", "Returned")'),
  image: productImageSchema.describe('Product thumbnail image'),
  product_url: z.string().describe('URL to the product page'),
});

interface RawProductLink {
  linkUri?: string;
  linkLabel?: string;
}

interface RawSku {
  id?: string;
  shortDesc?: string;
  brand?: string;
  model?: string;
  currentPrice?: number;
  image?: RawImage;
  productLinks?: RawProductLink[];
  productV2?: { namesShort?: string };
}

export interface RawOrderLine {
  id?: string;
  skuId?: string;
  sku?: RawSku;
  quantity?: number;
  fulfillmentType?: string;
  trackerInfo?: { status?: string };
}

export const mapOrderLine = (l: RawOrderLine) => {
  const pdpLink = l.sku?.productLinks?.find(p => p.linkLabel === 'pdpUrl');
  return {
    id: l.id ?? '',
    sku_id: l.skuId ?? l.sku?.id ?? '',
    name: l.sku?.productV2?.namesShort ?? l.sku?.shortDesc ?? '',
    brand: l.sku?.brand ?? '',
    model: l.sku?.model ?? '',
    current_price: l.sku?.currentPrice ?? 0,
    quantity: l.quantity ?? 1,
    fulfillment_type: l.fulfillmentType ?? '',
    status: l.trackerInfo?.status ?? '',
    image: mapImage(l.sku?.image),
    product_url: pdpLink?.linkUri ?? '',
  };
};

// --- Order ---

export const orderSchema = z.object({
  id: z.string().describe('Order ID or receipt number'),
  channel: z.string().describe('Purchase channel (e.g., "STORE PURCHASE", "ONLINE ORDER")'),
  date: z.string().describe('Purchase date in ISO 8601 format'),
  total: z.number().describe('Order total in USD (negative for returns)'),
  is_marketplace: z.boolean().describe('Whether this is a marketplace order'),
  line_count: z.number().int().describe('Number of line items'),
  items: z.array(orderLineSchema).describe('Line items in this order'),
});

export interface RawOrder {
  id?: string;
  channel?: string;
  date?: string;
  amount?: { total?: number };
  isMarketPlaceOrder?: boolean;
  lines?: RawOrderLine[];
}

export const mapOrder = (o: RawOrder) => ({
  id: o.id ?? '',
  channel: o.channel ?? '',
  date: o.date ?? '',
  total: o.amount?.total ?? 0,
  is_marketplace: o.isMarketPlaceOrder ?? false,
  line_count: o.lines?.length ?? 0,
  items: (o.lines ?? []).map(mapOrderLine),
});

// --- Purchase Detail ---

export const purchaseDetailSchema = z.object({
  purchase_key: z.string().describe('In-store purchase key'),
  receipt_text: z.string().describe('Full receipt text'),
  has_pdf: z.boolean().describe('Whether a PDF download is available'),
});

export interface RawPurchaseDetail {
  purchase?: {
    receiptData?: string;
    purchaseKey?: string;
    downloadAsPdfEnabled?: boolean;
  };
}

export const mapPurchaseDetail = (d: RawPurchaseDetail) => {
  let receiptText = '';
  if (d.purchase?.receiptData) {
    try {
      receiptText = atob(d.purchase.receiptData);
    } catch {
      receiptText = d.purchase.receiptData;
    }
  }
  return {
    purchase_key: d.purchase?.purchaseKey ?? '',
    receipt_text: receiptText,
    has_pdf: d.purchase?.downloadAsPdfEnabled ?? false,
  };
};

// --- Plan ---

export const planSchema = z.object({
  id: z.string().describe('Plan ID'),
  name: z.string().describe('Plan name'),
  type: z.string().describe('Plan type'),
  status: z.string().describe('Plan status'),
});

export interface RawPlan {
  id?: string;
  name?: string;
  type?: string;
  status?: string;
}

export const mapPlan = (p: RawPlan) => ({
  id: p.id ?? '',
  name: p.name ?? '',
  type: p.type ?? '',
  status: p.status ?? '',
});

// --- Product (from priceBlocks API) ---

export const productSchema = z.object({
  sku_id: z.string().describe('Best Buy SKU ID'),
  name: z.string().describe('Product short name'),
  brand: z.string().describe('Product brand'),
  current_price: z.number().describe('Current price in USD'),
  regular_price: z.number().describe('Regular (non-sale) price in USD'),
  on_sale: z.boolean().describe('Whether the product is currently on sale'),
  savings: z.number().describe('Savings amount in USD (0 if not on sale)'),
  condition: z.string().describe('Product condition (e.g., "new", "refurbished")'),
  purchasable: z.boolean().describe('Whether the product can be added to cart'),
  button_state: z.string().describe('Cart button state (e.g., "ADD_TO_CART", "SOLD_OUT")'),
  url: z.string().describe('Relative URL to the product page'),
  department: z.string().describe('Product department (e.g., "COMPUTERS")'),
  category: z.string().describe('Product class (e.g., "LAPTOP COMPUTERS")'),
  subcategory: z.string().describe('Product subclass (e.g., "TRADITIONAL LAPTOPS")'),
  product_type: z.string().describe('Product type (e.g., "hardgood", "software")'),
});

export interface RawPriceBlockSku {
  skuId?: string;
  names?: { short?: string };
  brand?: { brand?: string };
  price?: {
    currentPrice?: number;
    regularPrice?: number;
    pricingType?: string;
    savingsAmount?: number;
  };
  buttonState?: {
    purchasable?: boolean;
    buttonState?: string;
    displayText?: string;
    skuId?: string;
  };
  condition?: string;
  url?: string;
  class?: { displayName?: string };
  department?: { displayName?: string };
  subclass?: { displayName?: string };
  productType?: string;
}

export interface RawPriceBlock {
  sku?: RawPriceBlockSku;
}

export const mapProduct = (block: RawPriceBlock) => {
  const s = block.sku;
  return {
    sku_id: s?.skuId ?? '',
    name: s?.names?.short ?? '',
    brand: s?.brand?.brand ?? '',
    current_price: s?.price?.currentPrice ?? 0,
    regular_price: s?.price?.regularPrice ?? 0,
    on_sale: s?.price?.pricingType === 'onSale',
    savings: s?.price?.savingsAmount ?? 0,
    condition: s?.condition ?? '',
    purchasable: s?.buttonState?.purchasable ?? false,
    button_state: s?.buttonState?.buttonState ?? '',
    url: s?.url ?? '',
    department: s?.department?.displayName ?? '',
    category: s?.class?.displayName ?? '',
    subcategory: s?.subclass?.displayName ?? '',
    product_type: s?.productType ?? '',
  };
};

// --- Review ---

export const reviewSchema = z.object({
  id: z.string().describe('Review ID'),
  rating: z.number().describe('Star rating (1–5)'),
  title: z.string().describe('Review title'),
  text: z.string().describe('Review body text'),
  author: z.string().describe('Review author display name'),
  submitted_at: z.string().describe('Submission timestamp in ISO 8601 format'),
  recommended: z.boolean().describe('Whether the reviewer recommends the product'),
  positive_feedback: z.number().int().describe('Number of helpful votes'),
  negative_feedback: z.number().int().describe('Number of unhelpful votes'),
});

export interface RawReview {
  id?: string;
  rating?: number;
  title?: string;
  text?: string;
  author?: { nickname?: string };
  submissionTime?: string;
  recommended?: boolean;
  positiveFeedbackCount?: number;
  negativeFeedbackCount?: number;
}

export const mapReview = (r: RawReview) => ({
  id: r.id ?? '',
  rating: r.rating ?? 0,
  title: r.title ?? '',
  text: r.text ?? '',
  author: r.author?.nickname ?? '',
  submitted_at: r.submissionTime ?? '',
  recommended: r.recommended ?? false,
  positive_feedback: r.positiveFeedbackCount ?? 0,
  negative_feedback: r.negativeFeedbackCount ?? 0,
});

// --- Cart Item ---

export const cartItemSchema = z.object({
  id: z.string().describe('Cart line item ID'),
  sku_id: z.string().describe('Best Buy SKU ID'),
  name: z.string().describe('Product short label'),
  title: z.string().describe('Full product title'),
  quantity: z.number().int().describe('Item quantity'),
  each_price: z.string().describe('Unit price (formatted, e.g., "$144.99")'),
  regular_price: z.string().describe('Regular price before discount (formatted)'),
  savings: z.string().describe('Savings amount (formatted, e.g., "$75.00")'),
  image_url: z.string().describe('Product thumbnail image URL'),
  product_url: z.string().describe('Relative URL to the product page'),
});

export interface RawCartLineItem {
  id?: string;
  quantity?: number;
  item?: {
    skuId?: string;
    shortLabel?: string;
    title?: string;
    imageUrl?: string;
    itemUrl?: string;
    price?: {
      eachPrice?: string;
      regularPrice?: string;
      savingsAmount?: string;
    };
  };
}

export const mapCartItem = (l: RawCartLineItem) => ({
  id: l.id ?? '',
  sku_id: l.item?.skuId ?? '',
  name: l.item?.shortLabel ?? '',
  title: l.item?.title ?? '',
  quantity: l.quantity ?? 1,
  each_price: l.item?.price?.eachPrice ?? '',
  regular_price: l.item?.price?.regularPrice ?? '',
  savings: l.item?.price?.savingsAmount ?? '',
  image_url: l.item?.imageUrl ?? '',
  product_url: l.item?.itemUrl ?? '',
});

// --- Cart ---

export const cartSchema = z.object({
  id: z.string().describe('Cart ID'),
  item_count: z.number().int().describe('Total number of items in cart'),
  subtotal: z.string().describe('Cart subtotal (formatted, e.g., "$368.98")'),
  order_total: z.string().describe('Order total including tax and fees (formatted)'),
  total_savings: z.string().describe('Total savings amount (formatted)'),
  items: z.array(cartItemSchema).describe('Cart line items'),
});

export interface RawCart {
  cart?: {
    id?: string;
    cartItemCount?: string;
    subtotalAmount?: string;
    orderSummary?: {
      orderTotal?: string;
      totalSavings?: string;
    };
    lineItems?: RawCartLineItem[];
  };
}

export const mapCart = (data: RawCart) => {
  const c = data.cart;
  return {
    id: c?.id ?? '',
    item_count: Number.parseInt(c?.cartItemCount ?? '0', 10),
    subtotal: c?.subtotalAmount ?? '',
    order_total: c?.orderSummary?.orderTotal ?? '',
    total_savings: c?.orderSummary?.totalSavings ?? '',
    items: (c?.lineItems ?? []).map(mapCartItem),
  };
};

// --- Add to Cart Response ---

export const addToCartResponseSchema = z.object({
  cart_count: z.number().int().describe('Total items in cart after adding'),
  cart_subtotal: z.number().describe('Cart subtotal in USD after adding'),
});

export interface RawAddToCartResponse {
  cartCount?: number;
  cartSubTotal?: number;
}

export const mapAddToCartResponse = (data: RawAddToCartResponse) => ({
  cart_count: data.cartCount ?? 0,
  cart_subtotal: data.cartSubTotal ?? 0,
});
