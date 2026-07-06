import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, extractSsrStore } from '../booking-api.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Booking.com user profile including user ID, email, name, Genius loyalty status, and country.',
  summary: 'Get the logged-in user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user_id: z.number().describe('Booking.com user ID'),
    email: z.string().describe('Email address'),
    first_name: z.string().describe('First name'),
    last_name: z.string().describe('Last name'),
    is_genius: z.boolean().describe('Whether the user is a Genius member'),
    genius_level: z.number().describe('Genius loyalty level (0 if not Genius)'),
    country: z.string().describe('User country code'),
    currency: z.string().describe('Preferred currency'),
    language: z.string().describe('Preferred language'),
  }),
  handle: async () => {
    const doc = await fetchPage('/');
    const store = extractSsrStore(doc);

    // Extract user data from the SSR store and page HTML
    const identity = store?.userIdentity;

    // Parse the page HTML for additional user data embedded in scripts
    const html = doc.documentElement.outerHTML;
    const emailMatch = html.match(/"email"\s*:\s*"([^"]+)"/);
    const firstNameMatch = html.match(/"firstName"\s*:\s*"([^"]+)"/);
    const lastNameMatch = html.match(/"lastName"\s*:\s*"([^"]+)"/);
    const geniusLevelMatch = html.match(/"geniusLevel"\s*:\s*(\d+)/);

    return {
      user_id: identity?.userId ?? 0,
      email: emailMatch?.[1] ?? '',
      first_name: firstNameMatch?.[1] ?? '',
      last_name: lastNameMatch?.[1] ?? '',
      is_genius: identity?.isGenius ?? false,
      genius_level: geniusLevelMatch ? Number(geniusLevelMatch[1]) : identity?.isGenius ? 1 : 0,
      country: ((store as Record<string, unknown>)?.visitorCountry as string) ?? '',
      currency: ((store as Record<string, unknown>)?.currency as string) ?? '',
      language: ((store as Record<string, unknown>)?.language as string) ?? '',
    };
  },
});
