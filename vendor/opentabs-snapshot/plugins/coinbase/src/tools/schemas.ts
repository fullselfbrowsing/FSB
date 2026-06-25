import { z } from 'zod';

// ---------------------------------------------------------------------------
// UserProperties
// ---------------------------------------------------------------------------

export const userPropertiesSchema = z.object({
  uuid: z.string().describe('User UUID'),
  name: z.string().describe('Full display name'),
  email: z.string().describe('Email address'),
  native_currency: z.string().describe('Native fiat currency code (e.g. USD)'),
  avatar_url: z.string().describe('Avatar image URL'),
  created_at: z.string().describe('Account creation date (ISO 8601)'),
  country_code: z.string().describe('Two-letter country code'),
  country_name: z.string().describe('Country name'),
});

export interface RawUserProperties {
  uuid?: string;
  name?: string;
  email?: string;
  nativeCurrency?: string;
  avatarUrl?: string;
  createdAt?: string;
  country?: { code?: string; name?: string };
}

export const mapUserProperties = (u: RawUserProperties) => ({
  uuid: u.uuid ?? '',
  name: u.name ?? '',
  email: u.email ?? '',
  native_currency: u.nativeCurrency ?? '',
  avatar_url: u.avatarUrl ?? '',
  created_at: u.createdAt ?? '',
  country_code: u.country?.code ?? '',
  country_name: u.country?.name ?? '',
});

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export const portfolioSchema = z.object({
  uuid: z.string().describe('Portfolio UUID'),
  name: z.string().describe('Portfolio name (e.g. "Primary")'),
  type: z.string().describe('Portfolio type (e.g. DEFAULT)'),
});

export interface RawPortfolio {
  uuid?: string;
  name?: string;
  type?: string;
}

export const mapPortfolio = (p: RawPortfolio) => ({
  uuid: p.uuid ?? '',
  name: p.name ?? '',
  type: p.type ?? '',
});

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

export const assetSchema = z.object({
  uuid: z.string().describe('Asset UUID'),
  name: z.string().describe('Asset full name (e.g. "Bitcoin")'),
  symbol: z.string().describe('Ticker symbol (e.g. "BTC")'),
  slug: z.string().describe('URL slug (e.g. "bitcoin")'),
  description: z.string().describe('Asset description'),
  color: z.string().describe('Brand color hex code'),
  image_url: z.string().describe('Asset icon image URL'),
  circulating_supply: z.string().describe('Circulating supply as numeric string'),
  max_supply: z.string().describe('Maximum supply as numeric string (empty if uncapped)'),
  market_cap: z.string().describe('Market capitalization in USD as numeric string'),
  volume_24h: z.string().describe('24-hour trading volume in USD as numeric string'),
  all_time_high: z.string().describe('All-time high price in USD as numeric string'),
  unit_price_scale: z.number().describe('Decimal places for price display'),
});

export interface RawAsset {
  uuid?: string;
  name?: string;
  symbol?: string;
  slug?: string;
  description?: string;
  color?: string;
  imageUrl?: string;
  circulatingSupply?: string;
  maxSupply?: string;
  marketCap?: string;
  volume24h?: string;
  allTimeHigh?: string;
  unitPriceScale?: number;
}

export const mapAsset = (a: RawAsset) => ({
  uuid: a.uuid ?? '',
  name: a.name ?? '',
  symbol: a.symbol ?? '',
  slug: a.slug ?? '',
  description: a.description ?? '',
  color: a.color ?? '',
  image_url: a.imageUrl ?? '',
  circulating_supply: a.circulatingSupply ?? '',
  max_supply: a.maxSupply ?? '',
  market_cap: a.marketCap ?? '',
  volume_24h: a.volume24h ?? '',
  all_time_high: a.allTimeHigh ?? '',
  unit_price_scale: a.unitPriceScale ?? 2,
});

// ---------------------------------------------------------------------------
// Asset (summary — lighter version for lists)
// ---------------------------------------------------------------------------

export const assetSummarySchema = z.object({
  uuid: z.string().describe('Asset UUID'),
  name: z.string().describe('Asset full name'),
  symbol: z.string().describe('Ticker symbol'),
  slug: z.string().describe('URL slug'),
  image_url: z.string().describe('Asset icon image URL'),
});

