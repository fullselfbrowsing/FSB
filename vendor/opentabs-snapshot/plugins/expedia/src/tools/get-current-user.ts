import { defineTool, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { userProfileSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Expedia user profile including name, loyalty tier, currency, and locale. Requires the user to be signed in.',
  summary: 'Get the signed-in user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userProfileSchema }),
  handle: async () => {
    const state = getPageGlobal('__PLUGIN_STATE__') as { context?: { context?: Record<string, unknown> } } | undefined;
    const ctx = state?.context?.context;
    const site = ctx?.site as { id?: number; brand?: string } | undefined;
    const user = ctx?.user as { authState?: string; firstName?: string } | undefined;

    // Try to get name from globalHeader SSR or page meta
    let firstName = '';
    const apolloState = getPageGlobal('__APOLLO_STATE__') as Record<string, unknown> | undefined;
    if (apolloState) {
      for (const [key, val] of Object.entries(apolloState)) {
        if (key.includes('globalHeader') && val && typeof val === 'object') {
          const header = val as Record<string, unknown>;
          const nav = header.secondaryNavigation as { sectionData?: Array<Record<string, unknown>> } | undefined;
          const menuItems = nav?.sectionData ?? [];
          for (const item of menuItems) {
            const text = item.text as string | undefined;
            if (text && !text.includes('USD') && !text.includes('travel')) {
              firstName = text;
              break;
            }
          }
        }
      }
    }

    // Fall back to user button text on page
    if (!firstName) {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const text = btn.textContent?.trim() ?? '';
        if (
          text.includes('tier') ||
          text.includes('Gold') ||
          text.includes('Silver') ||
          text.includes('Blue') ||
          text.includes('Platinum')
        ) {
          const parts = text.split(/tier|Gold|Silver|Blue|Platinum/);
          firstName = parts[0]?.trim() ?? '';
          break;
        }
      }
    }

    // Extract tier info from button text
    let memberTier = '';
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      const text = btn.textContent?.trim() ?? '';
      const tierMatch = text.match(/(Blue|Silver|Gold|Platinum)\s*tier/i);
      if (tierMatch) {
        memberTier = tierMatch[1] ?? '';
        break;
      }
    }

    return {
      user: {
        firstName,
        memberTier,
        signedIn: user?.authState === 'AUTHENTICATED',
        currency: (ctx?.currency as string) ?? 'USD',
        locale: (ctx?.locale as string) ?? 'en_US',
        siteId: site?.id ?? 1,
      },
    };
  },
});
