import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawLocation, mapLocation, locationSchema } from './schemas.js';

export const listSubscriptionLocations = defineTool({
  name: 'list_subscription_locations',
  displayName: 'List Subscription Locations',
  description:
    'List all available locations/regions for a specific subscription. These are the regions where resources can be deployed within the subscription.',
  summary: 'List available locations for a subscription',
  icon: 'map-pin',
  group: 'Locations',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
  }),
  output: z.object({
    locations: z.array(locationSchema).describe('List of available locations'),
  }),
  handle: async params => {
    const data = await armApi<ArmListResponse<RawLocation>>(`/subscriptions/${params.subscription_id}/locations`);
    return { locations: (data.value ?? []).map(mapLocation) };
  },
});
