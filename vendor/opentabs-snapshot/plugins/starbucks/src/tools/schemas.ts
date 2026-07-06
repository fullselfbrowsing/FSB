import { z } from 'zod';

// --- User / Account ---

export const userProfileSchema = z.object({
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  email: z.string().describe('Email address'),
  external_id: z.string().describe('Starbucks external user ID'),
  sub_market: z.string().describe('Sub-market code (e.g., "US")'),
  birth_month: z.number().describe('Birth month (1-12)'),
  birth_day: z.number().describe('Birth day (1-31)'),
  card_holder_since: z.string().describe('Loyalty member since date (ISO 8601)'),
  star_balance: z.number().describe('Current Stars balance'),
  stars_to_next_goal: z.number().describe('Stars needed to reach next reward'),
  program_name: z.string().describe('Loyalty program name (e.g., "MSR5_USA")'),
});

interface RawAccountProfile {
  firstName?: string;
  lastName?: string;
  email?: string;
  exId?: string;
  subMarket?: string;
  birthMonth?: number;
  birthDay?: number;
  loyaltyProgram?: {
    cardHolderSince?: string;
    progress?: { starBalance?: number; starsToNextGoal?: number };
    programName?: string;
  };
}

export const mapUserProfile = (d: RawAccountProfile) => ({
  first_name: d.firstName ?? '',
  last_name: d.lastName ?? '',
  email: d.email ?? '',
  external_id: d.exId ?? '',
  sub_market: d.subMarket ?? '',
  birth_month: d.birthMonth ?? 0,
  birth_day: d.birthDay ?? 0,
  card_holder_since: d.loyaltyProgram?.cardHolderSince ?? '',
  star_balance: d.loyaltyProgram?.progress?.starBalance ?? 0,
  stars_to_next_goal: d.loyaltyProgram?.progress?.starsToNextGoal ?? 0,
  program_name: d.loyaltyProgram?.programName ?? '',
});

// --- Rewards ---

export const rewardTierSchema = z.object({
  code: z.string().describe('Reward code'),
  description: z.string().describe('Reward description'),
  stars_required: z.number().describe('Stars required to redeem'),
  available: z.boolean().describe('Whether the user can currently redeem this reward'),
});

interface RawRewardTier {
  code?: string;
  description?: string;
  totalStarsToEarn?: number;
  available?: boolean;
}

export const mapRewardTier = (r: RawRewardTier) => ({
  code: r.code ?? '',
  description: r.description ?? '',
  stars_required: r.totalStarsToEarn ?? 0,
  available: r.available ?? false,
});

// --- Stored Value Cards (Starbucks cards) ---

export const svcCardSchema = z.object({
  card_id: z.string().describe('Internal card ID'),
  card_number: z.string().describe('Card number'),
  nickname: z.string().describe('Card display name'),
  balance_amount: z.number().describe('Current balance in dollars'),
  balance_currency: z.string().describe('Currency code (e.g., "USD")'),
  is_primary: z.boolean().describe('Whether this is the primary card'),
  is_digital: z.boolean().describe('Whether this is a digital card'),
  card_image_url: z.string().describe('Card image URL'),
});

interface RawSvcCard {
  cardId?: string;
  cardNumber?: string;
  nickname?: string;
  balance?: { amount?: number; currency?: string };
  isPrimary?: boolean;
  isDigital?: boolean;
  cardImageUrl?: string;
}

export const mapSvcCard = (c: RawSvcCard) => ({
  card_id: c.cardId ?? '',
  card_number: c.cardNumber ?? '',
  nickname: c.nickname ?? '',
  balance_amount: c.balance?.amount ?? 0,
  balance_currency: c.balance?.currency ?? 'USD',
  is_primary: c.isPrimary ?? false,
  is_digital: c.isDigital ?? false,
  card_image_url: c.cardImageUrl ?? '',
});

// --- Wallet / Payment Methods ---

export const paymentMethodSchema = z.object({
  payment_type: z.string().describe('Payment type (e.g., "APPLE_PAY", "VISA")'),
  payment_instrument_id: z.string().describe('Payment instrument ID'),
  nickname: z.string().describe('Display name'),
  last_four: z.string().describe('Last four digits of card number'),
  card_issuer: z.string().describe('Card issuer (e.g., "VISA", "MASTERCARD")'),
  status: z.string().describe('Instrument status code (e.g., "Active")'),
});

interface RawPaymentInstrument {
  paymentType?: string;
  paymentInstrumentId?: string;
  nickname?: string;
  accountNumberLastFour?: string;
  cardIssuer?: string;
  instrumentStatusCode?: string;
}

export const mapPaymentMethod = (p: RawPaymentInstrument) => ({
  payment_type: p.paymentType ?? '',
  payment_instrument_id: p.paymentInstrumentId ?? '',
  nickname: p.nickname ?? '',
  last_four: p.accountNumberLastFour ?? '',
  card_issuer: p.cardIssuer ?? '',
  status: p.instrumentStatusCode ?? '',
});

// --- Store / Location ---

