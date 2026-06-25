import { z } from 'zod';
import type { RawSearchBusiness, SearchResultItem } from '../yelp-api.js';

// --- Business (search result) ---

export const businessSchema = z.object({
  id: z.string().describe('Yelp encrypted business ID'),
  alias: z.string().describe('Business URL alias (e.g., "a-slice-of-new-york-san-jose")'),
  name: z.string().describe('Business name'),
  url: z.string().describe('Relative URL path to the business page'),
  rating: z.number().describe('Average star rating (1.0-5.0)'),
  review_count: z.number().int().describe('Total number of reviews'),
  phone: z.string().describe('Formatted phone number'),
  price: z.string().describe('Price range (e.g., "$", "$$", "$$$")'),
  categories: z.array(z.string()).describe('List of category names (e.g., "Pizza", "Italian")'),
  neighborhoods: z.array(z.string()).describe('List of neighborhood names'),
  address: z.string().describe('Formatted street address'),
  is_ad: z.boolean().describe('Whether this result is a paid advertisement'),
  ranking: z.number().int().describe('Position in search results'),
});

export const mapBusiness = (item: SearchResultItem) => {
  const biz: RawSearchBusiness = item.searchResultBusiness ?? {};
  return {
    id: item.bizId ?? '',
    alias: biz.alias ?? '',
    name: biz.name ?? '',
    url: biz.businessUrl ?? '',
    rating: biz.rating ?? 0,
    review_count: biz.reviewCount ?? 0,
    phone: biz.phone ?? '',
    price: biz.priceRange ?? '',
    categories: (biz.categories ?? []).map(c => c.title ?? ''),
    neighborhoods: biz.neighborhoods ?? [],
    address: biz.formattedAddress ?? '',
    is_ad: biz.isAd ?? false,
    ranking: biz.ranking ?? 0,
  };
};

// --- Autocomplete suggestion ---

export const suggestionSchema = z.object({
  query: z.string().describe('Suggested search query text'),
  title: z.string().describe('Display title of the suggestion'),
  subtitle: z.string().describe('Additional context (e.g., location or category)'),
  type: z.string().describe('Suggestion type (e.g., "common", "business", "category")'),
  redirect_url: z.string().describe('Direct URL if the suggestion links to a specific page'),
});

interface RawSuggestion {
  query?: string;
  title?: string;
  subtitle?: string;
  type?: string;
  redirect_url?: string;
}

export const mapSuggestion = (s: RawSuggestion) => ({
  query: s.query ?? '',
  title: s.title ?? '',
  subtitle: s.subtitle ?? '',
  type: s.type ?? '',
  redirect_url: s.redirect_url ?? '',
});

// --- Current user ---

export const currentUserSchema = z.object({
  user_id: z.string().describe('Yelp encrypted user ID'),
});
