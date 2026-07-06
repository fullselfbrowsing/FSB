import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage } from '../ebay-api.js';

export const getSellerProfile = defineTool({
  name: 'get_seller_profile',
  displayName: 'Get Seller Profile',
  description:
    "Get a seller's public profile information by their eBay username. Returns positive feedback percentage, items sold, follower count, and store name if available.",
  summary: "Get an eBay seller's public profile",
  icon: 'store',
  group: 'Users',
  input: z.object({
    seller_id: z.string().min(1).describe('eBay seller username'),
  }),
  output: z.object({
    seller_id: z.string().describe('Seller username'),
    items_sold: z.string().describe('Number of items sold (e.g., "48K")'),
    positive_feedback_pct: z.string().describe('Positive feedback percentage (e.g., "99.8%")'),
    followers: z.string().describe('Number of followers (e.g., "11K")'),
    store_name: z.string().describe('Seller store name, empty if no store'),
    url: z.string().describe('Seller profile URL'),
  }),
  handle: async params => {
    const url = `https://www.ebay.com/usr/${encodeURIComponent(params.seller_id)}`;
    const html = await fetchPage(url);

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Seller card stats: "99.8% positive feedback", "48K items sold", "11K followers"
    const statsEl = doc.querySelector('.str-seller-card__store-stats-content');
    const statsText = statsEl?.textContent ?? '';

    const pctMatch = statsText.match(/([\d.]+)%\s*positive feedback/i);
    const positivePct = pctMatch?.[1] ? `${pctMatch[1]}%` : '';

    const soldMatch = statsText.match(/([\d.]+[KMB]?)\s*items? sold/i);
    const feedbackScore = soldMatch?.[1] ?? '';

    const followersMatch = statsText.match(/([\d.]+[KMB]?)\s*followers/i);
    const followers = followersMatch?.[1] ?? '';

    // Store name from the card header
    const storeEl = doc.querySelector('.str-seller-card__store-name a, .str-seller-card__store-name');
    const storeName = storeEl?.textContent?.trim() ?? '';

    return {
      seller_id: params.seller_id,
      items_sold: feedbackScore,
      positive_feedback_pct: positivePct,
      followers,
      store_name: storeName,
      url,
    };
  },
});
