import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armDelete } from '../azure-api.js';

export const deleteResourceGroup = defineTool({
  name: 'delete_resource_group',
  displayName: 'Delete Resource Group',
  description:
    'Delete a resource group and all resources within it. This is a destructive operation that cannot be undone. The operation is asynchronous — Azure begins deletion and returns immediately.',
  summary: 'Delete a resource group',
  icon: 'folder-x',
  group: 'Resource Groups',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().describe('Resource group name to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the delete operation was accepted'),
  }),
  handle: async params => {
    await armDelete(`/subscriptions/${params.subscription_id}/resourcegroups/${params.resource_group_name}`, {
      apiVersion: '2021-04-01',
    });
    return { success: true };
  },
});
