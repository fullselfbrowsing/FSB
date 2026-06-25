import { z } from 'zod';
import type { RawListing, RawSearchUser, AutocompleteResult } from '../zillow-api.js';

// --- Listing schema ---

export const listingSchema = z.object({
  zpid: z.string().describe('Zillow property ID'),
  address: z.string().describe('Full address'),
  street: z.string().describe('Street address'),
  city: z.string().describe('City'),
  state: z.string().describe('State abbreviation'),
  zipcode: z.string().describe('ZIP code'),
  price: z.string().describe('Formatted price (e.g., "$500,000" or "$4,085/mo")'),
  price_raw: z.number().describe('Numeric price in dollars'),
  beds: z.number().describe('Number of bedrooms'),
  baths: z.number().describe('Number of bathrooms'),
  sqft: z.number().describe('Living area in square feet'),
  status: z.string().describe('Listing status (FOR_SALE, FOR_RENT, RECENTLY_SOLD)'),
  status_text: z.string().describe('Human-readable status (e.g., "Condo for sale")'),
  home_type: z.string().describe('Property type (SINGLE_FAMILY, CONDO, TOWNHOUSE, etc.)'),
  days_on_zillow: z.number().describe('Days listed on Zillow'),
  zestimate: z.number().describe('Zillow Zestimate value in dollars (0 if unavailable)'),
  rent_zestimate: z.number().describe('Estimated monthly rent in dollars (0 if unavailable)'),
  tax_assessed_value: z.number().describe('Tax assessed value in dollars (0 if unavailable)'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  image_url: z.string().describe('Primary listing photo URL'),
  detail_url: z.string().describe('URL to the property detail page on Zillow'),
  is_saved: z.boolean().describe("Whether the property is saved to the user's favorites"),
  has_3d_model: z.boolean().describe('Whether a 3D virtual tour is available'),
});

export const mapListing = (l: RawListing) => ({
  zpid: l.zpid ?? '',
  address: l.address ?? '',
  street: l.addressStreet ?? '',
  city: l.addressCity ?? l.hdpData?.homeInfo?.city ?? '',
  state: l.addressState ?? l.hdpData?.homeInfo?.state ?? '',
  zipcode: l.addressZipcode ?? l.hdpData?.homeInfo?.zipcode ?? '',
  price: l.price ?? '',
  price_raw: l.unformattedPrice ?? l.hdpData?.homeInfo?.price ?? 0,
  beds: l.beds ?? l.hdpData?.homeInfo?.bedrooms ?? 0,
  baths: l.baths ?? l.hdpData?.homeInfo?.bathrooms ?? 0,
  sqft: l.area ?? l.hdpData?.homeInfo?.livingArea ?? 0,
  status: l.statusType ?? l.hdpData?.homeInfo?.homeStatus ?? '',
  status_text: l.statusText ?? '',
  home_type: l.hdpData?.homeInfo?.homeType ?? '',
  days_on_zillow: l.hdpData?.homeInfo?.daysOnZillow ?? 0,
  zestimate: l.zestimate ?? l.hdpData?.homeInfo?.zestimate ?? 0,
  rent_zestimate: l.hdpData?.homeInfo?.rentZestimate ?? 0,
  tax_assessed_value: l.hdpData?.homeInfo?.taxAssessedValue ?? 0,
  latitude: l.latLong?.latitude ?? l.hdpData?.homeInfo?.latitude ?? 0,
  longitude: l.latLong?.longitude ?? l.hdpData?.homeInfo?.longitude ?? 0,
  image_url: l.imgSrc ?? '',
  detail_url: l.detailUrl ?? '',
  is_saved: l.isSaved ?? false,
  has_3d_model: l.has3DModel ?? false,
});

// --- User schema ---

export const userSchema = z.object({
  is_logged_in: z.boolean().describe('Whether the user is logged in'),
  email: z.string().describe('User email address'),
  display_name: z.string().describe('User display name'),
  full_name: z.string().describe('User full name'),
  guid: z.string().describe('Global user ID'),
  zuid: z.string().describe('Zillow user ID'),
  saved_homes_count: z.number().describe('Number of saved homes'),
  is_agent: z.boolean().describe('Whether the user is a real estate agent'),
});

export const mapUser = (u: RawSearchUser) => ({
  is_logged_in: u.isLoggedIn ?? false,
  email: u.email ?? '',
  display_name: u.displayName ?? '',
  full_name: u.fullName ?? '',
  guid: u.guid ?? '',
  zuid: u.zuid ?? '',
  saved_homes_count: u.savedHomesCount ?? 0,
  is_agent: u.isAgent ?? false,
});

// --- Location schema ---

export const locationSchema = z.object({
  display: z.string().describe('Display text for the location'),
  type: z.string().describe('Result type (Region, Address)'),
  city: z.string().describe('City name'),
  state: z.string().describe('State abbreviation'),
  county: z.string().describe('County name'),
  region_id: z.number().describe('Zillow region ID (use with search tools)'),
  region_type: z.string().describe('Region type (city, zipcode, neighborhood, county)'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  zpid: z.number().describe('Zillow property ID (for address results, 0 otherwise)'),
});

export const mapLocation = (r: AutocompleteResult) => ({
  display: r.display ?? '',
  type: r.resultType ?? '',
  city: r.metaData?.city ?? '',
  state: r.metaData?.state ?? '',
  county: r.metaData?.county ?? '',
  region_id: r.metaData?.regionId ?? 0,
  region_type: r.metaData?.regionType ?? '',
  latitude: r.metaData?.lat ?? 0,
  longitude: r.metaData?.lng ?? 0,
  zpid: r.metaData?.zpid ?? 0,
});
