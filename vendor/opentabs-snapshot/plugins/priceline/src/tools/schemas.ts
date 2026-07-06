import { z } from 'zod';

// --- Location / Search Item ---

export const searchItemSchema = z.object({
  id: z.string().describe('Location ID (city ID, POI ID, etc.)'),
  name: z.string().describe('Location name'),
  type: z.string().describe('Location type (CITY, HOTEL, POI, AIRPORT, NEIGHBORHOOD, GENAI_POI)'),
  city_name: z.string().describe('City name'),
  state_code: z.string().describe('State/province code'),
  country_code: z.string().describe('Country code (e.g., US)'),
  country_name: z.string().describe('Country name'),
  latitude: z.number().describe('Latitude'),
  longitude: z.number().describe('Longitude'),
  display_line_1: z.string().describe('Primary display text'),
  display_line_2: z.string().describe('Secondary display text (region)'),
});

export interface RawSearchItem {
  id?: string;
  itemName?: string;
  type?: string;
  cityName?: string;
  stateCode?: string;
  countryCode?: string;
  countryName?: string;
  lat?: number;
  lon?: number;
  displayLine1?: string;
  displayLine2?: string;
}

export const mapSearchItem = (item: RawSearchItem) => ({
  id: item.id ?? '',
  name: item.itemName ?? '',
  type: item.type ?? '',
  city_name: item.cityName ?? '',
  state_code: item.stateCode ?? '',
  country_code: item.countryCode ?? '',
  country_name: item.countryName ?? '',
  latitude: item.lat ?? 0,
  longitude: item.lon ?? 0,
  display_line_1: item.displayLine1 ?? '',
  display_line_2: item.displayLine2 ?? '',
});

// --- Hotel Listing ---

export const hotelListingSchema = z.object({
  hotel_id: z.string().describe('Priceline hotel ID'),
  name: z.string().describe('Hotel name'),
  star_rating: z.number().int().describe('Star rating (1-5)'),
  guest_rating: z.number().describe('Overall guest rating (0-10)'),
  total_price: z.number().describe('Total price for the stay in USD'),
  avg_nightly_rate: z.number().describe('Average nightly rate in USD'),
  display_savings_pct: z.number().int().describe('Savings percentage displayed'),
  hotel_type: z.string().describe('Hotel type (RTL=retail, SOPQ=opaque deal)'),
  brand_id: z.string().describe('Hotel brand ID'),
  thumbnail_url: z.string().describe('Thumbnail image URL'),
  description: z.string().describe('Short hotel description'),
  free_cancellation: z.boolean().describe('Whether free cancellation is available'),
  pay_later: z.boolean().describe('Whether pay-at-hotel is available'),
  breakfast_included: z.boolean().describe('Whether breakfast is included'),
  latitude: z.number().describe('Hotel latitude'),
  longitude: z.number().describe('Hotel longitude'),
  neighborhood: z.string().describe('Neighborhood or area name'),
  amenities: z.array(z.string()).describe('List of top amenity names (e.g., Free WiFi, Pool)'),
});

export interface RawHotelListing {
  hotelId?: string;
  name?: string;
  starRating?: number;
  overallGuestRating?: number;
  ratesSummary?: {
    minPrice?: number;
    avgNightlyRate?: number;
    freeCancellation?: boolean;
    payLater?: boolean;
    breakfastIncluded?: boolean;
  };
  displaySavingsPct?: number;
  hotelType?: string;
  brandId?: string;
  thumbnailUrl?: string;
  description?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    neighborhoodName?: string;
  };
  hotelFeatures?: {
    rankedAmenityList?: string[];
  };
}

export const mapHotelListing = (h: RawHotelListing) => ({
  hotel_id: h.hotelId ?? '',
  name: h.name ?? '',
  star_rating: h.starRating ?? 0,
  guest_rating: h.overallGuestRating ?? 0,
  total_price: h.ratesSummary?.minPrice ?? 0,
  avg_nightly_rate: h.ratesSummary?.avgNightlyRate ?? 0,
  display_savings_pct: h.displaySavingsPct ?? 0,
  hotel_type: h.hotelType ?? '',
  brand_id: h.brandId ?? '',
  thumbnail_url: h.thumbnailUrl ?? '',
  description: h.description ?? '',
  free_cancellation: h.ratesSummary?.freeCancellation ?? false,
  pay_later: h.ratesSummary?.payLater ?? false,
  breakfast_included: h.ratesSummary?.breakfastIncluded ?? false,
  latitude: h.location?.latitude ?? 0,
  longitude: h.location?.longitude ?? 0,
  neighborhood: h.location?.neighborhoodName ?? '',
  amenities: h.hotelFeatures?.rankedAmenityList ?? [],
});

// --- City Info ---

export const cityInfoSchema = z.object({
  city_id: z.number().int().describe('Priceline city ID'),
  city_name: z.string().describe('City name'),
  state_code: z.string().describe('State/province code'),
  country_code: z.string().describe('Country code'),
  display_name: z.string().describe('Full display name (e.g., South Lake Tahoe, CA)'),
  latitude: z.number().describe('City center latitude'),
  longitude: z.number().describe('City center longitude'),
});

