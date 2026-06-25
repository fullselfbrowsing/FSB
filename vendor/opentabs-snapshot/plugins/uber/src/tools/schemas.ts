import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  picture_url: z.string().describe('Profile picture URL'),
});

export interface RawUser {
  firstName?: string;
  lastName?: string;
  pictureUrl?: string;
}

export const mapUser = (u: RawUser) => ({
  first_name: u.firstName ?? '',
  last_name: u.lastName ?? '',
  picture_url: u.pictureUrl ?? '',
});

// --- Location ---

export const locationSchema = z.object({
  id: z.string().describe('Uber place ID'),
  address_line1: z.string().describe('Primary address line'),
  address_line2: z.string().describe('City and state'),
  provider: z.string().describe('Location data provider'),
  type: z.string().describe('Location type (e.g., LOCATION)'),
  tag: z.string().describe('Location tag (e.g., AIRPORT, RESTAURANT) if available'),
  categories: z.array(z.string()).describe('Location categories'),
});

export interface RawLocation {
  id?: string;
  addressLine1?: string;
  addressLine2?: string;
  provider?: string;
  type?: string;
  tag?: string;
  categories?: string[];
}

export const mapLocation = (l: RawLocation) => ({
  id: l.id ?? '',
  address_line1: l.addressLine1 ?? '',
  address_line2: l.addressLine2 ?? '',
  provider: l.provider ?? '',
  type: l.type ?? '',
  tag: l.tag ?? '',
  categories: l.categories ?? [],
});

// --- Past Activity ---

export const pastActivitySchema = z.object({
  title: z.string().describe('Trip destination or activity name'),
  subtitle: z.string().describe('Date and time of the activity'),
  amount: z.string().describe('Trip cost (e.g., "$17.46")'),
  order_type: z.string().describe('Order type (e.g., ORDER_TYPE_MOBILITY)'),
  details_url: z.string().describe('URL to view full trip details'),
  rebook_url: z.string().describe('URL to rebook this trip'),
  thumbnail_url: z.string().describe('Vehicle type thumbnail image URL'),
  map_url: z.string().describe('Static map image URL showing the route'),
});

export interface RawPastActivity {
  title?: string;
  subTitle?: string;
  tertiaryTitle?: string;
  orderType?: string;
  detailsUrl?: string;
  ctaUrl?: string;
  thumbnailImageUrl?: string;
  cardImageUrl?: string;
}

export const mapPastActivity = (a: RawPastActivity) => ({
  title: a.title ?? '',
  subtitle: a.subTitle ?? '',
  amount: a.tertiaryTitle ?? '',
  order_type: a.orderType ?? '',
  details_url: a.detailsUrl ?? '',
  rebook_url: a.ctaUrl ?? '',
  thumbnail_url: a.thumbnailImageUrl ?? '',
  map_url: a.cardImageUrl ?? '',
});

// --- Product Suggestion ---

export const productSuggestionSchema = z.object({
  name: z.string().describe('Product name (e.g., "Ride", "Reserve", "Courier")'),
  description: z.string().describe('Short description of the product'),
  type: z.string().describe('Navigation item type identifier'),
  url: z.string().describe('URL to launch this product'),
  image_url: z.string().describe('Product icon/image URL'),
});

export interface RawProductSuggestion {
  primaryText?: string;
  secondaryText?: string;
  type?: string;
  url?: string;
  imageUrl?: string;
}

export const mapProductSuggestion = (s: RawProductSuggestion) => ({
  name: s.primaryText ?? '',
  description: s.secondaryText ?? '',
  type: s.type ?? '',
  url: s.url ?? '',
  image_url: s.imageUrl ?? '',
});

// --- Membership ---

export const membershipSchema = z.object({
  average_monthly_savings: z.string().describe('Average monthly savings amount (e.g., "$30.00")'),
  monthly_price: z.string().describe('Monthly membership price (e.g., "$9.99")'),
  potential_savings: z.string().describe('Potential savings for non-members'),
});

interface AmountE5 {
  amountE5?: string;
  currencyCode?: string;
}

export interface RawMembershipResponse {
  response?: {
    savings_average_monthly_savings?: AmountE5;
    offering_monthly_offering_price?: AmountE5;
    savings_nonmember_potential_savings?: AmountE5;
  };
}

const formatAmountE5 = (a?: AmountE5): string => {
  if (!a?.amountE5) return '';
  const dollars = Number.parseInt(a.amountE5, 10) / 100_000;
  const code = a.currencyCode ?? 'USD';
  return `$${dollars.toFixed(2)} ${code}`;
};

export const mapMembership = (m: RawMembershipResponse) => ({
  average_monthly_savings: formatAmountE5(m.response?.savings_average_monthly_savings),
  monthly_price: formatAmountE5(m.response?.offering_monthly_offering_price),
  potential_savings: formatAmountE5(m.response?.savings_nonmember_potential_savings),
});

// --- Enabled Products ---

export const enabledProductSchema = z.object({
  product_key: z.string().describe('Product identifier (e.g., RIDE, CONNECT, RENT)'),
  title: z.string().describe('Display title for the product'),
});

export interface RawEnabledProducts {
  enabledProducts?: Record<string, { defaultTitle?: string }>;
}

export const mapEnabledProducts = (data: RawEnabledProducts) => {
  const products = data.enabledProducts ?? {};
  return Object.entries(products).map(([key, val]) => ({
    product_key: key,
    title: val.defaultTitle ?? key,
  }));
};
