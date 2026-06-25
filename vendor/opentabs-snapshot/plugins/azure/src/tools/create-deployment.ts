import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type RawDeployment, mapDeployment, deploymentSchema } from './schemas.js';

export const createDeployment = defineTool({
  name: 'create_deployment',
  displayName: 'Create Deployment',
  description:
    'Create or update a template deployment in a resource group. Provide an ARM template and optional parameters. The deployment runs asynchronously.',
  summary: 'Create a template deployment',
  icon: 'rocket',
  group: 'Deployments',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().describe('Resource group name'),
    deployment_name: z.string().describe('Deployment name'),
    template: z.record(z.string(), z.unknown()).describe('ARM template JSON object'),
    parameters: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Template parameters (each key maps to { value: ... })'),
    mode: z.enum(['Incremental', 'Complete']).optional().describe('Deployment mode (default: Incremental)'),
  }),
  output: z.object({ deployment: deploymentSchema }),
  handle: async params => {
    const body: Record<string, unknown> = {
      properties: {
        template: params.template,
        parameters: params.parameters ?? {},
        mode: params.mode ?? 'Incremental',
      },
    };
    const data = await armApi<RawDeployment>(
      `/subscriptions/${params.subscription_id}/resourcegroups/${params.resource_group_name}/providers/Microsoft.Resources/deployments/${params.deployment_name}`,
      { method: 'PUT', apiVersion: '2021-04-01', body },
    );
    return { deployment: mapDeployment(data) };
  },
});
