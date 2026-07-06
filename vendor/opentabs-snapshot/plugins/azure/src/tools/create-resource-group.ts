import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type RawResourceGroup, mapResourceGroup, resourceGroupSchema } from './schemas.js';

export const createResourceGroup = defineTool({
  name: 'create_resource_group',
  displayName: 'Create Resource Group',
  description: 'Create a new resource group in an Azure subscription. Specify a name, location, and optional tags.',
  summary: 'Create a resource group',
  icon: 'folder-plus',
  group: 'Resource Groups',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().describe('Resource group name'),
    location: z.string().describe('Azure region (e.g., "eastus", "westeurope")'),
    tags: z.record(z.string(), z.string()).optional().describe('Resource group tags'),
  }),
  output: z.object({ resource_group: resourceGroupSchema }),
  handle: async params => {
    const data = await armApi<RawResourceGroup>(
      `/subscriptions/${params.subscription_id}/resourcegroups/${params.resource_group_name}`,
      {
        method: 'PUT',
        apiVersion: '2021-04-01',
        body: { location: params.location, tags: params.tags },
      },
    );
    return { resource_group: mapResourceGroup(data) };
  },
});
