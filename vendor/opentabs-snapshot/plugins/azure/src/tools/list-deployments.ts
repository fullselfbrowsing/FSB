import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawDeployment, mapDeployment, deploymentSchema } from './schemas.js';

export const listDeployments = defineTool({
  name: 'list_deployments',
  displayName: 'List Deployments',
  description:
    'List all template deployments in a resource group. Returns deployment name, provisioning state, timestamp, and mode.',
  summary: 'List deployments in a resource group',
  icon: 'rocket',
  group: 'Deployments',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().describe('Resource group name'),
    filter: z.string().optional().describe('OData filter expression (e.g., "provisioningState eq \'Failed\'")'),
    top: z.number().int().min(1).optional().describe('Maximum number of results to return'),
  }),
  output: z.object({
    deployments: z.array(deploymentSchema).describe('List of deployments'),
  }),
  handle: async params => {
    const data = await armApi<ArmListResponse<RawDeployment>>(
      `/subscriptions/${params.subscription_id}/resourcegroups/${params.resource_group_name}/providers/Microsoft.Resources/deployments`,
      {
        apiVersion: '2021-04-01',
        query: { $filter: params.filter, $top: params.top },
      },
    );
    return { deployments: (data.value ?? []).map(mapDeployment) };
  },
});
