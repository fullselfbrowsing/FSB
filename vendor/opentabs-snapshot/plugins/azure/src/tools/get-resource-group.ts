import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type RawResourceGroup, mapResourceGroup, resourceGroupSchema } from './schemas.js';

export const getResourceGroup = defineTool({
  name: 'get_resource_group',
  displayName: 'Get Resource Group',
  description: 'Get detailed information about a specific resource group.',
  summary: 'Get resource group details',
  icon: 'folder-open',
  group: 'Resource Groups',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().describe('Resource group name'),
  }),
  output: z.object({ resource_group: resourceGroupSchema }),
  handle: async params => {
    const data = await armApi<RawResourceGroup>(
      `/subscriptions/${params.subscription_id}/resourcegroups/${params.resource_group_name}`,
      { apiVersion: '2021-04-01' },
    );
    return { resource_group: mapResourceGroup(data) };
  },
});