export const mapAssetSummary = (a: RawAsset) => ({
  uuid: a.uuid ?? '',
  name: a.name ?? '',
  symbol: a.symbol ?? '',
  slug: a.slug ?? '',
  image_url: a.imageUrl ?? '',
});

// ---------------------------------------------------------------------------
// Latest Price
// ---------------------------------------------------------------------------

export const latestPriceSchema = z.object({
  price: z.string().describe('Current price as decimal string'),
  timestamp: z.string().describe('Price timestamp (ISO 8601)'),
  quote_currency: z.string().describe('Quote currency (e.g. USD)'),
});

export interface RawLatestPrice {
  price?: string;
  timestamp?: string;
  quoteCurrency?: string;
}

export const mapLatestPrice = (p: RawLatestPrice) => ({
  price: p.price ?? '0',
  timestamp: p.timestamp ?? '',
  quote_currency: p.quoteCurrency ?? 'USD',
});

// ---------------------------------------------------------------------------
// Asset Category
// ---------------------------------------------------------------------------

export const assetCategorySchema = z.object({
  uuid: z.string().describe('Category UUID'),
  name: z.string().describe('Category name'),
  slug: z.string().describe('Category slug'),
  description: z.string().describe('Category description'),
});

export interface RawAssetCategory {
  uuid?: string;
  name?: string;
  slug?: string;
  description?: string;
}

export const mapAssetCategory = (c: RawAssetCategory) => ({
  uuid: c.uuid ?? '',
  name: c.name ?? '',
  slug: c.slug ?? '',
  description: c.description ?? '',
});

// ---------------------------------------------------------------------------
// Asset Network
// ---------------------------------------------------------------------------

export const assetNetworkSchema = z.object({
  display_name: z.string().describe('Network display name (e.g. "Ethereum", "Solana")'),
  chain_id: z.number().nullable().describe('EVM chain ID (null for non-EVM networks)'),
  contract_address: z.string().nullable().describe('Token contract address (null for native assets)'),
});

export interface RawAssetNetwork {
  displayName?: string;
  chainId?: number | null;
  contractAddress?: string | null;
}

export const mapAssetNetwork = (n: RawAssetNetwork) => ({
  display_name: n.displayName ?? '',
  chain_id: n.chainId ?? null,
  contract_address: n.contractAddress ?? null,
});

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export const watchlistItemSchema = z.object({
  uuid: z.string().describe('Watchlist item UUID'),
  type: z.string().describe('Item type (e.g. WATCHLIST_ITEM_TYPE_ASSET)'),
  created_at: z.string().describe('When the item was added (ISO 8601)'),
});

export interface RawWatchlistItem {
  uuid?: string;
  type?: string;
  createdAt?: string;
}

export const mapWatchlistItem = (i: RawWatchlistItem) => ({
  uuid: i.uuid ?? '',
  type: i.type ?? '',
  created_at: i.createdAt ?? '',
});

export const watchlistSchema = z.object({
  uuid: z.string().describe('Watchlist UUID'),
  name: z.string().describe('Watchlist name'),
  description: z.string().describe('Watchlist description'),
  items: z.array(watchlistItemSchema).describe('Items in the watchlist'),
});

export interface RawWatchlist {
  uuid?: string;
  name?: string;
  description?: string;
  items?: RawWatchlistItem[];
}

export const mapWatchlist = (w: RawWatchlist) => ({
  uuid: w.uuid ?? '',
  name: w.name ?? '',
  description: w.description ?? '',
  items: (w.items ?? []).map(mapWatchlistItem),
});

// ---------------------------------------------------------------------------
// Price Alert
// ---------------------------------------------------------------------------

export const priceAlertSchema = z.object({
  uuid: z.string().describe('Alert UUID'),
  target_price: z.string().describe('Target price as decimal string'),
  direction: z.string().describe('Alert direction (e.g. ABOVE, BELOW)'),
  asset_name: z.string().describe('Asset name'),
  asset_symbol: z.string().describe('Asset ticker symbol'),
});

export interface RawPriceAlert {
  uuid?: string;
  targetPrice?: string;
  direction?: string;
  asset?: { name?: string; symbol?: string };
}

export const mapPriceAlert = (a: RawPriceAlert) => ({
  uuid: a.uuid ?? '',
  target_price: a.targetPrice ?? '',
  direction: a.direction ?? '',
  asset_name: a.asset?.name ?? '',
  asset_symbol: a.asset?.symbol ?? '',
});
