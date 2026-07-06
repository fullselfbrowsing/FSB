import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type RawLock, mapLock, lockSchema } from './schemas.js';

export const createLock = defineTool({
  name: 'create_lock',
  displayName: 'Create Lock',
  description:
    'Create a management lock on a resource group to prevent accidental deletion or modification. CanNotDelete prevents deletion but allows modifications. ReadOnly prevents all changes.',
  summary: 'Create a management lock',
  icon: 'lock',
  group: 'Locks',
  input: z.object({
    subscription_id: z.string().describe('Subscription ID (GUID)'),
    resource_group_name: z.string().describe('Resource group name'),
    lock_name: z.string().describe('Lock name'),
    level: z.enum(['CanNotDelete', 'ReadOnly']).describe('Lock level — CanNotDelete or ReadOnly'),
    notes: z.string().optional().describe('Notes about the lock'),
  }),
  output: z.object({ lock: lockSchema }),
  handle: async params => {
    const data = await armApi<RawLock>(
      `/subscriptions/${params.subscription_id}/resourceGroups/${params.resource_group_name}/providers/Microsoft.Authorization/locks/${params.lock_name}`,
      {
        method: 'PUT',
        apiVersion: '2020-05-01',
        body: { properties: { level: params.level, notes: params.notes ?? '' } },
      },
    );
    return { lock: mapLock(data) };
  },
});
