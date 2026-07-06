import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawLock, mapLock, lockSchema } from './schemas.js';

export const listLocks = defineTool({
  name: 'list_locks',
  displayName: 'List Locks',
  description:
    'List all management locks in a subscription or resource group. Management locks prevent accidental deletion or modification of resources.',
  summary: 'List management locks',
  icon: 'lock',
  group: 'Locks',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().optional().describe('Resource group name (omit for subscription-level locks)'),
  }),
  output: z.object({
    locks: z.array(lockSchema).describe('List of management locks'),
  }),
  handle: async params => {
    const base = params.resource_group_name
      ? `/subscriptions/${params.subscription_id}/resourceGroups/${params.resource_group_name}/providers/Microsoft.Authorization/locks`
      : `/subscriptions/${params.subscription_id}/providers/Microsoft.Authorization/locks`;
    const data = await armApi<ArmListResponse<RawLock>>(base, {
      apiVersion: '2020-05-01',
    });
    return { locks: (data.value ?? []).map(mapLock) };
  },
});
