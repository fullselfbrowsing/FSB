import { z } from 'zod';
import type {
  RawFulfillment,
  RawGeoLocation,
  RawInventoryItem,
  RawList,
  RawListEntry,
  RawProductCatalog,
} from '../costco-api.js';

// ─── Product ──────────────────────────────────────────────────────────────────

export const productSchema = z.object({
  item_number: z.string().describe('Costco item number'),
  name: z.string().describe('Product name (short description)'),
  brand: z.string().describe('Manufacturer/brand name'),
  price: z.string().describe('Current price (e.g., "1299.99")'),
  list_price: z.string().describe('Original list price, or empty if not applicable'),
  rating: z.string().describe('Average customer rating (0-5)'),
  review_count: z.number().int().describe('Number of customer reviews'),
  image_url: z.string().describe('Product image URL'),
  buyable: z.boolean().describe('Whether the product can be purchased online'),
  in_stock: z.boolean().describe('Whether the product is in stock'),
  program_types: z.string().describe('Fulfillment channels (e.g., "ShipIt,InWarehouse")'),
  membership_required: z.boolean().describe('Whether Costco membership is required'),
  marketing_statement: z.string().describe('Promotional headline (e.g., "$150 OFF")'),
  promotional_statement: z.string().describe('Promotional details'),
  features: z.string().describe('Key product features (from auxDescription2)'),
  max_order_qty: z.number().int().describe('Maximum order quantity'),
});

export const mapProduct = (c: RawProductCatalog, f?: RawFulfillment) => {
  const brand = c.attributes?.find(a => a.key === 'Brand')?.value ?? c.fieldData?.mfName ?? '';
  const imageName = c.fieldData?.imageName ?? '';
  // imageName may be a full URL or just a filename
  const imageUrl = imageName.startsWith('http')
    ? imageName
    : imageName
      ? `https://bfasset.costco-static.com/U447IH35/as/${imageName}?auto=webp&format=jpg`
      : '';

  const price = f?.price?.toString() ?? c.priceData?.price ?? '0';
  const listPrice = f?.listPrice?.toString() ?? c.priceData?.listPrice ?? '';
  const effectiveListPrice = listPrice === '-1.00000' || listPrice === '-1' ? '' : listPrice;

  return {
    item_number: c.itemNumber ?? '',
    name: stripHtml(c.description?.shortDescription ?? ''),
    brand,
    price: cleanPrice(price),
    list_price: cleanPrice(effectiveListPrice),
    rating: c.additionalFieldData?.rating ?? '0',
    review_count: c.additionalFieldData?.numberOfRating ?? 0,
    image_url: imageUrl,
    buyable: c.buyable === 1,
    in_stock: true, // default to true; inventory check provides real data
    program_types: c.programTypes ?? '',
    membership_required: c.additionalFieldData?.membershipReqd === 1,
    marketing_statement: c.description?.marketingStatement ?? '',
    promotional_statement: stripHtml(c.description?.promotionalStatement ?? ''),
    features: stripHtml(c.description?.auxDescription2 ?? ''),
    max_order_qty: Number.parseInt(c.additionalFieldData?.maxItemOrderQty ?? '9999', 10),
  };
};

// ─── Inventory ────────────────────────────────────────────────────────────────

export const inventorySchema = z.object({
  item_number: z.string().describe('Costco item number'),
  online_available: z.boolean().describe('Available for online purchase/shipping'),
  online_status: z.string().describe('Online availability status (INSTOCK/NOSTOCK/LOWSTOCK)'),
  in_warehouse: z.boolean().describe('Available in physical warehouse'),
  warehouse_status: z.string().describe('Warehouse availability status'),
  pickup_available: z.boolean().describe('Available for warehouse pickup'),
  pickup_order_cutoff: z.string().describe('Pickup order cutoff time (ISO 8601)'),
  pickup_date: z.string().describe('Expected pickup date (ISO 8601)'),
  max_pickup_units: z.number().int().describe('Maximum units available for pickup'),
  third_party_delivery: z.boolean().describe('Available via third-party delivery'),
});

export const mapInventory = (inv: RawInventoryItem) => {
  const pt = inv.programTypes ?? {};
  const online = pt.siteControlledInventory;
  const warehouse = pt.inWarehouse;
  const pickup = pt.useWarehouseInventory;
  const thirdParty = pt['3rdPartyDelivery'];

  return {
    item_number: inv.itemNumber ?? '',
    online_available: online?.availability === 'INSTOCK' || online?.availability === 'LOWSTOCK',
    online_status: online?.availability ?? 'UNKNOWN',
    in_warehouse: warehouse?.availability === 'INSTOCK' || warehouse?.availability === 'LOWSTOCK',
    warehouse_status: warehouse?.availability ?? 'UNKNOWN',
    pickup_available: pickup?.buyable === true,
    pickup_order_cutoff: pickup?.orderCutOff ?? '',
    pickup_date: pickup?.orderPickup ?? '',
    max_pickup_units: pickup?.maxUnitsAvailable ?? 0,
    third_party_delivery: thirdParty?.availability === 'INSTOCK' || thirdParty?.availability === 'LOWSTOCK',
  };
};

// ─── Geo Location ─────────────────────────────────────────────────────────────

export const geoLocationSchema = z.object({
  postal_code: z.string().describe('ZIP or postal code'),
  city: z.string().describe('City name'),
  state: z.string().describe('State or province name'),
  state_abbreviation: z.string().describe('State/province abbreviation (e.g., "CA")'),
  country: z.string().describe('Country code (e.g., "USA")'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  timezone: z.string().describe('Timezone name (e.g., "Pacific")'),
});

export const mapGeoLocation = (loc: RawGeoLocation) => ({
  postal_code: loc.postalCode ?? '',
  city: loc.city ?? '',
  state: loc.stateProvince ?? '',
  state_abbreviation: loc.stateProvinceAbbreviation ?? '',
  country: loc.country ?? '',
  latitude: loc.latitude ?? 0,
  longitude: loc.longitude ?? 0,
  timezone: loc.timeZone ?? '',
});

// ─── Lists ────────────────────────────────────────────────────────────────────

export const listSchema = z.object({
  id: z.string().describe('List ID'),
  title: z.string().describe('List title'),
  description: z.string().describe('List description'),
  item_count: z.number().int().describe('Number of items in the list'),
  created_at: z.string().describe('Date the list was created'),
  updated_at: z.string().describe('Date the list was last modified'),
});

export const mapList = (list: RawList) => ({
  id: list.id ?? '',
  title: list.title ?? '',
  description: list.description ?? '',
  item_count: list.itemCount ?? 0,
  created_at: list.createdDate ?? '',
  updated_at: list.modifiedDate ?? '',
});

export const listEntrySchema = z.object({
  id: z.string().describe('List entry ID'),
  item_number: z.string().describe('Costco item number'),
  comment: z.string().describe('User comment on the item'),
  quantity: z.number().int().describe('Quantity saved'),
});

export const mapListEntry = (entry: RawListEntry) => ({
  id: entry.id ?? '',
  item_number: entry.itemNumber ?? '',
  comment: entry.comment ?? '',
  quantity: entry.quantity ?? 1,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stripHtml = (html: string): string => {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const cleanPrice = (price: string): string => {
  if (!price || price === '0' || price === '0.00000') return '0';
  // Remove trailing zeros from prices like "1299.99000"
  const num = Number.parseFloat(price);
  return Number.isNaN(num) ? price : num.toFixed(2);
};