export interface RawCityInfo {
  cityId?: number;
  cityName?: string;
  stateCode?: string;
  countryCode?: string;
  displayCityName?: string;
  lat?: number;
  lon?: number;
}

export const mapCityInfo = (c: RawCityInfo) => ({
  city_id: c.cityId ?? 0,
  city_name: c.cityName ?? '',
  state_code: c.stateCode ?? '',
  country_code: c.countryCode ?? '',
  display_name: c.displayCityName ?? '',
  latitude: c.lat ?? 0,
  longitude: c.lon ?? 0,
});

// --- Customer Profile ---

export const customerProfileSchema = z.object({
  loyalty_tier: z.string().describe('VIP loyalty tier label (e.g., BLUE, GOLD)'),
  audiences: z
    .array(
      z.object({
        id: z.string().describe('Audience ID'),
        name: z.string().describe('Audience name'),
      }),
    )
    .describe('Customer audience segments'),
});

interface RawAudience {
  id?: string;
  name?: string;
}

export interface RawCustomerProfile {
  loyalty?: { tierLabel?: string };
  audiences?: RawAudience[];
}

export const mapCustomerProfile = (p: RawCustomerProfile) => ({
  loyalty_tier: p.loyalty?.tierLabel ?? '',
  audiences: (p.audiences ?? []).map(a => ({
    id: a.id ?? '',
    name: a.name ?? '',
  })),
});

// --- Price Guidance ---

export const priceGuidanceEntrySchema = z.object({
  date: z.string().describe('Date in YYYYMMDD format'),
  min_price: z.number().int().describe('Minimum hotel price for this date'),
  max_price: z.number().int().describe('Maximum hotel price for this date'),
  avg_price: z.number().int().describe('Average hotel price for this date'),
  star_rating: z.string().describe('Star rating filter (All_Star, Star_2, Star_3, Star_4, Star_5)'),
  product: z.string().describe('Product type (RTL=retail, SOPQ=opaque)'),
});

interface RawPriceGuidanceValue {
  minPrice?: number;
  maxPrice?: number;
  avgPrice?: number;
  starRating?: string;
  product?: string;
}

export interface RawDatePriceMap {
  date?: string;
  values?: RawPriceGuidanceValue[];
}

export const mapPriceGuidance = (entry: RawDatePriceMap, value: RawPriceGuidanceValue) => ({
  date: entry.date ?? '',
  min_price: value.minPrice ?? 0,
  max_price: value.maxPrice ?? 0,
  avg_price: value.avgPrice ?? 0,
  star_rating: value.starRating ?? '',
  product: value.product ?? '',
});

// --- Dynamic Filter ---

export const dynamicFilterSchema = z.object({
  type: z.string().describe('Filter category (AMENITY, PRICE, ZONE, DEAL_TYPE, RATE_OPTIONS, etc.)'),
  values: z
    .array(
      z.object({
        key: z.string().describe('Machine-readable filter key'),
        display: z.string().describe('Human-readable filter label'),
      }),
    )
    .describe('Available filter values'),
});

interface RawFilterValue {
  key?: string;
  display?: string;
}

export interface RawDynamicFilter {
  type?: string;
  values?: RawFilterValue[];
}

export const mapDynamicFilter = (f: RawDynamicFilter) => ({
  type: f.type ?? '',
  values: (f.values ?? []).map(v => ({
    key: v.key ?? '',
    display: v.display ?? '',
  })),
});

// --- Hotel Description ---

export const hotelDescriptionSchema = z.object({
  hotel_id: z.string().describe('Hotel ID'),
  short_description: z.string().describe('AI-generated short description'),
});

export interface RawHotelDescription {
  id?: string;
  shortDescription?: string;
}

export const mapHotelDescription = (h: RawHotelDescription) => ({
  hotel_id: h.id ?? '',
  short_description: h.shortDescription ?? '',
});

// --- Merchandising Badge ---

export const merchandisingBadgeSchema = z.object({
  hotel_id: z.string().describe('Hotel ID'),
  is_top_rated: z.boolean().describe('Whether hotel is top-rated'),
  is_top_booked: z.boolean().describe('Whether hotel is top-booked'),
});

export interface RawMerchandisingEntity {
  entityId?: string;
  topBadges?: {
    isTopRated?: boolean;
    isTopBooked?: boolean;
  };
}

export const mapMerchandisingBadge = (e: RawMerchandisingEntity) => ({
  hotel_id: e.entityId ?? '',
  is_top_rated: e.topBadges?.isTopRated ?? false,
  is_top_booked: e.topBadges?.isTopBooked ?? false,
});

// --- Airport / Flight Location ---

