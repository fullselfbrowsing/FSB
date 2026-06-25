import { z } from 'zod';

// --- Customer ---

export const customerSchema = z.object({
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  email: z.string().describe('Email address'),
  phone_number: z.string().describe('Phone number'),
  country: z.string().describe('Country code (e.g. "US")'),
  customer_id_hash: z.string().describe('Hashed customer ID'),
  is_guest: z.boolean().describe('Whether the user is a guest'),
  date_of_birth: z.string().describe('Date of birth (YYYY-MM-DD)'),
  created_at: z.string().describe('Account creation timestamp'),
});

export interface RawCustomer {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  country?: string;
  customerIdHash?: string;
  isGuest?: boolean;
  dateOfBirth?: string;
  createdTimestamp?: string;
}

export const mapCustomer = (c: RawCustomer) => ({
  first_name: c.firstName ?? '',
  last_name: c.lastName ?? '',
  email: c.email ?? '',
  phone_number: c.phoneNumber ?? '',
  country: c.country ?? '',
  customer_id_hash: c.customerIdHash ?? '',
  is_guest: c.isGuest ?? false,
  date_of_birth: c.dateOfBirth ?? '',
  created_at: c.createdTimestamp ?? '',
});

// --- Loyalty Points ---

export const loyaltyPointsSchema = z.object({
  current_points: z.number().describe('Current loyalty points balance'),
  reward_threshold: z.number().describe('Points needed to earn a reward (typically 1250)'),
});

export interface RawLoyaltyPoints {
  currentPointsBalance?: number;
  rewardThreshold?: number;
}

export const mapLoyaltyPoints = (p: RawLoyaltyPoints) => ({
  current_points: p.currentPointsBalance ?? 0,
  reward_threshold: p.rewardThreshold ?? 1250,
});

// --- Restaurant ---