export const storeSchema = z.object({
  store_id: z.string().describe('Internal store ID'),
  store_number: z.string().describe('Store number'),
  name: z.string().describe('Store name'),
  phone_number: z.string().describe('Phone number'),
  is_open: z.boolean().describe('Whether the store is currently open'),
  open_status: z.string().describe('Formatted open status (e.g., "Open until 8:00 PM")'),
  hours_status: z.string().describe('Formatted hours (e.g., "Open today from 5:00 AM - 8:00 PM")'),
  address_single_line: z.string().describe('Full address on a single line'),
  city: z.string().describe('City'),
  state: z.string().describe('State/province code'),
  postal_code: z.string().describe('Postal code'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  distance: z.number().describe('Distance from search coordinates in miles'),
  is_favorite: z.boolean().describe("Whether this store is in the user's favorites"),
  mobile_ordering_available: z.boolean().describe('Whether mobile ordering is available'),
  ownership_type: z.string().describe('Ownership type (e.g., "CO" for company-owned)'),
  amenities: z.array(z.string()).describe('List of amenity names (e.g., "Mobile Order and Pay", "Drive-Thru")'),
});

interface RawStoreAddress {
  singleLine?: string;
  city?: string;
  countrySubdivisionCode?: string;
  postalCode?: string;
}

interface RawStoreCoordinates {
  latitude?: number;
  longitude?: number;
}

interface RawMobileOrdering {
  availability?: string;
}

interface RawStore {
  id?: string;
  storeNumber?: string;
  name?: string;
  phoneNumber?: string;
  open?: boolean;
  openStatusFormatted?: string;
  hoursStatusFormatted?: string;
  address?: RawStoreAddress;
  coordinates?: RawStoreCoordinates;
  ownershipTypeCode?: string;
  amenities?: Array<{ name?: string }>;
  mobileOrdering?: RawMobileOrdering;
}

interface RawLocationResult {
  distance?: number;
  isFavorite?: boolean;
  store?: RawStore;
}

export const mapStore = (r: RawLocationResult) => {
  const s = r.store ?? {};
  return {
    store_id: s.id ?? '',
    store_number: s.storeNumber ?? '',
    name: s.name ?? '',
    phone_number: s.phoneNumber ?? '',
    is_open: s.open ?? false,
    open_status: s.openStatusFormatted ?? '',
    hours_status: s.hoursStatusFormatted ?? '',
    address_single_line: s.address?.singleLine ?? '',
    city: s.address?.city ?? '',
    state: s.address?.countrySubdivisionCode ?? '',
    postal_code: s.address?.postalCode ?? '',
    latitude: s.coordinates?.latitude ?? 0,
    longitude: s.coordinates?.longitude ?? 0,
    distance: r.distance ?? 0,
    is_favorite: r.isFavorite ?? false,
    mobile_ordering_available: s.mobileOrdering?.availability === 'READY',
    ownership_type: s.ownershipTypeCode ?? '',
    amenities: (s.amenities ?? []).map(a => a.name ?? '').filter(Boolean),
  };
};

// --- Menu ---

export const menuCategorySchema = z.object({
  id: z.string().describe('Category ID'),
  name: z.string().describe('Category display name'),
  subcategories: z
    .array(
      z.object({
        id: z.string().describe('Subcategory ID'),
        name: z.string().describe('Subcategory display name'),
        product_count: z.number().describe('Number of products in subcategory'),
      }),
    )
    .describe('Subcategories within this category'),
});

interface RawMenuChild {
  id?: string;
  name?: string;
  products?: unknown[];
}

interface RawMenuCategory {
  id?: string;
  name?: string;
  children?: RawMenuChild[];
}

export const mapMenuCategory = (c: RawMenuCategory) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  subcategories: (c.children ?? []).map(ch => ({
    id: ch.id ?? '',
    name: ch.name ?? '',
    product_count: ch.products?.length ?? 0,
  })),
});

// --- Product ---

export const productSchema = z.object({
  product_number: z.number().describe('Product number'),
  name: z.string().describe('Product name'),
  form: z.string().describe('Product form (e.g., "Iced", "Hot")'),
  description: z.string().describe('Product description'),
  image_url: z.string().describe('Product image URL'),
  star_cost: z.number().describe('Cost in Stars to redeem (0 if not redeemable)'),
  product_type: z.string().describe('Product type (e.g., "beverages", "food")'),
});

interface RawProduct {
  productNumber?: number;
  name?: string;
  formCode?: string;
  description?: string;
  imageURL?: string;
  starCost?: number;
  productType?: string;
}

export const mapProduct = (p: RawProduct) => ({
  product_number: p.productNumber ?? 0,
  name: p.name ?? '',
  form: p.formCode ?? '',
  description: p.description ?? '',
  image_url: p.imageURL ?? '',
  star_cost: p.starCost ?? 0,
  product_type: p.productType ?? '',
});

// --- Stream / Feed ---

export const streamItemSchema = z.object({
  item_id: z.string().describe('Stream item ID'),
  type: z.string().describe('Item type (e.g., "Information", "RewardsCoupon")'),
  title: z.string().describe('Item title'),
  body: z.string().describe('Item body text'),
  image_url: z.string().describe('Image URL'),
  cta_text: z.string().describe('Call-to-action button text'),
  cta_link: z.string().describe('Call-to-action link URL'),
  start_date: z.string().describe('Start date (ISO 8601)'),
  end_date: z.string().describe('End date (ISO 8601)'),
  rank: z.number().describe('Display rank'),
});

interface RawStreamItemContent {
  item?: {
    title?: string;
    body?: string;
    image?: string;
    calltoactiontext?: string;
    calltoactionlink?: string;
  };
}

interface RawStreamItem {
  streamItemId?: string;
  streamItemType?: string;
  startDate?: string;
  endDate?: string;
  rank?: number;
  content?: RawStreamItemContent;
}

export const mapStreamItem = (s: RawStreamItem) => ({
  item_id: s.streamItemId ?? '',
  type: s.streamItemType ?? '',
  title: s.content?.item?.title ?? '',
  body: s.content?.item?.body ?? '',
  image_url: s.content?.item?.image ?? '',
  cta_text: s.content?.item?.calltoactiontext ?? '',
  cta_link: s.content?.item?.calltoactionlink ?? '',
  start_date: s.startDate ?? '',
  end_date: s.endDate ?? '',
  rank: s.rank ?? 0,
});
