import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawResource, mapResource, resourceSchema } from './schemas.js';

export const listResources = defineTool({
  name: 'list_resources',
  displayName: 'List Resources',
  description:
    'List all resources in a subscription or resource group. Use the filter parameter for OData filtering (e.g., "resourceType eq \'Microsoft.Compute/virtualMachines\'"). Optionally scope to a specific resource group.',
  summary: 'List Azure resources',
  icon: 'boxes',
  group: 'Resources',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z
      .string()
      .optional()
      .describe('Resource group name to scope to (omit for entire subscription)'),
    filter: z.string().optional().describe('OData filter expression'),
    top: z.number().int().min(1).optional().describe('Maximum number of results to return'),
  }),
  output: z.object({
    resources: z.array(resourceSchema).describe('List of resources'),
  }),
  handle: async params => {
    const base = params.resource_group_name
      ? `/subscriptions/${params.subscription_id}/resourceGroups/${params.resource_group_name}/resources`
      : `/subscriptions/${params.subscription_id}/resources`;
    const data = await armApi<ArmListResponse<RawResource>>(base, {
      apiVersion: '2021-04-01',
      query: { $filter: params.filter, $top: params.top },
    });
    return { resources: (data.value ?? []).map(mapResource) };
  },
});
