import { z } from 'zod';

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export const customerSchema = z.object({
  first_name: z.string().describe('Customer first name'),
  last_name: z.string().describe('Customer last name'),
  email: z.string().describe('Customer email address'),
  phone: z.string().describe('Customer phone number'),
});

interface RawCustomer {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export const mapCustomer = (c: RawCustomer) => ({
  first_name: c.firstName ?? '',
  last_name: c.lastName ?? '',
  email: c.email ?? '',
  phone: c.phone ?? '',
});

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

export const addressSchema = z.object({
  address_type: z.string().describe('Address type (e.g., HOUSE, APARTMENT, BUSINESS)'),
  street_address: z.string().describe('Street address'),
  city: z.string().describe('City name'),
  state: z.string().describe('State abbreviation'),
  zip_code: z.string().describe('ZIP code'),
  suite_apt: z.string().describe('Suite or apartment number'),
  nickname: z.string().describe('Saved address nickname'),
  business_name: z.string().describe('Business name if applicable'),
});

interface RawAddress {
  addressType?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  suiteApt?: string | null;
  nickname?: string | null;
  businessName?: string | null;
}

export const mapAddress = (a: RawAddress) => ({
  address_type: a.addressType ?? '',
  street_address: a.streetAddress ?? '',
  city: a.city ?? '',
  state: a.state ?? '',
  zip_code: a.zipCode ?? '',
  suite_apt: a.suiteApt ?? '',
  nickname: a.nickname ?? '',
  business_name: a.businessName ?? '',
});

// ---------------------------------------------------------------------------
// Payment Card
// ---------------------------------------------------------------------------

export const cardSchema = z.object({
  id: z.string().describe('Card ID'),
  card_type: z.string().describe('Card type (e.g., VISA, MASTERCARD)'),
  last_four: z.string().describe('Last four digits of card number'),
  expiration_month: z.number().describe('Expiration month (1-12)'),
  expiration_year: z.number().describe('Expiration year'),
  is_expired: z.boolean().describe('Whether the card is expired'),
  is_default: z.boolean().describe('Whether this is the default card'),
  nickname: z.string().describe('Card nickname'),
  billing_zip: z.string().describe('Billing ZIP code'),
});

interface RawCard {
  id?: string | null;
  cardType?: string | null;
  lastFour?: string | null;
  expirationMonth?: number | null;
  expirationYear?: number | null;
  isExpired?: boolean | null;
  isDefault?: boolean | null;
  nickName?: string | null;
  billingZip?: string | null;
}

export const mapCard = (c: RawCard) => ({
  id: c.id ?? '',
  card_type: c.cardType ?? '',
  last_four: c.lastFour ?? '',
  expiration_month: c.expirationMonth ?? 0,
  expiration_year: c.expirationYear ?? 0,
  is_expired: c.isExpired ?? false,
  is_default: c.isDefault ?? false,
  nickname: c.nickName ?? '',
  billing_zip: c.billingZip ?? '',
});

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const storeSchema = z.object({
  id: z.string().describe('Store ID'),
  store_name: z.string().describe('Store name / address display'),
  street: z.string().describe('Street address'),
  city: z.string().describe('City'),
  region: z.string().describe('State/region'),
  postal_code: z.string().describe('Postal code'),
  phone: z.string().describe('Store phone number'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  eta_minutes: z.string().describe('Estimated delivery time in minutes'),
  estimated_wait_minutes: z.string().describe('Estimated wait time range'),
  distance: z.string().describe('Distance from search location'),
  is_open: z.boolean().describe('Whether the store is currently open'),
  open_label: z.string().describe('Open/close status label'),
  allows_delivery: z.boolean().describe('Whether delivery orders are accepted'),
  allows_carside: z.boolean().describe('Whether carside delivery is available'),
});

interface RawStore {
  id?: string | null;
  storeName?: string | null;
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  etaMinutes?: string | null;
  estimatedWaitMinutes?: string | null;
  distance?: string | null;
  isOpen?: boolean | null;
  openLabel?: string | null;
  allowDeliveryOrders?: boolean | null;
  allowCarsideDelivery?: boolean | null;
  address?: string | null;
}

export const mapStore = (s: RawStore) => ({
  id: s.id ?? '',
  store_name: s.storeName ?? s.address ?? '',
  street: s.street ?? '',
  city: s.city ?? '',
  region: s.region ?? '',
  postal_code: s.postalCode ?? '',
  phone: s.phone ?? '',
  latitude: s.latitude ?? 0,
  longitude: s.longitude ?? 0,
  eta_minutes: s.etaMinutes ?? '',
  estimated_wait_minutes: s.estimatedWaitMinutes ?? '',
  distance: s.distance ?? '',
  is_open: s.isOpen ?? false,
  open_label: s.openLabel ?? '',
  allows_delivery: s.allowDeliveryOrders ?? false,
  allows_carside: s.allowCarsideDelivery ?? false,
});

// ---------------------------------------------------------------------------
// Address Suggestion (autocomplete)
// ---------------------------------------------------------------------------

export const addressSuggestionSchema = z.object({
  place_id: z.string().describe('Google Place ID for use with find_stores_by_address'),
  main_text: z.string().describe('Primary address text'),
  secondary_text: z.string().describe('Secondary address text (city, state)'),
});

interface RawSuggestion {
  placeId?: string | null;
  mainText?: string | null;
  secondaryText?: string | null;
}

export const mapSuggestion = (s: RawSuggestion) => ({
  place_id: s.placeId ?? '',
  main_text: s.mainText ?? '',
  secondary_text: s.secondaryText ?? '',
});

// ---------------------------------------------------------------------------
// Menu Category
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  id: z.string().describe('Category ID (e.g., "Specialty", "Wings", "Drinks")'),
  name: z.string().describe('Category display name'),
  image: z.string().describe('Category image URL path'),
  is_new: z.boolean().describe('Whether the category is marked as new'),
});

