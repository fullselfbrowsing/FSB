import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../uber-api.js';
import { type RawPastActivity, mapPastActivity, pastActivitySchema } from './schemas.js';

export const getPastActivities = defineTool({
  name: 'get_past_activities',
  displayName: 'Get Past Activities',
  description:
    "Get the user's recent Uber trip and order history. Returns past rides with destination, date, cost, and a rebook URL. Set show_only_trip to true to exclude non-ride activities (e.g., Uber Eats orders).",
  summary: 'Get recent trip and order history',
  icon: 'history',
  group: 'Activities',
  input: z.object({
    show_only_trip: z.boolean().optional().describe('Only show trips (exclude Uber Eats, etc.). Default false.'),
  }),
  output: z.object({
    activities: z.array(pastActivitySchema),
  }),
  handle: async params => {
    const data = await api<{ pastActivities?: RawPastActivity[] }>('/getPastActivities?localeCode=en', {
      body: {
        cityId: 1,
        localeCode: 'en',
        showOnlyTrip: params.show_only_trip ?? false,
      },
    });
    return {
      activities: (data.pastActivities ?? []).map(mapPastActivity),
    };
  },
});
