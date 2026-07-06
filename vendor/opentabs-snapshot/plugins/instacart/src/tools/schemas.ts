import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  email: z.string().describe('Email address'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  full_name: z.string().describe('Full display name'),
  guest: z.boolean().describe('Whether this is a guest account'),
  orders_count: z.number().int().describe('Total number of orders placed'),
  avatar_url: z.string().describe('Avatar image URL'),
  customer_since: z.string().describe('Customer since string (e.g. "Customer since April 2020")'),
});

export interface RawUser {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  guest?: boolean;
  ordersCount?: number;
  viewSection?: {
    avatarImage?: { url?: string };
    customerSinceString?: string;
  };
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  email: u.email ?? '',
  first_name: u.firstName ?? '',
  last_name: u.lastName ?? '',
  full_name: u.fullName ?? '',
  guest: u.guest ?? false,
  orders_count: u.ordersCount ?? 0,
  avatar_url: u.viewSection?.avatarImage?.url ?? '',
  customer_since: u.viewSection?.customerSinceString ?? '',
});

// --- Address ---

export const addressSchema = z.object({
  id: z.string().describe('Address ID'),
  street_address: z.string().describe('Street address'),
  apartment_number: z.string().describe('Apartment or unit number'),
  city_state: z.string().describe('City and state (e.g. "San Jose, CA")'),
  postal_code: z.string().describe('ZIP/postal code'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  instructions: z.string().describe('Delivery instructions'),
});

export interface RawAddress {
  id?: string;
  streetAddress?: string;
  apartmentNumber?: string;
  postalCode?: string;
  coordinates?: { latitude?: number; longitude?: number };
  instructions?: string;
  viewSection?: {
    cityStateString?: string;
    lineOneString?: string;
    lineTwoString?: string;
  };
}

export const mapAddress = (a: RawAddress) => ({
  id: a.id ?? '',
  street_address: a.streetAddress ?? '',
  apartment_number: a.apartmentNumber ?? '',
  city_state: a.viewSection?.cityStateString ?? '',
  postal_code: a.postalCode ?? '',
  latitude: a.coordinates?.latitude ?? 0,
  longitude: a.coordinates?.longitude ?? 0,
  instructions: a.instructions ?? '',
});

// --- Cart ---

export const cartItemSchema = z.object({
  id: z.string().describe('Cart item ID'),
  item_id: z.string().describe('Product item ID (format: items_{shopId}-{productId})'),
  product_id: z.string().describe('Product ID'),
  name: z.string().describe('Product name'),
  quantity: z.number().describe('Quantity in cart'),
  quantity_type: z.string().describe('Quantity type (e.g. "each", "lb")'),
  image_url: z.string().describe('Product image URL'),
});

export interface RawCartItem {
  id?: string;
  quantity?: number;
  quantityType?: string;
  basketProduct?: {
    id?: string;
    productId?: string;
    v4ItemId?: string;
    name?: string;
    thumbnailImageUrl?: string;
    viewSection?: {
      primaryImage?: { url?: string };
    };
  };
}

export const mapCartItem = (i: RawCartItem) => ({
  id: i.id ?? '',
  item_id: i.basketProduct?.v4ItemId ?? i.basketProduct?.id ?? '',
  product_id: i.basketProduct?.productId ?? '',
  name: i.basketProduct?.name ?? '',
  quantity: i.quantity ?? 0,
  quantity_type: i.quantityType ?? 'each',
  image_url: i.basketProduct?.viewSection?.primaryImage?.url ?? i.basketProduct?.thumbnailImageUrl ?? '',
});

export const cartSchema = z.object({
  id: z.string().describe('Cart ID'),
  item_count: z.number().int().describe('Total number of items in the cart'),
  retailer_name: z.string().describe('Retailer/store name'),
  retailer_id: z.string().describe('Retailer ID'),
  shop_id: z.string().describe('Shop ID'),
  cart_type: z.string().describe('Cart type (e.g. "grocery")'),
  updated_at: z.string().describe('Last updated timestamp'),
  items: z.array(cartItemSchema).describe('Items in the cart'),
});

export interface RawCart {
  id?: string;
  itemCount?: number;
  cartType?: string;
  updatedAt?: string;
  retailer?: { id?: string; name?: string };
  shop?: { id?: string };
  cartItemCollection?: {
    cartItems?: RawCartItem[];
  };
}

export const mapCart = (c: RawCart) => ({
  id: c.id ?? '',
  item_count: c.itemCount ?? 0,
  retailer_name: c.retailer?.name ?? '',
  retailer_id: c.retailer?.id ?? '',
  shop_id: c.shop?.id ?? '',
  cart_type: c.cartType ?? '',
  updated_at: c.updatedAt ?? '',
  items: (c.cartItemCollection?.cartItems ?? []).map(mapCartItem),
});

export const cartSummarySchema = cartSchema.pick({
  id: true,
  item_count: true,
  retailer_name: true,
  retailer_id: true,
  shop_id: true,
});

export const mapCartSummary = (c: RawCart) => ({
  id: c.id ?? '',
  item_count: c.itemCount ?? 0,
  retailer_name: c.retailer?.name ?? '',
  retailer_id: c.retailer?.id ?? '',
  shop_id: c.shop?.id ?? '',
});

// --- Search Suggestion ---

export const searchSuggestionSchema = z.object({
  term: z.string().describe('Suggested search term'),
  type: z.string().describe('Suggestion type (e.g. "item", "retailer")'),
  image_url: z.string().describe('Thumbnail image URL'),
});

export interface RawSearchSuggestion {
  searchTerm?: string;
  viewSection?: {
    textString?: string;
    typeVariant?: string;
    thumbnailImage?: { url?: string };
  };
}

export const mapSearchSuggestion = (s: RawSearchSuggestion) => ({
  term: s.searchTerm ?? s.viewSection?.textString ?? '',
  type: s.viewSection?.typeVariant ?? '',
  image_url: s.viewSection?.thumbnailImage?.url ?? '',
});

// --- Product Item ---

export const productSchema = z.object({
  item_id: z.string().describe('Item ID (format: items_{shopId}-{productId})'),
  product_id: z.string().describe('Product ID'),
  name: z.string().describe('Product name'),
  brand: z.string().describe('Brand name'),
  size: z.string().describe('Product size/weight'),
  image_url: z.string().describe('Product image URL'),
  description: z.string().describe('Product description'),
});

export interface RawProduct {
  id?: string;
  productId?: string;
  name?: string;
  brandName?: string;
  size?: string;
  description?: string;
  viewSection?: {
    itemImage?: { url?: string };
  };
}

export const mapProduct = (p: RawProduct) => ({
  item_id: p.id ?? '',
  product_id: p.productId ?? '',
  name: p.name ?? '',
  brand: p.brandName ?? '',
  size: p.size ?? '',
  image_url: p.viewSection?.itemImage?.url ?? '',
  description: p.description ?? '',
});

// --- Order ---

export const orderSchema = z.object({
  id: z.string().describe('Order delivery ID'),
  status: z.string().describe('Order status (e.g. "delivered", "in_progress")'),
  retailer_name: z.string().describe('Retailer/store name'),
  created_at: z.string().describe('Order creation timestamp'),
  total: z.string().describe('Order total display string'),
  item_count: z.number().int().describe('Number of items in the order'),
});

export interface RawOrder {
  id?: string;
  status?: string;
  retailer?: { name?: string };
  createdAt?: string;
  viewSection?: {
    totalString?: string;
    itemCountString?: string;
  };
  orderItems?: { totalCount?: number };
}

export const mapOrder = (o: RawOrder) => ({
  id: o.id ?? '',
  status: o.status ?? '',
  retailer_name: o.retailer?.name ?? '',
  created_at: o.createdAt ?? '',
  total: o.viewSection?.totalString ?? '',
  item_count: o.orderItems?.totalCount ?? 0,
});

// --- Location Context ---

export const locationContextSchema = z.object({
  zone_id: z.string().describe('Zone ID for the delivery area'),
  postal_code: z.string().describe('Postal/ZIP code'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  retailer_count: z.number().int().describe('Number of available retailers in the zone'),
});
