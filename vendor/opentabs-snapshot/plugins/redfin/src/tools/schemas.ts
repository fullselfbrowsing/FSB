import { z } from 'zod';

// --- Location autocomplete result ---

export const locationSchema = z.object({
  id: z.string().describe('Location ID (e.g., "2_17151" for city, "5_340" for county)'),
  name: z.string().describe('Location name (e.g., "San Francisco")'),
  sub_name: z.string().describe('Full location context (e.g., "San Francisco, CA, USA")'),
  type: z.string().describe('Location type code (2=city, 5=county, 6=zip, etc.)'),
  url: z.string().describe('Redfin URL path for this location'),
  active: z.boolean().describe('Whether the location is active on Redfin'),
});

export interface RawLocation {
  id?: string;
  name?: string;
  subName?: string;
  type?: string;
  url?: string;
  active?: boolean;
}

export const mapLocation = (l: RawLocation) => ({
  id: l.id ?? '',
  name: l.name ?? '',
  sub_name: l.subName ?? '',
  type: l.type ?? '',
  url: l.url ?? '',
  active: l.active ?? false,
});

// --- Search property listing ---

export const propertyListingSchema = z.object({
  property_id: z.number().describe('Redfin property ID'),
  listing_id: z.number().describe('Listing ID (0 if no active listing)'),
  mls_id: z.string().describe('MLS listing number'),
  street_line: z.string().describe('Street address'),
  city: z.string().describe('City'),
  state: z.string().describe('State abbreviation'),
  zip: z.string().describe('ZIP code'),
  price: z.number().describe('Listing price in dollars (0 if undisclosed)'),
  beds: z.number().describe('Number of bedrooms'),
  baths: z.number().describe('Number of bathrooms'),
  sqft: z.number().describe('Square footage (0 if unknown)'),
  lot_size: z.number().describe('Lot size in square feet (0 if unknown)'),
  year_built: z.number().describe('Year the home was built (0 if unknown)'),
  hoa: z.number().describe('Monthly HOA fee in dollars (0 if none)'),
  price_per_sqft: z.number().describe('Price per square foot (0 if unknown)'),
  days_on_market: z.number().describe('Days on market (0 if unknown)'),
  property_type: z.number().describe('Property type code (3=condo, 6=single family, 13=townhouse)'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  url: z.string().describe('Redfin URL path for this property'),
  listing_remarks: z.string().describe('Listing description text (truncated)'),
  is_hot: z.boolean().describe('Whether the property is marked as hot/popular'),
  is_new_construction: z.boolean().describe('Whether the property is new construction'),
  has_virtual_tour: z.boolean().describe('Whether a virtual tour is available'),
  search_status: z.number().describe('Search status (9=for sale, 32=off market, etc.)'),
});

// Many GIS fields use a {level, value} wrapper pattern
interface RawLevelValue<T = number> {
  value?: T;
  level?: number;
}

interface RawLatLong {
  value?: { latitude?: number; longitude?: number };
}

export interface RawPropertyListing {
  propertyId?: number;
  listingId?: number;
  mlsId?: RawLevelValue<string>;
  streetLine?: RawLevelValue<string>;
  city?: string;
  state?: string;
  zip?: string;
  postalCode?: RawLevelValue<string>;
  price?: RawLevelValue;
  beds?: number;
  baths?: number;
  sqFt?: RawLevelValue;
  lotSize?: RawLevelValue;
  yearBuilt?: RawLevelValue;
  hoa?: RawLevelValue;
  pricePerSqFt?: RawLevelValue;
  dom?: RawLevelValue;
  propertyType?: number;
  latLong?: RawLatLong;
  url?: string;
  listingRemarks?: string;
  isHot?: boolean;
  isNewConstruction?: boolean;
  hasVirtualTour?: boolean;
  searchStatus?: number;
}

export const mapPropertyListing = (p: RawPropertyListing) => ({
  property_id: p.propertyId ?? 0,
  listing_id: p.listingId ?? 0,
  mls_id: p.mlsId?.value ?? '',
  street_line: p.streetLine?.value ?? '',
  city: p.city ?? '',
  state: p.state ?? '',
  zip: p.zip ?? p.postalCode?.value ?? '',
  price: p.price?.value ?? 0,
  beds: p.beds ?? 0,
  baths: p.baths ?? 0,
  sqft: p.sqFt?.value ?? 0,
  lot_size: p.lotSize?.value ?? 0,
  year_built: p.yearBuilt?.value ?? 0,
  hoa: p.hoa?.value ?? 0,
  price_per_sqft: p.pricePerSqFt?.value ?? 0,
  days_on_market: p.dom?.value ?? 0,
  property_type: p.propertyType ?? 0,
  latitude: p.latLong?.value?.latitude ?? 0,
  longitude: p.latLong?.value?.longitude ?? 0,
  url: p.url ?? '',
  listing_remarks: (p.listingRemarks ?? '').slice(0, 500),
  is_hot: p.isHot ?? false,
  is_new_construction: p.isNewConstruction ?? false,
  has_virtual_tour: p.hasVirtualTour ?? false,
  search_status: p.searchStatus ?? 0,
});

// --- Property details (aboveTheFold) ---

export const propertyDetailSchema = z.object({
  property_id: z.number().describe('Redfin property ID'),
  street_address: z.string().describe('Full street address'),
  city: z.string().describe('City'),
  state: z.string().describe('State abbreviation'),
  zip: z.string().describe('ZIP code'),
  beds: z.number().describe('Number of bedrooms'),
  baths: z.number().describe('Number of bathrooms'),
  sqft: z.number().describe('Square footage'),
  lot_size: z.number().describe('Lot size in square feet'),
  year_built: z.number().describe('Year built'),
  property_type: z.number().describe('Property type code'),
  price_label: z.string().describe('Price label (e.g., "List Price", "Last Sold Price")'),
  price_amount: z.number().describe('Price amount in dollars'),
  estimated_value: z.number().describe('Redfin Estimate value (0 if unavailable)'),
  latitude: z.number().describe('Latitude'),
  longitude: z.number().describe('Longitude'),
  url: z.string().describe('Redfin URL path'),
  status_label: z.string().describe('Current status (e.g., "For Sale", "Off Market")'),
  photo_count: z.number().describe('Number of photos available'),
});

interface RawStreetAddress {
  assembledAddress?: string;
}

interface RawAvmInfo {
  predictedValue?: number;
  propertyId?: number;
}

interface RawPriceInfo {
  amount?: number;
  label?: string;
}

interface RawAddressSectionInfo {
  streetAddress?: RawStreetAddress;
  city?: string;
  state?: string;
  zip?: string;
  beds?: number;
  baths?: number;
  sqFt?: RawLevelValue;
  lotSize?: number;
  yearBuilt?: number;
  propertyType?: number;
  priceInfo?: RawPriceInfo;
  avmInfo?: RawAvmInfo;
  latLong?: { latitude?: number; longitude?: number };
  url?: string;
  homeStatusLabel?: string;
}

interface RawMediaBrowserInfo {
  photos?: Record<string, unknown> | unknown[];
}

export interface RawAboveTheFoldPayload {
  addressSectionInfo?: RawAddressSectionInfo;
  mediaBrowserInfo?: RawMediaBrowserInfo;
}

export const mapPropertyDetail = (payload: RawAboveTheFoldPayload, propertyId: number) => {
  const addr = payload.addressSectionInfo ?? {};
  const photos = payload.mediaBrowserInfo?.photos;
  let photoCount = 0;
  if (Array.isArray(photos)) photoCount = photos.length;
  else if (photos && typeof photos === 'object') photoCount = Object.keys(photos).length;

  return {
    property_id: propertyId,
    street_address: addr.streetAddress?.assembledAddress ?? '',
    city: addr.city ?? '',
    state: addr.state ?? '',
    zip: addr.zip ?? '',
    beds: addr.beds ?? 0,
    baths: addr.baths ?? 0,
    sqft: addr.sqFt?.value ?? 0,
    lot_size: addr.lotSize ?? 0,
    year_built: addr.yearBuilt ?? 0,
    property_type: addr.propertyType ?? 0,
    price_label: addr.priceInfo?.label ?? '',
    price_amount: addr.priceInfo?.amount ?? 0,
    estimated_value: addr.avmInfo?.predictedValue ?? 0,
    latitude: addr.latLong?.latitude ?? 0,
    longitude: addr.latLong?.longitude ?? 0,
    url: addr.url ?? '',
    status_label: addr.homeStatusLabel ?? '',
    photo_count: photoCount,
  };
};

// --- Property history event ---

export const historyEventSchema = z.object({
  date: z.string().describe('Event date (e.g., "Nov 1, 1995")'),
  description: z.string().describe('Event description (e.g., "Sold (Public Records)", "Listed for sale")'),
  price: z.number().describe('Price at event (0 if undisclosed)'),
  source: z.string().describe('Data source (e.g., "Public Records", "MLS")'),
});

export interface RawHistoryEvent {
  eventDateString?: string;
  eventDescription?: string;
  price?: number;
  priceDisplayLevel?: number;
  source?: string;
}

export const mapHistoryEvent = (e: RawHistoryEvent) => ({
  date: e.eventDateString ?? '',
  description: e.eventDescription ?? '',
  price: e.priceDisplayLevel === 1 ? (e.price ?? 0) : 0,
  source: e.source ?? '',
});

// --- AVM (Automated Valuation Model) estimate ---

export const estimateSchema = z.object({
  predicted_value: z.number().describe('Redfin Estimate value in dollars'),
  num_beds: z.number().describe('Number of bedrooms'),
  num_baths: z.number().describe('Number of bathrooms'),
  sqft: z.number().describe('Square footage'),
  street_address: z.string().describe('Street address'),
});

export const comparableSchema = z.object({
  property_id: z.number().describe('Comparable property ID'),
  street_address: z.string().describe('Street address'),
  beds: z.number().describe('Bedrooms'),
  baths: z.number().describe('Bathrooms'),
  sqft: z.number().describe('Square footage'),
  price: z.number().describe('Last sold price (0 if unavailable)'),
  predicted_value: z.number().describe('Estimated value'),
});

export interface RawAvmPayload {
  predictedValue?: number;
  numBeds?: number;
  numBaths?: number;
  sqFt?: RawLevelValue;
  streetAddress?: RawStreetAddress;
  comparables?: RawComparable[];
}

interface RawComparable {
  propertyId?: number;
  streetAddress?: RawStreetAddress;
  beds?: number;
  baths?: number;
  sqFt?: RawLevelValue;
  lastSoldPrice?: RawLevelValue;
  predictedValue?: number;
}

export const mapEstimate = (p: RawAvmPayload) => ({
  predicted_value: p.predictedValue ?? 0,
  num_beds: p.numBeds ?? 0,
  num_baths: p.numBaths ?? 0,
  sqft: p.sqFt?.value ?? 0,
  street_address: p.streetAddress?.assembledAddress ?? '',
});

export const mapComparable = (c: RawComparable) => ({
  property_id: c.propertyId ?? 0,
  street_address: c.streetAddress?.assembledAddress ?? '',
  beds: c.beds ?? 0,
  baths: c.baths ?? 0,
  sqft: c.sqFt?.value ?? 0,
  price: c.lastSoldPrice?.value ?? 0,
  predicted_value: c.predictedValue ?? 0,
});

// --- Favorite property ---

export const favoriteSchema = z.object({
  property_id: z.number().describe('Redfin property ID'),
  street_address: z.string().describe('Street address'),
  city: z.string().describe('City'),
  state: z.string().describe('State'),
  zip: z.string().describe('ZIP code'),
  price: z.number().describe('Price (0 if undisclosed)'),
  beds: z.number().describe('Bedrooms'),
  baths: z.number().describe('Bathrooms'),
  sqft: z.number().describe('Square footage'),
  year_built: z.number().describe('Year built'),
  url: z.string().describe('Redfin URL path'),
  favorite_date: z.string().describe('Date when favorited'),
  on_market: z.boolean().describe('Whether the property is currently on the market'),
});

interface RawAddressData {
  streetAddress?: string;
  display?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface RawFavoriteOnMarket {
  property?: { id?: number; propertyId?: number };
  address_data?: RawAddressData;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  year_built?: number;
  URL?: string;
  favoriteDate?: string;
}

export interface RawFavoriteOffMarket {
  id?: number;
  address_data?: RawAddressData;
  listing?: { price?: number };
  beds?: number;
  baths?: number;
  sqft?: number;
  year_built?: number;
  URL?: string;
  favoriteDate?: string;
}

export const mapFavoriteOnMarket = (f: RawFavoriteOnMarket) => ({
  property_id: f.property?.id ?? f.property?.propertyId ?? 0,
  street_address: f.address_data?.display ?? f.address_data?.streetAddress ?? '',
  city: f.address_data?.city ?? '',
  state: f.address_data?.state ?? '',
  zip: f.address_data?.zip ?? '',
  price: f.price ?? 0,
  beds: f.beds ?? 0,
  baths: f.baths ?? 0,
  sqft: f.sqft ?? 0,
  year_built: f.year_built ?? 0,
  url: f.URL ?? '',
  favorite_date: f.favoriteDate ?? '',
  on_market: true,
});

export const mapFavoriteOffMarket = (f: RawFavoriteOffMarket) => ({
  property_id: f.id ?? 0,
  street_address: f.address_data?.streetAddress ?? '',
  city: f.address_data?.city ?? '',
  state: f.address_data?.state ?? '',
  zip: f.address_data?.zip ?? '',
  price: f.listing?.price ?? 0,
  beds: f.beds ?? 0,
  baths: f.baths ?? 0,
  sqft: f.sqft ?? 0,
  year_built: f.year_built ?? 0,
  url: f.URL ?? '',
  favorite_date: f.favoriteDate ?? '',
  on_market: false,
});

// --- School ---

export const schoolSchema = z.object({
  name: z.string().describe('School name'),
  rating: z.number().describe('School rating (1-10, 0 if unrated)'),
  grades: z.string().describe('Grade range (e.g., "K-5", "6-8")'),
  type: z.string().describe('School type (e.g., "Public", "Private")'),
  distance: z.string().describe('Distance from property'),
});

export interface RawSchool {
  name?: string;
  rating?: number;
  gradeRanges?: string;
  schoolType?: string;
  distance?: string;
  distanceInMiles?: number;
}

export const mapSchool = (s: RawSchool) => ({
  name: s.name ?? '',
  rating: s.rating ?? 0,
  grades: s.gradeRanges ?? '',
  type: s.schoolType ?? '',
  distance: s.distance ?? (s.distanceInMiles != null ? `${s.distanceInMiles} mi` : ''),
});

// --- Risk factor ---

export const riskFactorSchema = z.object({
  type: z.string().describe('Risk type (flood, fire, heat, wind, air)'),
  score: z.number().describe('Risk score (0-10, 0 if unavailable)'),
  label: z.string().describe('Risk label (e.g., "Minimal", "Moderate", "Major")'),
  description: z.string().describe('Risk description'),
});

interface RawRiskData {
  floodFactor?: number;
  fireFactor?: number;
  heatFactor?: number;
  windFactor?: number;
  airFactor?: number;
  expandableHeading?: string;
  expandableSummary?: { value?: string };
}

export const mapRiskFactor = (type: string, data: RawRiskData | null | undefined) => {
  const factorKey = `${type}Factor` as keyof RawRiskData;
  const score = (data?.[factorKey] as number | undefined) ?? 0;
  return {
    type,
    score,
    label: data?.expandableHeading ?? '',
    description: data?.expandableSummary?.value ?? '',
  };
};

// --- Comparable rental ---

export const comparableRentalSchema = z.object({
  property_id: z.string().describe('Property ID'),
  street_address: z.string().describe('Street address'),
  city: z.string().describe('City'),
  state: z.string().describe('State'),
  zip: z.string().describe('ZIP code'),
  beds_min: z.number().describe('Minimum bedrooms'),
  beds_max: z.number().describe('Maximum bedrooms'),
  baths_min: z.number().describe('Minimum bathrooms'),
  baths_max: z.number().describe('Maximum bathrooms'),
  rent_min: z.number().describe('Minimum rent per month'),
  rent_max: z.number().describe('Maximum rent per month'),
  description: z.string().describe('Listing description (truncated)'),
  url: z.string().describe('Redfin URL path'),
});

interface RawRentalAddress {
  formattedStreetLine?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface RawRentalRange {
  min?: number;
  max?: number;
}

interface RawRentalExtension {
  bedRange?: RawRentalRange;
  bathRange?: RawRentalRange;
  rentPriceRange?: RawRentalRange;
  description?: string;
}

export interface RawComparableRental {
  homeData?: {
    propertyId?: string;
    url?: string;
    addressInfo?: RawRentalAddress;
  };
  rentalExtension?: RawRentalExtension;
}

export const mapComparableRental = (r: RawComparableRental) => ({
  property_id: r.homeData?.propertyId ?? '',
  street_address: r.homeData?.addressInfo?.formattedStreetLine ?? '',
  city: r.homeData?.addressInfo?.city ?? '',
  state: r.homeData?.addressInfo?.state ?? '',
  zip: r.homeData?.addressInfo?.zip ?? '',
  beds_min: r.rentalExtension?.bedRange?.min ?? 0,
  beds_max: r.rentalExtension?.bedRange?.max ?? 0,
  baths_min: r.rentalExtension?.bathRange?.min ?? 0,
  baths_max: r.rentalExtension?.bathRange?.max ?? 0,
  rent_min: r.rentalExtension?.rentPriceRange?.min ?? 0,
  rent_max: r.rentalExtension?.rentPriceRange?.max ?? 0,
  description: (r.rentalExtension?.description ?? '').slice(0, 300),
  url: r.homeData?.url ?? '',
});

// --- User profile ---

export const userProfileSchema = z.object({
  login_id: z.number().describe('User login ID'),
  first_name: z.string().describe('First name'),
  photo_url: z.string().describe('Profile photo URL'),
});

export interface RawUserProfile {
  loginId?: number;
  firstName?: string;
  userPhotoUrl?: string;
}

export const mapUserProfile = (u: RawUserProfile) => ({
  login_id: u.loginId ?? 0,
  first_name: u.firstName ?? '',
  photo_url: u.userPhotoUrl ?? '',
});

// --- Shared belowTheFold payload type ---
// Used by get-property-history, get-property-schools, get-property-risk-factors, get-property-amenities

interface RawAmenityEntry {
  amenityName?: string;
  amenityValues?: string[];
  referenceName?: string;
}

interface RawAmenityGroup {
  groupTitle?: string;
  amenityEntries?: RawAmenityEntry[];
}

interface RawSuperGroup {
  titleString?: string;
  amenityGroups?: RawAmenityGroup[];
}

interface RawRiskFactorPayload {
  floodData?: RawRiskData | null;
  fireData?: RawRiskData | null;
  heatData?: RawRiskData | null;
  windData?: RawRiskData | null;
  airData?: RawRiskData | null;
}

export interface BelowTheFoldPayload {
  amenitiesInfo?: {
    superGroups?: RawSuperGroup[];
    totalAmenities?: number;
  };
  propertyHistoryInfo?: {
    events?: RawHistoryEvent[];
    hasPropertyHistory?: boolean;
  };
  schoolsAndDistrictsInfo?: {
    servingThisHomeSchools?: RawSchool[];
    totalSchoolsServiced?: number;
  };
  riskFactorData?: RawRiskFactorPayload;
}