interface RawCategory {
  id?: string | null;
  name?: string | null;
  image?: string | null;
  isNew?: boolean | null;
}

export const mapCategory = (c: RawCategory) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  image: c.image ?? '',
  is_new: c.isNew ?? false,
});

// ---------------------------------------------------------------------------
// Product (menu item)
// ---------------------------------------------------------------------------

export const productSchema = z.object({
  id: z.string().describe('Product slug ID'),
  code: z.string().describe('Product code (SKU) for ordering'),
  name: z.string().describe('Product name'),
  description: z.string().describe('Product description'),
  price: z.number().describe('Product price in USD'),
  size: z.string().describe('Product size (e.g., "14" for 14-inch)'),
  product_type: z.string().describe('Product type (e.g., Pizza, Bread, Wings)'),
  image: z.string().describe('Product image URL path'),
  is_popular: z.boolean().describe('Whether marked as popular'),
  max_quantity: z.number().int().describe('Maximum order quantity'),
  is_build_your_own: z.boolean().describe('Whether this is a customizable product'),
});

interface RawProduct {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  price?: number | null;
  size?: string | null;
  productType?: string | null;
  image?: string | null;
  isPopular?: boolean | null;
  maxQuantity?: number | null;
  isBuildYourOwn?: boolean | null;
}

export const mapProduct = (p: RawProduct) => ({
  id: p.id ?? '',
  code: p.code ?? '',
  name: p.name ?? '',
  description: p.description ?? '',
  price: p.price ?? 0,
  size: p.size ?? '',
  product_type: p.productType ?? '',
  image: p.image ?? '',
  is_popular: p.isPopular ?? false,
  max_quantity: p.maxQuantity ?? 25,
  is_build_your_own: p.isBuildYourOwn ?? false,
});

// ---------------------------------------------------------------------------
// Product Builder (detailed product view with size/quantity options)
// ---------------------------------------------------------------------------

export const productBuilderSchema = z.object({
  name: z.string().describe('Product name'),
  description: z.string().describe('Product description'),
  product_type: z.string().describe('Product type (e.g., Pizza)'),
  min_quantity: z.number().int().describe('Minimum order quantity'),
  max_quantity: z.number().int().describe('Maximum order quantity'),
  selected_size: z.string().describe('Currently selected size'),
  size_label: z.string().describe('Size label text'),
});

interface RawProductBuilder {
  name?: string | null;
  description?: string | null;
  productType?: string | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
  selectedSize?: string | null;
  sizeLabel?: string | null;
}

export const mapProductBuilder = (p: RawProductBuilder) => ({
  name: p.name ?? '',
  description: p.description ?? '',
  product_type: p.productType ?? '',
  min_quantity: p.minQuantity ?? 1,
  max_quantity: p.maxQuantity ?? 25,
  selected_size: p.selectedSize ?? '',
  size_label: p.sizeLabel ?? '',
});

// ---------------------------------------------------------------------------
// Customer Location (resolved from store search)
// ---------------------------------------------------------------------------

export const customerLocationSchema = z.object({
  street_address: z.string().describe('Resolved street address'),
  city: z.string().describe('Resolved city'),
  state: z.string().describe('Resolved state'),
  zip_code: z.string().describe('Resolved ZIP code'),
});

interface RawCustomerLocation {
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

export const mapCustomerLocation = (loc: RawCustomerLocation) => ({
  street_address: loc.streetAddress ?? '',
  city: loc.city ?? '',
  state: loc.state ?? '',
  zip_code: loc.zipCode ?? '',
});

// ---------------------------------------------------------------------------
// Cart Product
// ---------------------------------------------------------------------------

export const cartProductSchema = z.object({
  id: z.string().describe('Cart product ID'),
  name: z.string().describe('Product name'),
  sku: z.string().describe('Product SKU code'),
  price: z.number().describe('Product price'),
  quantity: z.number().int().describe('Quantity in cart'),
  product_type: z.string().describe('Product type'),
});

interface RawCartProduct {
  id?: string | null;
  name?: string | null;
  sku?: string | null;
  price?: number | null;
  quantity?: number | null;
  productType?: string | null;
}

export const mapCartProduct = (p: RawCartProduct) => ({
  id: p.id ?? '',
  name: p.name ?? '',
  sku: p.sku ?? '',
  price: p.price ?? 0,
  quantity: p.quantity ?? 0,
  product_type: p.productType ?? '',
});

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const cartSchema = z.object({
  id: z.string().describe('Cart ID'),
  store_id: z.string().describe('Store ID the cart belongs to'),
  products: z.array(cartProductSchema).describe('Products in the cart'),
  total: z.number().describe('Cart total in USD'),
});

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

export const dealSchema = z.object({
  code: z.string().describe('Deal/coupon code'),
  name: z.string().describe('Deal name'),
  description: z.string().describe('Deal description'),
  image: z.string().describe('Deal image URL'),
});

interface RawDeal {
  code?: string | null;
  name?: string | null;
  description?: string | null;
  image?: string | null;
  visualDescription?: string | null;
}

export const mapDeal = (d: RawDeal) => ({
  code: d.code ?? '',
  name: d.name ?? '',
  description: d.description ?? d.visualDescription ?? '',
  image: d.image ?? '',
});
