import { z } from 'zod';

// --- Consumer ---

export const consumerSchema = z.object({
  id: z.string().describe('Consumer ID'),
  user_id: z.string().describe('User ID'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  email: z.string().describe('Email address'),
  phone_number: z.string().describe('Phone number in E.164 format'),
  timezone: z.string().describe('Timezone (e.g., US/Pacific)'),
  default_country: z.string().describe('Default country'),
  is_guest: z.boolean().describe('Whether this is a guest account'),
  default_address: z
    .object({
      id: z.string().describe('Address ID'),
      street: z.string().describe('Street address'),
      city: z.string().describe('City'),
      state: z.string().describe('State abbreviation'),
      zip_code: z.string().describe('ZIP code'),
      printable_address: z.string().describe('Full formatted address'),
    })
    .nullable()
    .describe('Default delivery address'),
});

interface RawConsumer {
  id?: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  timezone?: string;
  defaultCountry?: string;
  isGuest?: boolean;
  defaultAddress?: {
    id?: string;
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    printableAddress?: string;
  } | null;
}

export const mapConsumer = (c: RawConsumer) => ({
  id: c.id ?? '',
  user_id: c.userId ?? '',
  first_name: c.firstName ?? '',
  last_name: c.lastName ?? '',
  email: c.email ?? '',
  phone_number: c.phoneNumber ?? '',
  timezone: c.timezone ?? '',
  default_country: c.defaultCountry ?? '',
  is_guest: c.isGuest ?? false,
  default_address: c.defaultAddress
    ? {
        id: c.defaultAddress.id ?? '',
        street: c.defaultAddress.street ?? '',
        city: c.defaultAddress.city ?? '',
        state: c.defaultAddress.state ?? '',
        zip_code: c.defaultAddress.zipCode ?? '',
        printable_address: c.defaultAddress.printableAddress ?? '',
      }
    : null,
});

// --- Address ---

export const addressSchema = z.object({
  id: z.string().describe('Address record ID'),
  address_id: z.string().describe('Address ID'),
  street: z.string().describe('Street address'),
  city: z.string().describe('City'),
  subpremise: z.string().describe('Apartment, suite, or unit number'),
  state: z.string().describe('State abbreviation'),
  zip_code: z.string().describe('ZIP code'),
  country: z.string().describe('Country name'),
  lat: z.number().describe('Latitude'),
  lng: z.number().describe('Longitude'),
  timezone: z.string().describe('Timezone'),
  shortname: z.string().describe('Short display name'),
  printable_address: z.string().describe('Full formatted address'),
  driver_instructions: z.string().nullable().describe('Delivery instructions for the driver'),
});

interface RawAddress {
  id?: string;
  addressId?: string;
  street?: string;
  city?: string;
  subpremise?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  shortname?: string;
  printableAddress?: string;
  driverInstructions?: string | null;
}

export const mapAddress = (a: RawAddress) => ({
  id: a.id ?? '',
  address_id: a.addressId ?? '',
  street: a.street ?? '',
  city: a.city ?? '',
  subpremise: a.subpremise ?? '',
  state: a.state ?? '',
  zip_code: a.zipCode ?? '',
  country: a.country ?? '',
  lat: a.lat ?? 0,
  lng: a.lng ?? 0,
  timezone: a.timezone ?? '',
  shortname: a.shortname ?? '',
  printable_address: a.printableAddress ?? '',
  driver_instructions: a.driverInstructions ?? null,
});

// --- Order ---

const orderItemSchema = z.object({
  id: z.string().describe('Order item ID'),
  name: z.string().describe('Item name'),
  quantity: z.number().int().describe('Quantity ordered'),
  original_item_price: z.number().int().describe('Price in cents'),
});

export const orderSchema = z.object({
  id: z.string().describe('Order ID'),
  order_uuid: z.string().describe('Order UUID'),
  delivery_uuid: z.string().describe('Delivery UUID'),
  created_at: z.string().describe('ISO 8601 timestamp when order was created'),
  submitted_at: z.string().describe('ISO 8601 timestamp when order was submitted'),
  cancelled_at: z.string().nullable().describe('ISO 8601 timestamp when order was cancelled, or null'),
  fulfilled_at: z.string().nullable().describe('ISO 8601 timestamp when order was fulfilled, or null'),
  is_group: z.boolean().describe('Whether this is a group order'),
  is_gift: z.boolean().describe('Whether this is a gift order'),
  is_pickup: z.boolean().describe('Whether this is a pickup order'),
  is_retail: z.boolean().describe('Whether this is a retail order'),
  is_reorderable: z.boolean().describe('Whether this order can be reordered'),
  fulfillment_type: z.string().describe('Fulfillment type (e.g., Any, Virtual)'),
  store_name: z.string().describe('Restaurant or store name'),
  store_id: z.string().describe('Store ID'),
  creator_name: z.string().describe('Full name of the person who placed the order'),
  delivery_address_id: z.string().describe('Delivery address ID'),
  items: z.array(orderItemSchema).describe('Order items with names, quantities, and prices'),
  payment_card_type: z.string().describe('Payment card type (e.g., Visa)'),
  payment_card_last4: z.string().describe('Last 4 digits of the payment card'),
  grand_total_display: z.string().describe('Grand total as display string (e.g., $71.68)'),
  grand_total_cents: z.number().int().describe('Grand total in cents'),
});

interface RawOrderItem {
  id?: string;
  name?: string;
  quantity?: number;
  originalItemPrice?: number;
}

interface RawOrder {
  id?: string;
  orderUuid?: string;
  deliveryUuid?: string;
  createdAt?: string;
  submittedAt?: string;
  cancelledAt?: string | null;
  fulfilledAt?: string | null;
  isGroup?: boolean;
  isGift?: boolean;
  isPickup?: boolean;
  isRetail?: boolean;
  isReorderable?: boolean;
  fulfillmentType?: string;
  store?: { id?: string; name?: string };
  creator?: { firstName?: string; lastName?: string };
  deliveryAddress?: { id?: string };
  orders?: Array<{ items?: RawOrderItem[] }>;
  paymentCard?: { type?: string; last4?: string };
  grandTotal?: { unitAmount?: number; displayString?: string };
}

export const mapOrder = (o: RawOrder) => {
  const items: Array<{ id: string; name: string; quantity: number; original_item_price: number }> = [];
  for (const sub of o.orders ?? []) {
    for (const item of sub.items ?? []) {
      items.push({
        id: item.id ?? '',
        name: item.name ?? '',
        quantity: item.quantity ?? 0,
        original_item_price: item.originalItemPrice ?? 0,
      });
    }
  }

  return {
    id: o.id ?? '',
    order_uuid: o.orderUuid ?? '',
    delivery_uuid: o.deliveryUuid ?? '',
    created_at: o.createdAt ?? '',
    submitted_at: o.submittedAt ?? '',
    cancelled_at: o.cancelledAt ?? null,
    fulfilled_at: o.fulfilledAt ?? null,
    is_group: o.isGroup ?? false,
    is_gift: o.isGift ?? false,
    is_pickup: o.isPickup ?? false,
    is_retail: o.isRetail ?? false,
    is_reorderable: o.isReorderable ?? false,
    fulfillment_type: o.fulfillmentType ?? '',
    store_name: o.store?.name ?? '',
    store_id: o.store?.id ?? '',
    creator_name: [o.creator?.firstName, o.creator?.lastName].filter(Boolean).join(' '),
    delivery_address_id: o.deliveryAddress?.id ?? '',
    items,
    payment_card_type: o.paymentCard?.type ?? '',
    payment_card_last4: o.paymentCard?.last4 ?? '',
    grand_total_display: o.grandTotal?.displayString ?? '',
    grand_total_cents: o.grandTotal?.unitAmount ?? 0,
  };
};

// --- Payment Method ---

export const paymentMethodSchema = z.object({
  id: z.string().describe('Payment method ID'),
  is_default: z.boolean().describe('Whether this is the default payment method'),
  type: z.string().describe('Card type (e.g., Visa, MasterCard)'),
  last4: z.string().describe('Last 4 digits of the card'),
  exp_year: z.string().describe('Expiration year'),
  exp_month: z.string().describe('Expiration month'),
  is_dash_card: z.boolean().describe('Whether this is a DashCard'),
  is_hsa_fsa_card: z.boolean().describe('Whether this is an HSA/FSA card'),
});

interface RawPaymentMethod {
  id?: string;
  isDefault?: boolean;
  type?: string;
  last4?: string;
  expYear?: string;
  expMonth?: string;
  metadata?: { isDashCard?: boolean; isHsaFsaCard?: boolean };
}

export const mapPaymentMethod = (p: RawPaymentMethod) => ({
  id: p.id ?? '',
  is_default: p.isDefault ?? false,
  type: p.type ?? '',
  last4: p.last4 ?? '',
  exp_year: p.expYear ?? '',
  exp_month: p.expMonth ?? '',
  is_dash_card: p.metadata?.isDashCard ?? false,
  is_hsa_fsa_card: p.metadata?.isHsaFsaCard ?? false,
});

// --- Notifications ---

export const notificationStatusSchema = z.object({
  has_new_notifications: z.boolean().describe('Whether there are new notifications'),
  num_unread_notifications: z.number().int().describe('Number of unread notifications'),
});

interface RawNotificationStatus {
  hasNewNotifications?: boolean;
  numUnreadNotifications?: number;
}

export const mapNotificationStatus = (n: RawNotificationStatus) => ({
  has_new_notifications: n.hasNewNotifications ?? false,
  num_unread_notifications: n.numUnreadNotifications ?? 0,
});
