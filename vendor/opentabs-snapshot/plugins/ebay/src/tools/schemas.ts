import { z } from 'zod';
import type { RawItemDetail, RawSearchItem, RawWatchlistItem } from '../ebay-api.js';

// --- Search result ---

export const searchItemSchema = z.object({
  item_id: z.string().describe('eBay item ID'),
  title: z.string().describe('Item title'),
  price: z.string().describe('Current price with currency symbol'),
  url: z.string().describe('URL to the item listing on eBay'),
  image: z.string().describe('Thumbnail image URL'),
  condition: z.string().describe('Item condition (New, Used, Refurbished, etc.)'),
  shipping: z.string().describe('Shipping cost or "Free shipping"'),
  bids: z.string().describe('Number of bids (empty for Buy It Now listings)'),
});

export const mapSearchItem = (item: RawSearchItem) => ({
  item_id: item.itemId,
  title: item.title,
  price: item.price,
  url: item.url,
  image: item.image,
  condition: item.condition,
  shipping: item.shipping,
  bids: item.bids,
});

// --- Item detail ---

export const itemDetailSchema = z.object({
  item_id: z.string().describe('eBay item ID'),
  title: z.string().describe('Item title'),
  price: z.string().describe('Current price'),
  currency: z.string().describe('Currency code (e.g., USD)'),
  list_price: z.string().describe('Original list price if discounted, empty otherwise'),
  condition: z.string().describe('Item condition (New, Used, Refurbished, etc.)'),
  availability: z.string().describe('Stock status (InStock, OutOfStock, etc.)'),
  images: z.array(z.string()).describe('Product image URLs'),
  seller: z.string().describe('Seller username'),
  seller_url: z.string().describe('Seller profile URL'),
  url: z.string().describe('Item listing URL'),
  brand: z.string().describe('Brand name'),
  description: z.string().describe('Item description (truncated to 500 chars)'),
  shipping: z.string().describe('Shipping cost or "Free"'),
  return_policy: z.string().describe('Return policy text'),
});

export const mapItemDetail = (item: RawItemDetail) => ({
  item_id: item.itemId,
  title: item.title,
  price: item.price,
  currency: item.currency,
  list_price: item.listPrice,
  condition: item.condition,
  availability: item.availability,
  images: item.images,
  seller: item.seller,
  seller_url: item.sellerUrl,
  url: item.url,
  brand: item.brand,
  description: item.description,
  shipping: item.shipping,
  return_policy: item.returnPolicy,
});

// --- Watchlist item ---

export const watchlistItemSchema = z.object({
  item_id: z.string().describe('eBay item ID'),
  title: z.string().describe('Item title'),
  price: z.string().describe('Current price'),
  url: z.string().describe('Item listing URL'),
  image: z.string().describe('Thumbnail image URL'),
  time_left: z.string().describe('Time remaining for auction or listing'),
});

export const mapWatchlistItem = (item: RawWatchlistItem) => ({
  item_id: item.itemId,
  title: item.title,
  price: item.price,
  url: item.url,
  image: item.image,
  time_left: item.timeLeft,
});

// --- User profile ---

export const userProfileSchema = z.object({
  user_id: z.string().describe('eBay user ID'),
  first_name: z.string().describe('User first name'),
});
