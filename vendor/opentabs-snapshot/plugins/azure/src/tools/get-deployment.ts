import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type RawDeployment, mapDeployment, deploymentSchema } from './schemas.js';

export const getDeployment = defineTool({
  name: 'get_deployment',
  displayName: 'Get Deployment',
  description: 'Get detailed information about a specific template deployment in a resource group.',
  summary: 'Get deployment details',
  icon: 'rocket',
  group: 'Deployments',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().describe('Resource group name'),
    deployment_name: z.string().describe('Deployment name'),
  }),
  output: z.object({ deployment: deploymentSchema }),
  handle: async params => {
    const data = await armApi<RawDeployment>(
      `/subscriptions/${params.subscription_id}/resourcegroups/${params.resource_group_name}/providers/Microsoft.Resources/deployments/${params.deployment_name}`,
      { apiVersion: '2021-04-01' },
    );
    return { deployment: mapDeployment(data) };
  },
});
