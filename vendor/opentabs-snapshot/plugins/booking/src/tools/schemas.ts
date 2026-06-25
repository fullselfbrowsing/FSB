import { z } from 'zod';

// --- Shared output schemas ---

export const propertySchema = z.object({
  id: z.number().describe('Property ID'),
  name: z.string().describe('Property display name'),
  type: z.string().describe('Accommodation type (e.g., Hotel, Apartment, Hostel)'),
  page_name: z.string().describe('URL-friendly page name slug'),
  address: z.string().describe('Street address'),
  city: z.string().describe('City name'),
  country_code: z.string().describe('Two-letter country code'),
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
  display_location: z.string().describe('Human-readable district/area location'),
  distance_from_center: z.string().describe('Distance from city center'),
  star_rating: z.number().describe('Star rating (0-5)'),
  review_score: z.number().describe('Review score out of 10'),
  review_score_word: z.string().describe('Review score label (e.g., Wonderful, Very Good)'),
  review_count: z.number().describe('Total number of reviews'),
  photo_url: z.string().describe('Main photo URL'),
  url: z.string().describe('Full URL to the property page on Booking.com'),
  is_genius: z.boolean().describe('Whether Genius discount is available'),
  price_text: z.string().describe('Displayed price text'),
  currency: z.string().describe('Price currency code'),
});

export const destinationSchema = z.object({
  dest_id: z.string().describe('Destination ID'),
  dest_type: z.string().describe('Destination type (CITY, REGION, COUNTRY, HOTEL, LANDMARK)'),
  label: z.string().describe('Full destination label'),
  city: z.string().describe('City name'),
  country: z.string().describe('Country name'),
  region: z.string().describe('Region name'),
  image_url: z.string().describe('Destination image URL'),
});

export const tripSchema = z.object({
  id: z.string().describe('Trip/booking ID'),
  property_name: z.string().describe('Property name'),
  property_id: z.number().describe('Property ID'),
  city: z.string().describe('City name'),
  country: z.string().describe('Country name'),
  checkin: z.string().describe('Check-in date (YYYY-MM-DD)'),
  checkout: z.string().describe('Check-out date (YYYY-MM-DD)'),
  status: z.string().describe('Booking status'),
  photo_url: z.string().describe('Property photo URL'),
  url: z.string().describe('URL to the booking details page'),
});

export const wishlistSchema = z.object({
  list_id: z.string().describe('Wishlist ID'),
  name: z.string().describe('Wishlist name'),
  item_count: z.number().describe('Number of items in the list'),
  image_url: z.string().describe('Cover image URL'),
});

export const geniusSchema = z.object({
  level: z.number().describe('Genius loyalty level (1, 2, or 3)'),
  completed_bookings: z.number().describe('Number of completed bookings'),
  next_level_bookings: z.number().describe('Bookings needed for next level'),
  benefits: z.array(z.string()).describe('List of current Genius benefits'),
});

// --- Raw interfaces ---

export interface RawSearchResult {
  basicPropertyData?: {
    id?: number;
    accommodationTypeId?: number;
    pageName?: string;
    location?: {
      address?: string;
      city?: string;
      countryCode?: string;
      latitude?: number;
      longitude?: number;
    };
    photos?: {
      main?: {
        highResUrl?: { relativeUrl?: string };
        lowResUrl?: { relativeUrl?: string };
      };
    };
    reviews?: {
      totalScore?: number;
      reviewsCount?: number;
      totalScoreTextTag?: { translation?: string };
    };
    starRating?: {
      value?: number;
    };
  };
  displayName?: {
    text?: string;
  };
  location?: {
    displayLocation?: string;
    mainDistance?: string;
  };
  geniusInfo?: unknown;
  priceDisplayInfoIrene?: {
    displayPrice?: {
      amountPerStay?: {
        amountUnformatted?: number;
        currency?: string;
        amount?: string;
      };
    };
  };
  blocks?: Array<{
    finalPrice?: {
      amount?: number;
      currency?: string;
    };
  }>;
}

// --- Defensive mappers ---

const BOOKING_BASE = 'https://www.booking.com';

const resolvePhotoUrl = (relativeUrl?: string): string => {
  if (!relativeUrl) return '';
  if (relativeUrl.startsWith('http')) return relativeUrl;
  return `${BOOKING_BASE}${relativeUrl}`;
};

const ACCOMMODATION_TYPES: Record<number, string> = {
  201: 'Apartment',
  202: 'Hostel',
  203: 'Motel',
  204: 'Hotel',
  205: 'Guest House',
  206: 'Bed and Breakfast',
  208: 'Resort',
  210: 'Villa',
  213: 'Capsule Hotel',
  216: 'Holiday Home',
  218: 'Campsite',
  219: 'Boat',
  220: 'Country House',
  221: 'Farm Stay',
  222: 'Luxury Tent',
  223: 'Chalet',
  224: 'Cabin',
  225: 'Ryokan',
  226: 'Riad',
  228: 'Cottage',
};

export const mapProperty = (r: RawSearchResult) => {
  const bp = r.basicPropertyData;
  const loc = bp?.location;
  const photoUrl = resolvePhotoUrl(
    bp?.photos?.main?.highResUrl?.relativeUrl ?? bp?.photos?.main?.lowResUrl?.relativeUrl,
  );
  const price = r.priceDisplayInfoIrene?.displayPrice?.amountPerStay;
  const blockPrice = r.blocks?.[0]?.finalPrice;

  return {
    id: bp?.id ?? 0,
    name: r.displayName?.text ?? '',
    type: ACCOMMODATION_TYPES[bp?.accommodationTypeId ?? 0] ?? 'Property',
    page_name: bp?.pageName ?? '',
    address: loc?.address ?? '',
    city: loc?.city ?? '',
    country_code: loc?.countryCode ?? '',
    latitude: loc?.latitude ?? 0,
    longitude: loc?.longitude ?? 0,
    display_location: r.location?.displayLocation ?? '',
    distance_from_center: r.location?.mainDistance ?? '',
    star_rating: bp?.starRating?.value ?? 0,
    review_score: bp?.reviews?.totalScore ?? 0,
    review_score_word: bp?.reviews?.totalScoreTextTag?.translation ?? '',
    review_count: bp?.reviews?.reviewsCount ?? 0,
    photo_url: photoUrl,
    url: bp?.pageName ? `${BOOKING_BASE}/hotel/${loc?.countryCode ?? 'xx'}/${bp.pageName}.html` : '',
    is_genius: r.geniusInfo != null,
    price_text: price?.amount ?? blockPrice?.amount?.toString() ?? '',
    currency: price?.currency ?? blockPrice?.currency ?? '',
  };
};
