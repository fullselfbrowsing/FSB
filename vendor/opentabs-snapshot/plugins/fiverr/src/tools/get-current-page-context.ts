import { defineTool, getCurrentUrl, getPageTitle } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUsername, requireContext } from '../fiverr-api.js';

export const getCurrentPageContext = defineTool({
  name: 'get_current_page_context',
  displayName: 'Get Current Page Context',
  description:
    'Get the logged-in Fiverr account identity and the page currently open in the browser tab. ' +
    'Returns the username, numeric user ID, account currency/country/locale, Pro status, and the ' +
    'current page URL and title. Use this to confirm who is logged in and what they are looking at ' +
    'before taking further actions. Reads page state only — makes no network request.',
  summary: 'Identify the logged-in user and current page',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    username: z.string().describe('Logged-in user’s Fiverr username'),
    user_id: z.number().describe('Logged-in user’s numeric ID'),
    currency: z.string().describe('Account currency (ISO code, e.g., "USD")'),
    country_code: z.string().describe('Account country code (e.g., "US")'),
    locale: z.string().describe('Account locale (e.g., "en-US")'),
    is_pro: z.boolean().describe('Whether the account is a Fiverr Pro account'),
    current_url: z.string().describe('URL of the currently open page'),
    page_title: z.string().describe('Title of the currently open page'),
  }),
  handle: async () => {
    const ctx = requireContext();
    return {
      username: getUsername(),
      user_id: ctx.userId,
      currency: ctx.currency,
      country_code: ctx.countryCode,
      locale: ctx.locale,
      is_pro: ctx.isPro,
      current_url: getCurrentUrl(),
      page_title: getPageTitle(),
    };
  },
});
