import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armDelete } from '../azure-api.js';

export const deleteResource = defineTool({
  name: 'delete_resource',
  displayName: 'Delete Resource',
  description:
    'Delete a specific Azure resource by its full resource ID. This is a destructive and irreversible operation.',
  summary: 'Delete a resource by ID',
  icon: 'trash-2',
  group: 'Resources',
  input: z.object({
    resource_id: z.string().describe('Full resource ID to delete'),
    api_version: z.string().optional().describe('API version for the resource provider (default: 2021-04-01)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the delete operation was accepted'),
  }),
  handle: async params => {
    await armDelete(params.resource_id, {
      apiVersion: params.api_version ?? '2021-04-01',
    });
    return { success: true };
  },
});
