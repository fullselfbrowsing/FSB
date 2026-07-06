import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, extractApolloCache, extractSsrStore } from '../booking-api.js';
import { geniusSchema } from './schemas.js';

export const getGeniusStatus = defineTool({
  name: 'get_genius_status',
  displayName: 'Get Genius Status',
  description:
    "Get the current user's Booking.com Genius loyalty program status including level, completed bookings, and active benefits.",
  summary: 'Get Genius loyalty program details',
  icon: 'award',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    genius: geniusSchema,
  }),
  handle: async () => {
    const doc = await fetchPage('/');
    const cache = extractApolloCache(doc);
    const store = extractSsrStore(doc);

    let level = store?.userIdentity?.isGenius ? 1 : 0;
    let completedBookings = 0;
    let nextLevelBookings = 0;
    const benefits: string[] = [];

    if (cache?.ROOT_QUERY) {
      for (const [key, value] of Object.entries(cache.ROOT_QUERY)) {
        if (typeof value !== 'object' || value === null) continue;
        const v = value as Record<string, unknown>;

        if (key.includes('geniusMembership') || v.__typename === 'GeniusMembership') {
          level = Number(v.currentLevel ?? v.level ?? level);
          completedBookings = Number(v.completedBookings ?? v.bookingsCount ?? 0);
          nextLevelBookings = Number(v.nextLevelBookings ?? v.bookingsToNextLevel ?? 0);
        }

        if (key.includes('geniusGuestData') || v.__typename === 'GeniusGuestData') {
          level = Number(v.geniusLevel ?? level);
        }

        if (v.__typename === 'GeniusVipVoucher' || key.includes('geniusVip')) {
          const voucherBenefits = (v.benefits ?? []) as Array<Record<string, string>>;
          for (const b of voucherBenefits) {
            if (b.text) benefits.push(b.text);
          }
        }
      }
    }

    // Default Genius benefits by level
    if (benefits.length === 0) {
      if (level >= 1) benefits.push('10% discounts at select properties');
      if (level >= 2) {
        benefits.push('15% discounts at select properties');
        benefits.push('Free breakfast at select properties');
        benefits.push('Free room upgrades at select properties');
      }
      if (level >= 3) {
        benefits.push('20% discounts at select properties');
        benefits.push('Priority support');
      }
    }

    return {
      genius: {
        level,
        completed_bookings: completedBookings,
        next_level_bookings: nextLevelBookings,
        benefits,
      },
    };
  },
});
