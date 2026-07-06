import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawResourceGroup, mapResourceGroup, resourceGroupSchema } from './schemas.js';

export const listResourceGroups = defineTool({
  name: 'list_resource_groups',
  displayName: 'List Resource Groups',
  description:
    'List all resource groups in an Azure subscription. Returns name, location, provisioning state, and tags.',
  summary: 'List resource groups in a subscription',
  icon: 'folder',
  group: 'Resource Groups',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    filter: z
      .string()
      .optional()
      .describe("OData filter expression (e.g., \"tagName eq 'env' and tagValue eq 'prod'\")"),
    top: z.number().int().min(1).optional().describe('Maximum number of results to return'),
  }),
  output: z.object({
    resource_groups: z.array(resourceGroupSchema).describe('List of resource groups'),
  }),
  handle: async params => {
    const data = await armApi<ArmListResponse<RawResourceGroup>>(
      `/subscriptions/${params.subscription_id}/resourcegroups`,
      {
        apiVersion: '2021-04-01',
        query: { $filter: params.filter, $top: params.top },
      },
    );
    return { resource_groups: (data.value ?? []).map(mapResourceGroup) };
  },
});
