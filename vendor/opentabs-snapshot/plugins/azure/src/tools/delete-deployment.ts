import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armDelete } from '../azure-api.js';

export const deleteDeployment = defineTool({
  name: 'delete_deployment',
  displayName: 'Delete Deployment',
  description:
    'Delete a template deployment from a resource group. This removes the deployment history — it does not delete the deployed resources.',
  summary: 'Delete a deployment',
  icon: 'trash-2',
  group: 'Deployments',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().describe('Resource group name'),
    deployment_name: z.string().describe('Deployment name to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the delete operation was accepted'),
  }),
  handle: async params => {
    await armDelete(
      `/subscriptions/${params.subscription_id}/resourcegroups/${params.resource_group_name}/providers/Microsoft.Resources/deployments/${params.deployment_name}`,
      { apiVersion: '2021-04-01' },
    );
    return { success: true };
  },
});