export const addressSchema = z.object({
  type: z.string().describe('Address type (e.g. "MAIN")'),
  line1: z.string().describe('Street address line 1'),
  line2: z.string().describe('Street address line 2'),
  city: z.string().describe('City'),
  state: z.string().describe('State/province code'),
  zip: z.string().describe('ZIP/postal code'),
  country: z.string().describe('Country code'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
});

export interface RawAddress {
  addressType?: string;
  addressLine1?: string;
  addressLine2?: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
}

export const mapAddress = (a: RawAddress) => ({
  type: a.addressType ?? '',
  line1: a.addressLine1 ?? '',
  line2: (a.addressLine2 ?? '').trim(),
  city: a.locality ?? '',
  state: a.administrativeArea ?? '',
  zip: a.postalCode ?? '',
  country: a.countryCode ?? '',
  latitude: a.latitude ?? 0,
  longitude: a.longitude ?? 0,
});

export const restaurantSchema = z.object({
  id: z.number().describe('Restaurant number'),
  name: z.string().describe('Restaurant name'),
  status: z.string().describe('Status (e.g. "OPEN")'),
  distance: z.number().describe('Distance from search location in meters'),
  addresses: z.array(addressSchema).describe('Restaurant addresses'),
  phone: z.string().describe('Phone number'),
  online_ordering: z.boolean().describe('Whether online ordering is available'),
  has_chipotlane: z.boolean().describe('Whether the restaurant has a Chipotlane'),
});

export interface RawRestaurant {
  restaurantNumber?: number;
  restaurantName?: string;
  restaurantStatus?: string;
  distance?: number;
  addresses?: RawAddress[];
  phoneNumber?: string;
  onlineOrdering?: { onlineOrderingEnabled?: boolean };
  chipotlane?: { chipotlanePickupEnabled?: boolean };
}

export const mapRestaurant = (r: RawRestaurant) => ({
  id: r.restaurantNumber ?? 0,
  name: r.restaurantName ?? '',
  status: r.restaurantStatus ?? '',
  distance: r.distance ?? 0,
  addresses: (r.addresses ?? []).map(mapAddress),
  phone: r.phoneNumber ?? '',
  online_ordering: r.onlineOrdering?.onlineOrderingEnabled ?? false,
  has_chipotlane: r.chipotlane?.chipotlanePickupEnabled ?? false,
});

// --- Restaurant Hours ---

export const restaurantHoursSchema = z.object({
  day_of_week: z.string().describe('Day of week (e.g. "Monday")'),
  open_time: z.string().describe('Opening time (HH:MM)'),
  close_time: z.string().describe('Closing time (HH:MM)'),
});

export interface RawHour {
  dayOfWeek?: string;
  openDateTime?: string;
  closeDateTime?: string;
}

export const mapHour = (h: RawHour) => ({
  day_of_week: h.dayOfWeek ?? '',
  open_time: h.openDateTime ?? '',
  close_time: h.closeDateTime ?? '',
});

// --- Menu ---

export const menuGroupSchema = z.object({
  id: z.string().describe('Menu group ID'),
  name: z.string().describe('Group display name (e.g. "Burrito", "Bowl")'),
  description: z.string().describe('Group description'),
  type: z.string().describe('Group type'),
  image_url: z.string().describe('Thumbnail image URL'),
});

export interface RawMenuGroup {
  id?: string;
  displayName?: string;
  description?: string;
  type?: string;
  thumbnailImageUrl?: string;
}

export const mapMenuGroup = (g: RawMenuGroup) => ({
  id: g.id ?? '',
  name: g.displayName ?? '',
  description: g.description ?? '',
  type: g.type ?? '',
  image_url: g.thumbnailImageUrl ?? '',
});

export const menuItemSchema = z.object({
  id: z.string().describe('Menu item ID (e.g. "CMG-1")'),
  name: z.string().describe('Item name (e.g. "Chicken Bowl")'),
  description: z.string().describe('Item description'),
  price: z.number().describe('Unit price in dollars'),
  calories: z.string().describe('Calorie range (e.g. "430-750")'),
  image_url: z.string().describe('Thumbnail image URL'),
  is_available: z.boolean().describe('Whether item is currently available'),
});

export interface RawMenuItem {
  itemId?: string;
  itemName?: string;
  itemType?: string;
  unitPrice?: number;
  baseCalories?: number;
  maxCalories?: number;
  thumbnailUrl?: string;
  isItemAvailable?: boolean;
}

export const mapMenuItem = (item: RawMenuItem) => ({
  id: item.itemId ?? '',
  name: item.itemName ?? '',
  description: item.itemType ?? '',
  price: item.unitPrice ?? 0,
  calories:
    item.baseCalories != null && item.maxCalories != null
      ? `${item.baseCalories}-${item.maxCalories}`
      : `${item.baseCalories ?? 0}`,
  image_url: item.thumbnailUrl ?? '',
  is_available: item.isItemAvailable ?? true,
});

// --- Pre-configured Meals ---

export const preconfiguredMealSchema = z.object({
  id: z.string().describe('Meal ID'),
  name: z.string().describe('Meal name (e.g. "Build-Your-Own Chicken")'),
  type: z.string().describe('Meal type (e.g. "BuildYourOwn")'),
  description: z.string().describe('Meal description with customizations'),
});

export interface RawPreconfiguredMeal {
  mealId?: string;
  mealName?: string;
  mealType?: string;
  description?: string;
}

export const mapPreconfiguredMeal = (m: RawPreconfiguredMeal) => ({
  id: m.mealId ?? '',
  name: m.mealName ?? '',
  type: m.mealType ?? '',
  description: m.description ?? '',
});

// --- Recent Orders ---

export const recentOrderSchema = z.object({
  order_id: z.string().describe('Order ID (UUID)'),
  order_date: z.string().describe('Order date/time in ISO 8601 format'),
  is_available: z.boolean().describe('Whether the order can be reordered'),
  meals: z
    .array(
      z.object({
        meal_id: z.string().describe('Meal ID'),
        meal_name: z.string().describe('Custom meal name'),
        entree_name: z.string().describe('Primary entree name (e.g. "Steak Burrito")'),
        is_available: z.boolean().describe('Whether this meal is available'),
      }),
    )
    .describe('Meals in the order'),
});

export interface RawEntreeContent {
  menuItemId?: string;
  menuItemName?: string;
}

export interface RawEntree {
  entreeId?: string;
  menuItemId?: string;
  menuItemName?: string;
  isEntreeAvailable?: boolean;
  contents?: RawEntreeContent[];
}

export interface RawMeal {
  mealId?: string;
  mealName?: string;
  isMealAvailable?: boolean;
  entrees?: RawEntree[];
}

export interface RawRecentOrder {
  orderId?: string;
  orderDateTime?: string;
  order?: {
    orderId?: string;
    orderDateTimeLocal?: string;
    isOrderAvailable?: boolean;
    meals?: RawMeal[];
  };
}

export const mapRecentOrder = (o: RawRecentOrder) => ({
  order_id: o.orderId ?? '',
  order_date: o.orderDateTime ?? '',
  is_available: o.order?.isOrderAvailable ?? false,
  meals: (o.order?.meals ?? []).map(m => ({
    meal_id: m.mealId ?? '',
    meal_name: m.mealName ?? '',
    entree_name: m.entrees?.[0]?.menuItemName ?? '',
    is_available: m.isMealAvailable ?? false,
  })),
});

// --- Reward Store ---

export const rewardOfferSchema = z.object({
  id: z.string().describe('Reward offer ID'),
  title: z.string().describe('Reward title (e.g. "Side Tortilla")'),
  description: z.string().describe('Reward description'),
  points: z.number().describe('Points required to redeem'),
  image_url: z.string().describe('Reward image URL'),
});

export interface RawRewardOffer {
  id?: string;
  title?: string;
  description?: string;
  points?: number;
  mediaUri?: string;
}

export const mapRewardOffer = (r: RawRewardOffer) => ({
  id: r.id ?? '',
  title: r.title ?? '',
  description: r.description ?? '',
  points: r.points ?? 0,
  image_url: r.mediaUri ?? '',
});

// --- Payment Methods ---

export const paymentMethodSchema = z.object({
  token_id: z.number().describe('Payment token ID'),
  card_type: z.string().describe('Card type (e.g. "visa", "mastercard")'),
  last_four: z.string().describe('Last four digits of card number'),
  expiration: z.string().describe('Card expiration date'),
  cardholder_name: z.string().describe('Cardholder name'),
  billing_zip: z.string().describe('Billing ZIP code'),
  is_gift_card: z.boolean().describe('Whether this is a gift card'),
});

export interface RawPaymentMethod {
  tokenId?: number;
  paymentMethod?: string;
  lastFourAccountNumbers?: string;
  expiration?: string;
  cardHolderName?: string;
  billingZip?: string;
  isGiftCard?: boolean;
}

export const mapPaymentMethod = (p: RawPaymentMethod) => ({
  token_id: p.tokenId ?? 0,
  card_type: p.paymentMethod ?? '',
  last_four: p.lastFourAccountNumbers ?? '',
  expiration: p.expiration ?? '',
  cardholder_name: p.cardHolderName ?? '',
  billing_zip: p.billingZip ?? '',
  is_gift_card: p.isGiftCard ?? false,
});

// --- Promotions ---

export const promotionSchema = z.object({
  code: z.string().describe('Promotion code'),
  campaign: z.string().describe('Campaign name'),
  name: z.string().describe('Promotion name'),
  description: z.string().describe('Promotion description'),
  terms: z.string().describe('Terms and conditions'),
  is_valid: z.boolean().describe('Whether the promotion is currently valid'),
  invalid_reason: z.string().describe('Reason if invalid (e.g. "EXPIRED")'),
});

export interface RawPromotion {
  PromotionCode?: string;
  Campaign?: string;
  PromotionName?: string;
  PromotionDescription?: string;
  TermsAndConditions?: string;
  IsValid?: boolean;
  InvalidReason?: string;
}

export const mapPromotion = (p: RawPromotion) => ({
  code: p.PromotionCode ?? '',
  campaign: p.Campaign ?? '',
  name: p.PromotionName ?? '',
  description: p.PromotionDescription ?? '',
  terms: p.TermsAndConditions ?? '',
  is_valid: p.IsValid ?? false,
  invalid_reason: p.InvalidReason ?? '',
});