export const airportSchema = z.object({
  id: z.string().describe('IATA code for an airport (e.g., JFK, LAX) or city code for a metro area (e.g., NYC)'),
  type: z
    .string()
    .describe('Entry type — AIRPORT for a specific airport, GDS_CITY for a multi-airport metropolitan area'),
  display_name: z
    .string()
    .describe('Full display name (e.g., "New York City, NY - John F Kennedy Intl Airport (JFK)")'),
  city_name: z.string().describe('City name'),
  state_code: z.string().describe('State or province code (US only)'),
  country_code: z.string().describe('ISO country code (e.g., US, GB)'),
  latitude: z.number().describe('Airport latitude in decimal degrees; 0 for multi-airport metro entries'),
  longitude: z.number().describe('Airport longitude in decimal degrees; 0 for multi-airport metro entries'),
  timezone: z.string().describe('IANA timezone name (e.g., America/New_York)'),
});

export interface RawAirport {
  id?: string;
  subType?: string;
  displayName?: string;
  cityName?: string;
  stateCode?: string;
  countryCode?: string;
  lat?: number;
  lon?: number;
  timeZoneName?: string;
}

export const mapAirport = (a: RawAirport) => ({
  id: a.id ?? '',
  type: a.subType ?? '',
  display_name: a.displayName ?? '',
  city_name: a.cityName ?? '',
  state_code: a.stateCode ?? '',
  country_code: a.countryCode ?? '',
  latitude: a.lat ?? 0,
  longitude: a.lon ?? 0,
  timezone: a.timeZoneName ?? '',
});

// --- Flight Price Calendar (airPriceGuideCalendar) ---

export const flightFareRecordSchema = z.object({
  dates: z
    .array(z.string())
    .describe(
      'Travel date(s) in YYYY-MM-DD format. One entry for one-way searches; two entries (depart, return) for round-trip.',
    ),
  min_price: z.number().describe('Minimum fare per passenger in the response currency'),
  currency: z.string().describe('Currency code (e.g., USD)'),
  is_private_fare: z.boolean().describe('Whether the fare is a members-only private rate'),
  stops_by_slice: z
    .array(
      z.object({
        slice_id: z.number().int().describe('Slice number (1 for outbound, 2 for return)'),
        stops: z.number().int().describe('Number of stops for this slice (0 = non-stop)'),
      }),
    )
    .describe('Stop counts for each flight slice'),
  takeoff_times: z.array(z.string()).describe('Departure times per slice in HH:MM (24h)'),
  landing_times: z.array(z.string()).describe('Arrival times per slice in HH:MM (24h)'),
});

interface RawFlightMinFareCommon {
  takeOffTimes?: string[];
  landingTimes?: string[];
}

interface RawFlightStop {
  sliceId?: number;
  stops?: number;
}

export interface RawFlightMinimumFare {
  isPrivateFare?: boolean;
  currency?: string;
  amtPerPax?: number;
  commonAttributes?: RawFlightMinFareCommon;
  listOfStops?: RawFlightStop[];
}

export interface RawFlightFareRecord {
  dates?: string[];
  minimumFare?: RawFlightMinimumFare;
}

export const mapFlightFareRecord = (r: RawFlightFareRecord) => ({
  dates: r.dates ?? [],
  min_price: r.minimumFare?.amtPerPax ?? 0,
  currency: r.minimumFare?.currency ?? '',
  is_private_fare: r.minimumFare?.isPrivateFare ?? false,
  stops_by_slice: (r.minimumFare?.listOfStops ?? []).map(s => ({
    slice_id: s.sliceId ?? 0,
    stops: s.stops ?? 0,
  })),
  takeoff_times: r.minimumFare?.commonAttributes?.takeOffTimes ?? [],
  landing_times: r.minimumFare?.commonAttributes?.landingTimes ?? [],
});

// --- Flight Price Watch (airPriceWatchGetListResponse) ---

export const flightPriceWatchSchema = z.object({
  origin_code: z.string().describe('Origin airport or city code'),
  destination_code: z.string().describe('Destination airport or city code'),
  depart_date: z.string().describe('Outbound date in YYYY-MM-DD format'),
  return_date: z.string().describe('Return date in YYYY-MM-DD format, empty for one-way watches'),
  cabin_class: z.string().describe('Cabin class (ECO, BUS, FIRST)'),
  current_price: z.number().describe('Most recently observed minimum fare'),
  target_price: z.number().describe('User-set target fare for alerts'),
  is_active: z.boolean().describe('Whether the watch is currently active'),
  created_at: z.string().describe('When the watch was created (ISO 8601)'),
});

export interface RawFlightPriceWatch {
  originCityCode?: string;
  originCityId?: string;
  destCityCode?: string;
  destCityId?: string;
  departDate?: string;
  returnDate?: string;
  cabinClass?: string;
  currentPrice?: number;
  targetPrice?: number;
  active?: boolean;
  createdDate?: string;
}

export const mapFlightPriceWatch = (w: RawFlightPriceWatch) => ({
  origin_code: w.originCityCode ?? '',
  destination_code: w.destCityCode ?? '',
  depart_date: w.departDate ?? '',
  return_date: w.returnDate ?? '',
  cabin_class: w.cabinClass ?? '',
  current_price: w.currentPrice ?? 0,
  target_price: w.targetPrice ?? 0,
  is_active: w.active ?? false,
  created_at: w.createdDate ?? '',
});
