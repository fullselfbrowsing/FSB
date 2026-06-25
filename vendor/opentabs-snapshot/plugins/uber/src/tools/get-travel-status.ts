import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../uber-api.js';

export const getTravelStatus = defineTool({
  name: 'get_travel_status',
  displayName: 'Get Travel Status',
  description: 'Check whether the user is currently traveling (i.e., has an active Uber ride in progress).',
  summary: 'Check if user has an active ride',
  icon: 'navigation',
  group: 'Rides',
  input: z.object({
    latitude: z.number().optional().describe('Current latitude (default 0)'),
    longitude: z.number().optional().describe('Current longitude (default 0)'),
  }),
  output: z.object({
    is_traveling: z.boolean().describe('Whether the user currently has an active ride'),
  }),
  handle: async params => {
    const data = await api<{ isUserTraveling?: boolean }>('/getUserTravelStatus?localeCode=en', {
      body: {
        location: {
          latitude: params.latitude ?? 0,
          longitude: params.longitude ?? 0,
        },
      },
    });
    return { is_traveling: data.isUserTraveling ?? false };
  },
});
