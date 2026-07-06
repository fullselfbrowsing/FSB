import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage } from '../ebay-api.js';

const dealSchema = z.object({
  title: z.string().describe('Deal item title'),
  price: z.string().describe('Deal price'),
  original_price: z.string().describe('Original price before discount'),
  discount: z.string().describe('Discount percentage or amount'),
  url: z.string().describe('URL to the deal listing'),
  image: z.string().describe('Deal item image URL'),
});

export const getDeals = defineTool({
  name: 'get_deals',
  displayName: 'Get Deals',
  description:
    'Get current eBay daily deals and featured promotions. Returns discounted items with their deal price and original price.',
  summary: 'Get current eBay daily deals',
  icon: 'tag',
  group: 'Browse',
  input: z.object({}),
  output: z.object({
    deals: z.array(dealSchema).describe('Current deals'),
  }),
  handle: async () => {
    const html = await fetchPage('https://www.ebay.com/deals');

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const cards = doc.querySelectorAll(
      '[class*="deal-card"], [class*="ebayui-dne-item-featured-card"], [data-testid*="deal"]',
    );

    const deals: Array<{
      title: string;
      price: string;
      original_price: string;
      discount: string;
      url: string;
      image: string;
    }> = [];

    for (const card of cards) {
      const linkEl = card.querySelector('a[href*="/itm/"], a[href*="/e/"]');
      const href = linkEl?.getAttribute('href') ?? '';

      const titleEl = card.querySelector('[class*="title"], [role="heading"]') ?? linkEl;
      const title = titleEl?.textContent?.trim() ?? '';
      if (!title) continue;

      const priceEl = card.querySelector('[class*="price"]');
      const price = priceEl?.textContent?.trim() ?? '';

      const origEl = card.querySelector('[class*="original"], [class*="was"], [class*="strikethrough"], s, del');
      const originalPrice = origEl?.textContent?.trim() ?? '';

      const discountEl = card.querySelector('[class*="discount"], [class*="off"]');
      const discount = discountEl?.textContent?.trim() ?? '';

      const imgEl = card.querySelector('img');
      const image = imgEl?.getAttribute('src') ?? '';

      deals.push({
        title,
        price,
        original_price: originalPrice,
        discount,
        url: href.startsWith('http') ? href : `https://www.ebay.com${href}`,
        image,
      });
    }

    return { deals };
  },
});
