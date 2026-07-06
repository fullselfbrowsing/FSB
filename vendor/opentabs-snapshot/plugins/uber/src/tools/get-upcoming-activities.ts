import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../uber-api.js';

export const getUpcomingActivities = defineTool({
  name: 'get_upcoming_activities',
  displayName: 'Get Upcoming Activities',
  description:
    "Get the user's upcoming Uber trip or reservation. Returns the active or scheduled trip details, or null if no upcoming trip exists.",
  summary: 'Get upcoming trips or reservations',
  icon: 'calendar-clock',
  group: 'Activities',
  input: z.object({}),
  output: z.object({
    has_upcoming_trip: z.boolean().describe('Whether the user has an upcoming trip'),
    upcoming_trip: z.unknown().nullable().describe('Upcoming trip details, or null if none'),
  }),
  handle: async () => {
    const data = await api<{ upcomingTrip?: unknown }>('/getUpcomingActivities?localeCode=en', {
      body: { cityId: 1, localeCode: 'en' },
    });
    return {
      has_upcoming_trip: data.upcomingTrip != null,
      upcoming_trip: data.upcomingTrip ?? null,
    };
  },
});
