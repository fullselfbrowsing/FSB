import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawCalendar, calendarSchema, mapCalendar } from './schemas.js';

export const getUserCalendar = defineTool({
  name: 'get_user_calendar',
  displayName: 'Get User Calendar',
  description:
    'Get a user submission calendar (heatmap data), current streak, total active days, and active years. Optionally filter by year.',
  summary: 'Get submission calendar and streaks',
  icon: 'calendar',
  group: 'Users',
  input: z.object({
    username: z.string().describe('LeetCode username'),
    year: z.number().int().optional().describe('Filter by year (e.g., 2025). Omit for all years.'),
  }),
  output: z.object({ calendar: calendarSchema }),
  handle: async params => {
    const data = await graphql<{
      matchedUser: { userCalendar: RawCalendar };
    }>(
      `query userProfileCalendar($username: String!, $year: Int) {
				matchedUser(username: $username) {
					userCalendar(year: $year) {
						activeYears streak totalActiveDays submissionCalendar
					}
				}
			}`,
      { username: params.username, year: params.year },
    );
    return { calendar: mapCalendar(data.matchedUser?.userCalendar ?? {}) };
  },
});
