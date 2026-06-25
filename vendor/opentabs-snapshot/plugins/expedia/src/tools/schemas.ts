import { z } from 'zod';

// --- Shared utilities ---

/** Converts YYYY-MM-DD to MM/DD/YYYY for Expedia URL parameters */
export const formatDateForUrl = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-');
  return `${m}/${d}/${y}`;
};

// --- Location suggestion schemas ---

export const locationSuggestionSchema = z.object({
  gaiaId: z.string().describe('Gaia region ID used for property/flight searches'),
  type: z.string().describe('Location type (CITY, AIRPORT, NEIGHBORHOOD, HOTEL, etc.)'),
  fullName: z.string().describe('Full display name with region hierarchy'),
  shortName: z.string().describe('Short display name'),
  latitude: z.string().describe('Latitude coordinate'),
  longitude: z.string().describe('Longitude coordinate'),
  country: z.string().describe('Country name'),
  countryCode: z.string().describe('ISO 2-letter country code'),
  airportCode: z.string().describe('Airport code (empty if not an airport)'),
});

export interface RawTypeaheadResult {
  gaiaId?: string;
  type?: string;
  regionNames?: {
    fullName?: string;
    shortName?: string;
  };
  coordinates?: { lat?: string; long?: string };
  hierarchyInfo?: {
    country?: { name?: string; isoCode2?: string };
    airport?: { airportCode?: string };
  };
}

export const mapLocationSuggestion = (r: RawTypeaheadResult) => ({
  gaiaId: r.gaiaId ?? '',
  type: r.type ?? '',
  fullName: r.regionNames?.fullName ?? '',
  shortName: r.regionNames?.shortName ?? '',
  latitude: r.coordinates?.lat ?? '',
  longitude: r.coordinates?.long ?? '',
  country: r.hierarchyInfo?.country?.name ?? '',
  countryCode: r.hierarchyInfo?.country?.isoCode2 ?? '',
  airportCode: r.hierarchyInfo?.airport?.airportCode ?? '',
});

// --- Hotel listing schemas ---

export const hotelListingSchema = z.object({
  name: z.string().describe('Hotel name'),
  nightlyPrice: z.string().describe('Nightly price display text (e.g. "$267 nightly")'),
  totalPrice: z.string().describe('Total price display text (e.g. "$619 total")'),
  strikeOutPrice: z.string().describe('Original price before discount (empty if none)'),
  priceNote: z.string().describe('Price note (e.g. "Total with taxes and fees")'),
});

export interface RawLodgingCard {
  headingSection?: { heading?: string };
  priceSection?: {
    priceSummary?: {
      displayMessages?: Array<{
        lineItems?: Array<{
          __typename?: string;
          value?: string;
          price?: { formatted?: string };
        }>;
      }>;
    };
  };
}

export const mapHotelListing = (card: RawLodgingCard) => {
  const messages = card.priceSection?.priceSummary?.displayMessages ?? [];
  const nightlyLine = messages[0]?.lineItems?.[0];
  const priceLine = messages[1]?.lineItems ?? [];
  const noteLine = messages[2]?.lineItems?.[0];

  const prices = priceLine.filter(li => li.price?.formatted);
  const totalPrice = prices[prices.length - 1]?.price?.formatted ?? '';
  const strikeOutPrice = prices.length > 1 ? (prices[0]?.price?.formatted ?? '') : '';

  return {
    name: card.headingSection?.heading ?? '',
    nightlyPrice: nightlyLine?.value ?? '',
    totalPrice,
    strikeOutPrice,
    priceNote: noteLine?.value ?? '',
  };
};

// --- Trip schemas ---

export const tripSchema = z.object({
  heading: z.string().describe('Trip heading/title'),
  dates: z.string().describe('Trip date range display text'),
  status: z.string().describe('Trip booking status'),
  type: z.string().describe('Trip type (hotel, flight, etc.)'),
  viewUrl: z.string().describe('URL to view trip details'),
});

export interface RawTripCard {
  __typename?: string;
  heading?: string;
  dates?: string;
  primary?: string;
  secondaries?: string[];
  action?: {
    __typename?: string;
    viewUrl?: string;
    linkAction?: { resource?: { value?: string } };
  };
}

export const mapTrip = (card: RawTripCard) => ({
  heading: card.heading ?? card.primary ?? '',
  dates: card.dates ?? card.secondaries?.[0] ?? '',
  status: card.__typename ?? '',
  type: '',
  viewUrl: card.action?.viewUrl ?? card.action?.linkAction?.resource?.value ?? '',
});

// --- User profile schemas ---

export const userProfileSchema = z.object({
  firstName: z.string().describe('User first name'),
  memberTier: z.string().describe('OneKey loyalty tier name (e.g. "Blue", "Gold")'),
  signedIn: z.boolean().describe('Whether the user is signed in'),
  currency: z.string().describe('Preferred currency code'),
  locale: z.string().describe('Preferred locale (e.g. "en_US")'),
  siteId: z.number().int().describe('Expedia site ID'),
});
