import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armDelete } from '../azure-api.js';

export const deleteLock = defineTool({
  name: 'delete_lock',
  displayName: 'Delete Lock',
  description:
    'Delete a management lock from a resource group. This allows the previously locked operations to proceed.',
  summary: 'Delete a management lock',
  icon: 'lock-open',
  group: 'Locks',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().describe('Resource group name'),
    lock_name: z.string().describe('Lock name to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the lock was deleted'),
  }),
  handle: async params => {
    await armDelete(
      `/subscriptions/${params.subscription_id}/resourceGroups/${params.resource_group_name}/providers/Microsoft.Authorization/locks/${params.lock_name}`,
      { apiVersion: '2020-05-01' },
    );
    return { success: true };
  },
});
