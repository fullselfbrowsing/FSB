import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawProvider, mapProvider, providerSchema } from './schemas.js';

export const listResourceProviders = defineTool({
  name: 'list_resource_providers',
  displayName: 'List Resource Providers',
  description:
    'List all resource providers and their registration states for a subscription. Shows which providers are registered (available for use) vs not registered.',
  summary: 'List resource providers in a subscription',
  icon: 'server',
  group: 'Resources',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    top: z.number().int().min(1).optional().describe('Maximum number of results to return'),
  }),
  output: z.object({
    providers: z.array(providerSchema).describe('List of resource providers'),
  }),
  handle: async params => {
    const data = await armApi<ArmListResponse<RawProvider>>(`/subscriptions/${params.subscription_id}/providers`, {
      apiVersion: '2021-04-01',
      query: { $top: params.top },
    });
    return { providers: (data.value ?? []).map(mapProvider) };
  },
});
