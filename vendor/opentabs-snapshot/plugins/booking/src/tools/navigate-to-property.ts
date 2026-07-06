import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToProperty = defineTool({
  name: 'navigate_to_property',
  displayName: 'Navigate to Property',
  description:
    'Navigate the browser to a specific property page on Booking.com. The user can then view photos, reviews, room options, and book directly. Provide check-in/check-out dates for pricing.',
  summary: 'Open a property page in the browser',
  icon: 'external-link',
  group: 'Navigation',
  input: z.object({
    page_name: z.string().describe('Property page name slug (e.g., "paris-j-39-adore-amp-spa")'),
    country_code: z.string().describe('Two-letter country code (e.g., "fr", "us")'),
    checkin: z.string().optional().describe('Check-in date in YYYY-MM-DD format'),
    checkout: z.string().optional().describe('Check-out date in YYYY-MM-DD format'),
  }),
  output: z.object({
    url: z.string().describe('The URL navigated to'),
    success: z.boolean().describe('Whether the navigation succeeded'),
  }),
  handle: async params => {
    let url = `https://www.booking.com/hotel/${params.country_code}/${params.page_name}.html`;
    const queryParts: string[] = [];
    if (params.checkin) queryParts.push(`checkin=${params.checkin}`);
    if (params.checkout) queryParts.push(`checkout=${params.checkout}`);
    if (queryParts.length > 0) url += `?${queryParts.join('&')}`;

    window.location.href = url;
    return { url, success: true };
  },
});
