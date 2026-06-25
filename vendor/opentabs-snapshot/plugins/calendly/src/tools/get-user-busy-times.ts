import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';
import { busyTimeSchema, mapBusyTime } from './schemas.js';

export const getUserBusyTimes = defineTool({
  name: 'get_user_busy_times',
  displayName: 'Get User Busy Times',
  description:
    'Get busy time slots for the current user within a date range. Returns both Calendly events and external calendar events that block availability. Requires start_time and end_time in ISO 8601 format.',
  summary: 'Get busy time slots for a date range',
  icon: 'clock',
  group: 'Calendars',
  input: z.object({
    start_time: z.string().describe('Start of the time range in ISO 8601 format (e.g. "2026-03-10T00:00:00Z")'),
    end_time: z.string().describe('End of the time range in ISO 8601 format (e.g. "2026-03-17T00:00:00Z")'),
  }),
  output: z.object({
    busy_times: z.array(busyTimeSchema).describe('List of busy time slots'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>('/user_busy_times', {
      query: {
        start_time: params.start_time,
        end_time: params.end_time,
      },
    });
    return { busy_times: (data ?? []).map(mapBusyTime) };
  },
});
